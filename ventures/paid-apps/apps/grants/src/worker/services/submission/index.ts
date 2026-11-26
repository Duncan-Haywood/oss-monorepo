// Submission module: builds the immutable package, picks a channel (email or manual), records the
// submission, schedules follow-ups and notifies the org's team. See channel.ts for why Grants.gov
// system-to-system submission is not implemented.
import type { ApplicationStatus } from "@shared/enums";
import { and, eq, gte, inArray, isNull, ne, or, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applications,
  applicationVersions,
  followups,
  opportunities,
  opportunityMatches,
  orgProfiles,
  orgSettings,
  reviews,
  submissions,
} from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { sha256Hex } from "../../lib/hash";
import { newId } from "../../lib/ids";
import { loadAttachmentFiles, prepareSubmissionAttachments } from "../attachments/checklist";
import { type FunderSubmissionData, renderEmail } from "../email-templates";
import { buildFunderAttachments, bytesToBase64, funderAttachmentNames } from "../export/funder";
import { notify } from "../notifications";
import { audit } from "../privacy/audit";
import {
  automationAuditMeta,
  type EffectiveAutomation,
  presetDefaults,
  requiredApprovals,
  resolveAutomation,
} from "../review/automation";
import { checkSafetyRails } from "../review/safety-rails";
import { buildManualGuide, isEmail, selectChannel } from "./channel";
import { loadOrgContacts, notifyTeam, type OrgContacts } from "./notify";
import {
  buildSubmissionPackage,
  formatAddress,
  renderPackageMarkdown,
  type SubmissionPackage,
  serializePackage,
} from "./package";

export { buildManualGuide, selectChannel } from "./channel";
export {
  buildSubmissionPackage,
  countWords,
  renderPackageMarkdown,
  renderSectionText,
  type SubmissionPackage,
  serializePackage,
} from "./package";

export type SubmissionRow = typeof submissions.$inferSelect;
export type FollowupRow = typeof followups.$inferSelect;

const DAY = 86_400_000;
/** Application statuses after which nothing should be (re)submitted or reminded. */
export const TERMINAL_STATUSES: ApplicationStatus[] = [
  "submitted",
  "awarded",
  "declined",
  "withdrawn",
];

export const packageKeys = (orgId: string, submissionId: string) => ({
  json: `orgs/${orgId}/submissions/${submissionId}/package.json`,
  md: `orgs/${orgId}/submissions/${submissionId}/package.md`,
});

export interface SubmitInput {
  orgId: string;
  applicationId: string;
  versionId: string;
  submittedByType: "user" | "autopilot";
  submittedBy?: string | null;
  approvedBy?: string | null;
  requestId?: string;
}

/**
 * Submit an application version. Idempotent per (application, version): a retry returns the
 * existing non-failed submission instead of sending again.
 */
