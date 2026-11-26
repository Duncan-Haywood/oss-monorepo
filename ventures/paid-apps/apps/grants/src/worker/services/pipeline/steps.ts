// Idempotent pipeline steps. Each step reads its state from D1 (never from the previous step's
// return value), so it can run inside a Workflow `step.do` (retried, replayed) or inline.
import {
  type ApplicationContent,
  type OpportunityRequirements,
  OpportunityRequirements as OpportunityRequirementsSchema,
} from "@shared/content";
import type { ApplicationStatus, ReviewTier } from "@shared/enums";
import { and, desc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  interviews,
  llmCalls,
  opportunities,
  opportunityMatches,
  orgSettings,
  reviews,
  submissions,
} from "../../db/schema";
import { chunk, D1_BATCH_CHUNK } from "../../lib/chunk";
import { AppError, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { notify } from "../notifications";
import { audit } from "../privacy/audit";
import { automationAuditMeta, resolveAutomation } from "../review/automation";
import { decideReviewTier, reasonsToText } from "../review/policy";
import { loadSafetyRailFacts } from "../review/safety-rails";
import { type NormalizedFlag, pipelineDeps } from "./deps";

export type ApplicationRow = typeof applications.$inferSelect;
export type VersionRow = typeof applicationVersions.$inferSelect;
export type OpportunityRow = typeof opportunities.$inferSelect;
export type OrgSettingsRow = typeof orgSettings.$inferSelect;

export interface AppIds {
  orgId: string;
  applicationId: string;
}

/** Statuses after which the automatic pipeline must not touch the application. */
export const FINAL_STATUSES: ApplicationStatus[] = [
  "submitting",
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
];
export const isFinal = (s: ApplicationStatus) => FINAL_STATUSES.includes(s);

/** Max automatic redrafts in response to "changes requested". */
export const MAX_CHANGE_REDRAFTS = 3;

// ---------------------------------------------------------------------------------------------
// Loaders
// ---------------------------------------------------------------------------------------------

export async function loadApplication(ctx: AppContext, ids: AppIds): Promise<ApplicationRow> {
  const app = await ctx.db
    .select()
    .from(applications)
    .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)))
    .get();
  if (!app) throw notFound("Application");
  return app;
}

export async function loadVersion(
  ctx: AppContext,
  ids: AppIds,
  versionId: string,
): Promise<VersionRow | undefined> {
  return ctx.db
    .select()
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.id, versionId),
        eq(applicationVersions.orgId, ids.orgId),
        eq(applicationVersions.applicationId, ids.applicationId),
      ),
    )
    .get();
}

/** Opportunities are a public catalog; private (imported) ones are visible only to their org. */
export async function loadVisibleOpportunity(
  ctx: AppContext,
  orgId: string,
  opportunityId: string,
): Promise<OpportunityRow | undefined> {
  return ctx.db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, opportunityId),
        or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId)),
      ),
    )
    .get();
}

export async function loadSettings(ctx: AppContext, orgId: string): Promise<OrgSettingsRow> {
  const row = await ctx.db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get();
  if (row) return row;
  // Missing settings row (should not happen): create conservative defaults — autopilot off.
  await ctx.db.insert(orgSettings).values({ orgId }).onConflictDoNothing();
  const created = await ctx.db.select().from(orgSettings).where(eq(orgSettings.orgId, orgId)).get();
  if (!created) throw notFound("Organization settings");
  return created;
}

async function setStatus(
  ctx: AppContext,
  ids: AppIds,
  status: ApplicationStatus,
  extra: Partial<typeof applications.$inferInsert> = {},
) {
  await ctx.db
    .update(applications)
    .set({ status, ...extra })
    .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)));
}

