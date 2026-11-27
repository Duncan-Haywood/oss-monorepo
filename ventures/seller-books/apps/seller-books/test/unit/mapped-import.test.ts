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
