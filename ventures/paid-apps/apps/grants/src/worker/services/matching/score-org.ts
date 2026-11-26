// matching.score_org: prefilter -> embedding similarity -> LLM scoring (capped) -> upsert matches
// -> autopilot drafting. Cross-module calls go through `deps` (see deps.ts) so tests can stub them.
import type { FunderType, MatchStatus } from "@shared/enums";
import { and, desc, eq, gte, inArray, isNull, max, ne, or } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  facts as factsTable,
  funders,
  opportunities,
  opportunityMatches,
  orgProfiles,
  projects as projectsTable,
} from "../../db/schema";
import { newId } from "../../lib/ids";
import { LlmOutputError, LlmRefusalError } from "../../ports/llm";
import { notify } from "../notifications";
import { type AutoDraftResult, runAutopilotDrafting } from "./autodraft";
import type { MatchingDeps } from "./deps";
import {
  applyDismissalSignal,
  DISMISS_SIGNAL_REASONS,
  type DismissalSignal,
  isSignalReason,
} from "./dismissal-signal";
import { type PrefilterResult, prefilter } from "./prefilter";
import {
  buildScoreContext,
  buildScorePrompt,
  finalizeScore,
  MATCH_SCORE_PURPOSE,
  MatchScoreOutput,
  SYSTEM_PROMPT,
} from "./scoring";
import { cosine, opportunityEmbeddingText, orgEmbeddingText, topSummaryFacts } from "./similarity";

/** Max LLM scoring calls per run (cost control). The rest are picked up by later runs. */
export const MAX_LLM_SCORES_PER_RUN = 12;
/** Don't rescore a match within this window unless the opportunity or org knowledge changed. */
export const RESCORE_AFTER_DAYS = 14;
const MAX_CANDIDATES = 500;
const MAX_FACTS_IN_PROMPT = 150;
const LLM_CONCURRENCY = 3;
const EMBED_BATCH = 50;
const IN_CHUNK = 50; // D1 caps bound parameters per statement

/** Statuses a user (or the pipeline) owns: never overwritten, and not rescored automatically. */
const STICKY_STATUSES: MatchStatus[] = ["dismissed", "drafting", "applied"];

export interface ScoreOrgInput {
  orgId: string;
  /** Explicit ids are scored even if fresh (still subject to the prefilter and the cap). */
  opportunityIds?: string[];
}

export interface ScoreOrgResult {
  candidates: number;
  passedPrefilter: number;
  needingScore: number;
  scored: number;
  failed: number;
  autodraft: AutoDraftResult;
}

type Candidate = typeof opportunities.$inferSelect & { funderType: FunderType | null };

const chunk = <T>(xs: T[], n: number): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n));
  return out;
};

function funderTypeOf(o: Candidate): FunderType {
  if (o.funderType) return o.funderType;
  return o.source === "grants_gov" || o.source === "simpler_grants" ? "federal" : "other";
}

async function loadCandidates(ctx: AppContext, input: ScoreOrgInput): Promise<Candidate[]> {
  const minClose = new Date(ctx.now().getTime() + 7 * 86_400_000);
  const base = and(
    or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, input.orgId)),
    inArray(opportunities.status, ["posted", "forecasted"]),
    or(isNull(opportunities.closeDate), gte(opportunities.closeDate, minClose)),
  );
  const select = () =>
    ctx.db
      .select({ opp: opportunities, funderType: funders.type })
      .from(opportunities)
      .leftJoin(funders, eq(funders.id, opportunities.funderId));
  const rows =
    input.opportunityIds && input.opportunityIds.length > 0
      ? (
          await Promise.all(
            chunk([...new Set(input.opportunityIds)], IN_CHUNK).map((ids) =>
              select()
                .where(and(base, inArray(opportunities.id, ids)))
                .all(),
            ),
          )
        ).flat()
      : await select().where(base).orderBy(opportunities.closeDate).limit(MAX_CANDIDATES).all();
  return rows.map((r) => ({ ...r.opp, funderType: r.funderType ?? null }));
}

