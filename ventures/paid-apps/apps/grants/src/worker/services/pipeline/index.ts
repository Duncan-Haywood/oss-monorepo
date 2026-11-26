// Application lifecycle: create -> (Workflow | inline) draft -> verify -> route -> review -> submit.
// Routes call these functions; the Workflow (workflows/application-pipeline.ts) calls the steps.
import { ApplicationContent, Paragraph } from "@shared/content";
import { type ApplicationStatus, REVIEW_DECISIONS, type ReviewDecision } from "@shared/enums";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  opportunityMatches,
  reviews,
} from "../../db/schema";
import { AppError, badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { type ApprovalGate, gateApproval, toApprovalStatusDto } from "../approvals";
import { AwardTermsInput, onApplicationAwarded } from "../awards";
import { audit } from "../privacy/audit";
import { automationAuditMeta, presetDefaults, resolveAutomation } from "../review/automation";
import { pipelineDeps } from "./deps";
import { runQualityPass } from "./quality-step";
import {
  type AppIds,
  type ApplicationRow,
  changeRequestCount,
  countOpenFlags,
  latestReviewerNotes,
  loadApplication,
  loadSettings,
  loadVersion,
  loadVisibleOpportunity,
  MAX_CHANGE_REDRAFTS,
  markFailed,
  nextDraftRound,
  nextVersionNumber,
  requirementsOf,
  stepDraft,
  stepPrepare,
  stepRoute,
  stepSubmit,
  stepVerify,
} from "./steps";

export type { ApplicationRow } from "./steps";

export interface ApplicationPipelineParams {
  orgId: string;
  applicationId: string;
  /** user id that started the pipeline, or "autopilot" */
  startedBy: string;
}

/** Events the Workflow waits for (sent via instance.sendEvent). */
export type InfoProvidedEvent = { redraft: boolean };
export type ReviewDecisionEvent = {
  decision: ReviewDecision;
  reviewerId: string;
  comments: string;
};
/** Event payloads are untrusted at the Workflow boundary (anyone can `send-event`): validate. */
export const InfoProvidedPayload = z.object({ redraft: z.boolean() });
export const ReviewDecisionPayload = z.object({
  decision: z.enum(REVIEW_DECISIONS),
  reviewerId: z.string(),
  comments: z.string(),
});

/** Instance statuses in which a Workflow will still consume a sent event. */
const LIVE_WORKFLOW_STATUSES = ["queued", "running", "waiting", "paused", "waitingForPause"];

/** Statuses that block starting another application for the same opportunity. */
const INACTIVE_STATUSES: ApplicationStatus[] = ["withdrawn", "failed"];

/** Inline (synchronous, deterministic) mode for tests and the offline demo. */
export function runsInline(ctx: AppContext): boolean {
  const env = ctx.env as AppContext["env"] & { INLINE_JOBS?: string };
  return (
    env.APP_ENV === "test" ||
    env.INLINE_JOBS === "true" ||
    env.FAKE_EXTERNALS === "true" ||
    !env.APPLICATION_PIPELINE
  );
}

// ---------------------------------------------------------------------------------------------
// Create + run
// ---------------------------------------------------------------------------------------------

export interface CreateApplicationInput {
  orgId: string;
  opportunityId: string;
  projectId?: string | null;
  requestedAmountCents?: number | null;
  /** userId, or "autopilot" for auto-drafted matches */
  startedBy: string;
  requestId?: string;
}

export async function createApplication(
  ctx: AppContext,
  input: CreateApplicationInput,
): Promise<ApplicationRow> {
  const { orgId } = input;
  const opp = await loadVisibleOpportunity(ctx, orgId, input.opportunityId);
  if (!opp) throw notFound("Opportunity");

  const active = await ctx.db
    .select({ id: applications.id })
    .from(applications)
    .where(
      and(
        eq(applications.orgId, orgId),
        eq(applications.opportunityId, opp.id),
        notInArray(applications.status, INACTIVE_STATUSES),
      ),
    )
    .get();
  if (active) throw conflict("An application for this opportunity is already in progress");

  // Fail fast with 402 before creating anything if the plan has no drafts left.
  await pipelineDeps.assertCanDraft(ctx, orgId);

  const match = await ctx.db
    .select()
    .from(opportunityMatches)
    .where(and(eq(opportunityMatches.orgId, orgId), eq(opportunityMatches.opportunityId, opp.id)))
    .get();
  const projectId = input.projectId ?? match?.projectId ?? null;
  const requestedAmountCents =
    input.requestedAmountCents ?? match?.suggestedAskCents ?? opp.awardCeilingCents ?? null;
  const isAutopilot = input.startedBy === "autopilot";
  // Below `prepared` people start every draft: autopilot may not (defense in depth for autodraft).
  const automation = isAutopilot ? resolveAutomation(await loadSettings(ctx, orgId)) : null;
  if (automation && !automation.autoDraft) {
    throw conflict(
      `Automatic drafting is off at the "${presetDefaults(automation.level).label}" automation level`,
    );
  }
  const id = newId("app");
  const [row] = await ctx.db
    .insert(applications)
    .values({
      id,
      orgId,
      opportunityId: opp.id,
      matchId: match?.id ?? null,
      projectId,
      title: opp.title,
      status: "draft_queued",
      requestedAmountCents,
      deadline: opp.closeDate,
      createdBy: isAutopilot ? null : input.startedBy,
      workflowInstanceId: null,
    })
    .returning();
  if (!row) throw new Error("application insert failed");
  if (match && (match.status === "new" || match.status === "shortlisted")) {
    await ctx.db
      .update(opportunityMatches)
      .set({ status: "drafting" })
      .where(and(eq(opportunityMatches.id, match.id), eq(opportunityMatches.orgId, orgId)));
  }
  await audit(ctx, {
    orgId,
    actorType: isAutopilot ? "autopilot" : "user",
    actorId: isAutopilot ? null : input.startedBy,
    action: "application.created",
    targetType: "application",
    targetId: id,
    metadata: {
      opportunityId: opp.id,
      requestedAmountCents,
      projectId,
      ...(automation ? automationAuditMeta(automation) : {}),
    },
    requestId: input.requestId,
  });

  const ids = { orgId, applicationId: id };
  try {
    await pipelineDeps.scheduleDeadlineReminders(ctx, ids);
  } catch (e) {
    ctx.logger.warn("pipeline.reminders_failed", { applicationId: id, error: String(e) });
  }

  const params: ApplicationPipelineParams = {
    orgId,
    applicationId: id,
    startedBy: input.startedBy,
  };
  if (runsInline(ctx)) {
    await runPipelineInline(ctx, params);
  } else {
    try {
      const instance = await ctx.env.APPLICATION_PIPELINE.create({ id, params });
      await ctx.db
        .update(applications)
        .set({ workflowInstanceId: instance.id })
        .where(and(eq(applications.id, id), eq(applications.orgId, orgId)));
    } catch (e) {
      ctx.logger.error("pipeline.workflow_create_failed", { applicationId: id, error: String(e) });
      ctx.defer(runPipelineInline(ctx, params));
    }
  }
  return loadApplication(ctx, ids);
}

/** Runs the pipeline to its next human checkpoint (needs_info / in_review) or to submission. */
export async function runPipelineInline(ctx: AppContext, params: ApplicationPipelineParams) {
  const ids = { orgId: params.orgId, applicationId: params.applicationId };
  try {
    await stepPrepare(ctx, ids);
    const draft = await stepDraft(ctx, ids, { round: 0 });
    if (!draft.versionId) return;
    await continueAfterDraft(ctx, ids, draft.versionId);
  } catch (e) {
    await markFailed(ctx, ids, e);
  }
}

/** verify -> (needs_info | route -> [auto: submit]) */
async function continueAfterDraft(ctx: AppContext, ids: AppIds, versionId: string) {
  const verified = await stepVerify(ctx, ids, versionId);
  // Advisory rubric scoring: never throws, never blocks routing or submission.
  await runQualityPass(ctx, ids, versionId, runsInline(ctx));
  if (verified.needsInfo) return;
  await routeAndMaybeAutoSubmit(ctx, ids);
}

async function routeAndMaybeAutoSubmit(ctx: AppContext, ids: AppIds) {
  const routed = await stepRoute(ctx, ids);
  if (routed.tier === "auto" && routed.status === "approved") {
    await stepSubmit(ctx, ids, { submittedByType: "autopilot" });
  }
}

// ---------------------------------------------------------------------------------------------
// Workflow events
// ---------------------------------------------------------------------------------------------

/** Send an event to the application's Workflow instance. Returns false if it could not. */
async function notifyWorkflow(
  ctx: AppContext,
  app: ApplicationRow,
  type: "info_provided" | "review_decision",
  payload: InfoProvidedEvent | ReviewDecisionEvent,
  /** Runs once the instance is known to be live, right before the event is sent. */
  beforeSend?: () => Promise<void>,
): Promise<boolean> {
  if (runsInline(ctx)) return false;
  try {
    const instance = await ctx.env.APPLICATION_PIPELINE.get(app.workflowInstanceId ?? app.id);
    // A finished instance (complete after a wait timeout, errored, terminated) silently accepts
    // events nobody will consume: fall back to the inline path instead of dropping the action.
    const { status } = await instance.status();
    if (!LIVE_WORKFLOW_STATUSES.includes(status)) {
      ctx.logger.info("pipeline.workflow_not_live", { applicationId: app.id, type, status });
      return false;
    }
    await beforeSend?.();
    await instance.sendEvent({ type, payload });
    return true;
  } catch (e) {
    ctx.logger.warn("pipeline.workflow_event_failed", {
      applicationId: app.id,
      type,
      error: String(e),
    });
    return false;
  }
}

/**
 * New information is available (gap-fill interview completed, facts added): redraft and continue.
 * With `redraft: false` the current version is simply re-routed (e.g. the missing-info flags were
 * resolved by hand).
 */
export async function resumeAfterInfo(
  ctx: AppContext,
  input: AppIds & { redraft?: boolean; actorId?: string | null },
): Promise<ApplicationRow> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const app = await loadApplication(ctx, ids);
  if (app.status !== "needs_info") return app;
  const redraft = input.redraft ?? true;
  if (await notifyWorkflow(ctx, app, "info_provided", { redraft }))
    return loadApplication(ctx, ids);
  try {
    if (redraft) {
      const round = await nextDraftRound(ctx, ids);
      const draft = await stepDraft(ctx, ids, { round, actorId: input.actorId });
      if (draft.versionId) await continueAfterDraft(ctx, ids, draft.versionId);
    } else {
      await routeAndMaybeAutoSubmit(ctx, ids);
    }
  } catch (e) {
    await markFailed(ctx, ids, e);
  }
  return loadApplication(ctx, ids);
}

