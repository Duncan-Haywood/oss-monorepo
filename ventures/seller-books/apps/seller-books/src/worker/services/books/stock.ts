// Stock report: how old the unsold inventory is, how fast items sell, and whether each lot has paid
// for itself. Pure function over plain rows so it is unit-tested without a database.
//
// Definitions (shown on the page, docs/ARCHITECTURE.md "Stock report"):
//   in stock on day D  = acquired on or before D, and not yet disposed on D (status in_stock, or
//                        disposed after D)
//   days held          = D − acquired date, in whole calendar days
//   sell-through       = items sold in [from, to] ÷ (items in stock the day before `from` + items acquired
//                        in [from, to]); only items that left as "sold" count as sold
//   days to sell       = disposed date − acquired date, for items sold in [from, to]
//   proceeds of a sale = item price + shipping charged − refunds − fees − postage on that row, all from the
//                        imported report (never a fee computed from a rate); sales tax is excluded
//   lot payback        = proceeds of every sale linked to the lot's items, up to `asOf`, − the lot's cost
// Proceeds are before cost of goods and before expenses not tied to a sale (ads bought separately,
// subscriptions, supplies), so a lot that "paid back" may still have lost money once those are counted.

export interface StockItemInput {
  id: string;
  title: string;
  sku: string | null;
  lotId: string | null;
  acquiredDate: string;
  costCents: number;
  status: string; // InventoryStatus
  disposedDate: string | null;
}

export interface StockSaleInput {
  /** The inventory item this row is linked to. Unlinked rows are not passed in. */
  itemId: string;
  platform: string;
  kind: "order" | "refund";
  date: string;
  itemCents: number;
  shippingChargedCents: number;
  refundCents: number;
  shippingLabelCents: number;
  feesCents: number;
}

export interface StockLotInput {
  id: string;
  name: string;
  acquiredDate: string;
  totalCostCents: number;
}

export interface AgingBucket {
  key: string;
  label: string;
  /** Inclusive lower bound in days held. */
  minDays: number;
  /** Inclusive upper bound, null for the last bucket. */
  maxDays: number | null;
  items: number;
  costCents: number;
}

export interface OldItem {
  id: string;
  title: string;
  sku: string | null;
  lotId: string | null;
  acquiredDate: string;
  daysHeld: number;
  costCents: number;
}

export interface SpeedRow {
  platform: string; // a Platform, or "unlinked" for items marked sold with no linked order
  sold: number;
  medianDays: number | null;
  meanDays: number | null;
  proceedsCents: number;
  costCents: number;
}

export interface LotRow {
  id: string;
  name: string;
  acquiredDate: string;
  totalCostCents: number;
  items: number;
  sold: number;
  inStock: number;
  /** Items written off or taken for personal use. */
  removed: number;
  proceedsCents: number;
  /** proceeds − lot cost; ≥ 0 means the lot's sales have covered what it cost. */
  paybackCents: number;
  /** proceeds ÷ cost as a whole percent, null when the lot cost nothing. */
  recoveredPercent: number | null;
  /** Cost still sitting in the lot's unsold items. */
  inStockCostCents: number;
}

export interface StockReport {
  asOf: string;
  from: string;
  to: string;
  inStock: { items: number; costCents: number };
  aging: AgingBucket[];
  oldest: OldItem[];
  sellThrough: {
    startItems: number;
    acquiredItems: number;
    soldItems: number;
    /** Whole percent, null when there was nothing to sell. */
    percent: number | null;
  };
  speed: SpeedRow[];
  speedTotal: SpeedRow;
  lots: LotRow[];
  warnings: string[];
}

export const AGING_BUCKETS: readonly {
  key: string;
  label: string;
  min: number;
  max: number | null;
}[] = [
  { key: "0-30", label: "0–30 days", min: 0, max: 30 },
  { key: "31-90", label: "31–90 days", min: 31, max: 90 },
  { key: "91-180", label: "91–180 days", min: 91, max: 180 },
  { key: "181-365", label: "181–365 days", min: 181, max: 365 },
  { key: "365+", label: "Over a year", min: 366, max: null },
];