/** Listing-only fallback when the RFP has not been parsed: generic sections, marked incomplete. */
export function fallbackRequirements(
  opp: Pick<OpportunityRow, "summary">,
): OpportunityRequirements {
  return OpportunityRequirementsSchema.parse({
    sections: [
      {
        key: "need_statement",
        title: "Statement of need",
        prompt: "Describe the need this project addresses and the population served.",
      },
      {
        key: "project_description",
        title: "Project description",
        prompt: "Describe the project, its activities, timeline and expected outcomes.",
        guidance: opp.summary,
      },
      {
        key: "organizational_capacity",
        title: "Organizational capacity",
        prompt: "Describe the organization's history, track record and capacity to deliver.",
      },
      {
        key: "budget_narrative",
        title: "Budget narrative",
        prompt: "Explain how the requested funds will be used.",
        kind: "budget",
      },
    ],
    complete: false,
  });
}

export function requirementsOf(opp: OpportunityRow): OpportunityRequirements {
  const parsed = OpportunityRequirementsSchema.safeParse(opp.requirements);
  if (parsed.success && parsed.data.sections.length > 0) return parsed.data;
  return fallbackRequirements(opp);
}

export function citedFactIds(content: ApplicationContent): string[] {
  const ids = new Set<string>();
  for (const s of content.sections)
    for (const p of s.paragraphs) for (const c of p.claims) for (const id of c.factIds) ids.add(id);
  return [...ids];
}

/** Deterministic id per automatic draft round so a retried step never creates a duplicate. */
export const draftVersionId = (applicationId: string, round: number) =>
  `ver_${applicationId.replace(/^app_/, "")}_d${round}`;

export async function nextDraftRound(ctx: AppContext, ids: AppIds): Promise<number> {
  const rows = await ctx.db
    .select({ id: applicationVersions.id })
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.orgId, ids.orgId),
        eq(applicationVersions.applicationId, ids.applicationId),
      ),
    )
    .all();
  let max = -1;
  for (const r of rows) {
    const m = /_d(\d+)$/.exec(r.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return max + 1;
}

export async function nextVersionNumber(ctx: AppContext, ids: AppIds): Promise<number> {
  const row = await ctx.db
    .select({ max: sql<number | null>`max(${applicationVersions.versionNumber})` })
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.orgId, ids.orgId),
        eq(applicationVersions.applicationId, ids.applicationId),
      ),
    )
    .get();
  return (row?.max ?? 0) + 1;
}

export async function applicationCost(ctx: AppContext, ids: AppIds) {
  const row = await ctx.db
    .select({
      costMicros: sql<number>`coalesce(sum(${llmCalls.costMicros}), 0)`,
      calls: sql<number>`count(*)`,
    })
    .from(llmCalls)
    .where(and(eq(llmCalls.orgId, ids.orgId), eq(llmCalls.applicationId, ids.applicationId)))
    .get();
  return { costMicros: Number(row?.costMicros ?? 0), calls: Number(row?.calls ?? 0) };
}

export async function countOpenFlags(ctx: AppContext, ids: AppIds, versionId: string | null) {
  if (!versionId) return { blockers: 0, warnings: 0, missingInfoBlockers: 0 };
  const rows = await ctx.db
    .select({ severity: applicationFlags.severity, kind: applicationFlags.kind })
    .from(applicationFlags)
    .where(
      and(
        eq(applicationFlags.orgId, ids.orgId),
        eq(applicationFlags.applicationId, ids.applicationId),
        eq(applicationFlags.versionId, versionId),
        eq(applicationFlags.status, "open"),
      ),
    )
    .all();
  return {
    blockers: rows.filter((r) => r.severity === "blocker").length,
    warnings: rows.filter((r) => r.severity === "warning").length,
    missingInfoBlockers: rows.filter((r) => r.severity === "blocker" && r.kind === "missing_info")
      .length,
  };
}

// ---------------------------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------------------------

