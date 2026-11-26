// Application activity timeline: loads every source for one application (tenant-scoped), strips
// all text down to counts and labels, and hands it to the pure builder (build.ts).
import type { TimelineResponse } from "@shared/api/timeline";
import type { ApplicationContent } from "@shared/content";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  applicationFlags,
  applications,
  applicationVersions,
  auditLog,
  feedback,
  interviews,
  llmCalls,
  reviews,
  submissions,
  user,
} from "../../db/schema";
import { chunk, D1_IN_CHUNK } from "../../lib/chunk";
import { notFound } from "../../lib/errors";
import { paginateTimeline, type TimelineSources, type TlAudit, type TlVersion } from "./build";

export type { TimelineSources } from "./build";
export {
  buildTimelineEvents,
  DEFAULT_TIMELINE_LIMIT,
  decodeTimelineCursor,
  encodeTimelineCursor,
  formatDuration,
  formatUsd,
  MAX_TIMELINE_LIMIT,
  paginateTimeline,
  whoDecided,
} from "./build";

/** Per-source row caps (one application's history is small; these only bound worst cases). */
const MAX_ROWS = 2_000;

/** Audit target types that name the application or one of its children. */
const AUDIT_TARGET_TYPES = [
  "application",
  "application_version",
  "version",
  "application_flag",
  "flag",
  "submission",
];

function contentCounts(content: ApplicationContent | null | undefined) {
  const facts = new Set<string>();
  let gaps = 0;
  for (const s of content?.sections ?? []) {
    gaps += s.gaps?.length ?? 0;
    for (const p of s.paragraphs)
      for (const c of p.claims) for (const id of c.factIds) facts.add(id);
  }
  return { factsCited: facts.size, sections: content?.sections.length ?? 0, gaps };
}