// ---------------------------------------------------------------------------------------------
// Review decisions
// ---------------------------------------------------------------------------------------------

const DECIDABLE: ApplicationStatus[] = ["in_review", "changes_requested", "approved"];

/** Atomically move the application to "submitting" if it is still in one of `from`. */
async function claimForSubmit(
  ctx: AppContext,
  ids: AppIds,
  from: ApplicationStatus[],
  versionId?: string,
): Promise<boolean> {
  const claimed = await ctx.db
    .update(applications)
    .set({ status: "submitting", lastError: null })
    .where(
      and(
        eq(applications.id, ids.applicationId),
        eq(applications.orgId, ids.orgId),
        inArray(applications.status, from),
        versionId ? eq(applications.currentVersionId, versionId) : undefined,
      ),
    )
    .returning({ id: applications.id });
  return claimed.length > 0;
}

/** Give back an approval claim that will not be submitted from here (only while still held). */
async function releaseApprovalClaim(ctx: AppContext, ids: AppIds, to: ApplicationStatus) {
  await ctx.db
    .update(applications)
    .set({ status: to })
    .where(
      and(
        eq(applications.id, ids.applicationId),
        eq(applications.orgId, ids.orgId),
        eq(applications.status, "submitting"),
      ),
    );
}

/** Approval progress returned with a decision that leaves the application in review. */
export type ApprovalStatusSummary = ReturnType<typeof toApprovalStatusDto> & { message: string };
const approvalSummary = (gate: ApprovalGate): ApprovalStatusSummary => ({
  ...toApprovalStatusDto(gate.evaluation),
  message: gate.message,
});

