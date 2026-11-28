// The column-mapped CSV import (src/shared/column-mapping.ts, importers/mapped.ts). The file below is
// written for the test, not a platform's export: the point of this importer is that no layout is assumed.
import { type ColumnMapping, mappingProblems, suggestMapping } from "@shared/column-mapping";
import { ImportFormatError } from "@worker/services/importers";
import { headerRow, parseMappedCsv } from "@worker/services/importers/mapped";
import { describe, expect, it } from "vitest";

const FILE = [
  "My sales,,,,,,,",
  "Sold On,Order #,Listing,Sale Price,Shipping Paid,Tax,Commission,Processing,Payout",
  "2026-03-02,G-1001,Vintage denim jacket,120.00,12.00,9.60,-10.80,-3.40,117.80",
  "03/05/2026,G-1002,Wool overcoat,$250.00,0,0,(22.50),(7.30),220.20",
  "2026-03-09,G-1002,Wool overcoat second unit,80.00,0,0,7.20,2.40,70.40",
  "2026-03-20,G-1001,Vintage denim jacket returned,-120.00,-12.00,0,10.80,0,-121.20",
  "not a date,G-1003,Shirt,40.00,0,0,0,0,40.00",
  "",
].join("\n");

const MAPPING: ColumnMapping = {
  date: "Sold On",
  orderId: "Order #",
  title: "Listing",
  itemPrice: "Sale Price",
  shipping: "Shipping Paid",
  salesTax: "Tax",
  net: "Payout",
  fees: [
    { column: "Commission", kind: "commission" },
    { column: "Processing", kind: "payment_processing" },
  ],
};

describe("column-mapped import", () => {
  it("reads sales under a title line, with fees as charges whatever their sign", () => {
    const r = parseMappedCsv(FILE, "grailed", MAPPING);
    expect(r.platform).toBe("grailed");
    expect(r.reportKind).toBe("mapped_csv");
    const [a, b, c, refund] = r.sales;
    expect(a).toMatchObject({
      kind: "order",
      externalId: "G-1001",
      date: "2026-03-02",
      itemCents: 12000,
      shippingChargedCents: 1200,
      salesTaxCents: 960,
      netCents: 11780,
    });
    expect(a?.fees).toEqual([
      { kind: "commission", amountCents: 1080, sourceColumn: "Commission" },
      { kind: "payment_processing", amountCents: 340, sourceColumn: "Processing" },
    ]);
    expect(b).toMatchObject({ date: "2026-03-05", itemCents: 25000, externalId: "G-1002" });
    expect(b?.fees.map((f) => f.amountCents)).toEqual([2250, 730]);
    // The same order number again in one file is a second sale, keyed so a re-import matches it.
    expect(c?.externalId).toBe("G-1002:2");
    // A negative price is a refund: item and shipping back, fees credited (negative).
    expect(refund).toMatchObject({
      kind: "refund",
      refundCents: 13200,
      itemCents: 0,
      externalId: "G-1001:2",
    });
    expect(refund?.fees).toEqual([
      { kind: "commission", amountCents: -1080, sourceColumn: "Commission" },
    ]);
    expect(r.skipped).toEqual([{ line: 7, reason: 'Unreadable date "not a date"' }]);
  });

  it("is stable: the same file twice gives the same external ids", () => {
    const ids = (t: string) => parseMappedCsv(t, "stockx", MAPPING).sales.map((s) => s.externalId);
    expect(ids(FILE)).toEqual(ids(FILE));
  });

  it("refuses a mapping that names a column the file lacks, or one column twice", () => {
    expect(() => parseMappedCsv(FILE, "vinted", { ...MAPPING, net: "Total payout" })).toThrow(
      ImportFormatError,
    );
    const problems = mappingProblems(
      { date: "Sold On", itemPrice: "Sale Price", net: "Sale Price" },
      headerRow(FILE),
    );
    expect(problems.join(" ")).toMatch(/chosen for both/);
    expect(mappingProblems({ date: "", itemPrice: "Sale Price" }, headerRow(FILE))[0]).toMatch(
      /Choose the column for Sale date/,
    );
  });

  it("warns when there is no net column, and adds a refund column's refund beside the sale", () => {
    const text = "Date,Price,Refunded\n2026-04-01,50.00,50.00\n";
    const r = parseMappedCsv(text, "other", {
      date: "Date",
      itemPrice: "Price",
      refund: "Refunded",
    });
    expect(r.sales.map((s) => [s.kind, s.itemCents, s.refundCents])).toEqual([
      ["order", 5000, 0],
      ["refund", 0, 5000],
    ]);
    expect(r.warnings.join(" ")).toMatch(/No net payout column/);
  });

  it("finds the header row below a preamble", () => {
    expect(headerRow(FILE, MAPPING)[0]).toBe("Sold On");
  });

  it("suggests a mapping from header names, fees as fees, each column once", () => {
    const s = suggestMapping(headerRow(FILE));
    expect(s.fields).toMatchObject({
      date: "Sold On",
      orderId: "Order #",
      title: "Listing",
      itemPrice: "Sale Price",
      shipping: "Shipping Paid",
      salesTax: "Tax",
      net: "Payout",
    });
    // "Processing" names no fee, so it is left for the seller to choose rather than guessed.
    expect(s.fees).toEqual([{ column: "Commission", kind: "commission" }]);
    expect(Object.values(s.fields)).not.toContain("Processing");
    expect(suggestMapping(["Date", "Price", "Payment processing fee", "Boost fee"]).fees).toEqual([
      { column: "Payment processing fee", kind: "payment_processing" },
      { column: "Boost fee", kind: "advertising" },
    ]);
  });
});

