import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairCii } from "./repair-cii.mjs";

const ex = (n) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");
const rules = (r) => r.map((e) => e.rule).sort();

test("clean CII documents come back byte for byte", () => {
  for (const n of ["xrechnung-cii-invoice.xml", "xrechnung-cii-credit-note.xml", "cii-invoice.xml"]) {
    const src = ex(n);
    const r = repairCii(src);
    assert.equal(r.repaired, false, n);
    assert.equal(r.xml, src, n);
    assert.deepEqual(r.remaining, [], n);
  }
});

test("the defective credit note's wrong VAT amount is fixed; type code and missing fields stay for a person", () => {
  const src = ex("xrechnung-cii-credit-note-with-defects.xml");
  const r = repairCii(src);
  assert.deepEqual(r.changes.map((c) => [c.path, c.from, c.to]), [["/tax_breakdown/0/tax", "150.00", "190.00"]]);
  assert.ok(r.remaining.length > 0);
  assert.equal(r.xml.length, src.length);
  assert.ok(r.xml.includes("A German domestic") || r.xml.includes("The clean credit note"));
});

test("a wrong line total and wrong gross are recomputed back to the clean file", () => {
  const clean = ex("xrechnung-cii-invoice.xml");
  const src = clean.replace("<ram:LineTotalAmount>960.00", "<ram:LineTotalAmount>900.00").replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00");
  assert.notEqual(src, clean);
  const r = repairCii(src);
  assert.deepEqual(r.changes.map((c) => c.path), ["/lines/0/net", "/totals/gross"]);
  assert.equal(r.xml, clean);
});

test("amount due follows gross minus prepaid", () => {
  const clean = ex("xrechnung-cii-invoice.xml");
  const src = clean.replace("<ram:GrandTotalAmount>1190.00</ram:GrandTotalAmount>", "<ram:GrandTotalAmount>1190.00</ram:GrandTotalAmount><ram:TotalPrepaidAmount>90.00</ram:TotalPrepaidAmount>");
  const r = repairCii(src);
  assert.ok(r.changes.some((c) => c.path === "/totals/due" && c.to === "1100.00"));
});

test("a header allowance leaves tax and totals alone and says so", () => {
  const src = ex("xrechnung-cii-invoice.xml").replace("<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>", "<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>10.00</ram:ActualAmount></ram:SpecifiedTradeAllowanceCharge><ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>");
  const r = repairCii(src);
  assert.ok(r.skipped.some((s) => /header allowances/.test(s)));
  assert.equal(r.repaired, false);
});

test("a header tax block that no line matches is reported, tax is not invented", () => {
  const src = ex("xrechnung-cii-invoice.xml").replace("<ram:RateApplicablePercent>19</ram:RateApplicablePercent>\n      </ram:ApplicableTradeTax>\n      <ram:SpecifiedTradePaymentTerms>", "<ram:RateApplicablePercent>7</ram:RateApplicablePercent>\n      </ram:ApplicableTradeTax>\n      <ram:SpecifiedTradePaymentTerms>");
  const r = repairCii(src);
  assert.ok(r.skipped.some((s) => /Tax was not recomputed/.test(s)));
  assert.ok(!r.changes.some((c) => c.path.startsWith("/totals/gross")));
});

test("a line without a quantity stops everything", () => {
  const src = ex("xrechnung-cii-invoice.xml").replace(/<ram:BilledQuantity[^>]*>8<\/ram:BilledQuantity>/, "");
  const r = repairCii(src);
  assert.equal(r.repaired, false);
  assert.ok(r.skipped.some((s) => /no quantity/.test(s)));
});