export async function submitReviewDecision(
  ctx: AppContext,
  input: AppIds & {
    reviewerId: string;
    decision: ReviewDecision;
    comments?: string;
    requestId?: string;
  },
): Promise<ApplicationRow & { approval?: ApprovalStatusSummary }> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const app = await loadApplication(ctx, ids);
  if (!DECIDABLE.includes(app.status) || !app.currentVersionId) {
    throw conflict(`Application is ${app.status.replace("_", " ")} and cannot be reviewed now`);
  }
  const comments = input.comments?.trim() ?? "";
  if (input.decision === "approved") {
    const counts = await countOpenFlags(ctx, ids, app.currentVersionId);
    if (counts.blockers > 0) {
      throw new AppError(
        409,
        "open_blockers",
        `Resolve ${counts.blockers} blocking flag${counts.blockers === 1 ? "" : "s"} before approving`,
      );
    }
  }
  if (input.decision === "changes_requested" && !comments) {
    throw badRequest("Tell the drafter what to change (comments are required)");
  }

  // Approval policy (services/approvals): an approval that does not yet complete the policy (and the
  // two-person rule) is recorded there and the application stays in review.
  let gate: ApprovalGate | undefined;
  if (input.decision === "approved") {
    gate = await gateApproval(ctx, {
      ...ids,
      versionId: app.currentVersionId,
      approverId: input.reviewerId,
      comments,
      requestId: input.requestId,
    });
    if (!gate.proceed) {
      return { ...(await loadApplication(ctx, ids)), approval: approvalSummary(gate) };
    }
  }

  // Claim-then-act: an approval atomically moves the application out of every decidable status
  // before anything else happens, so of two concurrent approves only one records a review and
  // reaches the submission step; the other gets a 409.
  if (
    input.decision === "approved" &&
    !(await claimForSubmit(ctx, ids, DECIDABLE, app.currentVersionId))
  ) {
    const now = await loadApplication(ctx, ids);
    if (gate?.recorded) return now; // a concurrent approval completed the policy and submits
    throw conflict(`Application is ${now.status.replace("_", " ")} and cannot be reviewed now`);
  }

  try {
    if (!gate?.recorded) {
      await ctx.db.insert(reviews).values({
        id: newId("rev"),
        orgId: ids.orgId,
        applicationId: ids.applicationId,
        versionId: app.currentVersionId,
        reviewerId: input.reviewerId,
        decision: input.decision,
        comments,
      });
    }
  } catch (e) {
    if (input.decision === "approved") await releaseApprovalClaim(ctx, ids, app.status);
    throw e;
  }
  if (input.decision !== "approved") {
    const status: ApplicationStatus =
      input.decision === "changes_requested" ? "changes_requested" : "withdrawn";
    await ctx.db
      .update(applications)
      .set({
        status,
        lastError: null,
        ...(input.decision === "rejected"
          ? { outcomeNotes: comments ? `Rejected in review: ${comments}` : "Rejected in review" }
          : {}),
      })
      .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)));
  }
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: input.reviewerId,
    action: `application.review_${input.decision}`,
    targetType: "application",
    targetId: ids.applicationId,
    metadata: { versionId: app.currentVersionId, tier: app.reviewTier },
    requestId: input.requestId,
  });

  if (input.decision === "rejected") {
    await terminateWorkflow(ctx, app);
    return loadApplication(ctx, ids);
  }
  const event: ReviewDecisionEvent = {
    decision: input.decision,
    reviewerId: input.reviewerId,
    comments,
  };
  // A live Workflow submits from "approved": hand the claim over right before waking it.
  let handedOff = false;
  const handOff =
    input.decision === "approved"
      ? async () => {
          handedOff = true;
          await releaseApprovalClaim(ctx, ids, "approved");
        }
      : undefined;
  if (await notifyWorkflow(ctx, app, "review_decision", event, handOff)) {
    return loadApplication(ctx, ids);
  }

  if (input.decision === "approved") {
    // Inline: submit while holding the claim (re-take it if the hand-off released it but the
    // event could not be delivered; if another request took it meanwhile, that one submits).
    if (handedOff && !(await claimForSubmit(ctx, ids, ["approved"]))) {
      return loadApplication(ctx, ids);
    }
    try {
      await stepSubmit(ctx, ids, {
        submittedByType: "user",
        submittedBy: input.reviewerId,
        approvedBy: input.reviewerId,
        requestId: input.requestId,
      });
    } catch (e) {
      // stepSubmit recorded lastError and left the application approved (retry = approve again).
      ctx.logger.warn("pipeline.submit_failed", { applicationId: app.id, error: String(e) });
    }
  } else {
    await redraftForChanges(ctx, ids, input.reviewerId);
  }
  return loadApplication(ctx, ids);
}

