// Sworn statements kept as given with their pay applications (db/schema/sworn-statements.ts): an
// editor's print keeps the statement (one per pay application and statement date; a reprint
// replaces it), everyone in the company lists and reprints them, editors delete one given in error.

import {
  computeSwornStatement,
  MAX_SWORN_GIVEN,
  type SwornGivenDto,
  type SwornGivenSummaryDto,
  type SwornStatement,
} from "@shared/sworn-statement";
import { and, count, desc, eq } from "drizzle-orm";
import type { AppContext } from "../../context";
import { swornStatementsGiven, user } from "../../db/schema";
import { badRequest, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { getProjectRow } from "./bundle";

type Row = typeof swornStatementsGiven.$inferSelect & { createdByName: string | null };

function toDto(r: Row): SwornGivenDto {
  const c = computeSwornStatement(r.data);
  return {
    id: r.id,
    payApp: r.payApp,
    statementDate: r.statementDate,
    state: r.state,
    givenTo: r.data.givenTo,
    parties: r.data.rows.length,
    adjustedCents: c.totals.adjustedCents,
    paidCents: c.totals.paidCents,
    owingCents: c.totals.owingCents,
    createdAt: r.createdAt.toISOString(),
    createdByName: r.createdByName,
    statement: r.data,
  };
}

const summary = ({ statement: _s, ...rest }: SwornGivenDto): SwornGivenSummaryDto => rest;

function selectRows(ctx: AppContext) {
  return ctx.db
    .select({
      id: swornStatementsGiven.id,
      projectId: swornStatementsGiven.projectId,
      orgId: swornStatementsGiven.orgId,
      payApp: swornStatementsGiven.payApp,
      statementDate: swornStatementsGiven.statementDate,
      state: swornStatementsGiven.state,
      data: swornStatementsGiven.data,
      createdBy: swornStatementsGiven.createdBy,
      createdAt: swornStatementsGiven.createdAt,
      createdByName: user.name,
    })
    .from(swornStatementsGiven)
    .leftJoin(user, eq(user.id, swornStatementsGiven.createdBy));
}

export async function listSwornGiven(
  ctx: AppContext,
  orgId: string,
  projectId: string,
): Promise<SwornGivenSummaryDto[]> {
  await getProjectRow(ctx, orgId, projectId);
  const rows = await selectRows(ctx)
    .where(
      and(eq(swornStatementsGiven.projectId, projectId), eq(swornStatementsGiven.orgId, orgId)),
    )
    .orderBy(desc(swornStatementsGiven.statementDate), desc(swornStatementsGiven.createdAt))
    .all();
  return rows.map((r) => summary(toDto(r)));
}

export async function getSwornGiven(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  id: string,
): Promise<SwornGivenDto> {
  await getProjectRow(ctx, orgId, projectId);
  const row = await selectRows(ctx)
    .where(
      and(
        eq(swornStatementsGiven.id, id),
        eq(swornStatementsGiven.projectId, projectId),
        eq(swornStatementsGiven.orgId, orgId),
      ),
    )
    .get();
  if (!row) throw notFound("Sworn statement");
  return toDto(row);
}

/**
 * Keep a printed statement as given. The caller has checked it prints (no errors). The same pay
 * application and statement date replaces the one kept before, so a corrected reprint does not
 * leave two.
 */
export async function keepSwornGiven(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  userId: string,
  statement: SwornStatement,
): Promise<SwornGivenSummaryDto> {
  await getProjectRow(ctx, orgId, projectId);
  const payApp = statement.payApp;
  const where = and(
    eq(swornStatementsGiven.projectId, projectId),
    eq(swornStatementsGiven.orgId, orgId),
    eq(swornStatementsGiven.payApp, payApp),
    eq(swornStatementsGiven.statementDate, statement.statementDate),
  );
  const existing = await ctx.db
    .select({ id: swornStatementsGiven.id })
    .from(swornStatementsGiven)
    .where(where)
    .get();
  const now = ctx.now();
  let id: string;
  if (existing) {
    id = existing.id;
    await ctx.db
      .update(swornStatementsGiven)
      .set({ data: statement, state: statement.state, createdBy: userId, createdAt: now })
      .where(eq(swornStatementsGiven.id, id));
  } else {
    const n = await ctx.db
      .select({ n: count() })
      .from(swornStatementsGiven)
      .where(
        and(eq(swornStatementsGiven.projectId, projectId), eq(swornStatementsGiven.orgId, orgId)),
      )
      .get();
    if ((n?.n ?? 0) >= MAX_SWORN_GIVEN) {
      throw badRequest(
        `This job already keeps ${MAX_SWORN_GIVEN} sworn statements; delete one given in error first`,
      );
    }
    id = newId("sws");
    await ctx.db.insert(swornStatementsGiven).values({
      id,
      projectId,
      orgId,
      payApp,
      statementDate: statement.statementDate,
      state: statement.state,
      data: statement,
      createdBy: userId,
      createdAt: now,
    });
  }
  return summary(await getSwornGiven(ctx, orgId, projectId, id));
}

export async function deleteSwornGiven(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  id: string,
) {
  await getSwornGiven(ctx, orgId, projectId, id);
  await ctx.db
    .delete(swornStatementsGiven)
    .where(
      and(
        eq(swornStatementsGiven.id, id),
        eq(swornStatementsGiven.projectId, projectId),
        eq(swornStatementsGiven.orgId, orgId),
      ),
    );
}
