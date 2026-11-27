// Who collected the sales tax: the P&L splits it, and the seller-collected part is reported by month,
// channel and quarter for the seller's own sales tax return.
import { parseCsv } from "@shared/csv";
import {
  quarterOf,
  SELLER_TAX_CAVEATS,
  salesTaxCsvRows,
  sellerSalesTaxRows,
  taxCollector,
  totalsBy,
} from "@shared/sales-tax";
import { buildPnl, type PnlSaleInput } from "@worker/services/books/pnl";
import { parseSquareTransactions } from "@worker/services/importers/square";
import { describe, expect, it } from "vitest";
import squareCsv from "../fixtures/square-transactions.csv?raw";

const sale = (
  o: Partial<PnlSaleInput> & Pick<PnlSaleInput, "platform" | "date">,
): PnlSaleInput => ({
  kind: "order",
  itemCents: 0,
  shippingChargedCents: 0,
  salesTaxCents: 0,
  refundCents: 0,
  shippingLabelCents: 0,
  fees: [],
  cogsCents: 0,
  ...o,
});

describe("taxCollector", () => {
  it("the marketplaces collect their own sales' tax; the seller collects the rest", () => {
    for (const p of ["ebay", "poshmark", "mercari", "whatnot", "depop", "etsy", "amazon", "tiktok"])
      expect(taxCollector(p)).toBe("marketplace");
    for (const p of ["square", "paypal", "shopify", "direct"])
      expect(taxCollector(p)).toBe("seller");
    expect(taxCollector("something-new")).toBe("marketplace");
  });
});

describe("the P&L's sales tax split", () => {
  const pnl = buildPnl("2026-01-01", "2026-12-31", {
    sales: [
      sale({ platform: "ebay", date: "2026-02-03", itemCents: 5000, salesTaxCents: 400 }),
      sale({ platform: "square", date: "2026-02-10", itemCents: 3500, salesTaxCents: 210 }),
      sale({ platform: "square", date: "2026-04-01", itemCents: 1000, salesTaxCents: 60 }),
      sale({
        platform: "square",
        date: "2026-04-05",
        kind: "refund",
        refundCents: 1000,
        salesTaxCents: 60,
      }),
      sale({ platform: "direct", date: "2026-05-20", itemCents: 2000, salesTaxCents: 150 }),
      sale({ platform: "paypal", date: "2026-02-11", itemCents: 2500, shippingChargedCents: 500 }),
    ],
    charges: [],
    expenses: [],
  });

  it("keeps every cent of tax out of revenue and says who collected it", () => {
    expect(pnl.total.revenueCents).toBe(5000 + 3500 + 1000 - 1000 + 2000 + 2500 + 500);
    expect(pnl.total.salesTaxCollectedCents).toBe(400 + 210 + 60 + 150);
    expect(pnl.total.marketplaceSalesTaxCents).toBe(400);
    expect(pnl.total.sellerSalesTaxCents).toBe(210 + 60 + 150);
    expect(pnl.total.sellerSalesTaxRefundedCents).toBe(60);
    expect(pnl.total.marketplaceSalesTaxCents + pnl.total.sellerSalesTaxCents).toBe(
      pnl.total.salesTaxCollectedCents,
    );
  });

  it("reports the seller-collected tax by month and channel, net of refunds, with no marketplace rows", () => {
    const rows = sellerSalesTaxRows(pnl.cells);
    expect(rows.map((r) => [r.month, r.platform, r.netTaxCents])).toEqual([
      ["2026-02", "square", 210],
      ["2026-02", "paypal", 0], // a sale with no tax still shows, so a missing tax is visible
      ["2026-04", "square", 0],
      ["2026-05", "direct", 150],
    ]);
    expect(rows[2]).toMatchObject({
      salesCents: 1000,
      refundsCents: 1000,
      taxCollectedCents: 60,
      taxRefundedCents: 60,
    });
    expect(rows[1]?.salesCents).toBe(3000);
  });

  it("adds the rows up by quarter", () => {
    const q = totalsBy(sellerSalesTaxRows(pnl.cells), "quarter");
    expect(
      q.map((t) => [t.period, t.taxCollectedCents, t.taxRefundedCents, t.netTaxCents]),
    ).toEqual([
      ["2026-Q1", 210, 0, 210],
      ["2026-Q2", 210, 60, 150],
    ]);
    expect(
      ["2026-01", "2026-03", "2026-04", "2026-09", "2026-10", "2026-12"].map(quarterOf),
    ).toEqual(["2026-Q1", "2026-Q1", "2026-Q2", "2026-Q3", "2026-Q4", "2026-Q4"]);
  });

  it("writes a CSV whose quarter and total rows add up to its month rows", () => {
    const csv = salesTaxCsvRows(sellerSalesTaxRows(pnl.cells), (p) => p.toUpperCase());
    expect(csv[0]).toEqual([
      "Period",
      "Channel",
      "Sales (items and shipping)",
      "Refunds (items and shipping)",
      "Sales tax you collected",
      "Sales tax refunded",
      "Net sales tax",
      "Note",
    ]);
    expect(csv[1]).toEqual(["2026-02", "SQUARE", "35.00", "0.00", "2.10", "0.00", "2.10", ""]);
    expect(csv.at(-1)).toEqual([
      "Total",
      "All channels",
      "95.00",
      "10.00",
      "4.20",
      "0.60",
      "3.60",
      "",
    ]);
    const quarterNet = csv
      .filter((r) => /^\d{4}-Q\d$/.test(r[0] ?? ""))
      .reduce((s, r) => s + Number(r[6]), 0);
    expect(quarterNet.toFixed(2)).toBe("3.60");
  });

  it("puts the Shopify caveat on Shopify's rows", () => {
    const rows = sellerSalesTaxRows(
      buildPnl("2026-01-01", "2026-12-31", {
        sales: [
          sale({ platform: "shopify", date: "2026-03-01", itemCents: 900, salesTaxCents: 72 }),
        ],
        charges: [],
        expenses: [],
      }).cells,
    );
    const csv = salesTaxCsvRows(rows, (p) => p);
    expect(csv[1]?.[7]).toBe(SELLER_TAX_CAVEATS.shopify);
  });
});

describe("Square refunds carry the tax handed back", () => {
  it("the fixture's refunded jacket gives its $2.10 of tax back; the untaxed skillet gives none", () => {
    const parsed = parseSquareTransactions(squareCsv);
    const refunds = parsed.sales.filter((s) => s.kind === "refund");
    const jacket = refunds.find((s) => s.title === "Vintage denim jacket");
    expect(jacket).toMatchObject({ refundCents: 3500, salesTaxCents: 210 });
    const skillet = refunds.find((s) => s.title === "Cast iron skillet");
    expect(skillet).toMatchObject({ refundCents: 1000, salesTaxCents: 0 });
    const taxIn = parsed.sales
      .filter((s) => s.kind === "order")
      .reduce((t, s) => t + s.salesTaxCents, 0);
    const taxBack = refunds.reduce((t, s) => t + s.salesTaxCents, 0);
    expect(taxIn - taxBack).toBe(0); // the only taxed sale, the jacket, came back
  });

  it("round-trips through the CSV reader", () => {
    const text = salesTaxCsvRows([], (p) => p)
      .map((r) => r.join(","))
      .join("\n");
    expect(parseCsv(text).at(-1)).toEqual([
      "Total",
      "All channels",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      "0.00",
      "",
    ]);
  });
});