/** Make sure the opportunity's requirements are parsed and the org has facts to draft from. */
export async function stepPrepare(ctx: AppContext, ids: AppIds) {
  const app = await loadApplication(ctx, ids);
  if (isFinal(app.status)) return { skipped: true, sections: 0, facts: 0 };
  let requirements: OpportunityRequirements | null = null;
  try {
    requirements = await pipelineDeps.ensureRequirements(ctx, app.opportunityId, ids.orgId);
  } catch (e) {
    // Drafting can still proceed from the listing; the drafter sees `complete: false`.
    ctx.logger.warn("pipeline.prepare.requirements_failed", {
      applicationId: app.id,
      error: String(e),
    });
  }
  const opp = await loadVisibleOpportunity(ctx, ids.orgId, app.opportunityId);
  if (!opp) throw notFound("Opportunity");
  const settings = await loadSettings(ctx, ids.orgId);
  const factRows = await pipelineDeps.factsForDrafting(ctx, ids.orgId, {
    projectId: app.projectId,
    includeProposed: settings.allowUnconfirmedFactsInDrafts,
  });
  const reqs = requirements ?? requirementsOf(opp);
  return { skipped: false, sections: reqs.sections.length, facts: factRows.length };
}

export interface DraftStepOptions {
  round: number;
  /** Reviewer comments / new-information note the drafter must address. */
  reviewerNotes?: string;
  actorId?: string | null;
}

/** Draft (or redraft) the whole application into a new immutable version. */
export async function stepDraft(ctx: AppContext, ids: AppIds, opts: DraftStepOptions) {
  const versionId = draftVersionId(ids.applicationId, opts.round);
  const existing = await loadVersion(ctx, ids, versionId);
  if (existing) {
    // A previous attempt inserted the version but died before pointing the application at it:
    // finish that attempt, or the application stays "drafting" and verify skips the version.
    const app = await loadApplication(ctx, ids);
    if (
      app.currentVersionId !== versionId &&
      (app.status === "draft_queued" || app.status === "drafting")
    ) {
      await setStatus(ctx, ids, "verifying", { currentVersionId: versionId });
    }
    return { versionId, versionNumber: existing.versionNumber, skipped: true };
  }

  const app = await loadApplication(ctx, ids);
  if (isFinal(app.status)) return { versionId: null, versionNumber: 0, skipped: true };
  if (opts.round === 0) await pipelineDeps.assertCanDraft(ctx, ids.orgId);

  await setStatus(ctx, ids, "drafting", { lastError: null });
  const opp = await loadVisibleOpportunity(ctx, ids.orgId, app.opportunityId);
  if (!opp) throw notFound("Opportunity");
  const settings = await loadSettings(ctx, ids.orgId);
  const factRows = await pipelineDeps.factsForDrafting(ctx, ids.orgId, {
    projectId: app.projectId,
    includeProposed: settings.allowUnconfirmedFactsInDrafts,
  });
  const previous = app.currentVersionId
    ? await loadVersion(ctx, ids, app.currentVersionId)
    : undefined;

  const result = await pipelineDeps.draft(ctx, {
    orgId: ids.orgId,
    applicationId: ids.applicationId,
    opportunity: opp,
    requirements: requirementsOf(opp),
    facts: factRows,
    projectId: app.projectId,
    requestedAmountCents: app.requestedAmountCents,
    reviewerNotes: opts.reviewerNotes,
    previous: previous?.content,
  });

  const versionNumber = await nextVersionNumber(ctx, ids);
  await ctx.db
    .insert(applicationVersions)
    .values({
      id: versionId,
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      versionNumber,
      content: result.content,
      executiveSummary: result.executiveSummary,
      keyPoints: result.keyPoints,
      authorType: "system",
      authorId: null,
      model: result.model,
      promptVersion: result.promptVersion,
      changeNote:
        opts.round === 0
          ? "Initial draft"
          : opts.reviewerNotes
            ? "Redraft addressing reviewer comments"
            : "Redraft with new information",
    })
    .onConflictDoNothing();
  await setStatus(ctx, ids, "verifying", { currentVersionId: versionId });

  if (opts.round === 0) {
    const cost = await applicationCost(ctx, ids);
    try {
      await pipelineDeps.recordDraftUsage(ctx, {
        orgId: ids.orgId,
        subjectId: ids.applicationId,
        costMicros: cost.costMicros,
      });
    } catch (e) {
      ctx.logger.warn("pipeline.draft.usage_failed", { applicationId: app.id, error: String(e) });
    }
  }
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: opts.actorId ? "user" : "system",
    actorId: opts.actorId ?? null,
    action: "application.drafted",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: { versionId, versionNumber, round: opts.round, model: result.model },
  });
  return { versionId, versionNumber, skipped: false };
}

