// Database side of the books: loads tenant rows for the pure P&L / Schedule C builders and keeps lot costs
// allocated. Every query filters by orgId.
import type { ExpenseCategory } from "@shared/enums";
import { PERIODS } from "@shared/estimated-tax";
import { and, eq, gte, inArray, isNotNull, lte, sql } from "drizzle-orm";
import type { AppContext } from "../../context";
import {
  expense,
  filedInventory,
  homeOffice,
  inventoryItem,
  inventoryLot,
  mileageTrip,
  platformCharge,
  sale,
  saleFee,
} from "../../db/schema";
import { notFound } from "../../lib/errors";
import { buildSalesLedger, type LedgerSaleInput } from "./ledger";
import { allocateLotCost } from "./lots";
import { buildPnl, type PnlSaleInput } from "./pnl";
import { buildScheduleC, type HomeOfficeInput, type ScInput } from "./schedule-c";
import { buildStockReport, type StockSaleInput } from "./stock";
import { splitCents } from "./units";

/** Sales dated in [from, to] with their fees and linked inventory items (one pass, shared by P&L and ledger). */
async function loadSaleRows(ctx: AppContext, orgId: string, from: string, to: string) {
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
  const itemsBySale = await loadSoldItems(
    ctx,
    orgId,
    rows.filter((r) => r.kind === "order" && r.inventoryItemId),
  );
  const returnedBySale = await loadReturnedItems(
    ctx,
    orgId,
    rows.filter((r) => r.kind === "refund").map((r) => r.id),
  );
  return rows.map((r) => {
    const sold = itemsBySale.get(r.id) ?? [];
    return {
      row: r,
      fees: feesBySale.get(r.id) ?? [],
      items: sold,
      /** Refunds: the items the buyer sent back, now in stock again (their cost comes back on the refund). */
      returned: returnedBySale.get(r.id) ?? [],
      /** Units the order sold that no item is linked to (their cost is missing). */
      unitsWithoutItem: r.kind === "order" ? Math.max(0, r.quantity - sold.length) : 0,
    };
  });
}

/**
 * The copies each refund put back in stock (`returnSaleId`, "Item came back?"), by refund id. The order
 * that sold the original keeps its cost; the refund books the same cost back in its own month, the
 * P&L's and ledger's match for what Schedule C Part III does through line 41.
 */
async function loadReturnedItems(ctx: AppContext, orgId: string, refundIds: string[]) {
  const bySale = new Map<string, { id: string; title: string; costCents: number }[]>();
  for (let i = 0; i < refundIds.length; i += 50) {
    const found = await ctx.db
      .select({
        id: inventoryItem.id,
        title: inventoryItem.title,
        costCents: inventoryItem.costCents,
        returnSaleId: inventoryItem.returnSaleId,
      })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.orgId, orgId),
          inArray(inventoryItem.returnSaleId, refundIds.slice(i, i + 50)),
        ),
      )
      .orderBy(inventoryItem.id);
    for (const it of found) {
      const key = it.returnSaleId as string;
      bySale.set(key, [...(bySale.get(key) ?? []), it]);
    }
  }
  return bySale;
}

const sumCost = (items: { costCents: number }[]) => items.reduce((s, it) => s + it.costCents, 0);

/** Several items as one ledger label ("Jacket and 2 more") with their total cost; null for none. */
function itemsLabel(items: { title: string; costCents: number }[]) {
  if (items.length === 0) return null;
  const first = (items[0] as { title: string }).title;
  return {
    title: items.length === 1 ? first : `${first} and ${items.length - 1} more`,
    costCents: sumCost(items),
  };
}

/**
 * The items each order sold: those whose `soldBySaleId` is the order, plus the order's own
 * `inventoryItemId` for links made before that column existed.
 */