export async function submitApplication(
  ctx: AppContext,
  input: SubmitInput,
): Promise<SubmissionRow> {
  const { orgId, applicationId, versionId } = input;
  const now = ctx.now();

  const app = await ctx.db
    .select()
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!app) throw notFound("Application");

  const existing = await ctx.db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.orgId, orgId),
        eq(submissions.applicationId, applicationId),
        inArray(submissions.status, ["pending", "sent", "confirmed"]),
      ),
    )
    .all();
  const same = existing.find((s) => s.versionId === versionId);
  if (same) {
    // Never send twice. If the funder email went out but the bookkeeping after it failed, finish
    // the bookkeeping now.
    if (
      same.channel === "email" &&
      same.status === "sent" &&
      !TERMINAL_STATUSES.includes(app.status)
    ) {
      await completeSentSubmission(ctx, app, same, input);
    }
    return same;
  }
  if (await providerAcceptedFailedSubmission(ctx, orgId, applicationId, versionId)) {
    throw conflict("This version was already emailed to the funder");
  }
  if (existing.some((s) => s.status !== "pending")) {
    throw conflict("This application has already been submitted");
  }
  if (TERMINAL_STATUSES.includes(app.status)) {
    throw conflict(`Application is ${app.status}`);
  }

  const version = await ctx.db
    .select()
    .from(applicationVersions)
    .where(
      and(
        eq(applicationVersions.id, versionId),
        eq(applicationVersions.orgId, orgId),
        eq(applicationVersions.applicationId, applicationId),
      ),
    )
    .get();
  if (!version) throw notFound("Application version");

  const opp = await ctx.db
    .select()
    .from(opportunities)
    .where(
      and(
        eq(opportunities.id, app.opportunityId),
        or(isNull(opportunities.privateToOrgId), eq(opportunities.privateToOrgId, orgId)),
      ),
    )
    .get();
  if (!opp) throw notFound("Opportunity");

  // Attachments checklist (services/attachments): a missing required attachment becomes a blocker
  // flag and refuses the submission (409 missing_attachments) before anything is prepared or sent.
  const checklist = await prepareSubmissionAttachments(ctx, {
    orgId,
    applicationId,
    versionId,
    requirements: opp.requirements,
  });

  const profile = await ctx.db.select().from(orgProfiles).where(eq(orgProfiles.orgId, orgId)).get();
  if (!profile) throw badRequest("Organization profile is missing");
  const settingsRow = await ctx.db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .get();
  const automation = settingsRow ? resolveAutomation(settingsRow) : null;
  // Two-person rule, re-checked before anything is prepared or sent (approvals are version-scoped).
  if (
    input.submittedByType === "user" &&
    automation &&
    requiredApprovals(automation, app.requestedAmountCents ?? null) > 1 &&
    (await distinctApprovers(ctx, orgId, applicationId, versionId)) < 2
  ) {
    throw conflict("Two different reviewers must approve this version before it is submitted");
  }
  const levelMeta =
    input.submittedByType === "autopilot" && automation ? automationAuditMeta(automation) : {};
  const contacts = await loadOrgContacts(ctx, orgId);

  // Supersede a pending manual submission of an older version.
  for (const old of existing) {
    await ctx.db
      .update(submissions)
      .set({ status: "failed", error: `Superseded by version ${version.versionNumber}` })
      .where(and(eq(submissions.id, old.id), eq(submissions.orgId, orgId)));
  }

  const submittedBy = input.submittedBy ?? null;
  const approvedBy = input.approvedBy ?? null;
  const id = newId("sub");
  const pkg = buildSubmissionPackage({
    submissionId: id,
    generatedAt: now,
    application: app,
    version,
    opportunity: opp,
    profile,
    approval: { submittedByType: input.submittedByType, submittedBy, approvedBy },
    attachments: checklist.items,
  });
  const json = serializePackage(pkg);
  const sha256 = await sha256Hex(json);
  const markdown = renderPackageMarkdown(pkg, { sha256 });
  const keys = packageKeys(orgId, id);
  await ctx.env.FILES.put(keys.json, json, {
    httpMetadata: { contentType: "application/json; charset=utf-8" },
    customMetadata: { sha256, orgId, submissionId: id },
  });
  await ctx.env.FILES.put(keys.md, markdown, {
    httpMetadata: { contentType: "text/markdown; charset=utf-8" },
    customMetadata: { packageSha256: sha256, orgId, submissionId: id },
  });

  // Never email a funder unless a human approved it (user) or the autopilot gates still hold at
  // send time (autopilot) — and only when the org has a reply-to contact.
  const replyTo = contacts.contactEmail ?? contacts.notifyEmails[0] ?? null;
  const humanApproved = input.submittedByType === "user" ? !!(submittedBy || approvedBy) : true;
  const autopilotBlocker =
    input.submittedByType === "autopilot"
      ? await autopilotEmailBlocker(ctx, orgId, app, version, automation)
      : null;
  // Matched attachment files ride along with a funder email only up to 10 MB in total; otherwise
  // (or when an original is gone) the manual guide lists them.
  const attachmentFiles =
    checklist.files.length > 0 && opp.submissionMethod === "email"
      ? await loadAttachmentFiles(ctx, orgId, checklist)
      : ({ ok: true, files: [] } as const);
  const baseGate = !humanApproved
    ? { emailAllowed: false, reason: "No approving user recorded; submit manually." }
    : !replyTo
      ? {
          emailAllowed: false,
          reason:
            "Add a contact email (profile) or notification email (settings) so the funder can reply; until then submit manually.",
        }
      : autopilotBlocker
        ? { emailAllowed: false, reason: `Not sent automatically: ${autopilotBlocker}` }
        : { emailAllowed: true };
  const gate =
    baseGate.emailAllowed && !attachmentFiles.ok
      ? { emailAllowed: false, reason: attachmentFiles.reason }
      : baseGate;
  const choice = selectChannel(opp, gate);
  const guide = choice.channel === "manual" ? buildManualGuide(pkg, choice) : null;
  // Funders get the application only (DOCX + plain text), never the internal package.md with its
  // grounding report and citations. Hashed so we know exactly what the funder received.
  const funderFiles = choice.channel === "email" ? buildFunderAttachments(pkg) : null;
  const funderShas = funderFiles
    ? await Promise.all(funderFiles.map((f) => sha256Hex(f.bytes)))
    : null;

  // Persisted as "pending" before anything is sent. The partial unique index on live submissions
  // per (application, version) makes a concurrent duplicate fail here; it returns the winner.
  const idempotencyKey = `submission:${id}`;
  let row: SubmissionRow | undefined;
  try {
    [row] = await ctx.db
      .insert(submissions)
      .values({
        id,
        orgId,
        applicationId,
        versionId,
        channel: choice.channel,
        status: "pending",
        packageR2Key: keys.json,
        packageSha256: sha256,
        recipient: choice.recipient,
        submittedByType: input.submittedByType,
        submittedBy,
        approvedBy,
        metadata: {
          method: choice.method,
          packageMdR2Key: keys.md,
          ...(funderShas
            ? { funderAttachmentSha256: funderShas[0], funderTextAttachmentSha256: funderShas[1] }
            : {}),
          idempotencyKey,
          ...(choice.fallbackReason ? { fallbackReason: choice.fallbackReason } : {}),
          ...(guide ? { guide } : {}),
        },
      })
      .returning();
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const winner = await ctx.db
      .select()
      .from(submissions)
      .where(
        and(
          eq(submissions.orgId, orgId),
          eq(submissions.applicationId, applicationId),
          eq(submissions.versionId, versionId),
          ne(submissions.status, "failed"),
        ),
      )
      .get();
    if (!winner) throw e;
    ctx.logger.info("submission.duplicate_suppressed", { orgId, submissionId: winner.id });
    return winner;
  }
  if (!row) throw new Error("submission insert failed");

  const actor = {
    actorType: input.submittedByType,
    actorId: submittedBy ?? approvedBy,
    requestId: input.requestId,
  } as const;

  if (choice.channel === "manual") {
    await ctx.db
      .update(applications)
      .set({ status: "submitting", lastError: null })
      .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
    await audit(ctx, {
      orgId,
      ...actor,
      action: "submission.package_prepared",
      targetType: "application",
      targetId: applicationId,
      metadata: {
        submissionId: id,
        channel: "manual",
        method: choice.method,
        sha256,
        versionId,
        ...levelMeta,
      },
    });
    await notifyTeam(
      ctx,
      orgId,
      renderEmail(
        "manualSubmissionInstructions",
        {
          orgId,
          orgName: contacts.legalName,
          applicationId,
          applicationTitle: app.title,
          funderName: opp.funderName,
          guide: guide ?? { title: "", steps: [] },
          deadline: pkg.application.deadline,
        },
        { appUrl: ctx.env.APP_URL },
      ),
      contacts,
    );
    return row;
  }

  // Email channel. The provider's message id is the proof the email went out: a failure before it
  // marks the submission failed (retryable); after it, the submission is never marked failed and
  // a retry finds the row and never sends again.
  let sent: { id: string };
  try {
    sent = await ctx.email.send({
      to: [choice.recipient as string],
      ...funderEmail(pkg, { submissionId: id, sha256 }, ctx.env.APP_URL),
      replyTo: replyTo ?? undefined,
      idempotencyKey,
      attachments: [
        ...(funderFiles ?? []),
        ...(attachmentFiles.ok ? attachmentFiles.files : []),
      ].map((f) => ({
        filename: f.filename,
        content: bytesToBase64(f.bytes),
        contentType: f.contentType,
      })),
    });
  } catch (e) {
    const error = `Email submission failed: ${String((e as Error).message ?? e).slice(0, 300)}`;
    const [failed] = await ctx.db
      .update(submissions)
      .set({ status: "failed", error })
      .where(and(eq(submissions.id, id), eq(submissions.orgId, orgId)))
      .returning();
    await ctx.db
      .update(applications)
      .set({ lastError: error })
      .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
    await audit(ctx, {
      orgId,
      ...actor,
      action: "submission.failed",
      targetType: "application",
      targetId: applicationId,
      metadata: { submissionId: id, channel: "email", ...levelMeta },
    });
    ctx.logger.error("submission.email_failed", { orgId, submissionId: id });
    return failed ?? { ...row, status: "failed", error };
  }

  // Sent: record it in its own (retried) write before any other bookkeeping.
  const metadata = { ...(row.metadata ?? {}), emailMessageId: sent.id };
  let updated: SubmissionRow | undefined;
  try {
    updated = await withRetry(ctx, "submission.record_sent", async () => {
      const [u] = await ctx.db
        .update(submissions)
        .set({ status: "sent", sentAt: now, metadata })
        .where(and(eq(submissions.id, id), eq(submissions.orgId, orgId)))
        .returning();
      return u;
    });
  } catch (e) {
    // Still "pending" (never failed): a retry returns that row and does not send again.
    ctx.logger.error("submission.sent_not_recorded", {
      orgId,
      submissionId: id,
      emailMessageId: sent.id,
      error: String(e),
    });
    throw new Error("The application was emailed to the funder but recording it failed");
  }
  const sentRow: SubmissionRow = updated ?? { ...row, status: "sent", sentAt: now, metadata };
  await withRetry(ctx, "submission.mark_submitted", () =>
    markApplicationSubmitted(ctx, {
      orgId,
      applicationId,
      matchId: app.matchId,
      submission: sentRow,
      at: now,
      actor,
      contacts,
      title: app.title,
      funderName: opp.funderName,
      auditMeta: levelMeta,
    }),
  );
  return sentRow;
}

