// Sales ledger: one row per imported sale, refund and account charge, with the arithmetic the P&L uses, so a
// seller (or their accountant) can see where every figure on the P&L and the Schedule C worksheet came from.
// Pure function over plain rows so it is unit-tested without a database.
//
// Per row, exactly as buildPnl counts it:
//   order:   revenue = item sales + shipping charged; cost of goods = the linked item's cost (0 when unlinked)
//   refund:  revenue = −refund
//   charge:  postage (shipping labels), fees (every other kind), or a subscription, which the P&L counts as an
//            expense and so stays out of gross profit
//   gross profit = revenue − fees − postage − cost of goods
// The total of the gross-profit column therefore equals the P&L's gross profit for the same dates. Expenses the
// seller typed in are not sales and are not in the ledger.
import { FEE_KIND_LABELS, type FeeKind } from "@shared/enums";

export interface LedgerSaleInput {
  platform: string;
  kind: "order" | "refund";
  date: string;
  orderId: string | null;
  title: string | null;
  sku: string | null;
  quantity: number;
  itemCents: number;
  shippingChargedCents: number;
  salesTaxCents: number;
  refundCents: number;
  shippingLabelCents: number;
  netCents: number | null;
  fees: { kind: string; amountCents: number }[];
  /** The linked inventory item, if any (several items of a multi-unit order: their titles and total cost). */
  item: { title: string; costCents: number } | null;
  /** Units of the order with no item linked. */
  unitsWithoutItem?: number;
  /** Refunds: the items the buyer sent back into stock (titles and total cost), if any. */
  returned?: { title: string; costCents: number } | null;
}

export interface LedgerChargeInput {
  platform: string;
  date: string;
  kind: string;
  amountCents: number;
  orderId: string | null;
  description: string | null;
}

export interface LedgerRow {
  date: string;
  platform: string;
  type: string;
  orderId: string | null;
  title: string | null;
  sku: string | null;
  quantity: number | null;
  itemSalesCents: number;
  shippingChargedCents: number;
  refundCents: number;
  revenueCents: number;
  feesCents: number;
  /** The part of `feesCents` that is ads / promoted listings (Schedule C line 8; the rest is line 10). */
  advertisingCents: number;
  postageCents: number;
  cogsCents: number;
  grossProfitCents: number;
  subscriptionCents: number;
  salesTaxCollectedCents: number;
  netPerReportCents: number | null;
  feeDetail: string;
  note: string;
}

export type LedgerTotals = Pick<
  LedgerRow,
  | "itemSalesCents"
  | "shippingChargedCents"
  | "refundCents"
  | "revenueCents"
  | "feesCents"
  | "postageCents"
  | "cogsCents"
  | "grossProfitCents"
  | "subscriptionCents"
  | "salesTaxCollectedCents"
> & { ordersWithoutCost: number };

export interface SalesLedger {
  from: string;
  to: string;
  rows: LedgerRow[];
  totals: LedgerTotals;
}

const feeLabel = (kind: string) => FEE_KIND_LABELS[kind as FeeKind] ?? kind;
const money = (cents: number) => (cents / 100).toFixed(2);

function feeDetail(fees: { kind: string; amountCents: number }[]): string {
  const byKind = new Map<string, number>();
  for (const f of fees) byKind.set(f.kind, (byKind.get(f.kind) ?? 0) + f.amountCents);
  return [...byKind]
    .filter(([, c]) => c !== 0)
    .map(([k, c]) => `${feeLabel(k)} ${money(c)}`)
    .join("; ");
}

const inRange = (d: string, from: string, to: string) => d >= from && d <= to;

