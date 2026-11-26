// Autopilot drafting: after scoring, start drafts for the org's best matches (by expected value).
// Guards against duplicates: (1) skips opportunities that already have an application, (2) claims
// each match atomically (status new|shortlisted -> drafting) before calling the pipeline, and
// (3) counts autopilot drafts started in the last 20h against autoDraftTopN, so repeated runs
// (rescore clicks, queue retries, cron overlap) don't draft more than N per day.
// Never drafts an opportunity whose source looked like a prompt injection (sourceSafetyFlags set by
// imports / watchlist, or an ingested document of the same URL flagged by ingestion): its match
// stays "new" until a person reviews it and starts the draft (docs/SAFETY.md).
// Automation level: nothing is auto-drafted below `prepared`; with `requireMatchApproval` only
// matches a person shortlisted are drafted (review/automation.ts).
import type { MatchStatus } from "@shared/enums";
import { and, count, desc, eq, gte, inArray, isNull, ne, notExists, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applications,
  documents,
  opportunities,
  opportunityMatches,
  orgSettings,
} from "../../db/schema";
import { isFake } from "../../env";
import { AppError } from "../../lib/errors";
import { getUsageSummary } from "../billing";
import { ensureEligibility } from "../eligibility";
import { audit } from "../privacy/audit";
import { automationAuditMeta, resolveAutomation } from "../review/automation";
import type { MatchingDeps } from "./deps";

export const AUTODRAFT_MIN_FIT = 60;
export const AUTODRAFT_MIN_DAYS_TO_DEADLINE = 10;
const AUTODRAFT_WINDOW_MS = 20 * 3_600_000;

export interface AutoDraftResult {
  drafted: { matchId: string; opportunityId: string; applicationId: string | null }[];
  /** "automation_level": the org's level is below `prepared` (people start every draft). */
  skipped?: "disabled" | "no_profile" | "quota_reached" | "automation_level";
}

/**
 * Matches autopilot may claim. With `requireMatchApproval` only matches a person shortlisted;
 * otherwise new ones too.
 */
export const claimableStatuses = (requireMatchApproval: boolean): MatchStatus[] =>
  requireMatchApproval ? ["shortlisted"] : ["new", "shortlisted"];