/** Automatic redraft addressing reviewer comments (bounded by MAX_CHANGE_REDRAFTS). */
export async function redraftForChanges(ctx: AppContext, ids: AppIds, actorId: string | null) {
  if ((await changeRequestCount(ctx, ids)) > MAX_CHANGE_REDRAFTS) return;
  try {
    const round = await nextDraftRound(ctx, ids);
    const draft = await stepDraft(ctx, ids, {
      round,
      reviewerNotes: await latestReviewerNotes(ctx, ids),
      actorId,
    });
    if (draft.versionId) await continueAfterDraft(ctx, ids, draft.versionId);
  } catch (e) {
    // Keep the human's decision visible; record the error instead of failing the application.
    ctx.logger.warn("pipeline.redraft_failed", {
      applicationId: ids.applicationId,
      error: String(e),
    });
    await ctx.db
      .update(applications)
      .set({
        status: "changes_requested",
        lastError: `Redraft failed: ${String((e as Error).message ?? e).slice(0, 300)}`,
      })
      .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)));
  }
}

async function terminateWorkflow(ctx: AppContext, app: ApplicationRow) {
  if (runsInline(ctx)) return;
  try {
    const instance = await ctx.env.APPLICATION_PIPELINE.get(app.workflowInstanceId ?? app.id);
    await instance.terminate();
  } catch (e) {
    ctx.logger.warn("pipeline.workflow_terminate_failed", {
      applicationId: app.id,
      error: String(e),
    });
  }
}