/** Gaps the drafter left that the verifier did not already turn into missing_info flags. */
function gapFlags(content: ApplicationContent, flags: NormalizedFlag[]): NormalizedFlag[] {
  if (flags.some((f) => f.kind === "missing_info")) return [];
  const out: NormalizedFlag[] = [];
  for (const s of content.sections) {
    for (const g of s.gaps) {
      out.push({
        severity: "blocker",
        kind: "missing_info",
        sectionKey: s.key,
        claimId: null,
        message: `Missing information for "${s.title}": ${g.why || g.question}`,
        suggestedQuestion: g.question,
      });
    }
  }
  return out;
}

/**
 * Independently verify a version's claims, store the report + flags, and move the application to
 * needs_info (with a gap-fill interview) when information is missing.
 */
export async function stepVerify(ctx: AppContext, ids: AppIds, versionId: string) {
  const app = await loadApplication(ctx, ids);
  const version = await loadVersion(ctx, ids, versionId);
  if (!version) throw notFound("Application version");

  if (!version.groundingReport) {
    const opp = await loadVisibleOpportunity(ctx, ids.orgId, app.opportunityId);
    if (!opp) throw notFound("Opportunity");
    const settings = await loadSettings(ctx, ids.orgId);
    const cited = await pipelineDeps.factsByIds(ctx, ids.orgId, citedFactIds(version.content));
    const { report, flags } = await pipelineDeps.verify(ctx, {
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      content: version.content,
      facts: cited,
      requirements: requirementsOf(opp),
      autopilot: resolveAutomation(settings).autoSubmit,
      requestedAmountCents: app.requestedAmountCents ?? null,
    });
    const allFlags = [...flags, ...gapFlags(version.content, flags)];
    // One statement per flag (12 bound params each; a multi-row insert breaks D1's 100-param
    // limit at 9 flags), batched for one round trip per chunk.
    const flagRows = allFlags.map((f) => ({
      id: newId("flg"),
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      versionId,
      ...f,
    }));
    const [head = [], ...tail] = chunk(
      flagRows.map((r) => ctx.db.insert(applicationFlags).values(r)),
      D1_BATCH_CHUNK - 2,
    );
    // Replace any flags from a previous (or concurrent) attempt of this step: delete + insert +
    // report in one batch, which D1 runs atomically, so two runs never leave two copies.
    await ctx.db.batch([
      ctx.db
        .delete(applicationFlags)
        .where(
          and(eq(applicationFlags.orgId, ids.orgId), eq(applicationFlags.versionId, versionId)),
        ),
      ...head,
      ctx.db
        .update(applicationVersions)
        .set({ groundingReport: report })
        .where(
          and(eq(applicationVersions.id, versionId), eq(applicationVersions.orgId, ids.orgId)),
        ),
    ]);
    for (const part of tail) {
      const [first, ...rest] = part;
      if (first) await ctx.db.batch([first, ...rest]);
    }
    await audit(ctx, {
      orgId: ids.orgId,
      actorType: "system",
      action: "application.verified",
      targetType: "application",
      targetId: ids.applicationId,
      metadata: {
        versionId,
        passed: report.passed,
        unsupported: report.unsupported,
        numericMismatches: report.numericMismatches,
        flags: allFlags.length,
      },
    });
  }

  if (isFinal(app.status) || app.currentVersionId !== versionId) {
    return { status: app.status, needsInfo: false };
  }
  const counts = await countOpenFlags(ctx, ids, versionId);
  if (counts.missingInfoBlockers > 0) {
    // Claim the transition (compare-and-set on the status this run loaded): of two concurrent
    // runs only the one that moves the application creates the gap-fill interview, and only
    // after checking for an active one.
    const claimed = await ctx.db
      .update(applications)
      .set({ status: "needs_info" })
      .where(
        and(
          eq(applications.id, ids.applicationId),
          eq(applications.orgId, ids.orgId),
          eq(applications.status, app.status),
          eq(applications.currentVersionId, versionId),
        ),
      )
      .returning({ id: applications.id });
    if (claimed.length > 0) {
      await ensureGapFillInterview(ctx, ids, versionId);
      await notify(ctx, {
        orgId: ids.orgId,
        recipients: "editors",
        kind: "application.needs_info",
        title: `Needs your input: ${app.title}`,
        body: `${counts.missingInfoBlockers} missing detail(s) to fill in before this draft can be reviewed.`,
        link: `/orgs/${ids.orgId}/applications/${ids.applicationId}`,
        severity: "action",
        dedupeKey: `needs_info:${ids.applicationId}:${versionId}`,
      });
    }
    return { status: "needs_info" as const, needsInfo: true };
  }
  await setStatus(ctx, ids, "verifying");
  return { status: "verifying" as const, needsInfo: false };
}

