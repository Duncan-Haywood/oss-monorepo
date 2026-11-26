// Tenant-scoped reads the drafter needs beyond its input: reviewer feedback ("do more of / avoid")
// and the focus project's description. Every query filters by orgId.
import { and, desc, eq, gte, lte, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { feedback, projects } from "../../db/schema";
import type { FeedbackNote } from "./prompts";

const FEEDBACK_PER_POLARITY = 6;

export async function loadFeedbackNotes(
  ctx: AppContext,
  orgId: string,
): Promise<{ doMore: FeedbackNote[]; avoid: FeedbackNote[] }> {
  const cols = {
    rating: feedback.rating,
    comment: feedback.comment,
    sectionKey: feedback.sectionKey,
  };
  const [doMore, avoid] = await Promise.all([
    ctx.db
      .select(cols)
      .from(feedback)
      .where(and(eq(feedback.orgId, orgId), gte(feedback.rating, 4), ne(feedback.comment, "")))
      .orderBy(desc(feedback.rating), desc(feedback.createdAt))
      .limit(FEEDBACK_PER_POLARITY)
      .all(),
    ctx.db
      .select(cols)
      .from(feedback)
      .where(and(eq(feedback.orgId, orgId), lte(feedback.rating, 2), ne(feedback.comment, "")))
      .orderBy(feedback.rating, desc(feedback.createdAt))
      .limit(FEEDBACK_PER_POLARITY)
      .all(),
  ]);
  return { doMore, avoid };
}

export async function loadProjectFocus(
  ctx: AppContext,
  orgId: string,
  projectId: string | null | undefined,
): Promise<{ title: string; summary: string } | null> {
  if (!projectId) return null;
  const row = await ctx.db
    .select({ title: projects.title, summary: projects.summary, approach: projects.approach })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)))
    .get();
  if (!row) return null;
  return { title: row.title, summary: [row.summary, row.approach].filter(Boolean).join(" ") };
}
