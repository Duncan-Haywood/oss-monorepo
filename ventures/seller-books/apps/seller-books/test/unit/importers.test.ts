import { readFileSync } from "node:fs";
import { parseAmazonDateRangeReport } from "@worker/services/importers/amazon";
import { parseDepopSales } from "@worker/services/importers/depop";
import { parseEbayTransactionReport } from "@worker/services/importers/ebay";
import { parseEtsySoldOrders, parseEtsyStatement } from "@worker/services/importers/etsy";
import { parseMercariSalesReport } from "@worker/services/importers/mercari";
import { ImportFormatError, sumFees } from "@worker/services/importers/parse";
import { parsePoshmarkSalesReport } from "@worker/services/importers/poshmark";
import {
  parseShopifyOrders,
  parseShopifyPaymentsTransactions,
} from "@worker/services/importers/shopify";
import { parseSquareTransactions } from "@worker/services/importers/square";
import { parseTiktokShopStatement } from "@worker/services/importers/tiktok";
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

describe("Mercari Gross Sales Report", () => {
  // The fixture's header is the full column list of Mercari's help article 541 (read 2026-11-26).
  const r = parseMercariSalesReport(fixture("mercari-sales-report.csv"));

  it("reads itemised fees and seller-paid shipping, dated by Completed Date", () => {
    expect(r.sales).toHaveLength(3);
    const [ds, lego, tee] = r.sales;
    expect(ds).toMatchObject({
      externalId: "m11111111111",
      date: "2026-02-05",
      itemCents: 4500,
      salesTaxCents: 360,
    });
    expect(ds?.fees).toEqual([
      { kind: "commission", amountCents: 450, sourceColumn: "Mercari Selling Fee" },
    ]);
    expect(ds?.shippingLabelCents).toBe(750);
    expect(lego?.fees.map((f) => f.kind)).toEqual(["commission", "other"]);
    // Sold 30 Dec, completed 3 Jan: Mercari's 1099-K counts completed transactions, so January.
    expect(tee).toMatchObject({ externalId: "b66666666666", date: "2026-01-03" });
    expect(r.warnings).toEqual([]);
    expectReconciles(r.sales);
  });

  it("never reads a buyer-paid fee column as the seller's fee", () => {
    // Lego row: "Payment Processing Fee Charged to Buyer" is 9.99, the seller's own column is 0.
    const lego = r.sales.find((s) => s.externalId === "m22222222222");
    expect(lego?.fees.some((f) => f.kind === "payment_processing")).toBe(false);
  });

  it("skips cancelled, not-yet-completed and impossible-date rows with the line number", () => {
    expect(r.skipped).toEqual([
      { line: 4, reason: "Cancelled order" },
      { line: 5, reason: 'Unreadable date "Feb 31 2026"' },
      {
        line: 6,
        reason:
          "Order not completed yet (Mercari's fees are estimates until then): import a later report once it completes",
      },
    ]);
  });

  it("without a status column, a blank Completed Date means not completed and a Canceled Date means cancelled", () => {
    const csv = [
      '"Item Id","Sold Date","Canceled Date","Completed Date","Item Price","Mercari Selling Fee","Net Seller Proceeds"',
      '"m1","2026-03-01","","2026-03-04","10.00","1.00","9.00"',
      '"m2","2026-03-02","","","10.00","1.00","9.00"',
      '"m3","2026-03-03","2026-03-05","","10.00","0.00","0.00"',
    ].join("\n");
    const t = parseMercariSalesReport(csv);
    expect(t.sales.map((s) => [s.externalId, s.date])).toEqual([["m1", "2026-03-04"]]);
    expect(t.skipped.map((s) => s.line)).toEqual([3, 4]);
    expect(t.skipped[1]?.reason).toBe("Cancelled order");
  });

  it("a trimmed export with only the required columns books every row on its sold date", () => {
    const csv = [
      '"Item Id","Sold Date","Item Price","Net Seller Proceeds"',
      '"m7","2026-04-01","12.00","10.80"',
    ].join("\n");
    const t = parseMercariSalesReport(csv);
    expect(t.sales.map((s) => [s.externalId, s.date])).toEqual([["m7", "2026-04-01"]]);
  });
});