async function loadSoldItems(
  ctx: AppContext,
  orgId: string,
  orders: { id: string; inventoryItemId: string | null }[],
) {
  const bySale = new Map<string, { id: string; title: string; costCents: number }[]>();
  const add = (saleId: string, it: { id: string; title: string; costCents: number }) => {
    const list = bySale.get(saleId) ?? [];
    if (!list.some((x) => x.id === it.id)) list.push(it);
    bySale.set(saleId, list);
  };
  const cols = {
    id: inventoryItem.id,
    title: inventoryItem.title,
    costCents: inventoryItem.costCents,
    soldBySaleId: inventoryItem.soldBySaleId,
    acquiredDate: inventoryItem.acquiredDate,
  };
  const saleIds = orders.map((o) => o.id);
  for (let i = 0; i < saleIds.length; i += 50) {
    const found = await ctx.db
      .select(cols)
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.orgId, orgId),
          inArray(inventoryItem.soldBySaleId, saleIds.slice(i, i + 50)),
        ),
      )
      .orderBy(inventoryItem.acquiredDate, inventoryItem.id);
    for (const it of found) if (it.soldBySaleId) add(it.soldBySaleId, it);
  }
  const legacy = orders.filter((o) => o.inventoryItemId && !bySale.has(o.id));
  const legacyIds = [...new Set(legacy.map((o) => o.inventoryItemId as string))];
  const byId = new Map<string, { id: string; title: string; costCents: number }>();
  for (let i = 0; i < legacyIds.length; i += 50) {
    const found = await ctx.db
      .select(cols)
      .from(inventoryItem)
      .where(
        and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, legacyIds.slice(i, i + 50))),
      );
    for (const it of found) byId.set(it.id, it);
  }
  for (const o of legacy) {
    const it = byId.get(o.inventoryItemId as string);
    if (it) add(o.id, it);
  }
  return bySale;
}

