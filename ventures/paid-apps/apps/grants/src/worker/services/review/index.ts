// Review queue + quality feedback. Decisions live in services/pipeline (they drive the lifecycle).
import type { ApplicationStatus } from "@shared/enums";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppContext } from "../../context";
import { applicationFlags, applications, feedback, opportunities } from "../../db/schema";
import { newId } from "../../lib/ids";
import { loadApplication } from "../pipeline/steps";
import { audit } from "../privacy/audit";

export { decideReviewTier, type ReviewPolicyInput, type ReviewTierDecision } from "./policy";

const REVIEW_QUEUE_STATUSES: ApplicationStatus[] = ["in_review", "changes_requested"];

/** Applications awaiting a human, soonest deadline first (no deadline last). */
export async function reviewQueue(ctx: AppContext, orgId: string) {
  const rows = await ctx.db
    .select({
      app: applications,
      opportunity: {
        id: opportunities.id,
        title: opportunities.title,
        funderName: opportunities.funderName,
        closeDate: opportunities.closeDate,
      },
    })
    .from(applications)
    .innerJoin(opportunities, eq(opportunities.id, applications.opportunityId))
    .where(and(eq(applications.orgId, orgId), inArray(applications.status, REVIEW_QUEUE_STATUSES)))
    .orderBy(sql`${applications.deadline} is null`, asc(applications.deadline))
    .limit(200)
    .all();
  // Join through current_version_id rather than an IN list of version ids: a fixed handful of
  // bound params however long the queue (an IN list breaks D1's 100-param limit at 98 apps).
  const counts = rows.some((r) => r.app.currentVersionId)
    ? await ctx.db
        .select({
          versionId: applicationFlags.versionId,
          severity: applicationFlags.severity,
          n: sql<number>`count(*)`,
        })
        .from(applicationFlags)
        .innerJoin(
          applications,
          and(
            eq(applications.currentVersionId, applicationFlags.versionId),
            eq(applications.orgId, orgId),
          ),
        )
        .where(
          and(
            eq(applicationFlags.orgId, orgId),
            eq(applicationFlags.status, "open"),
            inArray(applications.status, REVIEW_QUEUE_STATUSES),
          ),
        )
        .groupBy(applicationFlags.versionId, applicationFlags.severity)
        .all()
    : [];
  const count = (versionId: string | null, severity: "blocker" | "warning") =>
    Number(counts.find((c) => c.versionId === versionId && c.severity === severity)?.n ?? 0);
  return rows.map((r) => ({
    ...r.app,
    opportunity: r.opportunity,
    openBlockers: count(r.app.currentVersionId, "blocker"),
    openWarnings: count(r.app.currentVersionId, "warning"),
  }));
}

export const FeedbackInput = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(5000).optional(),
  sectionKey: z.string().min(1).max(200).nullish(),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
});

export async function addFeedback(
  ctx: AppContext,
  input: { orgId: string; applicationId: string; userId: string; requestId?: string } & z.infer<
    typeof FeedbackInput
  >,
) {
  const app = await loadApplication(ctx, input);
  const [row] = await ctx.db
    .insert(feedback)
    .values({
      id: newId("fbk"),
      orgId: input.orgId,
      applicationId: app.id,
      versionId: app.currentVersionId,
      sectionKey: input.sectionKey ?? null,
      rating: input.rating,
      comment: input.comment ?? "",
      tags: input.tags ?? [],
      createdBy: input.userId,
    })
    .returning();
  await audit(ctx, {
    orgId: input.orgId,
    actorType: "user",
    actorId: input.userId,
    action: "application.feedback_added",
    targetType: "application",
    targetId: app.id,
    metadata: { rating: input.rating, sectionKey: input.sectionKey ?? null },
    requestId: input.requestId,
  });
  return row;
}

export async function listFeedback(ctx: AppContext, orgId: string, applicationId: string) {
  await loadApplication(ctx, { orgId, applicationId });
  return ctx.db
    .select()
    .from(feedback)
    .where(and(eq(feedback.orgId, orgId), eq(feedback.applicationId, applicationId)))
    .orderBy(desc(feedback.createdAt))
    .all();
}