describe("Whatnot orders report", () => {
  // Header row in the order of Whatnot's "Metric Definitions" (help article 36772664621837); rows authored.
  const r = parseWhatnotOrdersReport(fixture("whatnot-orders-report.csv"));
  const orders = r.sales.filter((s) => s.kind === "order");

  it("reads the official columns and dates each row by when it completed (UTC)", () => {
    expect(r.rowCount).toBe(7);
    expect(orders.map((s) => [s.externalId, s.orderId, s.date])).toEqual([
      ["led-1001", "wn-9001", "2026-03-03"], // placed 28 Feb, completed 3 Mar
      ["led-1002", "wn-9002", "2026-03-04"],
      ["led-1004", null, "2026-03-03"],
      ["led-1005", "wn-9004", "2026-03-05"],
    ]);
    expect(r.warnings).toEqual(["1 non-USD rows were skipped."]);
    expect(r.skipped.map((s) => s.reason)).toEqual(["Currency CAD (only USD is supported)"]);
    expectReconciles(r.sales);
  });

  it("books the post-coupon price and itemises commission, processing and fee taxes", () => {
    expect(orders[1]).toMatchObject({
      title: "Vintage Starter jacket",
      sku: "JKT-7",
      itemCents: 7500, // 80.00 less the seller's 5.00 coupon
      shippingChargedCents: 0,
      salesTaxCents: 0,
      shippingLabelCents: 0,
      netCents: 6593,
    });
    expect(orders[1]?.fees.map((f) => [f.kind, f.amountCents, f.sourceColumn])).toEqual([
      ["commission", 600, "Commission Fee"],
      ["payment_processing", 294, "Payment Processing Fee"],
      ["other", 13, "Tax on Commission"],
    ]);
  });

  it("a tip with no price is its amount plus its fees; a giveaway costs its seller-paid shipping", () => {
    expect(orders[2]).toMatchObject({ title: "Tip", itemCents: 500, netCents: 455 });
    expect(orders[3]).toMatchObject({
      title: "Sticker pack",
      itemCents: 0,
      shippingLabelCents: 499,
      netCents: -499,
    });
  });

  it("books an Order Refund whole, in the week it completed", () => {
    const refunds = r.sales.filter((s) => s.kind === "refund");
    expect(refunds).toHaveLength(1);
    expect(refunds[0]).toMatchObject({
      externalId: "led-1003:refund",
      orderId: "wn-9002",
      date: "2026-03-08",
      refundCents: 4000,
      netCents: -4000,
      fees: [],
    });
  });

  it("turns a Shipping Charge into a postage charge for its shipment", () => {
    expect(r.charges).toEqual([
      {
        externalId: "led-1006:charge",
        date: "2026-03-06",
        kind: "shipping_label",
        amountCents: 125,
        orderId: null,
        description: "Shipping Charge: Shipping label adjustment: shipment sh-72",
      },
    ]);
  });

  it("warns when a row does not add up, and skips types the report does not define", () => {
    const csv = [
      "TRANSACTION_TYPE,ORDER_ID,TRANSACTION_COMPLETED_AT_UTC,POST_COUPON_PRICE,COMMISSION_FEE,TRANSACTION_AMOUNT",
      "ORDER_EARNINGS,wn-1,2026-04-01 10:00:00,20.00,1.60,18.00",
      "PAYOUT,,2026-04-02 10:00:00,,,-100.00",
    ].join("\n");
    const t = parseWhatnotOrdersReport(csv);
    expect(t.sales).toHaveLength(1);
    expect(t.warnings[0]).toMatch(
      /Line 2: sale price − fees − seller-paid shipping ≠ Transaction Amount/,
    );
    expect(t.skipped).toEqual([
      { line: 3, reason: 'Transaction type "PAYOUT" is not one this report defines' },
    ]);
  });

  it("refuses a file without a transaction type or amount, naming what it expected", () => {
    expect(() => parseWhatnotOrdersReport("Order ID,Sold Price\nwn-1,5.00")).toThrow(
      ImportFormatError,
    );
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

describe("Shopify", () => {
  it("orders export: one sale per order from its first row, line items summed, unpaid and non-USD skipped", () => {
    const r = parseShopifyOrders(fixture("shopify-orders-export.csv"));
    expect(r.rowCount).toBe(6);
    expect(r.sales.filter((s) => s.kind === "order")).toHaveLength(3);
    expect(r.sales[0]).toMatchObject({
      kind: "order",
      externalId: "5550000000001",
      orderId: "#1001",
      date: "2026-05-03",
      title: "Vintage denim jacket and 1 more",
      sku: null, // two SKUs on one order
      quantity: 2,
      itemCents: 8000, // total 94.40 − shipping 8.00 − tax 6.40: after the SPRING5 discount
      shippingChargedCents: 800,
      salesTaxCents: 640,
      netCents: null,
      fees: [],
    });
    expect(r.sales[1]).toMatchObject({
      kind: "order",
      orderId: "#1002",
      sku: "LMP-07",
      itemCents: 4500,
    });
    expect(r.sales[2]).toMatchObject({
      kind: "refund",
      externalId: "5550000000002:refund",
      date: "2026-05-09",
      refundCents: 2000,
    });
    // No "Paid at": the order's created date.
    expect(r.sales[3]).toMatchObject({
      orderId: "#1005",
      date: "2026-05-30",
      quantity: 3,
      sku: "MUG-01",
    });
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Not paid (financial status pending)",
      "Currency CAD (only USD is supported)",
    ]);
    expect(r.warnings[0]).toMatch(/1 refunded order\(s\) recorded on the order's payment date/);
    expect(r.warnings[1]).toMatch(/Shopify Payments transactions file/);
  });

  it("orders export: a file without the line-item columns is refused, naming them", () => {
    expect(() => parseShopifyOrders("Name,Created at,Total\n#1,2026-01-01,5.00\n")).toThrow(
      ImportFormatError,
    );
  });

  it("payments transactions: fees from charges, chargebacks as returns, bills as subscription; no double count", () => {
    const r = parseShopifyPaymentsTransactions(fixture("shopify-payments-transactions.csv"));
    expect(r.rowCount).toBe(13);
    expect(r.charges.map((c) => [c.kind, c.amountCents, c.orderId])).toEqual([
      ["payment_processing", 304, "#1001"],
      ["payment_processing", 171, "#1002"],
      ["other", 1500, "#1001"],
      ["subscription", 3900, null],
    ]);
    expect(r.sales.map((s) => [s.kind, s.title, s.refundCents, s.date])).toEqual([
      ["refund", "Chargeback (order #1001)", 9440, "2026-05-20"],
      ["refund", "Chargeback won (order #1001)", -9440, "2026-06-10"],
    ]);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Refund with no fee (the refund comes from the orders export)",
      "Currency EUR (only USD is supported)",
      "Reserved funds (money held back, not income or a cost)",
      "Shop Cash part of an order's payment (the order's total already counts it)",
      "Marketplace sales tax collected and remitted by Shopify",
      "Refund that did not go through: check the order's Refunded Amount in the orders export",
      'Unknown transaction type "loan_withdrawal": not imported',
    ]);
    expect(r.warnings.join("\n")).toMatch(/Adjustments on line\(s\) 7 are recorded/);
    expect(r.warnings.join("\n")).toMatch(/3 charge and refund rows gave their fee only/);
  });

  it("payments transactions: the same file twice gives the same ids (re-import adds nothing)", () => {
    const a = parseShopifyPaymentsTransactions(fixture("shopify-payments-transactions.csv"));
    const b = parseShopifyPaymentsTransactions(fixture("shopify-payments-transactions.csv"));
    expect(a.charges.map((c) => c.externalId)).toEqual(b.charges.map((c) => c.externalId));
    expect(new Set(a.charges.map((c) => c.externalId)).size).toBe(a.charges.length);
  });
});

describe("Amazon Date Range Report (transaction)", () => {
  const r = parseAmazonDateRangeReport(fixture("amazon-date-range-report.csv"));
  const orders = r.sales.filter((s) => s.kind === "order");

  it("skips the preamble and reads orders by their printed date, net of Amazon-withheld tax", () => {
    expect(r.platform).toBe("amazon");
    expect(orders.map((o) => [o.date, o.orderId, o.netCents])).toEqual([
      ["2026-03-03", "111-0000001-0000001", 1705],
      ["2026-03-05", "111-0000002-0000002", 3811],
    ]);
    expect(r.warnings.filter((w) => w.includes("do not add up"))).toEqual([]);
    expectReconciles(r.sales);
  });

  it("takes every fee from its own column: selling, FBA and the regulatory fee", () => {
    const [fba, own] = orders;
    expect(fba?.fees.map((f) => [f.kind, f.amountCents, f.sourceColumn])).toEqual([
      ["commission", 375, "selling fees"],
      ["fulfillment", 420, "fba fees"],
    ]);
    expect(own?.fees.map((f) => [f.kind, f.amountCents])).toEqual([
      ["commission", 675],
      ["regulatory", 13],
    ]);
    // The seller's promotion lowers the item price; buyer-paid shipping is shipping income; tax is not income.
    expect(own).toMatchObject({ itemCents: 3900, shippingChargedCents: 599, salesTaxCents: 315 });
  });

  it("books a refund without the tax, with the fee Amazon credited back as a negative fee", () => {
    const refund = r.sales.find((s) => s.kind === "refund");
    expect(refund).toMatchObject({ date: "2026-03-09", refundCents: 2500, netCents: -2200 });
    expect(refund?.fees).toEqual([
      { kind: "commission", amountCents: -300, sourceColumn: "selling fees" },
    ]);
  });

  it("turns account rows into charges: the plan, ads, storage, labels, and a reimbursement as a credit", () => {
    expect(r.charges.map((c) => [c.kind, c.amountCents])).toEqual([
      ["subscription", 3999],
      ["advertising", 1234],
      ["fulfillment", 321],
      ["fulfillment", 321],
      ["other", -850],
      ["shipping_label", 610],
    ]);
    // Two identical storage rows stay two charges, and the ids are the same on a second read of the file.
    const ids = r.charges.map((c) => c.externalId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      parseAmazonDateRangeReport(fixture("amazon-date-range-report.csv")).charges.map(
        (c) => c.externalId,
      ),
    ).toEqual(ids);
  });

  it("skips payouts, other marketplaces and types it does not know, saying why", () => {
    const reasons = r.skipped.map((s) => s.reason);
    expect(reasons).toEqual([
      "Transfer row (money movement, not income)",
      "Marketplace amazon.ca (only amazon.com, in USD, is supported)",
      'Transaction type "Something New" is not one Seller Books reads yet',
    ]);
    expect(r.warnings).toContain("1 rows from other Amazon marketplaces were skipped.");
    expect(r.warnings.some((w) => w.startsWith("1 account credits") && w.includes("$8.50"))).toBe(
      true,
    );
  });

  it("refuses a report in another currency, and a file without the required columns", () => {
    const cad = fixture("amazon-date-range-report.csv").replace(
      "All amounts in USD",
      "All amounts in CAD",
    );
    expect(() => parseAmazonDateRangeReport(cad)).toThrow(/CAD/);
    expect(() => parseAmazonDateRangeReport("order id,sku\n1,2\n")).toThrow(ImportFormatError);
  });

  it("warns when a row's columns do not add up to its total", () => {
    const bad = fixture("amazon-date-range-report.csv").replace('"17.05"', '"17.06"');
    const out = parseAmazonDateRangeReport(bad);
    expect(out.warnings.some((w) => w.includes("do not add up"))).toBe(true);
  });
});

describe("TikTok Shop statement (Order details)", () => {
  const r = parseTiktokShopStatement(fixture("tiktok-shop-statement.csv"));
  const orders = r.sales.filter((s) => s.kind === "order");

  it("skips other currencies and reserve rows", () => {
    expect(r.rowCount).toBe(7);
    expect(r.skipped.map((s) => s.reason)).toEqual([
      "Currency GBP (only US shops, in USD, are supported)",
      "Reserve row (money movement, not income)",
    ]);
  });

  it("books an order at its created date, after the seller's discount, with each fee from its column", () => {
    expect(orders[0]).toMatchObject({
      orderId: "576100000000000001",
      date: "2026-03-14",
      itemCents: 3200,
      shippingChargedCents: 0,
      shippingLabelCents: 550,
      salesTaxCents: 256,
      netCents: 1818,
    });
    expect(orders[0]?.fees).toEqual([
      { kind: "commission", amountCents: 192, sourceColumn: "Referral fee" },
      { kind: "advertising", amountCents: 640, sourceColumn: "Affiliate commission" },
    ]);
    expect(orders[1]).toMatchObject({
      quantity: 2,
      shippingChargedCents: 499,
      shippingLabelCents: 499,
      netCents: 2350,
    });
    expectReconciles(r.sales);
  });

  it("splits a refunded order into the sale and a refund dated when it settled", () => {
    expect(orders[2]).toMatchObject({
      itemCents: 3000,
      date: "2026-03-16",
      shippingLabelCents: 500,
    });
    expect(orders[2]?.fees).toEqual([
      { kind: "commission", amountCents: 36, sourceColumn: "Refund administration fee" },
    ]);
    expect(r.sales.find((s) => s.kind === "refund")).toMatchObject({
      orderId: "576100000000000003",
      date: "2026-04-02",
      refundCents: 3000,
    });
    expect(r.warnings.join(" ")).toMatch(/1 refunds are dated on their statement date/);
  });

  it("books adjustments as charges and credits, and says what a credit does to line 10", () => {
    expect(r.charges.map((c) => [c.kind, c.amountCents, c.date])).toEqual([
      ["shipping_label", -325, "2026-04-02"],
      ["other", 200, "2026-04-02"],
    ]);
    expect(r.warnings.join(" ")).toMatch(/1 credits .*\$3\.25.*line 10/);
    expect(r.warnings.join(" ")).not.toMatch(/do not add up/);
  });

  it("reads a file whose costs are positive numbers the same way", () => {
    const csv = [
      "Type,Order/adjustment ID,Order created date,Total settlement amount,Net sales,Shipping,Fees,Referral fee,Affiliate commission",
      "Order,a1,03/14/2026,18.18,32.00,5.50,8.32,1.92,6.40",
    ].join("\n");
    const p = parseTiktokShopStatement(csv);
    expect(p.sales[0]).toMatchObject({ itemCents: 3200, shippingLabelCents: 550, netCents: 1818 });
    expect(p.sales[0]?.fees.map((f) => [f.kind, f.amountCents])).toEqual([
      ["commission", 192],
      ["advertising", 640],
    ]);
    expectReconciles(p.sales);
  });

  it("keeps what the itemised columns leave of the Fees subtotal, and warns when a row does not add up", () => {
    const csv = [
      "Type,Order/adjustment ID,Order created date,Total settlement amount,Net sales,Fees,Referral fee",
      "Order,a1,2026-03-14,17.00,20.00,-3.00,-1.20",
      "Order,a2,2026-03-14,9.00,10.00,-0.60,-0.60",
    ].join("\n");
    const p = parseTiktokShopStatement(csv);
    expect(p.sales[0]?.fees).toEqual([
      { kind: "commission", amountCents: 120, sourceColumn: "Referral fee" },
      { kind: "other", amountCents: 180, sourceColumn: "Fees (not itemised)" },
    ]);
    expect(p.warnings[0]).toMatch(/^1 rows \(line 3\) do not add up/);
  });

  it("refuses a file without the settlement columns, naming them", () => {
    expect(() => parseTiktokShopStatement("Order ID,Price\n1,5.00")).toThrow(ImportFormatError);
  });
});

describe("Square Transactions CSV", () => {
  const r = parseSquareTransactions(fixture("square-transactions.csv"));
  const orders = r.sales.filter((s) => s.kind === "order");
  const refunds = r.sales.filter((s) => s.kind === "refund");

  it("imports payments and refunds and skips a failed payment", () => {
    expect(r.platform).toBe("square");
    expect(r.rowCount).toBe(7);
    expect(r.skipped.map((s) => s.reason)).toEqual(['Transaction status "Failed": no money moved']);
    expect(orders).toHaveLength(3);
    expect(refunds).toHaveLength(2);
  });

  it("books a card sale after its discount, with the tax kept out of income and the fee from its column", () => {
    expect(orders[0]).toMatchObject({
      externalId: "TXN001:PAY001:payment",
      orderId: "TXN001",
      date: "2026-03-14",
      title: "Vintage denim jacket",
      itemCents: 3500,
      salesTaxCents: 210,
      netCents: null,
    });
    expect(orders[0]?.fees).toEqual([
      { kind: "payment_processing", amountCents: 97, sourceColumn: "Fees" },
    ]);
  });

  it("books cash with no fee and counts a tip as income", () => {
    expect(orders[1]).toMatchObject({ itemCents: 1200, fees: [] });
    expect(orders[2]).toMatchObject({ itemCents: 6300 });
    expect(r.warnings.join(" ")).toMatch(/1 payments include tips \(\$3\.00/);
  });

  it("leaves gift card sales out of income, keeping the fee as a charge", () => {
    expect(orders.map((o) => o.title)).not.toContain("eGift Card");
    expect(r.charges).toEqual([
      {
        externalId: "TXN004:PAY004:payment:fee",
        date: "2026-03-16",
        kind: "payment_processing",
        amountCents: 66,
        orderId: "TXN004",
        description: "Square fee on eGift Card",
      },
    ]);
    expect(r.warnings.join(" ")).toMatch(/\$25\.00 of gift card sales left out/);
  });

  it("books refunds from their own rows, net of tax, with a fee given back as a credit", () => {
    expect(refunds[0]).toMatchObject({ orderId: "TXN003", date: "2026-03-18", refundCents: 1000 });
    expect(refunds[1]).toMatchObject({ orderId: "TXN001", date: "2026-03-20", refundCents: 3500 });
    expect(refunds[1]?.fees).toEqual([
      { kind: "payment_processing", amountCents: -97, sourceColumn: "Fees" },
    ]);
    expect(r.warnings.join(" ")).toMatch(/1 payments show a partial refund \(lines 4\)/);
  });

  it("every payment in the fixture adds up to Net Total", () => {
    expect(r.warnings.join(" ")).not.toMatch(/do not add up/);
  });

  it("re-reading the file gives the same ids, and two equal refunds of one payment stay apart", () => {
    expect(
      parseSquareTransactions(fixture("square-transactions.csv")).sales.map((s) => s.externalId),
    ).toEqual(r.sales.map((s) => s.externalId));
    const csv = [
      "Date,Event Type,Net Sales,Tax,Fees,Net Total,Transaction ID,Payment ID",
      "2026-04-01,Refund,-5.00,0,0,-5.00,T9,P9",
      "2026-04-02,Refund,-5.00,0,0,-5.00,T9,P9",
    ].join("\n");
    const ids = parseSquareTransactions(csv).sales.map((s) => s.externalId);
    expect(new Set(ids).size).toBe(2);
  });

  it("reads a file with costs as positive numbers, and gross less discounts without Net Sales", () => {
    const csv = [
      "Date,Event Type,Gross Sales,Discounts,Tax,Fees,Net Total,Transaction ID",
      "03/14/2026,Payment,20.00,2.00,1.00,0.50,18.50,T1",
      "03/15/2026,Refund,-20.00,-2.00,-1.00,0.50,-18.50,T1",
    ].join("\n");
    const p = parseSquareTransactions(csv);
    expect(p.sales[0]).toMatchObject({ itemCents: 1800, salesTaxCents: 100 });
    expect(p.sales[0]?.fees.map((f) => f.amountCents)).toEqual([50]);
    expect(p.sales[1]).toMatchObject({ kind: "refund", refundCents: 1800, fees: [] });
    expect(p.warnings.join(" ")).toMatch(/fees are not signed/);
  });

  it("names a row that does not add up, and refuses a file without the required columns", () => {
    const csv = [
      "Date,Event Type,Net Sales,Tax,Fees,Net Total",
      "2026-03-14,Payment,$10.00,$0.00,-$0.30,$9.00",
    ].join("\n");
    expect(parseSquareTransactions(csv).warnings.join(" ")).toMatch(
      /1 payments \(lines 2\) do not add up/,
    );
    expect(() => parseSquareTransactions("Date,Amount\n2026-01-01,5")).toThrow(ImportFormatError);
  });
});