export function buildSalesLedger(
  from: string,
  to: string,
  input: { sales: LedgerSaleInput[]; charges: LedgerChargeInput[] },
): SalesLedger {
  const rows: (LedgerRow & { order: number })[] = [];
  let seq = 0;
  let ordersWithoutCost = 0;

  for (const s of input.sales) {
    if (!inRange(s.date, from, to)) continue;
    const feesCents = s.fees.reduce((sum, f) => sum + f.amountCents, 0);
    const isOrder = s.kind === "order";
    const itemSalesCents = isOrder ? s.itemCents : 0;
    const shippingChargedCents = isOrder ? s.shippingChargedCents : 0;
    const refundCents = isOrder ? 0 : s.refundCents;
    const revenueCents = itemSalesCents + shippingChargedCents - refundCents;
    const cogsCents = isOrder ? (s.item?.costCents ?? 0) : s.returned ? -s.returned.costCents : 0;
    let note = "";
    if (isOrder && !s.item) {
      ordersWithoutCost++;
      note = "No inventory item linked: cost of goods not counted";
    } else if (isOrder && s.item && (s.unitsWithoutItem ?? 0) > 0) {
      ordersWithoutCost++;
      note = `Cost from inventory item: ${s.item.title}; ${s.unitsWithoutItem} unit(s) sold with no item linked: their cost of goods not counted`;
    } else if (isOrder && s.item) {
      note = `Cost from inventory item: ${s.item.title}`;
    } else if (!isOrder && s.returned) {
      note = `Returned to stock: ${s.returned.title}; its cost of goods is reversed`;
    }
    rows.push({
      order: seq++,
      date: s.date,
      platform: s.platform,
      type: isOrder ? "Sale" : "Refund",
      orderId: s.orderId,
      title: s.title,
      sku: s.sku,
      quantity: s.quantity,
      itemSalesCents,
      shippingChargedCents,
      refundCents,
      revenueCents,
      feesCents,
      advertisingCents: s.fees
        .filter((f) => f.kind === "advertising")
        .reduce((sum, f) => sum + f.amountCents, 0),
      postageCents: s.shippingLabelCents,
      cogsCents,
      grossProfitCents: revenueCents - feesCents - s.shippingLabelCents - cogsCents,
      subscriptionCents: 0,
      salesTaxCollectedCents: isOrder ? s.salesTaxCents : 0,
      netPerReportCents: s.netCents,
      feeDetail: feeDetail(s.fees),
      note,
    });
  }

  for (const ch of input.charges) {
    if (!inRange(ch.date, from, to)) continue;
    const isLabel = ch.kind === "shipping_label";
    const isSubscription = ch.kind === "subscription";
    const feesCents = isLabel || isSubscription ? 0 : ch.amountCents;
    const postageCents = isLabel ? ch.amountCents : 0;
    const label = isLabel ? "Shipping label" : isSubscription ? "Subscription" : feeLabel(ch.kind);
    rows.push({
      order: seq++,
      date: ch.date,
      platform: ch.platform,
      type: `Account charge: ${label}`,
      orderId: ch.orderId,
      title: ch.description,
      sku: null,
      quantity: null,
      itemSalesCents: 0,
      shippingChargedCents: 0,
      refundCents: 0,
      revenueCents: 0,
      feesCents,
      advertisingCents: ch.kind === "advertising" ? ch.amountCents : 0,
      postageCents,
      cogsCents: 0,
      grossProfitCents: 0 - feesCents - postageCents,
      subscriptionCents: isSubscription ? ch.amountCents : 0,
      salesTaxCollectedCents: 0,
      netPerReportCents: null,
      feeDetail: isLabel || isSubscription ? "" : `${label} ${money(ch.amountCents)}`,
      note: isSubscription ? "Counted as an expense, not in gross profit" : "",
    });
  }

  rows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || a.platform.localeCompare(b.platform) || a.order - b.order,
  );

  const totals: LedgerTotals = {
    itemSalesCents: 0,
    shippingChargedCents: 0,
    refundCents: 0,
    revenueCents: 0,
    feesCents: 0,
    postageCents: 0,
    cogsCents: 0,
    grossProfitCents: 0,
    subscriptionCents: 0,
    salesTaxCollectedCents: 0,
    ordersWithoutCost,
  };
  for (const r of rows) {
    totals.itemSalesCents += r.itemSalesCents;
    totals.shippingChargedCents += r.shippingChargedCents;
    totals.refundCents += r.refundCents;
    totals.revenueCents += r.revenueCents;
    totals.feesCents += r.feesCents;
    totals.postageCents += r.postageCents;
    totals.cogsCents += r.cogsCents;
    totals.grossProfitCents += r.grossProfitCents;
    totals.subscriptionCents += r.subscriptionCents;
    totals.salesTaxCollectedCents += r.salesTaxCollectedCents;
  }
  return { from, to, rows: rows.map(({ order: _order, ...r }) => r), totals };
}

export const LEDGER_HEADER = [
  "Date",
  "Platform",
  "Type",
  "Order ID",
  "Title / description",
  "SKU",
  "Quantity",
  "Item sales",
  "Shipping charged to buyer",
  "Refund",
  "Revenue",
  "Fees",
  "Postage",
  "Cost of goods",
  "Gross profit",
  "Subscription (expense)",
  "Sales tax collected by marketplace (not income)",
  "Net per report",
  "Fee detail",
  "Note",
] as const;

/** CSV rows (header, data, totals, notes) for the ledger; amounts in dollars with two decimals. */
export function ledgerCsvRows(
  ledger: SalesLedger,
  platformLabel: (p: string) => string,
): (string | number | null)[][] {
  const amounts = (r: LedgerTotals | LedgerRow) => [
    money(r.itemSalesCents),
    money(r.shippingChargedCents),
    money(r.refundCents),
    money(r.revenueCents),
    money(r.feesCents),
    money(r.postageCents),
    money(r.cogsCents),
    money(r.grossProfitCents),
    money(r.subscriptionCents),
    money(r.salesTaxCollectedCents),
  ];
  const t = ledger.totals;
  return [
    [`Sales ledger ${ledger.from} to ${ledger.to} (USD)`],
    [
      "Built from the marketplace reports you imported. Bookkeeping records, not a tax return and not tax advice.",
    ],
    [],
    [...LEDGER_HEADER],
    ...ledger.rows.map((r) => [
      r.date,
      platformLabel(r.platform),
      r.type,
      r.orderId,
      r.title,
      r.sku,
      r.quantity,
      ...amounts(r),
      r.netPerReportCents == null ? "" : money(r.netPerReportCents),
      r.feeDetail,
      r.note,
    ]),
    ["Total", "", `${ledger.rows.length} rows`, "", "", "", "", ...amounts(t), "", "", ""],
    [],
    [
      "The gross profit total equals the P&L's gross profit for the same dates. Expenses you entered by hand and mileage are not sales and are not in this file.",
    ],
    ...(t.ordersWithoutCost > 0
      ? [
          [
            `${t.ordersWithoutCost} sale(s) have no inventory item linked for some or all of the units sold, so their cost of goods is not fully counted. Link them on the Sales page.`,
          ],
        ]
      : []),
  ];
}