export const OLDEST_LIMIT = 25;

const DAY_MS = 86_400_000;

/** Whole calendar days from a to b (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

export function dayBefore(d: string): string {
  return new Date(Date.parse(`${d}T00:00:00Z`) - DAY_MS).toISOString().slice(0, 10);
}

/** Middle value (mean of the two middle values for an even count), to one decimal place. */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const at = (i: number) => s[i] as number;
  const m = s.length % 2 ? at(mid) : (at(mid - 1) + at(mid)) / 2;
  return Math.round(m * 10) / 10;
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

const percent = (num: number, den: number) => (den > 0 ? Math.round((num / den) * 100) : null);

export function saleProceeds(s: StockSaleInput): number {
  return s.itemCents + s.shippingChargedCents - s.refundCents - s.feesCents - s.shippingLabelCents;
}

export function buildStockReport(input: {
  asOf: string;
  from: string;
  to: string;
  items: StockItemInput[];
  sales: StockSaleInput[];
  lots: StockLotInput[];
}): StockReport {
  const { asOf, from, to } = input;
  const warnings: string[] = [];

  // An item that left inventory with no date cannot be placed in time; leave it out and say how many.
  const undated = input.items.filter((i) => i.status !== "in_stock" && !i.disposedDate);
  if (undated.length) {
    warnings.push(
      `${undated.length} item(s) marked sold, written off or personal use have no date they left, so ` +
        "they are left out of stock counts and sell-through. Set the date on the Inventory page.",
    );
  }
  const items = input.items.filter((i) => i.status === "in_stock" || i.disposedDate);
  const inStockOn = (i: StockItemInput, day: string) =>
    i.acquiredDate <= day && (i.status === "in_stock" || (i.disposedDate as string) > day);

  // ---- aging on asOf ------------------------------------------------------------------------------
  const aging: AgingBucket[] = AGING_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    minDays: b.min,
    maxDays: b.max,
    items: 0,
    costCents: 0,
  }));
  const held: OldItem[] = [];
  for (const i of items) {
    if (!inStockOn(i, asOf)) continue;
    const daysHeld = daysBetween(i.acquiredDate, asOf);
    const bucket = aging.find(
      (b) => daysHeld >= b.minDays && (b.maxDays == null || daysHeld <= b.maxDays),
    );
    if (bucket) {
      bucket.items++;
      bucket.costCents += i.costCents;
    }
    held.push({
      id: i.id,
      title: i.title,
      sku: i.sku,
      lotId: i.lotId,
      acquiredDate: i.acquiredDate,
      daysHeld,
      costCents: i.costCents,
    });
  }
  held.sort(
    (a, b) => b.daysHeld - a.daysHeld || b.costCents - a.costCents || a.id.localeCompare(b.id),
  );
  const inStock = {
    items: held.length,
    costCents: held.reduce((s, i) => s + i.costCents, 0),
  };
  const stillInStockLater = items.filter((i) => i.status === "in_stock" && i.acquiredDate > asOf);
  if (stillInStockLater.length) {
    // Not a problem, but explains why the Inventory page shows more items than this report.
    warnings.push(
      `${stillInStockLater.length} item(s) were bought after ${asOf} and are not counted in its stock.`,
    );
  }

  // ---- sell-through and speed in [from, to] -------------------------------------------------------
  const startDay = dayBefore(from);
  const startItems = items.filter((i) => inStockOn(i, startDay)).length;
  const acquiredItems = items.filter((i) => i.acquiredDate >= from && i.acquiredDate <= to).length;
  const soldInWindow = items.filter(
    (i) =>
      i.status === "sold" &&
      i.disposedDate != null &&
      i.disposedDate >= from &&
      i.disposedDate <= to,
  );

  const salesByItem = new Map<string, StockSaleInput[]>();
  for (const s of input.sales) {
    if (s.date > asOf) continue;
    const list = salesByItem.get(s.itemId) ?? [];
    list.push(s);
    salesByItem.set(s.itemId, list);
  }
  const platformOf = (itemId: string) => {
    const orders = (salesByItem.get(itemId) ?? [])
      .filter((s) => s.kind === "order")
      .sort((a, b) => a.date.localeCompare(b.date));
    return orders[0]?.platform ?? "unlinked";
  };
  const proceedsOf = (itemId: string) =>
    (salesByItem.get(itemId) ?? []).reduce((s, x) => s + saleProceeds(x), 0);

  const speedMap = new Map<string, { days: number[]; proceeds: number; cost: number }>();
  const allDays: number[] = [];
  let allProceeds = 0;
  let allCost = 0;
  let negative = 0;
  for (const i of soldInWindow) {
    const days = daysBetween(i.acquiredDate, i.disposedDate as string);
    if (days < 0) {
      negative++;
      continue;
    }
    const p = platformOf(i.id);
    const row = speedMap.get(p) ?? { days: [], proceeds: 0, cost: 0 };
    const proceeds = proceedsOf(i.id);
    row.days.push(days);
    row.proceeds += proceeds;
    row.cost += i.costCents;
    speedMap.set(p, row);
    allDays.push(days);
    allProceeds += proceeds;
    allCost += i.costCents;
  }
  if (negative) {
    warnings.push(
      `${negative} sold item(s) have a sale date before the date they were bought, so they are left out ` +
        "of days to sell. Check their bought dates on the Inventory page.",
    );
  }
  const speed: SpeedRow[] = [...speedMap.entries()]
    .map(([platform, r]) => ({
      platform,
      sold: r.days.length,
      medianDays: median(r.days),
      meanDays: mean(r.days),
      proceedsCents: r.proceeds,
      costCents: r.cost,
    }))
    .sort((a, b) => b.sold - a.sold || a.platform.localeCompare(b.platform));
  const unlinked = speedMap.get("unlinked")?.days.length ?? 0;
  if (unlinked) {
    warnings.push(
      `${unlinked} item(s) sold in the period have no linked order, so their platform and proceeds are ` +
        'unknown ("unlinked"). Link them on the Sales page.',
    );
  }

  // ---- lots ---------------------------------------------------------------------------------------
  const lots: LotRow[] = input.lots
    .filter((l) => l.acquiredDate <= asOf)
    .map((l) => {
      const mine = input.items.filter((i) => i.lotId === l.id);
      const gone = (i: StockItemInput) => i.disposedDate != null && i.disposedDate <= asOf;
      const sold = mine.filter((i) => i.status === "sold" && gone(i)).length;
      const removed = mine.filter(
        (i) => (i.status === "written_off" || i.status === "personal_use") && gone(i),
      ).length;
      const inStockMine = mine.filter((i) => inStockOn(i, asOf));
      const proceeds = mine.reduce((s, i) => s + proceedsOf(i.id), 0);
      return {
        id: l.id,
        name: l.name,
        acquiredDate: l.acquiredDate,
        totalCostCents: l.totalCostCents,
        items: mine.length,
        sold,
        inStock: inStockMine.length,
        removed,
        proceedsCents: proceeds,
        paybackCents: proceeds - l.totalCostCents,
        recoveredPercent: percent(proceeds, l.totalCostCents),
        inStockCostCents: inStockMine.reduce((s, i) => s + i.costCents, 0),
      };
    })
    .sort((a, b) => b.acquiredDate.localeCompare(a.acquiredDate) || a.name.localeCompare(b.name));

  return {
    asOf,
    from,
    to,
    inStock,
    aging,
    oldest: held.slice(0, OLDEST_LIMIT),
    sellThrough: {
      startItems,
      acquiredItems,
      soldItems: soldInWindow.length,
      percent: percent(soldInWindow.length, startItems + acquiredItems),
    },
    speed,
    speedTotal: {
      platform: "all",
      sold: allDays.length,
      medianDays: median(allDays),
      meanDays: mean(allDays),
      proceedsCents: allProceeds,
      costCents: allCost,
    },
    lots,
    warnings,
  };
}