// ---------------------------------------------------------------------------------------------
// Human edits
// ---------------------------------------------------------------------------------------------

const EDITABLE: ApplicationStatus[] = [
  "needs_info",
  "in_review",
  "changes_requested",
  "approved",
  "failed",
];

async function assertEditable(ctx: AppContext, ids: AppIds) {
  const app = await loadApplication(ctx, ids);
  if (!EDITABLE.includes(app.status) || !app.currentVersionId) {
    throw conflict(`Application is ${app.status.replace("_", " ")} and cannot be edited now`);
  }
  const version = await loadVersion(ctx, ids, app.currentVersionId);
  if (!version) throw notFound("Application version");
  return { app, version };
}

/** After a human-made version: verify it, then re-route (and tell a waiting Workflow). */
async function reverifyAndRoute(
  ctx: AppContext,
  ids: AppIds,
  prev: ApplicationRow,
  versionId: string,
) {
  const verified = await stepVerify(ctx, ids, versionId);
  await runQualityPass(ctx, ids, versionId, runsInline(ctx));
  if (!verified.needsInfo) await stepRoute(ctx, ids);
  if (prev.status === "needs_info" && !verified.needsInfo) {
    await notifyWorkflow(ctx, prev, "info_provided", { redraft: false });
  }
  // stepRoute never routes a human-edited version to `auto` (see hasHumanEdits in
  // review/policy.ts): a person must approve it, here and in a waiting Workflow alike.
  return loadApplication(ctx, ids);
}

export const SectionEdit = z.object({ paragraphs: z.array(Paragraph) });