/** Latest change to anything the score depends on from the org's side. */
async function knowledgeUpdatedAt(ctx: AppContext, orgId: string, profileUpdatedAt: Date) {
  const [f, p] = await Promise.all([
    ctx.db
      .select({ at: max(factsTable.updatedAt) })
      .from(factsTable)
      .where(eq(factsTable.orgId, orgId))
      .get(),
    ctx.db
      .select({ at: max(projectsTable.updatedAt) })
      .from(projectsTable)
      .where(eq(projectsTable.orgId, orgId))
      .get(),
  ]);
  const times = [profileUpdatedAt, f?.at, p?.at]
    .map((t) => (t instanceof Date ? t.getTime() : typeof t === "number" ? t : 0))
    .filter((t) => Number.isFinite(t));
  return Math.max(0, ...times);
}

async function mapLimit<T, R>(xs: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let next = 0;
  const worker = async () => {
    while (next < xs.length) {
      const i = next++;
      out[i] = await fn(xs[i] as T);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, xs.length) }, worker));
  return out;
}

export async function scoreOrgMatches(
  ctx: AppContext,
  input: ScoreOrgInput,
  deps: MatchingDeps,
): Promise<ScoreOrgResult> {
  const { orgId } = input;
  const now = ctx.now();
  const log = ctx.logger.child({ module: "matching", orgId });

  const profile = await ctx.db.select().from(orgProfiles).where(eq(orgProfiles.orgId, orgId)).get();
  if (!profile) {
    log.warn("matching.no_profile");
    return {
      candidates: 0,
      passedPrefilter: 0,
      needingScore: 0,
      scored: 0,
      failed: 0,
      autodraft: { drafted: [], skipped: "no_profile" },
    };
  }

  // ---- Stage 1: deterministic prefilter ----
  const candidates = await loadCandidates(ctx, input);
  const passed: { opp: Candidate; pf: PrefilterResult }[] = [];
  for (const opp of candidates) {
    const pf = prefilter(opp, profile, now);
    if (pf.pass) passed.push({ opp, pf });
  }

  // ---- Freshness: skip sticky statuses and recently scored, unchanged matches ----
  const existing = new Map(
    (
      await ctx.db
        .select({
          opportunityId: opportunityMatches.opportunityId,
          status: opportunityMatches.status,
          scoredAt: opportunityMatches.scoredAt,
        })
        .from(opportunityMatches)
        .where(eq(opportunityMatches.orgId, orgId))
        .all()
    ).map((m) => [m.opportunityId, m]),
  );
  const forced = new Set(input.opportunityIds ?? []);
  const knowledgeAt = await knowledgeUpdatedAt(ctx, orgId, profile.updatedAt);
  const freshSince = now.getTime() - RESCORE_AFTER_DAYS * 86_400_000;
  const needing = passed.filter(({ opp }) => {
    if (forced.has(opp.id)) return true;
    const m = existing.get(opp.id);
    if (!m) return true;
    if (STICKY_STATUSES.includes(m.status)) return false;
    const scoredAt = m.scoredAt?.getTime() ?? 0;
    const changed = opp.updatedAt.getTime() > scoredAt || knowledgeAt > scoredAt;
    return scoredAt < freshSince || changed;
  });

  // ---- Quota: the plan's monthly fit-score allowance (billing) caps LLM scoring ----
  const remaining = needing.length > 0 ? await deps.remainingScores(ctx, orgId) : 0;
  const cap = Math.min(MAX_LLM_SCORES_PER_RUN, remaining);
  if (needing.length > 0 && cap <= 0) {
    log.info("matching.score_quota_exhausted", { needing: needing.length });
  }

  let scored = 0;
  let failed = 0;
  if (needing.length > 0 && cap > 0) {
    const [factRows, profileText, projectRows, dismissals] = await Promise.all([
      deps.factsForMatching(ctx, orgId),
      deps.promptProfile(ctx, orgId),
      ctx.db
        .select({
          id: projectsTable.id,
          title: projectsTable.title,
          summary: projectsTable.summary,
          budgetNeededCents: projectsTable.budgetNeededCents,
        })
        .from(projectsTable)
        .where(and(eq(projectsTable.orgId, orgId), ne(projectsTable.status, "archived")))
        .orderBy(projectsTable.priority)
        .limit(20)
        .all(),
      loadDismissalSignals(ctx, orgId),
    ]);
    const promptFacts = factRows.slice(0, MAX_FACTS_IN_PROMPT);

    // ---- Stage 2: similarity, keep the top N ----
    let selected = needing;
    if (needing.length > cap || forced.size === 0) {
      const orgText = orgEmbeddingText({
        focusAreas: profile.focusAreas,
        serviceAreas: profile.serviceAreas,
        projects: projectRows,
        factStatements: topSummaryFacts(promptFacts),
      });
      const [orgVec] = await ctx.embedder.embed([orgText]);
      const sims = new Map<string, number>();
      for (const batch of chunk(needing, EMBED_BATCH)) {
        const vecs = await ctx.embedder.embed(batch.map((c) => opportunityEmbeddingText(c.opp)));
        batch.forEach((c, i) => {
          sims.set(c.opp.id, orgVec && vecs[i] ? cosine(orgVec, vecs[i]) : 0);
        });
      }
      selected = [...needing]
        .sort((a, b) => (sims.get(b.opp.id) ?? 0) - (sims.get(a.opp.id) ?? 0))
        .slice(0, cap);
    }

    // ---- Stage 3: LLM scoring ----
    const context = buildScoreContext({
      profileText,
      factsText: deps.formatFacts(promptFacts),
      projects: projectRows,
    });
    const allowedFactIds = new Set(promptFacts.map((f) => f.id));
    const allowedProjects = new Map(projectRows.map((p) => [p.id, p]));

    const topNew: TopMatch[] = [];
    const results = await mapLimit(selected, LLM_CONCURRENCY, async ({ opp, pf }) => {
      const funderType = funderTypeOf(opp);
      try {
        const { data, usage } = await ctx.llm.generateStructured({
          purpose: MATCH_SCORE_PURPOSE,
          orgId,
          system: SYSTEM_PROMPT,
          context,
          prompt: buildScorePrompt(
            {
              ...opp,
              funderType,
              prefilterEligibility: pf.eligibility,
              prefilterNotes: pf.notes,
            },
            now,
          ),
          schema: MatchScoreOutput,
          effort: "low",
          maxTokens: 4_000,
        });
        // Post-processing: guard rails, then the soft signal from the org's own dismissals.
        const s = applyDismissalSignal(
          finalizeScore({
            output: data,
            allowedFactIds,
            allowedProjects,
            awardFloorCents: opp.awardFloorCents,
            awardCeilingCents: opp.awardCeilingCents,
            totalFundingCents: opp.totalFundingCents,
            funderType,
          }),
          {
            opportunityId: opp.id,
            funderId: opp.funderId,
            funderName: opp.funderName,
            maxAwardCents: opp.awardCeilingCents ?? opp.totalFundingCents,
          },
          dismissals,
        );
        const values = {
          projectId: s.projectId,
          eligibility: s.eligibility,
          fitScore: s.fitScore,
          likelihood: s.likelihood,
          suggestedAskCents: s.suggestedAskCents,
          expectedValueCents: s.expectedValueCents,
          effortHours: s.effortHours,
          reasons: s.reasons,
          model: usage.model,
          scoredAt: now,
        };
        // Status is never part of the update: user-set shortlisted/dismissed (and the pipeline's
        // drafting/applied) survive rescoring.
        await ctx.db
          .insert(opportunityMatches)
          .values({ id: newId("mat"), orgId, opportunityId: opp.id, status: "new", ...values })
          .onConflictDoUpdate({
            target: [opportunityMatches.orgId, opportunityMatches.opportunityId],
            set: { ...values, updatedAt: now },
          });
        if (!existing.has(opp.id) && s.fitScore >= TOP_MATCH_NOTIFY_MIN_FIT) {
          topNew.push({ id: opp.id, title: opp.title, fitScore: s.fitScore });
        }
        // Metering must never turn a stored score into a failure.
        try {
          await deps.recordScoreUsage(ctx, {
            orgId,
            opportunityId: opp.id,
            costMicros: usage.costMicros,
          });
        } catch (e) {
          log.warn("matching.usage_record_failed", { opportunityId: opp.id, error: String(e) });
        }
        return "scored" as const;
      } catch (err) {
        const known = err instanceof LlmRefusalError || err instanceof LlmOutputError;
        log[known ? "warn" : "error"]("matching.score_failed", {
          opportunityId: opp.id,
          error: String(err),
        });
        return err instanceof LlmRefusalError ? ("refused" as const) : ("failed" as const);
      }
    });
    scored = results.filter((r) => r === "scored").length;
    failed = results.length - scored;
    const refused = results.filter((r) => r === "refused").length;
    // Every call failed (e.g. API outage): surface it so the queue retries the job. Refusals are
    // deterministic, so all-refused completes (nothing stored) instead of looping to the DLQ.
    if (scored === 0 && failed > refused) {
      throw new Error(`matching.score_org: all ${failed} scoring calls failed`);
    }
    if (scored === 0 && refused > 0) {
      log.warn("matching.score_org.all_refused", { refused });
    }
    await notifyTopMatches(ctx, orgId, topNew);
  }

  const autodraft = await runAutopilotDrafting(ctx, orgId, deps);
  const result = {
    candidates: candidates.length,
    passedPrefilter: passed.length,
    needingScore: needing.length,
    scored,
    failed,
    autodraft,
  };
  log.info("matching.score_org.done", { ...result, autodraft: autodraft.drafted.length });
  return result;
}