async function ensureGapFillInterview(ctx: AppContext, ids: AppIds, versionId: string) {
  const open = await ctx.db
    .select({ id: interviews.id })
    .from(interviews)
    .where(
      and(
        eq(interviews.orgId, ids.orgId),
        eq(interviews.focusApplicationId, ids.applicationId),
        eq(interviews.kind, "gap_fill"),
        eq(interviews.status, "active"),
      ),
    )
    .get();
  if (open) return;
  const rows = await ctx.db
    .select()
    .from(applicationFlags)
    .where(
      and(
        eq(applicationFlags.orgId, ids.orgId),
        eq(applicationFlags.applicationId, ids.applicationId),
        eq(applicationFlags.versionId, versionId),
        eq(applicationFlags.kind, "missing_info"),
        eq(applicationFlags.status, "open"),
      ),
    )
    .all();
  const questions = [...new Set(rows.map((f) => f.suggestedQuestion ?? f.message))];
  if (questions.length === 0) return;
  try {
    await pipelineDeps.createGapFillInterview(ctx, {
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      questions,
    });
  } catch (e) {
    // The flags (with their questions) remain visible on the application either way.
    ctx.logger.warn("pipeline.gap_fill_interview_failed", {
      applicationId: ids.applicationId,
      error: String(e),
    });
  }
}

/** Moved to the safety rails (review/safety-rails.ts), the one place that judges human edits. */
export { hasHumanEditsSinceApproval } from "../review/safety-rails";