/** Retries a D1 write a few times with a short backoff (for writes after a funder email). */
async function withRetry<T>(
  ctx: AppContext,
  what: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= attempts) throw e;
      ctx.logger.warn(`${what}.retry`, { attempt: i, error: String(e) });
      await new Promise((r) => setTimeout(r, 25 * 2 ** i));
    }
  }
}

function isUniqueViolation(e: unknown): boolean {
  for (let cur = e, depth = 0; cur && depth < 5; depth++) {
    if (/UNIQUE constraint failed/i.test(String((cur as Error).message ?? cur))) return true;
    cur = (cur as { cause?: unknown }).cause;
  }
  return false;
}

/** Legacy guard: a submission marked failed although the provider accepted its email. */
async function providerAcceptedFailedSubmission(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
  versionId: string,
): Promise<boolean> {
  const rows = await ctx.db
    .select({ metadata: submissions.metadata })
    .from(submissions)
    .where(
      and(
        eq(submissions.orgId, orgId),
        eq(submissions.applicationId, applicationId),
        eq(submissions.versionId, versionId),
        eq(submissions.status, "failed"),
      ),
    )
    .all();
  return rows.some((r) => typeof r.metadata?.emailMessageId === "string");
}

/** The funder email went out but a retry found the bookkeeping unfinished: finish it (no send). */
async function completeSentSubmission(
  ctx: AppContext,
  app: typeof applications.$inferSelect,
  sub: SubmissionRow,
  input: SubmitInput,
) {
  const opp = await ctx.db
    .select({ funderName: opportunities.funderName })
    .from(opportunities)
    .where(eq(opportunities.id, app.opportunityId))
    .get();
  await markApplicationSubmitted(ctx, {
    orgId: app.orgId,
    applicationId: app.id,
    matchId: app.matchId,
    submission: sub,
    at: sub.sentAt ?? ctx.now(),
    actor: {
      actorType: input.submittedByType,
      actorId: input.submittedBy ?? input.approvedBy ?? null,
      requestId: input.requestId,
    },
    title: app.title,
    funderName: opp?.funderName ?? "the funder",
  });
}