export async function runAutopilotDrafting(
  ctx: AppContext,
  orgId: string,
  deps: Pick<MatchingDeps, "createApplication">,
): Promise<AutoDraftResult> {
  const settings = await ctx.db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .get();
  if (!settings) return { drafted: [], skipped: "disabled" };
  // Automation level (review/automation.ts): below `prepared` people start every draft.
  const automation = resolveAutomation(settings);
  if (!automation.autoDraft) return { drafted: [], skipped: "automation_level" };
  const topN = settings.autoDraftTopN;
  if (topN <= 0) return { drafted: [], skipped: "disabled" };
  const CLAIMABLE = claimableStatuses(automation.requireMatchApproval);

  const now = ctx.now();
  // Applications without a human creator are system/autopilot-started.
  const recent = await ctx.db
    .select({ n: count() })
    .from(applications)
    .where(
      and(
        eq(applications.orgId, orgId),
        isNull(applications.createdBy),
        gte(applications.createdAt, new Date(now.getTime() - AUTODRAFT_WINDOW_MS)),
      ),
    )
    .get();
  const dailyRemaining = topN - (recent?.n ?? 0);
  if (dailyRemaining <= 0) return { drafted: [], skipped: "quota_reached" };
  // Autopilot never spends the org's last plan draft: at least one stays for a human-chosen grant.
  // (Offline demo / tests are unmetered.)
  let remaining = dailyRemaining;
  if (!isFake(ctx.env)) {
    const usage = await getUsageSummary(ctx, orgId).catch(() => null);
    const draftsLeft = usage ? usage.limit - usage.applicationDrafts : 0;
    remaining = Math.min(dailyRemaining, Math.max(0, draftsLeft - 1));
    if (remaining <= 0) return { drafted: [], skipped: "quota_reached" };
  }

  const minClose = new Date(now.getTime() + AUTODRAFT_MIN_DAYS_TO_DEADLINE * 86_400_000);
  const picks = await ctx.db
    .select({
      id: opportunityMatches.id,
      status: opportunityMatches.status,
      opportunityId: opportunityMatches.opportunityId,
      projectId: opportunityMatches.projectId,
      suggestedAskCents: opportunityMatches.suggestedAskCents,
    })
    .from(opportunityMatches)
    .innerJoin(opportunities, eq(opportunities.id, opportunityMatches.opportunityId))
    .where(
      and(
        eq(opportunityMatches.orgId, orgId),
        inArray(opportunityMatches.status, CLAIMABLE),
        ne(opportunityMatches.eligibility, "ineligible"),
        gte(opportunityMatches.fitScore, AUTODRAFT_MIN_FIT),
        eq(opportunities.status, "posted"),
        or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId)),
        or(isNull(opportunities.closeDate), gte(opportunities.closeDate, minClose)),
        // Flagged sources need human review first.
        isNull(opportunities.sourceSafetyFlags),
        notExists(
          ctx.db
            .select({ one: sql`1` })
            .from(documents)
            .where(
              and(
                eq(documents.orgId, orgId),
                eq(documents.sourceUrl, opportunities.sourceUrl),
                sql`json_extract(${documents.safetyFlags}, '$.injectionSuspected') = 1`,
              ),
            ),
        ),
        notExists(
          ctx.db
            .select({ one: sql`1` })
            .from(applications)
            .where(
              and(
                eq(applications.orgId, orgId),
                eq(applications.opportunityId, opportunityMatches.opportunityId),
              ),
            ),
        ),
      ),
    )
    .orderBy(desc(opportunityMatches.expectedValueCents), desc(opportunityMatches.fitScore))
    .limit(remaining * 3)
    .all();

  const drafted: AutoDraftResult["drafted"] = [];
  for (const m of picks) {
    if (drafted.length >= remaining) break;
    // Skip grants the org is clearly not eligible for (eligibility checklist from the fact base).
    const elig = await ensureEligibility(ctx, orgId, m.opportunityId).catch(() => null);
    if (elig?.overall === "ineligible") {
      await ctx.db
        .update(opportunityMatches)
        .set({ eligibility: "ineligible", updatedAt: now })
        .where(and(eq(opportunityMatches.id, m.id), eq(opportunityMatches.orgId, orgId)));
      continue;
    }
    // Atomic claim: a concurrent run that already moved this match to "drafting" wins.
    const claimed = await ctx.db
      .update(opportunityMatches)
      .set({ status: "drafting", updatedAt: now })
      .where(
        and(
          eq(opportunityMatches.id, m.id),
          eq(opportunityMatches.orgId, orgId),
          inArray(opportunityMatches.status, CLAIMABLE),
        ),
      )
      .returning({ id: opportunityMatches.id });
    if (claimed.length === 0) continue;
    try {
      const applicationId = await deps.createApplication(ctx, {
        orgId,
        opportunityId: m.opportunityId,
        projectId: m.projectId,
        requestedAmountCents: m.suggestedAskCents,
      });
      drafted.push({ matchId: m.id, opportunityId: m.opportunityId, applicationId });
      await audit(ctx, {
        orgId,
        actorType: "autopilot",
        action: "match.autodrafted",
        targetType: "opportunity_match",
        targetId: m.id,
        metadata: {
          opportunityId: m.opportunityId,
          applicationId,
          fromStatus: m.status,
          requireMatchApproval: automation.requireMatchApproval,
          ...automationAuditMeta(automation),
        },
      });
    } catch (err) {
      ctx.logger.warn("matching.autodraft_failed", {
        orgId,
        matchId: m.id,
        error: String(err),
      });
      await ctx.db
        .update(opportunityMatches)
        .set({ status: m.status, updatedAt: now })
        .where(and(eq(opportunityMatches.id, m.id), eq(opportunityMatches.orgId, orgId)));
      // Plan limit / billing problems apply to every remaining pick too.
      if (err instanceof AppError && (err.status === 402 || err.status === 429)) break;
    }
  }
  return { drafted };
}