function startOfMonthUtc(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/** Choose the review tier and move the application to in_review (or approved for autopilot). */
export async function stepRoute(ctx: AppContext, ids: AppIds) {
  const app = await loadApplication(ctx, ids);
  if (isFinal(app.status) || !app.currentVersionId) {
    return { tier: app.reviewTier, status: app.status, skipped: true };
  }
  const version = await loadVersion(ctx, ids, app.currentVersionId);
  if (!version) throw notFound("Application version");
  const counts = await countOpenFlags(ctx, ids, version.id);
  if (counts.missingInfoBlockers > 0) {
    await setStatus(ctx, ids, "needs_info");
    return { tier: app.reviewTier, status: "needs_info" as const, skipped: false };
  }

  const opp = await loadVisibleOpportunity(ctx, ids.orgId, app.opportunityId);
  if (!opp) throw notFound("Opportunity");
  const settings = await loadSettings(ctx, ids.orgId);
  const match = await ctx.db
    .select()
    .from(opportunityMatches)
    .where(
      and(
        eq(opportunityMatches.orgId, ids.orgId),
        eq(opportunityMatches.opportunityId, app.opportunityId),
      ),
    )
    .get();

  const funderCond = opp.funderId
    ? eq(opportunities.funderId, opp.funderId)
    : eq(opportunities.funderName, opp.funderName);
  const prior = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(submissions)
    .innerJoin(applications, eq(applications.id, submissions.applicationId))
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .where(
      and(
        eq(submissions.orgId, ids.orgId),
        ne(submissions.status, "failed"),
        ne(submissions.applicationId, ids.applicationId),
        funderCond,
      ),
    )
    .get();
  const autoThisMonth = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(submissions)
    .where(
      and(
        eq(submissions.orgId, ids.orgId),
        eq(submissions.submittedByType, "autopilot"),
        ne(submissions.status, "failed"),
        gte(submissions.createdAt, startOfMonthUtc(ctx.now())),
      ),
    )
    .get();
  const changesRequested = await ctx.db
    .select({ id: reviews.id })
    .from(reviews)
    .where(
      and(
        eq(reviews.orgId, ids.orgId),
        eq(reviews.applicationId, ids.applicationId),
        eq(reviews.decision, "changes_requested"),
      ),
    )
    .get();

  // Every safety rail, loaded from D1 by the one module that owns them (review/safety-rails.ts).
  const rails = await loadSafetyRailFacts(ctx, { app, version, opportunity: opp });
  const decision = decideReviewTier({
    ...rails,
    settings,
    requestedAmountCents: app.requestedAmountCents ?? null,
    fitScore: match?.fitScore ?? null,
    likelihood: match ? match.likelihood : null,
    openBlockers: counts.blockers,
    isFirstSubmissionToFunder: Number(prior?.n ?? 0) === 0,
    autoSubmissionsThisMonth: Number(autoThisMonth?.n ?? 0),
    submissionChannelSupportsAuto: pipelineDeps.channelSupportsAuto(opp),
  });
  let tier: ReviewTier = decision.tier;
  let reasons = decision.reasons;
  if (tier === "auto" && changesRequested) {
    // A human asked for changes: a human must also approve the result.
    tier = "one_click";
    reasons = ["A reviewer requested changes, so the revised draft needs re-approval"];
  }
  const status: ApplicationStatus = tier === "auto" ? "approved" : "in_review";
  await setStatus(ctx, ids, status, { reviewTier: tier, reviewTierReason: reasonsToText(reasons) });
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: tier === "auto" ? "autopilot" : "system",
    action: "application.routed",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: {
      tier,
      reasons,
      versionId: version.id,
      requiredApprovals: decision.requiredApprovals,
      ...automationAuditMeta(decision.automation),
    },
  });
  if (status === "in_review") {
    await notify(ctx, {
      orgId: ids.orgId,
      recipients: "editors",
      kind: "application.ready_for_review",
      title: `Ready for review: ${app.title}`,
      body:
        tier === "one_click"
          ? "Check the draft and approve it in one click."
          : "This draft needs a full review before it can be submitted.",
      link: `/orgs/${ids.orgId}/applications/${ids.applicationId}`,
      severity: "action",
      dedupeKey: `review:${ids.applicationId}:${version.id}`,
    });
  }
  return { tier, status, skipped: false };
}

export interface SubmitStepOptions {
  submittedByType: "user" | "autopilot";
  submittedBy?: string | null;
  approvedBy?: string | null;
  requestId?: string;
}

/** A non-failed submission exists for this version (it was sent, or is waiting to be). */
async function hasLiveSubmission(ctx: AppContext, ids: AppIds, versionId: string) {
  const row = await ctx.db
    .select({ id: submissions.id })
    .from(submissions)
    .where(
      and(
        eq(submissions.orgId, ids.orgId),
        eq(submissions.applicationId, ids.applicationId),
        eq(submissions.versionId, versionId),
        ne(submissions.status, "failed"),
      ),
    )
    .get();
  return !!row;
}