/**
 * Defense in depth for autopilot: the pipeline routed this application earlier, but the workflow
 * may have waited (or retried) since, and settings, flags or the current version can change in
 * between. Re-check the gates that must hold at the moment an email goes to a funder without a
 * human approval. Returns why email is not allowed, or null.
 */
async function autopilotEmailBlocker(
  ctx: AppContext,
  orgId: string,
  app: typeof applications.$inferSelect,
  version: typeof applicationVersions.$inferSelect,
  automation: EffectiveAutomation | null,
): Promise<string | null> {
  if (!automation || !presetDefaults(automation.level).autoSubmit) {
    const level = automation ? presetDefaults(automation.level).label : "unknown";
    return `autopilot is turned off for this organization (automation level "${level}").`;
  }
  if (automation.requireSubmissionApproval) {
    return "submission approval is required: a person approves every submission.";
  }
  if (app.reviewTier !== "auto") return "this application was not routed to autopilot.";
  if (app.currentVersionId !== version.id) return "this is not the current version.";
  if (requiredApprovals(automation, app.requestedAmountCents ?? null) > 1) {
    return "two different reviewers must approve this application (two-person rule).";
  }
  const settings = await ctx.db
    .select()
    .from(orgSettings)
    .where(eq(orgSettings.orgId, orgId))
    .get();
  if (!settings) return "the organization's settings are missing.";
  if (automation.riskThresholds) {
    const ask = app.requestedAmountCents ?? null;
    if (ask === null || ask > settings.autoSubmitMaxCents) {
      return "the requested amount is above the autopilot limit (or unknown).";
    }
  }
  const monthStart = new Date(Date.UTC(ctx.now().getUTCFullYear(), ctx.now().getUTCMonth(), 1));
  const used = await ctx.db
    .select({ n: sql<number>`count(*)` })
    .from(submissions)
    .where(
      and(
        eq(submissions.orgId, orgId),
        eq(submissions.submittedByType, "autopilot"),
        ne(submissions.status, "failed"),
        ne(submissions.applicationId, app.id),
        gte(submissions.createdAt, monthStart),
      ),
    )
    .get();
  if (Number(used?.n ?? 0) >= settings.maxAutoSubmissionsPerMonth) {
    return "the monthly autopilot cap is reached.";
  }
  // SAFETY RAILS (review/safety-rails.ts), re-checked from D1 right before the funder email.
  const rails = await checkSafetyRails(ctx, {
    orgId,
    applicationId: app.id,
    versionId: version.id,
  });
  if (rails.length > 0) {
    return `a safety rail failed: ${rails.map((r) => r.message).join("; ")}.`;
  }
  return null;
}

