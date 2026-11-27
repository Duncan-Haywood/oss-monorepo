import { readFileSync } from "node:fs";
import { parseDepopSales } from "@worker/services/importers/depop";
import { parseEbayTransactionReport } from "@worker/services/importers/ebay";
import { parseEtsySoldOrders, parseEtsyStatement } from "@worker/services/importers/etsy";
import { parseMercariSalesReport } from "@worker/services/importers/mercari";
import { ImportFormatError, sumFees } from "@worker/services/importers/parse";
import { parsePoshmarkSalesReport } from "@worker/services/importers/poshmark";
import { parseWhatnotOrdersReport } from "@worker/services/importers/whatnot";
import { describe, expect, it } from "vitest";

const fixture = (name: string) =>
  readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8");

/** Every order must reconcile: item + shipping − fees − postage = net (when the report gives net). */
function expectReconciles(sales: ReturnType<typeof parseEbayTransactionReport>["sales"]) {
  for (const s of sales.filter((x) => x.kind === "order" && x.netCents != null)) {
    expect(
      s.itemCents + s.shippingChargedCents - sumFees(s.fees) - s.shippingLabelCents,
      s.externalId,
    ).toBe(s.netCents);
  }
}

describe("eBay transaction report", () => {
  const r = parseEbayTransactionReport(fixture("ebay-transaction-report.csv"));

  it("skips the preamble, payouts and non-USD rows", () => {
    expect(r.rowCount).toBe(7);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Payout row (money movement, not income)",
      "Currency GBP (only USD is supported)",
    ]);
    expect(r.warnings).toContain("1 non-USD rows were skipped.");
  });

  it("splits each order's fees by the report's own columns and excludes eBay-collected tax", () => {
    const [a, b] = r.sales.filter((s) => s.kind === "order");
    expect(a).toMatchObject({
      orderId: "01-11111-22222",
      date: "2026-01-05",
      sku: "SKU-JEANS-1",
      itemCents: 4000,
      shippingChargedCents: 500,
      salesTaxCents: 330,
      netCents: 3866,
    });
    expect(a?.fees).toEqual([
      { kind: "final_value", amountCents: 594, sourceColumn: "Final Value Fee - variable" },
      { kind: "per_order", amountCents: 40, sourceColumn: "Final Value Fee - fixed" },
    ]);
    expect(b).toMatchObject({
      itemCents: 125000,
      quantity: 2,
      title: 'Pyrex Butterprint bowl set "rare"',
    });
    expect(b?.fees.find((f) => f.kind === "international")?.amountCents).toBe(1875);
    expectReconciles(r.sales);
  });

  it("records the refund net of tax with fee credits", () => {
    const refund = r.sales.find((s) => s.kind === "refund");
    expect(refund).toMatchObject({ date: "2026-02-02", refundCents: 4500, netCents: -3906 });
    expect(refund?.fees).toEqual([
      { kind: "final_value", amountCents: -594, sourceColumn: "Final Value Fee - variable" },
    ]);
    expect(refund ? refund.refundCents - -sumFees(refund.fees) : 0).toBe(-(refund?.netCents ?? 0));
  });

  it("turns labels and promoted-listing fees into account charges", () => {
    expect(r.charges.map((c) => [c.kind, c.amountCents, c.date])).toEqual([
      ["shipping_label", 875, "2026-01-06"],
      ["advertising", 1240, "2026-01-31"],
    ]);
  });

  it("gives every row a stable id so a re-import is detected", () => {
    const again = parseEbayTransactionReport(fixture("ebay-transaction-report.csv"));
    expect(again.sales.map((s) => s.externalId)).toEqual(r.sales.map((s) => s.externalId));
    expect(new Set(r.sales.map((s) => s.externalId)).size).toBe(r.sales.length);
  });

  it("refuses a file without the required columns", () => {
    expect(() => parseEbayTransactionReport("a,b,c\n1,2,3\n")).toThrow(ImportFormatError);
  });
});

describe("Poshmark My Sales Report", () => {
  const r = parsePoshmarkSalesReport(fixture("poshmark-my-sales-report.csv"));

  it("derives Poshmark's fee from order price and net earnings (no assumed rate)", () => {
    expect(r.sales).toHaveLength(4);
    expect(r.skipped).toEqual([{ line: 6, reason: "Cancelled order" }]);
    const [tote, sweater, tee, boots] = r.sales;
    expect(tote?.fees).toEqual([
      {
        kind: "marketplace_fee",
        amountCents: 960,
        sourceColumn: "Order Price − Net Earnings (derived)",
      },
    ]);
    expect(sweater).toMatchObject({ itemCents: 3000, shippingLabelCents: 199, netCents: 2201 });
    expect(sumFees(sweater?.fees ?? [])).toBe(600);
    expect(tee?.externalId).not.toBe(sweater?.externalId); // same bundle, separate lines
    expect(boots?.fees.map((f) => [f.kind, f.amountCents])).toEqual([
      ["other", 6],
      ["marketplace_fee", 295],
    ]);
    expectReconciles(r.sales);
  });
});

