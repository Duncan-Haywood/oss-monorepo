// Saved copies of the job's sworn statement (db/schema/sworn-statements.ts): one per pay application,
// kept by editors when they print it, listed and printed again by everyone in the company, removed by
// editors. Every query filters by org_id and the job.

import {
  type ComputedSwornStatement,
  MAX_SWORN_COPIES,
  type SwornCopyDetailDto,
  type SwornCopyDto,
  type SwornStatement,
  swornCopyKey,
} from "@shared/sworn-statement";
import { and, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { swornStatementCopies, user } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { getProjectRow } from "./bundle";

type CopyRow = typeof swornStatementCopies.$inferSelect;

function toDto(r: CopyRow, savedByName: string | null): SwornCopyDto {
  return {
    id: r.id,
    state: r.state,
    payApp: r.payApp,
    statementDate: r.statementDate,
    givenTo: r.data.givenTo,
    partyCount: r.data.rows.length,
    owingCents: r.owingCents,
    balanceCents: r.balanceCents,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    savedByName,
  };
}

const own = (orgId: string, projectId: string) =>
  and(eq(swornStatementCopies.orgId, orgId), eq(swornStatementCopies.projectId, projectId));

/** The job's copies, newest statement first. */
export async function listSwornCopies(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<SwornCopyDto[]> {
  await getProjectRow(ctx, orgId, projectId);
  const rows = await ctx.db
    .select({ copy: swornStatementCopies, savedByName: user.name })
    .from(swornStatementCopies)
    .leftJoin(user, eq(user.id, swornStatementCopies.savedBy))
    .where(own(orgId, projectId))
    .orderBy(desc(swornStatementCopies.statementDate), desc(swornStatementCopies.updatedAt))
    .all();
  return rows.map((r) => toDto(r.copy, r.savedByName ?? null));
}

export async function getSwornCopy(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  copyId: string,
): Promise<SwornCopyDetailDto> {
  await getProjectRow(ctx, orgId, projectId);
  const r = await ctx.db
    .select({ copy: swornStatementCopies, savedByName: user.name })
    .from(swornStatementCopies)
    .leftJoin(user, eq(user.id, swornStatementCopies.savedBy))
    .where(and(own(orgId, projectId), eq(swornStatementCopies.id, copyId)))
    .get();
  if (!r) throw notFound("Saved statement");
  return { ...toDto(r.copy, r.savedByName ?? null), statement: r.copy.data };
}

/**
 * Keep a statement that has already passed the full checks (the route refuses one with errors).
 * The same pay application again replaces its copy, so a corrected statement is the one kept.
 */
export async function keepSwornCopy(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  userId: string,
  statement: SwornStatement,
  computed: ComputedSwornStatement,
): Promise<{ copy: SwornCopyDetailDto; replaced: boolean }> {
  await getProjectRow(ctx, orgId, projectId);
  const copyKey = swornCopyKey(statement);
  const existing = await ctx.db
    .select({ id: swornStatementCopies.id })
    .from(swornStatementCopies)
    .where(and(own(orgId, projectId), eq(swornStatementCopies.copyKey, copyKey)))
    .get();
  const now = ctx.now();
  const values = {
    state: statement.state,
    payApp: statement.payApp,
    statementDate: statement.statementDate,
    data: statement,
    owingCents: computed.totals.owingCents,
    balanceCents: computed.totals.balanceCents,
    savedBy: userId,
    updatedAt: now,
  };
  if (existing) {
    await ctx.db
      .update(swornStatementCopies)
      .set(values)
      .where(and(own(orgId, projectId), eq(swornStatementCopies.id, existing.id)));
    return { copy: await getSwornCopy(ctx, orgId, projectId, existing.id), replaced: true };
  }
  const [{ n } = { n: 0 }] = await ctx.db
    .select({ n: count() })
    .from(swornStatementCopies)
    .where(own(orgId, projectId))
    .all();
  if (n >= MAX_SWORN_COPIES) {
    throw badRequest(
      `A job keeps up to ${MAX_SWORN_COPIES} saved statements: remove an old one first`,
    );
  }
  const id = newId("swc");
  await ctx.db
    .insert(swornStatementCopies)
    .values({ id, orgId, projectId, copyKey, ...values, createdAt: now });
  return { copy: await getSwornCopy(ctx, orgId, projectId, id), replaced: false };
}

export async function deleteSwornCopy(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  copyId: string,
) {
  await getProjectRow(ctx, orgId, projectId);
  const gone = await ctx.db
    .delete(swornStatementCopies)
    .where(and(own(orgId, projectId), eq(swornStatementCopies.id, copyId)))
    .returning({ id: swornStatementCopies.id });
  if (gone.length === 0) throw notFound("Saved statement");
}
