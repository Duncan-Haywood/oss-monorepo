// Change orders adjust schedule-of-values lines (existing ones, or new lines they create). Pending
// change orders do not count; approved ones count in every pay app whose period ends on/after the
// approval date. Approved change orders are immutable, and cannot be dated into a period that was
// already submitted (submitted applications never change).
import type { ChangeOrderInputBody } from "@shared/api/schemas";
import { and, eq, max, ne } from "drizzle-orm";
import type { AppContext } from "../../context";
import { changeOrderItems, changeOrders, payAppLines, payApps, sovLines } from "../../db/schema";
import { badRequest, conflict, notFound } from "../../lib/errors";
import { newId } from "../../lib/ids";
import { lastLockedPeriodTo, loadBundle } from "./bundle";

export async function createChangeOrder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  input: ChangeOrderInputBody,
) {
  if (input.submittedOn && input.submittedOn > ctx.now().toISOString().slice(0, 10)) {
    throw badRequest("The date sent cannot be in the future");
  }
  const b = await loadBundle(ctx, orgId, projectId);
  if (b.changeOrders.some((co) => co.number === input.number)) {
    throw conflict(`Change order ${input.number} already exists`);
  }
  const known = new Set(b.sov.map((l) => l.id));
  const coId = newId("cor");
  const maxOrder = await ctx.db
    .select({ m: max(sovLines.sortOrder) })
    .from(sovLines)
    .where(and(eq(sovLines.orgId, orgId), eq(sovLines.projectId, projectId)))
    .get();
  let order = (maxOrder?.m ?? 0) + 1;
  const newLines: (typeof sovLines.$inferInsert)[] = [];
  const items: (typeof changeOrderItems.$inferInsert)[] = [];
  for (const item of input.items) {
    let sovLineId: string;
    if ("sovLineId" in item) {
      if (!known.has(item.sovLineId)) throw badRequest("Unknown schedule of values line");
      sovLineId = item.sovLineId;
    } else {
      sovLineId = newId("sov");
      newLines.push({
        id: sovLineId,
        orgId,
        projectId,
        itemNumber: item.newLine.itemNumber,
        description: item.newLine.description,
        originalCents: 0,
        sortOrder: order++,
        changeOrderId: coId,
      });
    }
    items.push({
      id: newId("coi"),
      orgId,
      changeOrderId: coId,
      sovLineId,
      amountCents: item.amountCents,
    });
  }
  await ctx.db.batch([
    ctx.db.insert(changeOrders).values({
      id: coId,
      orgId,
      projectId,
      number: input.number,
      description: input.description,
      submittedOn: input.submittedOn ?? null,
      scheduleDays: input.scheduleDays ?? null,
    }),
    ...(newLines.length ? [ctx.db.insert(sovLines).values(newLines)] : []),
    ctx.db.insert(changeOrderItems).values(items),
  ]);
  return coId;
}

async function getPending(ctx: AppContext, orgId: string, projectId: string, coId: string) {
  const co = await ctx.db
    .select()
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.id, coId),
        eq(changeOrders.orgId, orgId),
        eq(changeOrders.projectId, projectId),
      ),
    )
    .get();
  if (!co) throw notFound("Change order");
  if (co.status !== "pending") throw conflict(`Change order is already ${co.status}`);
  return co;
}

export async function approveChangeOrder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  coId: string,
  approvedOn: string,
) {
  await getPending(ctx, orgId, projectId, coId);
  const locked = lastLockedPeriodTo(await loadBundle(ctx, orgId, projectId));
  if (locked && approvedOn <= locked) {
    throw badRequest(
      `Approval date must be after ${locked}, the end of the last submitted pay application`,
    );
  }
  await ctx.db
    .update(changeOrders)
    .set({ status: "approved", approvedOn })
    .where(and(eq(changeOrders.id, coId), eq(changeOrders.orgId, orgId)));
}

/** Records the date a pending change order went to the GC (null clears it). */
export async function setChangeOrderSubmitted(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  coId: string,
  submittedOn: string | null,
) {
  await getPending(ctx, orgId, projectId, coId);
  if (submittedOn !== null && submittedOn > ctx.now().toISOString().slice(0, 10)) {
    throw badRequest("The date sent cannot be in the future");
  }
  await ctx.db
    .update(changeOrders)
    .set({ submittedOn })
    .where(and(eq(changeOrders.id, coId), eq(changeOrders.orgId, orgId)));
}

/**
 * Records that an email draft about a pending change order was copied or opened today ("last
 * chased"). Returns the date stored. Approved and rejected change orders have no draft (409).
 */
export async function recordChangeOrderEmailed(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  coId: string,
): Promise<string> {
  await getPending(ctx, orgId, projectId, coId);
  const today = ctx.now().toISOString().slice(0, 10);
  await ctx.db
    .update(changeOrders)
    .set({ lastEmailedOn: today })
    .where(and(eq(changeOrders.id, coId), eq(changeOrders.orgId, orgId)));
  return today;
}

/** Records the contract time a pending change order asks for (null: not stated). */
export async function setChangeOrderSchedule(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  coId: string,
  scheduleDays: number | null,
) {
  await getPending(ctx, orgId, projectId, coId);
  await ctx.db
    .update(changeOrders)
    .set({ scheduleDays })
    .where(and(eq(changeOrders.id, coId), eq(changeOrders.orgId, orgId)));
}

export async function rejectChangeOrder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  coId: string,
) {
  await getPending(ctx, orgId, projectId, coId);
  await ctx.db
    .update(changeOrders)
    .set({ status: "rejected" })
    .where(and(eq(changeOrders.id, coId), eq(changeOrders.orgId, orgId)));
}

/** Deletes a pending change order and any lines it created that were never billed. */
export async function deleteChangeOrder(
  ctx: AppContext,
  orgId: string,
  projectId: string,
  coId: string,
) {
  await getPending(ctx, orgId, projectId, coId);
  const billed = await ctx.db
    .select({ id: payAppLines.id })
    .from(payAppLines)
    .innerJoin(sovLines, eq(sovLines.id, payAppLines.sovLineId))
    .innerJoin(payApps, eq(payApps.id, payAppLines.payAppId))
    .where(
      and(
        eq(payAppLines.orgId, orgId),
        eq(sovLines.changeOrderId, coId),
        ne(payApps.status, "draft"),
      ),
    )
    .get();
  if (billed)
    throw conflict("A line from this change order was billed on a submitted pay application");
  await ctx.db.batch([
    ctx.db
      .delete(changeOrders)
      .where(and(eq(changeOrders.id, coId), eq(changeOrders.orgId, orgId))),
    ctx.db.delete(sovLines).where(and(eq(sovLines.changeOrderId, coId), eq(sovLines.orgId, orgId))),
  ]);
}
