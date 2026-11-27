// Profit and loss by platform and month (cash basis: each amount lands in the month its row is dated).
// Pure function over plain rows so it is unit-tested without a database.
//
//   revenue      = item sales + shipping charged to buyers − refunds
//   gross profit = revenue − marketplace fees − postage − cost of goods sold
//   net profit   = gross profit − other expenses (expenses not tied to a platform sit in the "general" row)
// Sales tax the marketplace collected is shown but is never revenue.
import type { FeeKind } from "@shared/enums";

export interface PnlSaleInput {
  platform: string;
  kind: "order" | "refund";
  date: string;
  itemCents: number;
  shippingChargedCents: number;
  salesTaxCents: number;
  refundCents: number;
  shippingLabelCents: number;
  fees: { kind: string; amountCents: number }[];
  /**
   * Orders: cost of the linked inventory items; null when no item is linked. Refunds: minus the cost of the
   * items the buyer sent back into stock (a return reverses the cost the sale booked); null when none came back.
   */
  cogsCents: number | null;
  /** Units of a multi-unit order with no item linked; the order then counts as missing cost too. */
  unitsWithoutCost?: number;
}

export interface PnlChargeInput {
  platform: string;
  date: string;
  kind: string;
  amountCents: number;
}

export interface PnlExpenseInput {
  platform: string | null;
  date: string;
  amountCents: number;
}

export interface PnlCell {
  platform: string; // a Platform, or "general" for expenses not tied to one
  month: string; // YYYY-MM
  orders: number;
  ordersWithoutCost: number;
  itemSalesCents: number;
  shippingChargedCents: number;
  refundsCents: number;
  revenueCents: number;
  feesCents: number;
  feesByKind: Partial<Record<FeeKind | string, number>>;
  postageCents: number;
  cogsCents: number;
  grossProfitCents: number;
  expensesCents: number;
  netProfitCents: number;
  salesTaxCollectedCents: number;
}

export interface PnlReport {
  from: string;
  to: string;
  cells: PnlCell[];
  byPlatform: PnlCell[];
  byMonth: PnlCell[];
  total: PnlCell;
}

function emptyCell(platform: string, month: string): PnlCell {
  return {
    platform,
    month,
    orders: 0,
    ordersWithoutCost: 0,
    itemSalesCents: 0,
    shippingChargedCents: 0,
    refundsCents: 0,
    revenueCents: 0,
    feesCents: 0,
    feesByKind: {},
    postageCents: 0,
    cogsCents: 0,
    grossProfitCents: 0,
    expensesCents: 0,
    netProfitCents: 0,
    salesTaxCollectedCents: 0,
  };
}

function finish(c: PnlCell): PnlCell {
  c.revenueCents = c.itemSalesCents + c.shippingChargedCents - c.refundsCents;
  c.grossProfitCents = c.revenueCents - c.feesCents - c.postageCents - c.cogsCents;
  c.netProfitCents = c.grossProfitCents - c.expensesCents;
  return c;
}

function addInto(into: PnlCell, c: PnlCell) {
  into.orders += c.orders;
  into.ordersWithoutCost += c.ordersWithoutCost;
  into.itemSalesCents += c.itemSalesCents;
  into.shippingChargedCents += c.shippingChargedCents;
  into.refundsCents += c.refundsCents;
  into.feesCents += c.feesCents;
  for (const [k, v] of Object.entries(c.feesByKind))
    into.feesByKind[k] = (into.feesByKind[k] ?? 0) + (v ?? 0);
  into.postageCents += c.postageCents;
  into.cogsCents += c.cogsCents;
  into.expensesCents += c.expensesCents;
  into.salesTaxCollectedCents += c.salesTaxCollectedCents;
}

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export function buildPnl(
  from: string,
  to: string,
  input: { sales: PnlSaleInput[]; charges: PnlChargeInput[]; expenses: PnlExpenseInput[] },
): PnlReport {
  const cells = new Map<string, PnlCell>();
  const cell = (platform: string, date: string) => {
    const month = date.slice(0, 7);
    const key = `${platform}|${month}`;
    let c = cells.get(key);
    if (!c) {
      c = emptyCell(platform, month);
      cells.set(key, c);
    }
    return c;
  };
  const addFee = (c: PnlCell, kind: string, amount: number) => {
    c.feesCents += amount;
    c.feesByKind[kind] = (c.feesByKind[kind] ?? 0) + amount;
  };

  for (const s of input.sales) {
    if (!inRange(s.date, from, to)) continue;
    const c = cell(s.platform, s.date);
    if (s.kind === "order") {
      c.orders++;
      c.itemSalesCents += s.itemCents;
      c.shippingChargedCents += s.shippingChargedCents;
      c.salesTaxCollectedCents += s.salesTaxCents;
      if (s.cogsCents == null || (s.unitsWithoutCost ?? 0) > 0) c.ordersWithoutCost++;
      if (s.cogsCents != null) c.cogsCents += s.cogsCents;
    } else {
      c.refundsCents += s.refundCents;
      if (s.cogsCents != null) c.cogsCents += s.cogsCents;
    }
    c.postageCents += s.shippingLabelCents;
    for (const f of s.fees) addFee(c, f.kind, f.amountCents);
  }
  for (const ch of input.charges) {
    if (!inRange(ch.date, from, to)) continue;
    const c = cell(ch.platform, ch.date);
    if (ch.kind === "shipping_label") c.postageCents += ch.amountCents;
    else if (ch.kind === "subscription") c.expensesCents += ch.amountCents;
    else addFee(c, ch.kind, ch.amountCents);
  }
  for (const e of input.expenses) {
    if (!inRange(e.date, from, to)) continue;
    cell(e.platform ?? "general", e.date).expensesCents += e.amountCents;
  }

  const list = [...cells.values()]
    .map(finish)
    .sort((a, b) =>
      a.month === b.month ? a.platform.localeCompare(b.platform) : a.month.localeCompare(b.month),
    );
  const group = (keyOf: (c: PnlCell) => string, make: (c: PnlCell) => PnlCell) => {
    const m = new Map<string, PnlCell>();
    for (const c of list) {
      const k = keyOf(c);
      let g = m.get(k);
      if (!g) {
        g = make(c);
        m.set(k, g);
      }
      addInto(g, c);
    }
    return [...m.values()].map(finish);
  };
  const byPlatform = group(
    (c) => c.platform,
    (c) => emptyCell(c.platform, "all"),
  ).sort((a, b) => b.netProfitCents - a.netProfitCents);
  const byMonth = group(
    (c) => c.month,
    (c) => emptyCell("all", c.month),
  ).sort((a, b) => a.month.localeCompare(b.month));
  const total = emptyCell("all", "all");
  for (const c of list) addInto(total, c);
  return { from, to, cells: list, byPlatform, byMonth, total: finish(total) };
}
