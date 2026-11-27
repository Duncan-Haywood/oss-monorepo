// Who collected the sales tax on a sale, and so whether the seller still has to send it to the state.
//
// The marketplaces this app imports (eBay, Poshmark, Mercari, Whatnot, Depop, Etsy, Amazon, TikTok Shop)
// collect and send the sales tax on the sales made through them, so their tax is never the seller's to
// file (the platform pages in seller-books-site say so for each one). The tax on a sale the seller rang
// up themselves is different: Square at a booth, a PayPal or Venmo payment, a sale typed in as a direct sale, and
// an order on the seller's own Shopify store. That money was collected by the seller for the state; it is
// not income, and it is what goes on the seller's own sales tax return.
//
// Grailed, StockX and Vinted (imported through the column-mapped CSV) are marketplaces that collect the
// tax themselves (Vinted's help article 1014; StockX and Grailed by secondary sources, docs/IMPORTERS.md).
// "Another marketplace" is counted as the seller's, with a caveat: the app cannot know who collected it,
// and showing tax that is not the seller's to file is the safer mistake than hiding tax that is.
//
// Shopify is the mixed case: its orders export puts every order's tax in one Taxes column, and orders
// from the Shop sales channel can have their tax collected by Shopify as the marketplace. The orders
// export does not say which, so Shopify's tax is counted as the seller's and the report says to take out
// the Shop channel's orders. Nothing here decides what a state taxes or whether the seller needs a permit.
import type { SaleChannel } from "./enums";

export type TaxCollector = "marketplace" | "seller";

const SELLER_COLLECTED: ReadonlySet<string> = new Set<SaleChannel>([
  "square",
  "paypal",
  "venmo",
  "shopify",
  "other",
  "direct",
]);

/** Who collected the tax on a sale from this channel. An unknown channel counts as the marketplace's. */
export function taxCollector(channel: string): TaxCollector {
  return SELLER_COLLECTED.has(channel) ? "seller" : "marketplace";
}

/** Channels whose tax the seller collected, in report order. */
export const SELLER_TAX_CHANNELS = [
  "square",
  "paypal",
  "venmo",
  "shopify",
  "other",
  "direct",
] as const;

/** Channels whose seller-collected tax needs a caveat in the report. */
export const SELLER_TAX_CAVEATS: Partial<Record<SaleChannel, string>> = {
  shopify:
    "Shopify's orders export has one Taxes column. Tax on orders from the Shop sales channel is collected by Shopify as the marketplace: take those orders out.",
  other:
    "Another marketplace's file was matched by hand, so Seller Books cannot know who collected its tax. Most US marketplaces collect and send it themselves (marketplace facilitator laws): if this one did, that tax is not yours to file; take it out.",
};

export interface SalesTaxCellInput {
  platform: string;
  month: string; // YYYY-MM
  sellerSalesTaxCents: number;
  sellerSalesTaxRefundedCents: number;
  itemSalesCents: number;
  shippingChargedCents: number;
  refundsCents: number;
}

interface Amounts {
  /** What the buyers paid for items and shipping on these sales, without the tax. */
  salesCents: number;
  /** What went back to buyers for items and shipping, without the tax. */
  refundsCents: number;
  taxCollectedCents: number;
  taxRefundedCents: number;
  /** Collected less refunded: the figure a return usually starts from. */
  netTaxCents: number;
}

export interface SalesTaxRow extends Amounts {
  month: string;
  platform: string;
}

export interface SalesTaxPeriodTotal extends Amounts {
  period: string;
}

const zero = (): Amounts => ({
  salesCents: 0,
  refundsCents: 0,
  taxCollectedCents: 0,
  taxRefundedCents: 0,
  netTaxCents: 0,
});

function add(into: Amounts, a: Amounts) {
  into.salesCents += a.salesCents;
  into.refundsCents += a.refundsCents;
  into.taxCollectedCents += a.taxCollectedCents;
  into.taxRefundedCents += a.taxRefundedCents;
  into.netTaxCents += a.netTaxCents;
}

/**
 * The seller-collected tax, one row per month and channel, for the months and channels that had any
 * sale or refund on a seller-collected channel (a month with sales and no tax still shows, as a zero).
 * Sorted by month, then by SELLER_TAX_CHANNELS order.
 */
export function sellerSalesTaxRows(cells: SalesTaxCellInput[]): SalesTaxRow[] {
  const rank = (p: string) => (SELLER_TAX_CHANNELS as readonly string[]).indexOf(p);
  return cells
    .filter((c) => taxCollector(c.platform) === "seller")
    .filter(
      (c) =>
        c.sellerSalesTaxCents !== 0 ||
        c.sellerSalesTaxRefundedCents !== 0 ||
        c.itemSalesCents !== 0 ||
        c.shippingChargedCents !== 0 ||
        c.refundsCents !== 0,
    )
    .map((c) => ({
      month: c.month,
      platform: c.platform,
      salesCents: c.itemSalesCents + c.shippingChargedCents,
      refundsCents: c.refundsCents,
      taxCollectedCents: c.sellerSalesTaxCents,
      taxRefundedCents: c.sellerSalesTaxRefundedCents,
      netTaxCents: c.sellerSalesTaxCents - c.sellerSalesTaxRefundedCents,
    }))
    .sort((a, b) =>
      a.month === b.month ? rank(a.platform) - rank(b.platform) : a.month.localeCompare(b.month),
    );
}

/** Calendar quarter of a YYYY-MM month, as "2026-Q3". */
export function quarterOf(month: string): string {
  const m = Number(month.slice(5, 7));
  return `${month.slice(0, 4)}-Q${Math.ceil(m / 3)}`;
}

/** The rows added up by month ("month") or by calendar quarter ("quarter"), in date order. */
export function totalsBy(rows: SalesTaxRow[], by: "month" | "quarter"): SalesTaxPeriodTotal[] {
  const m = new Map<string, SalesTaxPeriodTotal>();
  for (const r of rows) {
    const period = by === "month" ? r.month : quarterOf(r.month);
    let t = m.get(period);
    if (!t) {
      t = { period, ...zero() };
      m.set(period, t);
    }
    add(t, r);
  }
  return [...m.values()].sort((a, b) => a.period.localeCompare(b.period));
}

const money = (cents: number) => (cents / 100).toFixed(2);
const amounts = (a: Amounts) => [
  money(a.salesCents),
  money(a.refundsCents),
  money(a.taxCollectedCents),
  money(a.taxRefundedCents),
  money(a.netTaxCents),
];

/**
 * The CSV the seller (or their preparer) fills a sales tax return from: one row per month and channel,
 * then a total per calendar quarter and for the whole range. Every amount is in dollars.
 */
export function salesTaxCsvRows(
  rows: SalesTaxRow[],
  label: (platform: string) => string,
): string[][] {
  const out: string[][] = [
    [
      "Period",
      "Channel",
      "Sales (items and shipping)",
      "Refunds (items and shipping)",
      "Sales tax you collected",
      "Sales tax refunded",
      "Net sales tax",
      "Note",
    ],
  ];
  for (const r of rows)
    out.push([
      r.month,
      label(r.platform),
      ...amounts(r),
      SELLER_TAX_CAVEATS[r.platform as SaleChannel] ?? "",
    ]);
  for (const q of totalsBy(rows, "quarter"))
    out.push([q.period, "All channels", ...amounts(q), ""]);
  const all = zero();
  for (const r of rows) add(all, r);
  out.push(["Total", "All channels", ...amounts(all), ""]);
  return out;
}