/** Distinct people who approved this exact version (reviews with decision "approved"). */
async function distinctApprovers(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
  versionId: string,
): Promise<number> {
  const rows = await ctx.db
    .selectDistinct({ reviewerId: reviews.reviewerId })
    .from(reviews)
    .where(
      and(
        eq(reviews.orgId, orgId),
        eq(reviews.applicationId, applicationId),
        eq(reviews.versionId, versionId),
        eq(reviews.decision, "approved"),
      ),
    )
    .all();
  return rows.length;
}

/** Mark a manual (or emailed) submission as confirmed by the user, with the funder's reference. */
export async function confirmSubmission(
  ctx: AppContext,
  input: {
    orgId: string;
    submissionId: string;
    userId: string;
    externalRef?: string | null;
    requestId?: string;
  },
): Promise<SubmissionRow> {
  const { orgId } = input;
  const sub = await ctx.db
    .select()
    .from(submissions)
    .where(and(eq(submissions.id, input.submissionId), eq(submissions.orgId, orgId)))
    .get();
  if (!sub) throw notFound("Submission");
  if (sub.status === "failed") throw conflict("This submission failed or was superseded");
  const externalRef = input.externalRef?.trim() || null;
  if (sub.status === "confirmed") {
    if (!externalRef || externalRef === sub.externalRef) return sub;
    const [u] = await ctx.db
      .update(submissions)
      .set({ externalRef })
      .where(and(eq(submissions.id, sub.id), eq(submissions.orgId, orgId)))
      .returning();
    return u ?? sub;
  }
  const now = ctx.now();
  const [updated] = await ctx.db
    .update(submissions)
    .set({
      status: "confirmed",
      confirmedAt: now,
      sentAt: sub.sentAt ?? now,
      externalRef: externalRef ?? sub.externalRef,
    })
    .where(and(eq(submissions.id, sub.id), eq(submissions.orgId, orgId)))
    .returning();
  const row = updated ?? sub;

  // Emailed submissions were already marked submitted; manual ones become submitted now.
  if (sub.status === "pending") {
    const app = await ctx.db
      .select({
        title: applications.title,
        matchId: applications.matchId,
        oppId: applications.opportunityId,
      })
      .from(applications)
      .where(and(eq(applications.id, sub.applicationId), eq(applications.orgId, orgId)))
      .get();
    const opp = app
      ? await ctx.db
          .select({ funderName: opportunities.funderName })
          .from(opportunities)
          .where(eq(opportunities.id, app.oppId))
          .get()
      : undefined;
    await markApplicationSubmitted(ctx, {
      orgId,
      applicationId: sub.applicationId,
      matchId: app?.matchId ?? null,
      submission: row,
      at: now,
      actor: { actorType: "user", actorId: input.userId, requestId: input.requestId },
      title: app?.title ?? "Application",
      funderName: opp?.funderName ?? "the funder",
    });
  } else {
    await audit(ctx, {
      orgId,
      actorType: "user",
      actorId: input.userId,
      requestId: input.requestId,
      action: "submission.confirmed",
      targetType: "submission",
      targetId: sub.id,
      metadata: { externalRef: row.externalRef },
    });
  }
  return row;
}