export async function editSection(
  ctx: AppContext,
  input: AppIds & {
    sectionKey: string;
    paragraphs: Paragraph[];
    userId: string;
    requestId?: string;
  },
): Promise<ApplicationRow> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const { app, version } = await assertEditable(ctx, ids);
  const sections = version.content.sections;
  const idx = sections.findIndex((s) => s.key === input.sectionKey);
  if (idx < 0) throw notFound("Section");
  const content = ApplicationContent.parse({
    sections: sections.map((s, i) => (i === idx ? { ...s, paragraphs: input.paragraphs } : s)),
  });
  const versionId = await insertUserVersion(ctx, ids, version, content, {
    authorType: "user",
    authorId: input.userId,
    changeNote: `Edited section "${sections[idx]?.title ?? input.sectionKey}"`,
  });
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "application.section_edited",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: { versionId, sectionKey: input.sectionKey },
    requestId: input.requestId,
  });
  return reverifyAndRoute(ctx, ids, app, versionId);
}

async function insertUserVersion(
  ctx: AppContext,
  ids: AppIds,
  base: typeof applicationVersions.$inferSelect,
  content: ApplicationContent,
  meta: {
    authorType: "user" | "system";
    authorId: string | null;
    changeNote: string;
    model?: string | null;
    promptVersion?: string | null;
  },
): Promise<string> {
  const id = newId("ver");
  const versionNumber = await nextVersionNumber(ctx, ids);
  await ctx.db.insert(applicationVersions).values({
    id,
    orgId: ids.orgId,
    applicationId: ids.applicationId,
    versionNumber,
    content,
    executiveSummary: base.executiveSummary,
    keyPoints: base.keyPoints,
    authorType: meta.authorType,
    authorId: meta.authorId,
    model: meta.model ?? null,
    promptVersion: meta.promptVersion ?? null,
    changeNote: meta.changeNote,
  });
  await ctx.db
    .update(applications)
    .set({ currentVersionId: id, status: "verifying", lastError: null })
    .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)));
  return id;
}

/** Regenerate one section (or the whole draft) with the drafter, then re-verify and re-route. */
export async function regenerate(
  ctx: AppContext,
  input: AppIds & {
    sectionKey?: string;
    instructions?: string;
    userId: string;
    requestId?: string;
    /** Version note for a section redraft (default "Regenerated section …"). */
    changeNote?: string;
  },
): Promise<ApplicationRow> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const { app, version } = await assertEditable(ctx, ids);
  if (!input.sectionKey) {
    const round = await nextDraftRound(ctx, ids);
    const draft = await stepDraft(ctx, ids, {
      round,
      reviewerNotes: input.instructions,
      actorId: input.userId,
    });
    if (!draft.versionId) return loadApplication(ctx, ids);
    return reverifyAndRoute(ctx, ids, app, draft.versionId);
  }
  if (!version.content.sections.some((s) => s.key === input.sectionKey)) {
    throw notFound("Section");
  }
  const opp = await loadVisibleOpportunity(ctx, ids.orgId, app.opportunityId);
  if (!opp) throw notFound("Opportunity");
  const settings = await loadSettings(ctx, ids.orgId);
  const factRows = await pipelineDeps.factsForDrafting(ctx, ids.orgId, {
    projectId: app.projectId,
    includeProposed: settings.allowUnconfirmedFactsInDrafts,
  });
  const result = await pipelineDeps.redraftSection(ctx, {
    orgId: ids.orgId,
    applicationId: ids.applicationId,
    opportunity: opp,
    requirements: requirementsOf(opp),
    facts: factRows,
    projectId: app.projectId,
    requestedAmountCents: app.requestedAmountCents,
    previous: version.content,
    sectionKey: input.sectionKey,
    instructions: input.instructions,
  });
  const versionId = await insertUserVersion(ctx, ids, version, result.content, {
    authorType: "system",
    authorId: input.userId,
    changeNote: input.changeNote ?? `Regenerated section "${input.sectionKey}"`,
    model: result.model,
    promptVersion: result.promptVersion,
  });
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "application.section_regenerated",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: { versionId, sectionKey: input.sectionKey },
    requestId: input.requestId,
  });
  return reverifyAndRoute(ctx, ids, app, versionId);
}