async function loadSales(ctx: AppContext, orgId: string, from: string, to: string) {
  return (await loadSaleRows(ctx, orgId, from, to)).map(
    ({ row: r, fees, items, returned, unitsWithoutItem }): PnlSaleInput => ({
      platform: r.platform,
      kind: r.kind === "refund" ? "refund" : "order",
      date: r.date,
      itemCents: r.itemCents,
      shippingChargedCents: r.shippingChargedCents,
      salesTaxCents: r.salesTaxCents,
      refundCents: r.refundCents,
      shippingLabelCents: r.shippingLabelCents,
      fees,
      cogsCents:
        r.kind === "refund"
          ? returned.length > 0
            ? -sumCost(returned)
            : null
          : items.length > 0
            ? sumCost(items)
            : null,
      unitsWithoutCost: items.length > 0 ? unitsWithoutItem : 0,
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

/** Every sale, refund and account charge in [from, to], row by row; its gross-profit total equals the P&L's. */
export async function salesLedger(ctx: AppContext, orgId: string, from: string, to: string) {
  const [sales, charges] = await Promise.all([
    loadSaleRows(ctx, orgId, from, to),
    ctx.db
      .select({
        platform: platformCharge.platform,
        date: platformCharge.date,
        kind: platformCharge.kind,
        amountCents: platformCharge.amountCents,
        orderId: platformCharge.orderId,
        description: platformCharge.description,
      })
      .from(platformCharge)
      .where(
        and(
          eq(platformCharge.orgId, orgId),
          gte(platformCharge.date, from),
          lte(platformCharge.date, to),
        ),
      ),
  ]);
  return buildSalesLedger(from, to, {
    sales: sales.map(
      ({ row: r, fees, items, returned, unitsWithoutItem }): LedgerSaleInput => ({
        platform: r.platform,
        kind: r.kind === "refund" ? "refund" : "order",
        date: r.date,
        orderId: r.orderId,
        title: r.title,
        sku: r.sku,
        quantity: r.quantity,
        itemCents: r.itemCents,
        shippingChargedCents: r.shippingChargedCents,
        salesTaxCents: r.salesTaxCents,
        refundCents: r.refundCents,
        shippingLabelCents: r.shippingLabelCents,
        netCents: r.netCents,
        fees,
        item: itemsLabel(items),
        unitsWithoutItem,
        returned: itemsLabel(returned),
      }),
    ),
    charges,
  });
}

export async function businessMiles(ctx: AppContext, orgId: string, from: string, to: string) {
  const trips = await ctx.db
    .select({
      date: mileageTrip.date,
      milesTenths: mileageTrip.milesTenths,
      roundTrip: mileageTrip.roundTrip,
    })
    .from(mileageTrip)
    .where(
      and(eq(mileageTrip.orgId, orgId), gte(mileageTrip.date, from), lte(mileageTrip.date, to)),
    );
  return {
    trips: trips.length,
    miles: totalMiles(trips),
    /** Each trip's date and counted miles, for line 9 at the rate in force on its date. */
    byTrip: trips.map((t) => ({
      date: t.date,
      miles: (t.milesTenths * (t.roundTrip ? 2 : 1)) / 10,
    })),
  };
}

/** Sum of trip miles (round trips count twice), to one decimal place. */
export function totalMiles(trips: { milesTenths: number; roundTrip: boolean }[]): number {
  return trips.reduce((s, t) => s + t.milesTenths * (t.roundTrip ? 2 : 1), 0) / 10;
}

/** The year's rows for the Schedule C builder (everything but the miles, which callers count per range). */
async function loadScheduleCInput(
  ctx: AppContext,
  orgId: string,
  year: number,
  mileageRateCents: number | null,
): Promise<Omit<ScInput, "businessMiles">> {
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;
  const [sales, charges, expenses, items, lots, filedOpeningCents] = await Promise.all([
    loadSales(ctx, orgId, from, to),
    loadCharges(ctx, orgId, from, to),
    loadExpenses(ctx, orgId, from, to),
    ctx.db
      .select({
        acquiredDate: inventoryItem.acquiredDate,
        costCents: inventoryItem.costCents,
        status: inventoryItem.status,
        disposedDate: inventoryItem.disposedDate,
        returnSaleId: inventoryItem.returnSaleId,
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
    getFiledInventory(ctx, orgId, year - 1),
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
    year,
    sales,
    charges,
    expenses: expenses.map((e) => ({ ...e, category: e.category as ExpenseCategory })),
    items,
    unallocatedLots,
    mileageRateCents,
    filedOpeningCents,
  };
}

export async function scheduleCWorksheet(
  ctx: AppContext,
  orgId: string,
  year: number,
  mileageRateCents: number | null,
) {
  const [input, miles, home] = await Promise.all([
    loadScheduleCInput(ctx, orgId, year, mileageRateCents),
    businessMiles(ctx, orgId, `${year}-01-01`, `${year}-12-31`),
    getHomeOffice(ctx, orgId, year),
  ]);
  return {
    ...buildScheduleC({
      ...input,
      businessMiles: miles.miles,
      mileage: miles.byTrip,
      homeOffice: home,
    }),
    mileageRateCents,
    businessMiles: miles.miles,
    homeOffice: home,
  };
}

/** Every item bought by December 31 of `year`, with its lot's name, for the closing inventory list. */
export async function yearEndInventory(ctx: AppContext, orgId: string, year: number) {
  return ctx.db
    .select({
      sku: inventoryItem.sku,
      title: inventoryItem.title,
      acquiredDate: inventoryItem.acquiredDate,
      costCents: inventoryItem.costCents,
      costIsManual: inventoryItem.costIsManual,
      status: inventoryItem.status,
      disposedDate: inventoryItem.disposedDate,
      lotName: inventoryLot.name,
    })
    .from(inventoryItem)
    .leftJoin(
      inventoryLot,
      and(eq(inventoryLot.id, inventoryItem.lotId), eq(inventoryLot.orgId, orgId)),
    )
    .where(and(eq(inventoryItem.orgId, orgId), lte(inventoryItem.acquiredDate, `${year}-12-31`)));
}

/** The year's mileage trips, for the mileage log. */
export async function yearEndTrips(ctx: AppContext, orgId: string, year: number) {
  return ctx.db
    .select({
      date: mileageTrip.date,
      purpose: mileageTrip.purpose,
      startPlace: mileageTrip.startPlace,
      endPlace: mileageTrip.endPlace,
      milesTenths: mileageTrip.milesTenths,
      roundTrip: mileageTrip.roundTrip,
    })
    .from(mileageTrip)
    .where(
      and(
        eq(mileageTrip.orgId, orgId),
        gte(mileageTrip.date, `${year}-01-01`),
        lte(mileageTrip.date, `${year}-12-31`),
      ),
    );
}

/** The year's expenses, for the expense list. */
export async function yearEndExpenses(ctx: AppContext, orgId: string, year: number) {
  const rows = await ctx.db
    .select({
      date: expense.date,
      category: expense.category,
      amountCents: expense.amountCents,
      vendor: expense.vendor,
      memo: expense.memo,
      platform: expense.platform,
    })
    .from(expense)
    .where(
      and(
        eq(expense.orgId, orgId),
        gte(expense.date, `${year}-01-01`),
        lte(expense.date, `${year}-12-31`),
      ),
    );
  return rows.map((r) => ({ ...r, category: r.category as ExpenseCategory }));
}

/** Months 1..12 from the stored bit mask (bit 0 = January) and back. */
export const monthsFromMask = (mask: number) =>
  Array.from({ length: 12 }, (_, i) => i + 1).filter((m) => (mask >> (m - 1)) & 1);
export const maskFromMonths = (months: number[]) =>
  [...new Set(months)].reduce((mask, m) => mask | (1 << (m - 1)), 0);

/** The seller's business use of the home for `year`, or null when none is entered. */
export async function getHomeOffice(
  ctx: AppContext,
  orgId: string,
  year: number,
): Promise<HomeOfficeInput | null> {
  const [row] = await ctx.db
    .select()
    .from(homeOffice)
    .where(and(eq(homeOffice.orgId, orgId), eq(homeOffice.year, year)));
  if (!row) return null;
  return {
    officeSqft: row.officeSqft,
    homeSqft: row.homeSqft,
    months: monthsFromMask(row.monthsMask),
  };
}

export async function putHomeOffice(
  ctx: AppContext,
  orgId: string,
  year: number,
  ho: HomeOfficeInput,
): Promise<void> {
  const values = {
    officeSqft: ho.officeSqft,
    homeSqft: ho.homeSqft,
    monthsMask: maskFromMonths(ho.months),
  };
  await ctx.db
    .insert(homeOffice)
    .values({ orgId, year, ...values })
    .onConflictDoUpdate({
      target: [homeOffice.orgId, homeOffice.year],
      set: { ...values, updatedAt: new Date() },
    });
}

/** Removes the year's entry; false when there was none. */
export async function deleteHomeOffice(ctx: AppContext, orgId: string, year: number) {
  const res = await ctx.db
    .delete(homeOffice)
    .where(and(eq(homeOffice.orgId, orgId), eq(homeOffice.year, year)))
    .returning({ year: homeOffice.year });
  return res.length > 0;
}

/** Line 41 of the seller's filed return for `year`, as they entered it, or null when none is entered. */
export async function getFiledInventory(
  ctx: AppContext,
  orgId: string,
  year: number,
): Promise<number | null> {
  const [row] = await ctx.db
    .select({ closingCents: filedInventory.closingCents })
    .from(filedInventory)
    .where(and(eq(filedInventory.orgId, orgId), eq(filedInventory.year, year)));
  return row?.closingCents ?? null;
}

export async function putFiledInventory(
  ctx: AppContext,
  orgId: string,
  year: number,
  closingCents: number,
): Promise<void> {
  await ctx.db
    .insert(filedInventory)
    .values({ orgId, year, closingCents })
    .onConflictDoUpdate({
      target: [filedInventory.orgId, filedInventory.year],
      set: { closingCents, updatedAt: new Date() },
    });
}

/** Removes the year's filed figure; false when there was none. */
export async function deleteFiledInventory(ctx: AppContext, orgId: string, year: number) {
  const res = await ctx.db
    .delete(filedInventory)
    .where(and(eq(filedInventory.orgId, orgId), eq(filedInventory.year, year)))
    .returning({ year: filedInventory.year });
  return res.length > 0;
}

/**
 * The home office months that count by `through` (YYYY-MM-DD): a month counts once its 15th day has passed,
 * since the simplified method counts a month with 15 or more days of business use. So line 30 for the year
 * to March 31 takes January to March, and for the year to April 10 still January to March.
 */
export function homeOfficeThrough(ho: HomeOfficeInput, through: string): HomeOfficeInput {
  const month = Number(through.slice(5, 7));
  const day = Number(through.slice(8, 10));
  return { ...ho, months: ho.months.filter((m) => m < month || (m === month && day >= 15)) };
}

/**
 * Schedule C profit from January 1 through each Form 2210 Schedule AI period end, or through `asOf` for the
 * period it falls in; null for periods that start after it. Rows load once. With a home office saved for
 * the year, it is line 31 (line 29 less line 30, counting only the months used by that date, each period
 * held to its own line 29); with none, line 29, which is then line 31 too.
 */
export async function profitToDateByPeriod(
  ctx: AppContext,
  orgId: string,
  year: number,
  asOf: string,
  mileageRateCents: number | null,
): Promise<{
  profitToDate: (number | null)[];
  /** Line 30 taken off each period's profit (null where the period has no profit yet or none is saved). */
  homeOfficeToDate: (number | null)[];
  homeOffice: HomeOfficeInput | null;
  warnings: string[];
}> {
  const ends = PERIODS.map((p) => `${year}-${p.end}`);
  if (asOf < `${year}-01-01`)
    return {
      profitToDate: ends.map(() => null),
      homeOfficeToDate: ends.map(() => null),
      homeOffice: null,
      warnings: [],
    };
  const [input, home] = await Promise.all([
    loadScheduleCInput(ctx, orgId, year, mileageRateCents),
    getHomeOffice(ctx, orgId, year),
  ]);
  const warnings = new Set<string>();
  const profitToDate: (number | null)[] = [];
  const homeOfficeToDate: (number | null)[] = [];
  let stopped = false;
  for (const end of ends) {
    if (stopped) {
      profitToDate.push(null);
      homeOfficeToDate.push(null);
      continue;
    }
    const through = end <= asOf ? end : asOf;
    if (through === asOf) stopped = true;
    const miles = await businessMiles(ctx, orgId, `${year}-01-01`, through);
    const ws = buildScheduleC({
      ...input,
      through,
      businessMiles: miles.miles,
      mileage: miles.byTrip,
      homeOffice: home ? homeOfficeThrough(home, through) : null,
    });
    // The line 29 limit on a period's own profit is not a year-end figure, so its warning stays on the
    // Schedule C page; every other warning (missing costs, unlinked sales) carries over.
    for (const w of ws.warnings)
      if (!w.startsWith("Line 30 is limited to line 29")) warnings.add(w);
    profitToDate.push(ws.lines.find((l) => l.line === "31")?.amountCents ?? 0);
    homeOfficeToDate.push(home ? (ws.lines.find((l) => l.line === "30")?.amountCents ?? 0) : null);
  }
  return { profitToDate, homeOfficeToDate, homeOffice: home, warnings: [...warnings] };
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

/**
 * Items made "sold" by sales of a batch go back in stock before the batch is deleted, and the copies its
 * refunds brought back into stock are removed.
 */
export async function releaseItemsOfBatch(ctx: AppContext, orgId: string, batchId: string) {
  const refunds = await ctx.db
    .select({ id: sale.id })
    .from(sale)
    .where(and(eq(sale.orgId, orgId), eq(sale.importBatchId, batchId), eq(sale.kind, "refund")));
  await removeReturnedCopies(ctx, orgId, { refundIds: refunds.map((r) => r.id) });
  const linked = await ctx.db
    .select({ id: sale.id, itemId: sale.inventoryItemId })
    .from(sale)
    .where(
      and(eq(sale.orgId, orgId), eq(sale.importBatchId, batchId), isNotNull(sale.inventoryItemId)),
    );
  return releaseItemsOfSales(
    ctx,
    orgId,
    linked.map((l) => ({ id: l.id, inventoryItemId: l.itemId })),
  );
}

/**
 * Puts back in stock every item the given orders sold (`soldBySaleId`, and each order's own
 * `inventoryItemId` for links made before that column). Returns how many items were released.
 */
export async function releaseItemsOfSales(
  ctx: AppContext,
  orgId: string,
  sales: { id: string; inventoryItemId: string | null }[],
) {
  const ids = new Set(sales.map((s) => s.inventoryItemId).filter((x): x is string => !!x));
  const saleIds = sales.map((s) => s.id);
  for (let i = 0; i < saleIds.length; i += 50) {
    const rows = await ctx.db
      .select({ id: inventoryItem.id })
      .from(inventoryItem)
      .where(
        and(
          eq(inventoryItem.orgId, orgId),
          inArray(inventoryItem.soldBySaleId, saleIds.slice(i, i + 50)),
        ),
      );
    for (const r of rows) ids.add(r.id);
  }
  const all = [...ids];
  // An item back in stock is no longer one that came back on a refund: its copy goes.
  await removeReturnedCopies(ctx, orgId, { originalIds: all });
  for (let i = 0; i < all.length; i += 50) {
    await ctx.db
      .update(inventoryItem)
      .set({ status: "in_stock", disposedDate: null, soldBySaleId: null })
      .where(and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, all.slice(i, i + 50))));
  }
  return all.length;
}

/** Stock aging, sell-through, days to sell by platform and lot payback (services/books/stock.ts). */
export async function stockReport(
  ctx: AppContext,
  orgId: string,
  asOf: string,
  from: string,
  to: string,
) {
  const [items, lots, linked] = await Promise.all([
    ctx.db
      .select({
        id: inventoryItem.id,
        title: inventoryItem.title,
        sku: inventoryItem.sku,
        lotId: inventoryItem.lotId,
        acquiredDate: inventoryItem.acquiredDate,
        costCents: inventoryItem.costCents,
        status: inventoryItem.status,
        disposedDate: inventoryItem.disposedDate,
        soldBySaleId: inventoryItem.soldBySaleId,
      })
      .from(inventoryItem)
      .where(eq(inventoryItem.orgId, orgId)),
    ctx.db
      .select({
        id: inventoryLot.id,
        name: inventoryLot.name,
        acquiredDate: inventoryLot.acquiredDate,
        totalCostCents: inventoryLot.totalCostCents,
      })
      .from(inventoryLot)
      .where(eq(inventoryLot.orgId, orgId)),
    ctx.db
      .select({
        id: sale.id,
        itemId: sale.inventoryItemId,
        platform: sale.platform,
        kind: sale.kind,
        date: sale.date,
        itemCents: sale.itemCents,
        shippingChargedCents: sale.shippingChargedCents,
        refundCents: sale.refundCents,
        shippingLabelCents: sale.shippingLabelCents,
        feesCents: sql<number>`coalesce((select sum(${saleFee.amountCents}) from ${saleFee} where ${saleFee.saleId} = ${sale.id} and ${saleFee.orgId} = ${orgId}), 0)`,
      })
      .from(sale)
      .where(and(eq(sale.orgId, orgId), isNotNull(sale.inventoryItemId), lte(sale.date, asOf))),
  ]);
  // A multi-unit order sold several items: each gets an equal share of the order's money (the cents
  // left over go to the first), so lot payback and days to sell count every unit.
  const itemsBySale = new Map<string, string[]>();
  for (const it of items) {
    if (!it.soldBySaleId) continue;
    const list = itemsBySale.get(it.soldBySaleId) ?? [];
    list.push(it.id);
    itemsBySale.set(it.soldBySaleId, list);
  }
  const sales: StockSaleInput[] = linked.flatMap((s) => {
    const ids = itemsBySale.get(s.id) ?? [s.itemId as string];
    const n = ids.length;
    const item = splitCents(s.itemCents, n);
    const ship = splitCents(s.shippingChargedCents, n);
    const refund = splitCents(s.refundCents, n);
    const label = splitCents(s.shippingLabelCents, n);
    const fees = splitCents(Number(s.feesCents), n);
    return ids.map(
      (itemId, k): StockSaleInput => ({
        itemId,
        platform: s.platform,
        kind: s.kind === "refund" ? "refund" : "order",
        date: s.date,
        itemCents: item[k] as number,
        shippingChargedCents: ship[k] as number,
        refundCents: refund[k] as number,
        shippingLabelCents: label[k] as number,
        feesCents: fees[k] as number,
      }),
    );
  });
  return buildStockReport({ asOf, from, to, items, sales, lots });
}

/**
 * Deletes the copies made when sold items came back on refunds (`returnSaleId`), chosen by the refunds
 * that brought them back or by the original items they stand for. An order that sold a copy again is left
 * with no item linked, so the worksheet's unlinked-sales check names it. Returns how many were removed.
 */
export async function removeReturnedCopies(
  ctx: AppContext,
  orgId: string,
  by: { refundIds?: string[]; originalIds?: string[] },
) {
  const copyIds: string[] = [];
  const pick = async (
    col: typeof inventoryItem.returnSaleId | typeof inventoryItem.returnedFromItemId,
    ids: string[],
  ) => {
    for (let i = 0; i < ids.length; i += 50) {
      const rows = await ctx.db
        .select({ id: inventoryItem.id })
        .from(inventoryItem)
        .where(and(eq(inventoryItem.orgId, orgId), inArray(col, ids.slice(i, i + 50))));
      for (const r of rows) copyIds.push(r.id);
    }
  };
  await pick(inventoryItem.returnSaleId, by.refundIds ?? []);
  await pick(inventoryItem.returnedFromItemId, by.originalIds ?? []);
  const ids = [...new Set(copyIds)];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    await ctx.db.batch([
      ctx.db
        .update(sale)
        .set({ inventoryItemId: null })
        .where(and(eq(sale.orgId, orgId), inArray(sale.inventoryItemId, chunk))),
      ctx.db
        .delete(inventoryItem)
        .where(and(eq(inventoryItem.orgId, orgId), inArray(inventoryItem.id, chunk))),
    ]);
  }
  return ids.length;
}