const MAX_DISMISSAL_SIGNALS = 500;

/** The org's dismissals whose reason carries over to the same funder (dismissal-signal.ts). */
async function loadDismissalSignals(ctx: AppContext, orgId: string): Promise<DismissalSignal[]> {
  const rows = await ctx.db
    .select({
      opportunityId: opportunityMatches.opportunityId,
      reason: opportunityMatches.dismissReason,
      funderId: opportunities.funderId,
      funderName: opportunities.funderName,
      ceiling: opportunities.awardCeilingCents,
      total: opportunities.totalFundingCents,
    })
    .from(opportunityMatches)
    .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
    .where(
      and(
        eq(opportunityMatches.orgId, orgId),
        eq(opportunityMatches.status, "dismissed"),
        inArray(opportunityMatches.dismissReason, [...DISMISS_SIGNAL_REASONS]),
      ),
    )
    .orderBy(desc(opportunityMatches.updatedAt))
    .limit(MAX_DISMISSAL_SIGNALS)
    .all();
  return rows.flatMap((r) =>
    isSignalReason(r.reason)
      ? [
          {
            opportunityId: r.opportunityId,
            reason: r.reason,
            funderId: r.funderId,
            funderName: r.funderName,
            maxAwardCents: r.ceiling ?? r.total,
          },
        ]
      : [],
  );
}

/** New matches (never scored for this org before) at or above this fit are worth a notification. */
export const TOP_MATCH_NOTIFY_MIN_FIT = 80;

interface TopMatch {
  id: string;
  title: string;
  fitScore: number;
}

/** At most one notification per scoring run, naming the best new match. */
async function notifyTopMatches(ctx: AppContext, orgId: string, top: TopMatch[]) {
  const best = [...top].sort((a, b) => b.fitScore - a.fitScore)[0];
  if (!best) return;
  const one = top.length === 1;
  await notify(ctx, {
    orgId,
    recipients: "editors",
    kind: "match.top",
    title: one ? `New top match: ${best.title}` : `${top.length} new top matches`,
    body: one
      ? `Fit score ${best.fitScore}/100.`
      : `Best fit: ${best.title} (${best.fitScore}/100).`,
    link: one
      ? `/orgs/${orgId}/opportunities/${encodeURIComponent(best.id)}`
      : `/orgs/${orgId}/opportunities`,
    severity: "info",
    dedupeKey: `top_match:${best.id}`,
  });
}