describe("Mercari sales report", () => {
  const r = parseMercariSalesReport(fixture("mercari-sales-report.csv"));

  it("reads itemised fees and seller-paid shipping", () => {
    expect(r.sales).toHaveLength(2);
    const [ds, lego] = r.sales;
    expect(ds).toMatchObject({
      externalId: "m11111111111",
      date: "2026-02-01",
      itemCents: 4500,
      salesTaxCents: 360,
    });
    expect(ds?.fees).toEqual([
      { kind: "commission", amountCents: 450, sourceColumn: "Mercari Selling Fee" },
    ]);
    expect(ds?.shippingLabelCents).toBe(750);
    expect(lego?.fees.map((f) => f.kind)).toEqual(["commission", "other"]);
    expect(r.warnings).toEqual([]);
    expectReconciles(r.sales);
  });

  it("skips cancelled orders and impossible dates with the line number", () => {
    expect(r.skipped).toEqual([
      { line: 4, reason: "Cancelled order" },
      { line: 5, reason: 'Unreadable date "Feb 30 2026"' },
    ]);
  });
});

describe("Whatnot orders report", () => {
  const r = parseWhatnotOrdersReport(fixture("whatnot-orders-report.csv"));

  it("matches UPPER_SNAKE headers and itemises commission and processing", () => {
    const orders = r.sales.filter((s) => s.kind === "order");
    expect(orders).toHaveLength(3);
    expect(orders[0]?.fees.map((f) => [f.kind, f.amountCents])).toEqual([
      ["commission", 200],
      ["payment_processing", 122],
    ]);
    expect(orders[2]).toMatchObject({ title: "Tip", itemCents: 500 });
    expectReconciles(r.sales);
  });

  it("turns a refund row into a refund with the commission credited back", () => {
    const refund = r.sales.find((s) => s.kind === "refund");
    expect(refund).toMatchObject({
      orderId: "wn-9002",
      date: "2026-03-09",
      refundCents: 8000,
      netCents: -7347,
    });
    expect(sumFees(refund?.fees ?? [])).toBe(-653);
  });
});

describe("Depop sales download", () => {
  const r = parseDepopSales(fixture("depop-sales.csv"));

  it("itemises payment, selling and boosting fees", () => {
    const orders = r.sales.filter((s) => s.kind === "order");
    expect(orders[0]?.fees.map((f) => [f.kind, f.amountCents])).toEqual([
      ["payment_processing", 129],
      ["advertising", 176],
    ]);
    expect(orders[0]).toMatchObject({
      shippingChargedCents: 500,
      shippingLabelCents: 500,
      salesTaxCents: 176,
    });
    expectReconciles(r.sales);
  });

  it("records a refunded sale as a refund and says the date is the sale date", () => {
    expect(r.sales.find((s) => s.kind === "refund")).toMatchObject({
      refundCents: 9500,
      date: "2026-04-11",
    });
    expect(r.warnings[0]).toMatch(/refund recorded on the sale date/);
  });
});

describe("Etsy", () => {
  it("Orders file: discounts reduce the item total, card processing fees itemised", () => {
    const r = parseEtsySoldOrders(fixture("etsy-sold-orders.csv"));
    expect(r.sales).toHaveLength(2);
    expect(r.sales[0]).toMatchObject({
      externalId: "3011111111",
      date: "2026-05-02",
      itemCents: 3420,
      shippingChargedCents: 650,
      sku: "VASE-03",
    });
    expect(r.sales[0]?.fees).toEqual([
      { kind: "payment_processing", amountCents: 147, sourceColumn: "Card Processing Fees" },
    ]);
    expect(r.sales[1]).toMatchObject({ quantity: 2, salesTaxCents: 662, sku: null });
  });

  it("statement: fees by title, processing and sales rows skipped (no double count)", () => {
    const r = parseEtsyStatement(fixture("etsy-statement.csv"));
    expect(r.charges.map((c) => [c.kind, c.amountCents])).toEqual([
      ["transaction", 222],
      ["transaction", 42],
      ["listing", 20],
      ["shipping_label", 510],
      ["advertising", 300],
      ["transaction", -130],
    ]);
    expect(r.charges[0]?.orderId).toBe("3011111111");
    expect(r.sales).toEqual([
      expect.objectContaining({ kind: "refund", refundCents: 2000, orderId: "3022222222" }),
    ]);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Sale row (sales come from the Orders file)",
      "Processing fee (already in the Orders file)",
      "Sales tax collected and remitted by Etsy",
      "Money movement, not income",
    ]);
    expect(r.warnings[0]).toMatch(/processing-fee rows were skipped/);
  });
});
