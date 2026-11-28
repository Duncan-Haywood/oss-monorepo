// The job's saved sworn statement draft (db/schema/sworn-statements.ts): read by everyone in the
// company, saved and cleared by editors. One row per job; a save replaces it whole.

import type { SwornDraft, SwornDraftDto } from "@shared/sworn-statement";
import { and, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { swornStatementDrafts, user } from "../../db/schema";
import { getProjectRow } from "./bundle";

export async function getSwornDraft(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<SwornDraftDto> {
  await getProjectRow(ctx, orgId, projectId);
  const row = await ctx.db
    .select({
      data: swornStatementDrafts.data,
      updatedAt: swornStatementDrafts.updatedAt,
      updatedByName: user.name,
    })
    .from(swornStatementDrafts)
    .leftJoin(user, eq(user.id, swornStatementDrafts.updatedBy))
    .where(
      and(eq(swornStatementDrafts.projectId, projectId), eq(swornStatementDrafts.orgId, orgId)),
    )
    .get();
  if (!row) return { draft: null, updatedAt: null, updatedByName: null };
  return {
    draft: row.data,
    updatedAt: row.updatedAt.toISOString(),
    updatedByName: row.updatedByName ?? null,
  };
}

export async function saveSwornDraft(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  userId: string,
  draft: SwornDraft,
): Promise<SwornDraftDto> {
  await getProjectRow(ctx, orgId, projectId);
  const now = ctx.now();
  await ctx.db
    .insert(swornStatementDrafts)
    .values({ projectId, orgId, data: draft, updatedBy: userId, createdAt: now, updatedAt: now })
    .onConflictDoUpdate({
      target: swornStatementDrafts.projectId,
      set: { data: draft, updatedBy: userId, updatedAt: now },
      // The project id is the key and a project has one org, but say so anyway.
      setWhere: eq(swornStatementDrafts.orgId, orgId),
    });
  return getSwornDraft(ctx, orgId, projectId);
}

export async function clearSwornDraft(ctx: AppContext, orgId: string, projectId: string) {
  await getProjectRow(ctx, orgId, projectId);
  await ctx.db
    .delete(swornStatementDrafts)
    .where(
      and(eq(swornStatementDrafts.projectId, projectId), eq(swornStatementDrafts.orgId, orgId)),
    );
}