/** Submit the current version (idempotent: the submission module dedupes per version). */
export async function stepSubmit(ctx: AppContext, ids: AppIds, opts: SubmitStepOptions) {
  const app = await loadApplication(ctx, ids);
  if (["submitted", "awarded", "declined", "withdrawn"].includes(app.status)) {
    return { status: app.status, skipped: true };
  }
  if (!app.currentVersionId) throw new AppError(409, "conflict", "Nothing to submit yet");
  const versionId = app.currentVersionId;
  let approvedBy = opts.approvedBy ?? null;
  if (!approvedBy && opts.submittedByType === "user") {
    const review = await ctx.db
      .select({ reviewerId: reviews.reviewerId })
      .from(reviews)
      .where(
        and(
          eq(reviews.orgId, ids.orgId),
          eq(reviews.applicationId, ids.applicationId),
          eq(reviews.versionId, app.currentVersionId),
          eq(reviews.decision, "approved"),
        ),
      )
      .orderBy(desc(reviews.createdAt))
      .get();
    approvedBy = review?.reviewerId ?? null;
  }
  try {
    await pipelineDeps.submit(ctx, {
      orgId: ids.orgId,
      applicationId: ids.applicationId,
      versionId: app.currentVersionId,
      submittedByType: opts.submittedByType,
      submittedBy: opts.submittedBy ?? undefined,
      approvedBy: approvedBy ?? undefined,
    });
  } catch (e) {
    // Only roll back to "approved" if the submission did not go through: an error after the
    // package was sent (e.g. a lost response) must not un-submit it, or the retry sees "approved",
    // the submission module dedupes, and the application never leaves "approved".
    // "submitting" alone may just be the approval claim (submitReviewDecision): it only counts as
    // gone through when a live submission exists for this version.
    const now = await loadApplication(ctx, ids).catch(() => null);
    if (
      !now ||
      !isFinal(now.status) ||
      (now.status === "submitting" && !(await hasLiveSubmission(ctx, ids, versionId)))
    ) {
      await setStatus(ctx, ids, "approved", {
        lastError: `Submission failed: ${String((e as Error).message ?? e).slice(0, 300)}`,
      });
    }
    throw e;
  }
  const after = await loadApplication(ctx, ids);
  if (after.status === "submitting" && !(await hasLiveSubmission(ctx, ids, versionId))) {
    // The approval claim is still held but nothing went out (e.g. the funder email failed and
    // lastError says why): back to approved, so approving again retries.
    await ctx.db
      .update(applications)
      .set({ status: "approved" })
      .where(
        and(
          eq(applications.id, ids.applicationId),
          eq(applications.orgId, ids.orgId),
          eq(applications.status, "submitting"),
        ),
      );
    return { status: "approved" as ApplicationStatus, skipped: false };
  }
  return { status: after.status, skipped: false };
}

/** Record a pipeline failure on the application (visible in the UI). */
export async function markFailed(ctx: AppContext, ids: AppIds, err: unknown) {
  const message =
    err instanceof AppError
      ? err.message
      : `Pipeline error: ${String((err as Error)?.message ?? err).slice(0, 300)}`;
  ctx.logger.error("pipeline.failed", { applicationId: ids.applicationId, error: String(err) });
  await setStatus(ctx, ids, "failed", { lastError: message });
}

/** Tiny state snapshot for Workflow branching (serializable). */
export async function pipelineState(ctx: AppContext, ids: AppIds) {
  const app = await loadApplication(ctx, ids);
  return { status: app.status, reviewTier: app.reviewTier, currentVersionId: app.currentVersionId };
}

/** Number of "changes requested" decisions so far (bounds automatic redraft loops). */
export async function changeRequestCount(ctx: AppContext, ids: AppIds): Promise<number> {
  const row = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(reviews)
    .where(
      and(
        eq(reviews.orgId, ids.orgId),
        eq(reviews.applicationId, ids.applicationId),
        eq(reviews.decision, "changes_requested"),
      ),
    )
    .get();
  return Number(row?.n ?? 0);
}

/** Latest reviewer comments to feed into a redraft. */
export async function latestReviewerNotes(ctx: AppContext, ids: AppIds): Promise<string> {
  const row = await ctx.db
    .select({ comments: reviews.comments })
    .from(reviews)
    .where(
      and(
        eq(reviews.orgId, ids.orgId),
        eq(reviews.applicationId, ids.applicationId),
        eq(reviews.decision, "changes_requested"),
      ),
    )
    .orderBy(desc(reviews.createdAt))
    .get();
  return row?.comments ?? "";
}