async function markApplicationSubmitted(
  ctx: AppContext,
  p: {
    orgId: string;
    applicationId: string;
    matchId: string | null;
    submission: SubmissionRow;
    at: Date;
    actor: { actorType: "user" | "autopilot"; actorId: string | null; requestId?: string };
    contacts?: OrgContacts;
    title: string;
    funderName: string;
    /** Extra audit metadata, e.g. the automation level in effect for autopilot submissions. */
    auditMeta?: Record<string, unknown>;
  },
) {
  const { orgId, applicationId, submission: sub, at } = p;
  await ctx.db
    .update(applications)
    .set({ status: "submitted", submittedAt: at, lastError: null })
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)));
  if (p.matchId) {
    await ctx.db
      .update(opportunityMatches)
      .set({ status: "applied" })
      .where(and(eq(opportunityMatches.id, p.matchId), eq(opportunityMatches.orgId, orgId)));
  }
  // Deadline reminders are moot once submitted.
  await ctx.db
    .update(followups)
    .set({ status: "skipped", notes: "Application submitted" })
    .where(
      and(
        eq(followups.orgId, orgId),
        eq(followups.applicationId, applicationId),
        eq(followups.kind, "deadline_reminder"),
        eq(followups.status, "pending"),
      ),
    );
  await ctx.db
    .insert(followups)
    .values([
      {
        id: newId("fup"),
        orgId,
        applicationId,
        submissionId: sub.id,
        kind: "status_check",
        title: `Check status of "${p.title}" with ${p.funderName}`,
        dueAt: new Date(at.getTime() + 30 * DAY),
        dedupeKey: `status_check:${sub.id}`,
      },
      {
        id: newId("fup"),
        orgId,
        applicationId,
        submissionId: sub.id,
        kind: "thank_you",
        title: `Optional: thank ${p.funderName} for the opportunity`,
        notes: "Optional courtesy note to the program officer.",
        dueAt: new Date(at.getTime() + DAY),
        dedupeKey: `thank_you:${sub.id}`,
      },
    ])
    .onConflictDoNothing();
  await audit(ctx, {
    orgId,
    actorType: p.actor.actorType,
    actorId: p.actor.actorId,
    requestId: p.actor.requestId,
    action: "application.submitted",
    targetType: "application",
    targetId: applicationId,
    metadata: {
      submissionId: sub.id,
      versionId: sub.versionId,
      channel: sub.channel,
      sha256: sub.packageSha256,
      recipient: sub.recipient,
      externalRef: sub.externalRef,
      ...(p.auditMeta ?? {}),
    },
  });
  await notify(ctx, {
    orgId,
    recipients: "members",
    kind: "submission.sent",
    title: `Submitted: ${p.title}`,
    body:
      sub.channel === "email"
        ? `Emailed to ${p.funderName}. We'll remind you to check its status in 30 days.`
        : `Marked as submitted to ${p.funderName}. We'll remind you to check its status in 30 days.`,
    link: `/orgs/${orgId}/applications/${applicationId}`,
    severity: "success",
    dedupeKey: `submitted:${sub.id}`,
  });
  await notifyTeam(
    ctx,
    orgId,
    (contacts) =>
      renderEmail(
        "submissionSent",
        {
          orgId,
          orgName: contacts.legalName,
          applicationId,
          applicationTitle: p.title,
          funderName: p.funderName,
          channel: sub.channel === "email" ? "email" : "manual",
          recipient: sub.recipient,
          externalRef: sub.externalRef,
          packageSha256: sub.packageSha256,
          statusCheckInDays: 30,
        },
        { appUrl: ctx.env.APP_URL },
      ),
    p.contacts,
  );
}