export async function loadTimelineSources(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
): Promise<TimelineSources> {
  const app = await ctx.db
    .select({
      id: applications.id,
      status: applications.status,
      createdAt: applications.createdAt,
      createdBy: applications.createdBy,
      currentVersionId: applications.currentVersionId,
    })
    .from(applications)
    .where(and(eq(applications.id, applicationId), eq(applications.orgId, orgId)))
    .get();
  if (!app) throw notFound("Application");

  const [versionRows, flagRows, reviewRows, feedbackRows, submissionRows, llmRows, ivRows] =
    await Promise.all([
      ctx.db
        .select({
          id: applicationVersions.id,
          versionNumber: applicationVersions.versionNumber,
          authorType: applicationVersions.authorType,
          authorId: applicationVersions.authorId,
          model: applicationVersions.model,
          changeNote: applicationVersions.changeNote,
          createdAt: applicationVersions.createdAt,
          content: applicationVersions.content,
          report: applicationVersions.groundingReport,
        })
        .from(applicationVersions)
        .where(
          and(
            eq(applicationVersions.orgId, orgId),
            eq(applicationVersions.applicationId, applicationId),
          ),
        )
        .orderBy(applicationVersions.versionNumber)
        .limit(MAX_ROWS)
        .all(),
      ctx.db
        .select({
          id: applicationFlags.id,
          versionId: applicationFlags.versionId,
          severity: applicationFlags.severity,
          kind: applicationFlags.kind,
          sectionKey: applicationFlags.sectionKey,
          status: applicationFlags.status,
          resolvedBy: applicationFlags.resolvedBy,
          resolvedAt: applicationFlags.resolvedAt,
          createdAt: applicationFlags.createdAt,
        })
        .from(applicationFlags)
        .where(
          and(eq(applicationFlags.orgId, orgId), eq(applicationFlags.applicationId, applicationId)),
        )
        .limit(MAX_ROWS)
        .all(),
      ctx.db
        .select({
          id: reviews.id,
          versionId: reviews.versionId,
          reviewerId: reviews.reviewerId,
          decision: reviews.decision,
          hasComments: sql<number>`length(${reviews.comments}) > 0`,
          createdAt: reviews.createdAt,
        })
        .from(reviews)
        .where(and(eq(reviews.orgId, orgId), eq(reviews.applicationId, applicationId)))
        .limit(MAX_ROWS)
        .all(),
      ctx.db
        .select({
          id: feedback.id,
          versionId: feedback.versionId,
          sectionKey: feedback.sectionKey,
          rating: feedback.rating,
          tags: feedback.tags,
          createdBy: feedback.createdBy,
          createdAt: feedback.createdAt,
        })
        .from(feedback)
        .where(and(eq(feedback.orgId, orgId), eq(feedback.applicationId, applicationId)))
        .limit(MAX_ROWS)
        .all(),
      ctx.db
        .select({
          id: submissions.id,
          versionId: submissions.versionId,
          channel: submissions.channel,
          status: submissions.status,
          packageSha256: submissions.packageSha256,
          submittedByType: submissions.submittedByType,
          submittedBy: submissions.submittedBy,
          approvedBy: submissions.approvedBy,
          sentAt: submissions.sentAt,
          confirmedAt: submissions.confirmedAt,
          createdAt: submissions.createdAt,
        })
        .from(submissions)
        .where(and(eq(submissions.orgId, orgId), eq(submissions.applicationId, applicationId)))
        .limit(MAX_ROWS)
        .all(),
      ctx.db
        .select({
          purpose: llmCalls.purpose,
          model: llmCalls.model,
          calls: sql<number>`count(*)`,
          costMicros: sql<number>`coalesce(sum(${llmCalls.costMicros}), 0)`,
          firstAt: sql<number>`min(${llmCalls.createdAt})`,
          lastAt: sql<number>`max(${llmCalls.createdAt})`,
        })
        .from(llmCalls)
        .where(and(eq(llmCalls.orgId, orgId), eq(llmCalls.applicationId, applicationId)))
        .groupBy(llmCalls.purpose, llmCalls.model)
        .all(),
      ctx.db
        .select({ id: interviews.id, createdAt: interviews.createdAt })
        .from(interviews)
        .where(
          and(
            eq(interviews.orgId, orgId),
            eq(interviews.focusApplicationId, applicationId),
            eq(interviews.kind, "gap_fill"),
          ),
        )
        .limit(MAX_ROWS)
        .all(),
    ]);

  // Audit rows that target the application, its versions, flags or submissions.
  const targetIds = [
    applicationId,
    ...versionRows.map((v) => v.id),
    ...flagRows.map((f) => f.id),
    ...submissionRows.map((s) => s.id),
  ];
  const audit: TlAudit[] = [];
  for (const ids of chunk(targetIds, D1_IN_CHUNK)) {
    const rows = await ctx.db
      .select({
        id: auditLog.id,
        actorType: auditLog.actorType,
        actorId: auditLog.actorId,
        action: auditLog.action,
        targetType: auditLog.targetType,
        targetId: auditLog.targetId,
        metadata: auditLog.metadata,
        createdAt: auditLog.createdAt,
      })
      .from(auditLog)
      .where(
        and(
          eq(auditLog.orgId, orgId),
          inArray(auditLog.targetType, AUDIT_TARGET_TYPES),
          inArray(auditLog.targetId, ids),
        ),
      )
      .limit(MAX_ROWS)
      .all();
    audit.push(...rows);
  }

  const versions: TlVersion[] = versionRows.map(({ content, report, ...v }) => ({
    ...v,
    ...contentCounts(content),
    report: report
      ? {
          passed: report.passed,
          totalClaims: report.totalClaims,
          factualClaims: report.factualClaims,
          supported: report.supported,
          unsupported: report.unsupported,
          numericMismatches: report.numericMismatches,
        }
      : null,
  }));

  const userIds = new Set<string>();
  const add = (id: string | null | undefined) => id && userIds.add(id);
  add(app.createdBy);
  for (const v of versionRows) add(v.authorId);
  for (const f of flagRows) add(f.resolvedBy);
  for (const r of reviewRows) add(r.reviewerId);
  for (const f of feedbackRows) add(f.createdBy);
  for (const s of submissionRows) {
    add(s.submittedBy);
    add(s.approvedBy);
  }
  for (const a of audit) if (a.actorType === "user") add(a.actorId);
  const names = new Map<string, string>();
  for (const ids of chunk([...userIds], D1_IN_CHUNK)) {
    const rows = await ctx.db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, ids))
      .all();
    for (const r of rows) if (r.name.trim()) names.set(r.id, r.name.trim());
  }

  return {
    orgId,
    app,
    versions,
    flags: flagRows,
    reviews: reviewRows.map((r) => ({ ...r, hasComments: Boolean(Number(r.hasComments)) })),
    feedback: feedbackRows.map((f) => ({ ...f, tags: Array.isArray(f.tags) ? f.tags : [] })),
    submissions: submissionRows,
    llm: llmRows.map((r) => ({
      purpose: r.purpose,
      model: r.model,
      calls: Number(r.calls),
      costMicros: Number(r.costMicros),
      firstAt: new Date(Number(r.firstAt)),
      lastAt: new Date(Number(r.lastAt)),
    })),
    audit,
    gapFillInterviews: ivRows,
    names,
  };
}

/** GET /applications/:id/timeline: one chronological page plus the "Who decided?" summary. */
export async function getApplicationTimeline(
  ctx: AppContext,
  orgId: string,
  applicationId: string,
  opts: { cursor?: string; limit?: number } = {},
): Promise<TimelineResponse> {
  const src = await loadTimelineSources(ctx, orgId, applicationId);
  return paginateTimeline(src, opts);
}