// Reverb's orders export: its help article lists the fields (Order ID, Order Total, Shipping Cost, Order
// Status, Selling Fee, Reverb Payments Fee, Bump Fee, Shipping Label Fee, Total Fees, Order Payout, Refund
// Status...) but not their exact header text, so these headers are written from that list for the test.
// It is not a Reverb export: the seller confirms every column.
const REVERB_LIKE = [
  "Order ID,Order Date,Title,SKU,Quantity,Order Status,Shipping Provider,Shipping Cost,Tax Amount,Tax Responsible Party,Order Total,Selling Fee,Reverb Payments Fee,Bump Fee,Shipping Label Fee,Total Fees,Order Payout,Refund Status",
  "R-1,2026-05-02,Fender Telecaster,TELE-1,1,Shipped,UPS,40.00,60.00,Reverb,1100.00,52.00,35.00,10.00,38.00,135.00,965.00,",
  "R-2,2026-05-04,Boss DS-1,DS1,1,Cancelled,,8.00,4.00,Reverb,62.00,0,0,0,0,0,0,",
  "R-3,2026-05-06,Pedal case,CASE,1,Delivered,USPS,5.00,0,,25.00,1.25,1.00,0,6.00,8.25,16.75,Refunded",
  "",
].join("\n");

describe("an order-total export like Reverb's", () => {
  it("suggests the parts, never a total-fees column beside them, and no status column as money", () => {
    const s = suggestMapping(headerRow(REVERB_LIKE));
    expect(s.fields).toMatchObject({
      orderId: "Order ID",
      date: "Order Date",
      status: "Order Status",
      shipping: "Shipping Cost",
      salesTax: "Tax Amount",
      shippingLabel: "Shipping Label Fee",
      net: "Order Payout",
      itemPrice: "Order Total",
    });
    expect(s.fields.refund).toBeUndefined();
    expect(Object.values(s.fields)).not.toContain("Shipping Provider");
    expect(Object.values(s.fields)).not.toContain("Tax Responsible Party");
    expect(s.fees).toEqual([
      { column: "Selling Fee", kind: "commission" },
      { column: "Reverb Payments Fee", kind: "payment_processing" },
      { column: "Bump Fee", kind: "advertising" },
    ]);
    expect(s.priceIncludes).toEqual(["shipping", "salesTax"]);
    // A total is still offered when it is the file's only fee column.
    expect(suggestMapping(["Date", "Price", "Total Fees"]).fees).toEqual([
      { column: "Total Fees", kind: "marketplace_fee" },
    ]);
  });

  it("takes shipping and tax out of the total, and leaves cancelled orders out", () => {
    const s = suggestMapping(headerRow(REVERB_LIKE));
    const mapping: ColumnMapping = {
      ...s.fields,
      date: s.fields.date ?? "",
      itemPrice: s.fields.itemPrice ?? "",
      fees: s.fees,
      priceIncludes: s.priceIncludes,
    };
    const r = parseMappedCsv(REVERB_LIKE, "reverb", mapping);
    expect(r.platform).toBe("reverb");
    expect(
      r.sales.map((x) => [x.externalId, x.itemCents, x.shippingChargedCents, x.salesTaxCents]),
    ).toEqual([
      ["R-1", 100000, 4000, 6000],
      ["R-3", 2000, 500, 0],
    ]);
    expect(r.sales[0]?.fees.map((f) => f.amountCents)).toEqual([5200, 3500, 1000]);
    expect(r.sales[0]).toMatchObject({ shippingLabelCents: 3800, netCents: 96500 });
    expect(r.skipped).toEqual([{ line: 3, reason: 'Order status "Cancelled": not a sale' }]);
  });

  it("without the ticks the total is the price, and a tick needs its column", () => {
    const base: ColumnMapping = { date: "Order Date", itemPrice: "Order Total" };
    expect(parseMappedCsv(REVERB_LIKE, "reverb", base).sales[0]?.itemCents).toBe(110000);
    expect(
      mappingProblems({ ...base, priceIncludes: ["shipping"] }, headerRow(REVERB_LIKE)),
    ).toEqual(["The price includes shipping the buyer paid: choose that column too."]);
  });

  it("refunds a negative total without its tax, and skips a total smaller than its parts", () => {
    const text = [
      "Date,Total,Shipping,Tax",
      "2026-06-01,-141.60,12.00,9.60",
      "2026-06-02,10.00,12.00,0",
      "",
    ].join("\n");
    const r = parseMappedCsv(text, "other", {
      date: "Date",
      itemPrice: "Total",
      shipping: "Shipping",
      salesTax: "Tax",
      priceIncludes: ["shipping", "salesTax"],
    });
    expect(r.sales.map((x) => [x.kind, x.refundCents])).toEqual([["refund", 13200]]);
    expect(r.skipped[0]?.reason).toMatch(/more than the total/);
  });
});
