// Database side of the books: loads tenant rows for the pure P&L / Schedule C builders and keeps lot costs
// allocated. Every query filters by orgId.
import type { ExpenseCategory } from "@shared/enums";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  expense,
  inventoryItem,
  inventoryLot,
  mileageTrip,
  platformCharge,
  sale,
  saleFee,
} from "../../db/schema";
import { notFound } from "../../lib/errors";
import { allocateLotCost } from "./lots";
import { buildPnl, type PnlSaleInput } from "./pnl";
import { buildScheduleC } from "./schedule-c";

async function loadSales(ctx: AppContext, orgId: string, from: string, to: string) {
  const rows = await ctx.db
    .select()
    .from(sale)
    .where(and(eq(sale.orgId, orgId), gte(sale.date, from), lte(sale.date, to)));
  const fees = await ctx.db
    .select({ saleId: saleFee.saleId, kind: saleFee.kind, amountCents: saleFee.amountCents })
    .from(saleFee)
    .innerJoin(sale, eq(sale.id, saleFee.saleId))
    .where(
      and(
        eq(saleFee.orgId, orgId),
        eq(sale.orgId, orgId),
        gte(sale.date, from),
        lte(sale.date, to),
      ),
    );
  const feesBySale = new Map<string, { kind: string; amountCents: number }[]>();
  for (const f of fees) {
    const list = feesBySale.get(f.saleId) ?? [];
    list.push({ kind: f.kind, amountCents: f.amountCents });
    feesBySale.set(f.saleId, list);
  }
  const itemIds = [...new Set(rows.map((r) => r.inventoryItemId).filter((x): x is string => !!x))];
  const costs = new Map<string, number>();
  for (let i = 0; i < itemIds.length; i += 50) {
    const items = await ctx.db
      .select({ id: inventoryItem.id, costCents: inventoryItem.costCents })
      .from(inventoryItem)
      .where(
        and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, itemIds.slice(i, i + 50))),
      );
    for (const it of items) costs.set(it.id, it.costCents);
  }
  return rows.map(
    (r): PnlSaleInput => ({
      platform: r.platform,
      kind: r.kind === "refund" ? "refund" : "order",
      date: r.date,
      itemCents: r.itemCents,
      shippingChargedCents: r.shippingChargedCents,
      salesTaxCents: r.salesTaxCents,
      refundCents: r.refundCents,
      shippingLabelCents: r.shippingLabelCents,
      fees: feesBySale.get(r.id) ?? [],
      cogsCents: r.inventoryItemId ? (costs.get(r.inventoryItemId) ?? null) : null,
    }),
  );
}

async function loadCharges(ctx: AppContext, orgId: string, from: string, to: string) {
  return ctx.db
    .select({
      platform: platformCharge.platform,
      date: platformCharge.date,
      kind: platformCharge.kind,
      amountCents: platformCharge.amountCents,
    })
    .from(platformCharge)
    .where(
      and(
        eq(platformCharge.orgId, orgId),
        gte(platformCharge.date, from),
        lte(platformCharge.date, to),
      ),
    );
}

async function loadExpenses(ctx: AppContext, orgId: string, from: string, to: string) {
  return ctx.db
    .select({
      platform: expense.platform,
      date: expense.date,
      category: expense.category,
      amountCents: expense.amountCents,
    })
    .from(expense)
    .where(and(eq(expense.orgId, orgId), gte(expense.date, from), lte(expense.date, to)));
}

export async function pnlReport(ctx: AppContext, orgId: string, from: string, to: string) {
  const [sales, charges, expenses] = await Promise.all([
    loadSales(ctx, orgId, from, to),
    loadCharges(ctx, orgId, from, to),
    loadExpenses(ctx, orgId, from, to),
  ]);
  return buildPnl(from, to, { sales, charges, expenses });
}

export async function businessMiles(ctx: AppContext, orgId: string, from: string, to: string) {
  const trips = await ctx.db
    .select({ milesTenths: mileageTrip.milesTenths, roundTrip: mileageTrip.roundTrip })
    .from(mileageTrip)
    .where(
      and(eq(mileageTrip.orgId, orgId), gte(mileageTrip.date, from), lte(mileageTrip.date, to)),
    );
  return { trips: trips.length, miles: totalMiles(trips) };
}