/** Resolve a flag; when the last missing-info blocker is resolved the application moves on. */
export async function resolveFlag(
  ctx: AppContext,
  input: AppIds & { flagId: string; resolution: string; userId: string; requestId?: string },
) {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const app = await loadApplication(ctx, ids);
  const flag = await ctx.db
    .select()
    .from(applicationFlags)
    .where(
      and(
        eq(applicationFlags.id, input.flagId),
        eq(applicationFlags.orgId, ids.orgId),
        eq(applicationFlags.applicationId, ids.applicationId),
      ),
    )
    .get();
  if (!flag) throw notFound("Flag");
  const [updated] = await ctx.db
    .update(applicationFlags)
    .set({
      status: "resolved",
      resolution: input.resolution,
      resolvedBy: input.userId,
      resolvedAt: ctx.now(),
    })
    .where(and(eq(applicationFlags.id, flag.id), eq(applicationFlags.orgId, ids.orgId)))
    .returning();
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "application.flag_resolved",
    targetType: "application",
    targetId: ids.applicationId,
    metadata: { flagId: flag.id, kind: flag.kind, severity: flag.severity },
    requestId: input.requestId,
  });
  if (flag.versionId === app.currentVersionId && flag.severity === "blocker") {
    const counts = await countOpenFlags(ctx, ids, flag.versionId);
    if (app.status === "needs_info" && counts.missingInfoBlockers === 0) {
      await resumeAfterInfo(ctx, { ...ids, redraft: false, actorId: input.userId });
    } else if (app.status === "in_review") {
      await stepRoute(ctx, ids); // the tier may drop from full_review once blockers are gone
    }
  }
  return updated ?? flag;
}

export async function withdrawApplication(
  ctx: AppContext,
  input: AppIds & { userId: string; requestId?: string },
): Promise<ApplicationRow> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const app = await loadApplication(ctx, ids);
  if (["submitted", "awarded", "declined", "withdrawn"].includes(app.status)) {
    throw conflict(`Application is already ${app.status}`);
  }
  await ctx.db
    .update(applications)
    .set({ status: "withdrawn" })
    .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)));
  await terminateWorkflow(ctx, app);
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "application.withdrawn",
    targetType: "application",
    targetId: ids.applicationId,
    requestId: input.requestId,
  });
  return loadApplication(ctx, ids);
}

export const OutcomeInput = z.object({
  outcome: z.enum(["awarded", "declined"]),
  awardedAmountCents: z.number().int().nonnegative().optional(),
  notes: z.string().max(5000).optional(),
  /** Grant period / number when known: seeds the award's report schedule (services/awards). */
  award: AwardTermsInput.optional(),
});

export async function recordOutcome(
  ctx: AppContext,
  input: AppIds & z.infer<typeof OutcomeInput> & { userId: string; requestId?: string },
): Promise<ApplicationRow> {
  const ids = { orgId: input.orgId, applicationId: input.applicationId };
  const app = await loadApplication(ctx, ids);
  if (!["submitting", "submitted", "awarded", "declined"].includes(app.status)) {
    throw conflict("Record an outcome only after the application was submitted");
  }
  await ctx.db
    .update(applications)
    .set({
      status: input.outcome,
      outcomeAt: ctx.now(),
      outcomeNotes: input.notes ?? null,
      awardedAmountCents:
        input.outcome === "awarded"
          ? (input.awardedAmountCents ?? app.requestedAmountCents ?? null)
          : null,
    })
    .where(and(eq(applications.id, ids.applicationId), eq(applications.orgId, ids.orgId)));
  await audit(ctx, {
    orgId: ids.orgId,
    actorType: "user",
    actorId: input.userId,
    action: `application.${input.outcome}`,
    targetType: "application",
    targetId: ids.applicationId,
    metadata: { awardedAmountCents: input.awardedAmountCents ?? null },
    requestId: input.requestId,
  });
  if (input.outcome === "awarded") {
    // Award row, report schedule, report_due follow-ups and the award fact. Never throws.
    await onApplicationAwarded(ctx, {
      ...ids,
      terms: input.award,
      userId: input.userId,
      requestId: input.requestId,
    });
  }
  return loadApplication(ctx, ids);
}

export {
  applicationCost,
  loadApplication,
  stepDraft,
  stepPrepare,
  stepRoute,
  stepSubmit,
  stepVerify,
} from "./steps";