/**
 * Schedule deadline reminders (deadline −14 days and −3 days). Past dates are skipped. Idempotent:
 * re-running updates the due date of still-pending reminders if the deadline moved.
 */
export async function scheduleDeadlineReminders(
  ctx: AppContext,
  input: { orgId: string; applicationId: string },
): Promise<FollowupRow[]> {
  const { orgId, applicationId } = input;
  const app = await ctx.db
    .select({
      id: applications.id,
      title: applications.title,
      status: applications.status,
      deadline: applications.deadline,
      closeDate: opportunities.closeDate,
      funderName: opportunities.funderName,
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!app) throw notFound("Application");
  const deadline = app.deadline ?? app.closeDate;
  if (!deadline || TERMINAL_STATUSES.includes(app.status)) return [];
  const now = ctx.now().getTime();
  const out: FollowupRow[] = [];
  for (const days of [14, 3]) {
    const dueAt = new Date(deadline.getTime() - days * DAY);
    if (dueAt.getTime() <= now) continue;
    const title = `"${app.title}" is due in ${days} days (${deadline.toISOString().slice(0, 10)})`;
    const dedupeKey = `deadline:${applicationId}:${days}d`;
    await ctx.db
      .insert(followups)
      .values({
        id: newId("fup"),
        orgId,
        applicationId,
        kind: "deadline_reminder",
        title,
        notes: `Deadline for ${app.funderName}.`,
        dueAt,
        dedupeKey,
      })
      .onConflictDoNothing();
    // If the deadline moved, move reminders that have not fired yet.
    await ctx.db
      .update(followups)
      .set({ dueAt, title })
      .where(
        and(
          eq(followups.orgId, orgId),
          eq(followups.dedupeKey, dedupeKey),
          eq(followups.status, "pending"),
          isNull(followups.notifiedAt),
        ),
      );
    const row = await ctx.db
      .select()
      .from(followups)
      .where(and(eq(followups.orgId, orgId), eq(followups.dedupeKey, dedupeKey)))
      .get();
    if (row) out.push(row);
  }
  return out;
}

// ---- Funder email -------------------------------------------------------------------------

/** The funder email's main (DOCX) attachment filename. */
export function funderAttachmentFilename(pkg: SubmissionPackage): string {
  return funderAttachmentNames(pkg).docx;
}

/** Template data for the funder cover note: applicant identity and the request only. */
export function funderSubmissionData(
  pkg: SubmissionPackage,
  ref: { submissionId: string; sha256: string },
): FunderSubmissionData {
  const a = pkg.applicant;
  const o = pkg.opportunity;
  const sections = pkg.sections.map((s) => s.title).filter(Boolean);
  return {
    funderName: o.funderName,
    opportunityTitle: o.title,
    opportunityNumber: o.opportunityNumber,
    applicant: {
      legalName: a.legalName,
      dba: a.dba,
      ein: a.ein,
      uei: a.uei,
      address: formatAddress(a.address) || null,
      websiteUrl: a.websiteUrl,
      contact: a.contact,
    },
    requestedAmountCents: pkg.application.requestedAmountCents,
    executiveSummary: pkg.executiveSummary,
    attachments: [
      {
        filename: funderAttachmentNames(pkg).docx,
        description: `The application as a Word document: applicant details${sections.length ? ` and the narrative sections (${sections.join("; ")})` : ""}.`,
      },
      {
        filename: funderAttachmentNames(pkg).txt,
        description: "The same application as plain text.",
      },
      ...pkg.attachmentsChecklist
        .filter((x) => x.filename && x.status !== "waived")
        .map((x) => ({ filename: x.filename as string, description: x.name })),
    ],
    reference: { submissionId: ref.submissionId, packageSha256: ref.sha256 },
  };
}

/** The formal cover email to the funder (subject, text and HTML). */
export function funderEmail(
  pkg: SubmissionPackage,
  ref: { submissionId: string; sha256: string },
  appUrl: string,
) {
  return renderEmail("funderSubmission", funderSubmissionData(pkg, ref), { appUrl });
}

export { isEmail };