/** Sum of trip miles (round trips count twice), to one decimal place. */
export function totalMiles(trips: { milesTenths: number; roundTrip: boolean }[]): number {
  return trips.reduce((s, t) => s + t.milesTenths * (t.roundTrip ? 2 : 1), 0) / 10;
}

export async function scheduleCWorksheet(
  ctx: AppContext,
  orgId: string,
  year: number,
  mileageRateCents: number | null,
) {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [sales, charges, expenses, items, lots, miles] = await Promise.all([
    loadSales(ctx, orgId, from, to),
    loadCharges(ctx, orgId, from, to),
    loadExpenses(ctx, orgId, from, to),
    ctx.db
      .select({
        acquiredDate: inventoryItem.acquiredDate,
        costCents: inventoryItem.costCents,
        status: inventoryItem.status,
        disposedDate: inventoryItem.disposedDate,
      })
      .from(inventoryItem)
      .where(and(eq(inventoryItem.orgId, orgId), lte(inventoryItem.acquiredDate, to))),
    ctx.db
      .select()
      .from(inventoryLot)
      .where(
        and(
          eq(inventoryLot.orgId, orgId),
          gte(inventoryLot.acquiredDate, from),
          lte(inventoryLot.acquiredDate, to),
        ),
      ),
    businessMiles(ctx, orgId, from, to),
  ]);
  const unallocatedLots: { acquiredDate: string; cents: number }[] = [];
  for (const lot of lots) {
    const lotItems = await ctx.db
      .select({ id: inventoryItem.id, costCents: inventoryItem.costCents })
      .from(inventoryItem)
      .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.lotId, lot.id)));
    const carried = lotItems.reduce((s, i) => s + i.costCents, 0);
    if (carried < lot.totalCostCents) {
      unallocatedLots.push({ acquiredDate: lot.acquiredDate, cents: lot.totalCostCents - carried });
    }
  }
  return {
    ...buildScheduleC({
      year,
      sales,
      charges,
      expenses: expenses.map((e) => ({ ...e, category: e.category as ExpenseCategory })),
      items,
      unallocatedLots,
      businessMiles: miles.miles,
      mileageRateCents,
    }),
    mileageRateCents,
    businessMiles: miles.miles,
  };
}

/** Re-spreads a lot's cost over its items (manual costs kept). Returns what is still unallocated. */
export async function reallocateLot(ctx: AppContext, orgId: string, lotId: string) {
  const lot = await ctx.db
    .select()
    .from(inventoryLot)
    .where(and(eq(inventoryLot.id, lotId), eq(inventoryLot.orgId, orgId)))
    .get();
  if (!lot) throw notFound("Lot");
  const items = await ctx.db
    .select({
      id: inventoryItem.id,
      costCents: inventoryItem.costCents,
      costIsManual: inventoryItem.costIsManual,
    })
    .from(inventoryItem)
    .where(and(eq(inventoryItem.orgId, orgId), eq(inventoryItem.lotId, lotId)))
    .orderBy(inventoryItem.createdAt, sql`rowid`);
  const result = allocateLotCost(
    lot.totalCostCents,
    items.map((i) => ({ id: i.id, manualCostCents: i.costIsManual ? i.costCents : null })),
  );
  for (const i of items) {
    const cost = result.costs.get(i.id);
    if (!i.costIsManual && cost !== undefined && cost !== i.costCents) {
      await ctx.db
        .update(inventoryItem)
        .set({ costCents: cost })
        .where(and(eq(inventoryItem.id, i.id), eq(inventoryItem.orgId, orgId)));
    }
  }
  return {
    lot,
    itemCount: items.length,
    unallocatedCents: result.unallocatedCents,
    warnings: result.warnings,
  };
}

/** Items made "sold" by sales of a batch go back in stock before the batch is deleted. */
export async function releaseItemsOfBatch(ctx: AppContext, orgId: string, batchId: string) {
  const linked = await ctx.db
    .select({ itemId: sale.inventoryItemId })
    .from(sale)
    .where(
      and(eq(sale.orgId, orgId), eq(sale.importBatchId, batchId), isNotNull(sale.inventoryItemId)),
    );
  const ids = linked.map((l) => l.itemId).filter((x): x is string => !!x);
  for (let i = 0; i < ids.length; i += 50) {
    await ctx.db
      .update(inventoryItem)
      .set({ status: "in_stock", disposedDate: null })
      .where(and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, ids.slice(i, i + 50))));
  }
  return ids.length;
}
