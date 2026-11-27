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

// Header allowances and charges (BG-20/BG-21), recomputed since 2026-11-14 (eval/cii-header-allowances.mjs).
const allowance = (amt, cat = "S", rate = "19", ind = "false") => `<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>${ind}</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>${amt}</ram:ActualAmount><ram:Reason>Rabatt</ram:Reason><ram:CategoryTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${cat}</ram:CategoryCode>${rate === null ? "" : `<ram:RateApplicablePercent>${rate}</ram:RateApplicablePercent>`}</ram:CategoryTradeTax></ram:SpecifiedTradeAllowanceCharge>`;
// The clean invoice with a 100.00 allowance at S 19%, all its totals right.
const withAllowance = () => ex("xrechnung-cii-invoice.xml")
  .replace("<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>190.00", allowance("100.00") + "<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>171.00")
  .replace("<ram:BasisAmount>1000.00</ram:BasisAmount>\n        <ram:CategoryCode>S", "<ram:BasisAmount>900.00</ram:BasisAmount>\n        <ram:CategoryCode>S")
  .replace("<ram:AllowanceTotalAmount>0.00", "<ram:AllowanceTotalAmount>100.00")
  .replace("<ram:TaxBasisTotalAmount>1000.00", "<ram:TaxBasisTotalAmount>900.00")
  .replace('<ram:TaxTotalAmount currencyID="EUR">190.00', '<ram:TaxTotalAmount currencyID="EUR">171.00')
  .replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1071.00")
  .replace("<ram:DuePayableAmount>1190.00", "<ram:DuePayableAmount>1071.00");

test("a correct invoice with a header allowance comes back byte for byte", () => {
  const src = withAllowance();
  const r = repairCii(src);
  assert.deepEqual(r.remaining, []);
  assert.equal(r.repaired, false);
  assert.equal(r.xml, src);
});

test("a header allowance is taken off its tax group, and every total follows", () => {
  const clean = withAllowance();
  // The seller forgot the allowance everywhere but the allowance itself.
  const src = clean.replace("<ram:BasisAmount>900.00", "<ram:BasisAmount>1000.00").replace("<ram:CalculatedAmount>171.00", "<ram:CalculatedAmount>190.00")
    .replace("<ram:AllowanceTotalAmount>100.00", "<ram:AllowanceTotalAmount>0.00").replace("<ram:TaxBasisTotalAmount>900.00", "<ram:TaxBasisTotalAmount>1000.00")
    .replace('currencyID="EUR">171.00', 'currencyID="EUR">190.00').replace("<ram:GrandTotalAmount>1071.00", "<ram:GrandTotalAmount>1190.00").replace("<ram:DuePayableAmount>1071.00", "<ram:DuePayableAmount>1190.00");
  const r = repairCii(src);
  assert.deepEqual(r.changes.map((c) => c.path), ["/tax_breakdown/0/taxable", "/tax_breakdown/0/tax", "/totals/allowances", "/totals/net", "/totals/tax", "/totals/gross", "/totals/due"]);
  assert.equal(r.xml, clean);
  assert.deepEqual(r.remaining, []);
});

test("a header charge is added; one in a category no line has needs its own tax block", () => {
  const charge = allowance("50.00", "S", "19", "true");
  const src = ex("xrechnung-cii-invoice.xml").replace("<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>", charge + "<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>");
  const r = repairCii(src);
  assert.ok(r.changes.some((c) => c.path === "/totals/charges" && c.to === "50.00"));
  assert.ok(r.changes.some((c) => c.path === "/tax_breakdown/0/taxable" && c.to === "1050.00"));
  assert.ok(r.changes.some((c) => c.path === "/totals/gross" && c.to === "1249.50"));
  // At 7%, no line and no header block: the tax is not invented.
  const r7 = repairCii(ex("xrechnung-cii-invoice.xml").replace("<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>", allowance("50.00", "S", "7", "true") + "<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>"));
  assert.ok(r7.skipped.some((s) => /Tax was not recomputed/.test(s)));
  assert.ok(!r7.changes.some((c) => c.path === "/totals/gross"));
});

test("a header allowance with no readable amount or category stops the tax part", () => {
  const src = ex("xrechnung-cii-invoice.xml").replace("<ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>", "<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>10.00</ram:ActualAmount></ram:SpecifiedTradeAllowanceCharge><ram:ApplicableTradeTax>\n        <ram:CalculatedAmount>");
  const r = repairCii(src);
  assert.ok(r.skipped.some((s) => /header allowance or charge has no readable/.test(s)));
  assert.equal(r.repaired, false);
});

test("BT-111 in another currency is left as written; BT-110 is found by its currency", () => {
  const clean = ex("xrechnung-cii-invoice.xml").replace("<ram:InvoiceCurrencyCode>EUR", "<ram:TaxCurrencyCode>GBP</ram:TaxCurrencyCode><ram:InvoiceCurrencyCode>EUR")
    .replace('<ram:TaxTotalAmount currencyID="EUR">190.00</ram:TaxTotalAmount>', '<ram:TaxTotalAmount currencyID="GBP">163.40</ram:TaxTotalAmount><ram:TaxTotalAmount currencyID="EUR">190.00</ram:TaxTotalAmount>');
  assert.equal(repairCii(clean).repaired, false);
  const src = clean.replace('currencyID="EUR">190.00', 'currencyID="EUR">197.00');
  const r = repairCii(src);
  assert.deepEqual(r.changes.map((c) => [c.path, c.to]), [["/totals/tax", "190.00"]]);
  assert.ok(r.xml.includes('currencyID="GBP">163.40'));
  assert.ok(r.skipped.some((s) => /BT-111, GBP/.test(s)));
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

// Found on real, valid files (eval/repair-real-files.mjs, 2026-11-14): the repair had
// rewritten amounts the official EN 16931 rules accept, moving the amount due.
test("a line net the stated totals agree with is kept, even when quantity x price differs", () => {
  // KoSIT's gross-price insurance samples: net price 67.2244, line net 80.00, totals on 80.00.
  const clean = ex("xrechnung-cii-invoice.xml");
  const src = clean.replace("<ram:ChargeAmount>120.00</ram:ChargeAmount>", "<ram:ChargeAmount>100.8403</ram:ChargeAmount>");
  assert.notEqual(src, clean);
  const r = repairCii(src);
  assert.equal(r.repaired, false);
  assert.equal(r.xml, src);
  assert.ok(r.skipped.some((s) => /Line 1's net \(960\.00\) is not quantity times price \(806\.72\).*BT-106.*kept/.test(s)), r.skipped.join("\n"));
  assert.ok(rules(r.remaining).includes("INV-012"), "the check still reports the line for a person");
});

test("a tax a cent off from per-line rounding is kept (EN 16931 accepts it)", () => {
  const clean = ex("xrechnung-cii-invoice.xml");
  const src = clean.replace("<ram:CalculatedAmount>190.00", "<ram:CalculatedAmount>190.01").replace(">190.00</ram:TaxTotalAmount>", ">190.01</ram:TaxTotalAmount>")
    .replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1190.01").replace("<ram:DuePayableAmount>1190.00", "<ram:DuePayableAmount>1190.01");
  const r = repairCii(src);
  assert.equal(r.repaired, false, JSON.stringify(r.changes));
  assert.ok(r.skipped.some((s) => /0\.01 off basis x rate \(190\.00\); within a cent per line/.test(s)));
  // Further off than a cent per line (2 lines here) is still rewritten.
  const far = src.replace("<ram:CalculatedAmount>190.01", "<ram:CalculatedAmount>190.03");
  assert.deepEqual(repairCii(far).changes.find((c) => c.path === "/tax_breakdown/0/tax")?.to, "190.00");
});

test("Hungarian VAT in whole forints is kept", () => {
  const src = ex("xrechnung-cii-invoice.xml").replaceAll("EUR", "HUF")
    .replace("<ram:ChargeAmount>120.00</ram:ChargeAmount>", "<ram:ChargeAmount>120.05</ram:ChargeAmount>")
    .replace("<ram:LineTotalAmount>960.00", "<ram:LineTotalAmount>960.40")
    .replace("<ram:BasisAmount>1000.00", "<ram:BasisAmount>1000.40").replace("<ram:CalculatedAmount>190.00", "<ram:CalculatedAmount>190")
    .replace("<ram:LineTotalAmount>1000.00", "<ram:LineTotalAmount>1000.40").replace("<ram:TaxBasisTotalAmount>1000.00", "<ram:TaxBasisTotalAmount>1000.40")
    .replace(">190.00</ram:TaxTotalAmount>", ">190</ram:TaxTotalAmount>")
    .replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1190.40").replace("<ram:DuePayableAmount>1190.00", "<ram:DuePayableAmount>1190.40");
  const r = repairCii(src);
  assert.deepEqual(r.changes, []);
  assert.ok(r.skipped.some((s) => /whole forint/.test(s)), r.skipped.join("\n"));
});

test("ZUGFeRD EXTENDED sub-invoice lines are not summed", () => {
  const clean = ex("xrechnung-cii-invoice.xml");
  const src = clean.replace("<ram:LineID>2</ram:LineID>", "<ram:LineID>2</ram:LineID><ram:ParentLineID>1</ram:ParentLineID><ram:LineStatusReasonCode>DETAIL</ram:LineStatusReasonCode>")
    .replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00");
  assert.notEqual(src, clean.replace("<ram:GrandTotalAmount>1190.00", "<ram:GrandTotalAmount>1100.00"));
  const r = repairCii(src);
  assert.equal(r.repaired, false);
  assert.ok(r.skipped.some((s) => /sub-invoice lines/.test(s)));
});

// Red-team guards, 2026-11-26 (prompts/runs/2026-11-26-session_01XpHqycsd3j9RMogFgfVGdC.json).
test("a standard-rated (S) group with no rate is not read as 0%, so tax is not recomputed", () => {
  // Only E, Z and O may omit the rate; S with the rate missing on every line and the header
  // must stop the tax part instead of being recomputed as tax-free.
  const src = ex("xrechnung-cii-invoice.xml").replaceAll("<ram:RateApplicablePercent>19</ram:RateApplicablePercent>", "")
    .replace('<ram:TaxTotalAmount currencyID="EUR">190.00', '<ram:TaxTotalAmount currencyID="EUR">197.00');
  const r = repairCii(src);
  assert.ok(r.skipped.some((s) => /Tax was not recomputed/.test(s)));
  assert.ok(!r.changes.some((c) => c.path === "/totals/tax"));
});

test("a missing AllowanceTotalAmount with an allowance present is reported, not passed over", () => {
  const src = withAllowance().replace("<ram:AllowanceTotalAmount>100.00</ram:AllowanceTotalAmount>", "");
  const r = repairCii(src);
  assert.ok(r.skipped.some((s) => /AllowanceTotalAmount is missing; it should be 100\.00/.test(s)));
});

test("BT-111 in the same currency as BT-110 is repaired with it", () => {
  const clean = ex("xrechnung-cii-invoice.xml").replace('<ram:TaxTotalAmount currencyID="EUR">190.00</ram:TaxTotalAmount>', '<ram:TaxTotalAmount currencyID="EUR">190.00</ram:TaxTotalAmount><ram:TaxTotalAmount currencyID="EUR">190.00</ram:TaxTotalAmount>');
  const src = clean.replaceAll('currencyID="EUR">190.00', 'currencyID="EUR">197.00');
  const r = repairCii(src);
  assert.deepEqual(r.changes.map((c) => [c.path, c.to]), [["/totals/tax", "190.00"], ["/totals/tax_accounting_currency", "190.00"]]);
  assert.equal(r.xml, clean);
});

test("a quantity or price that is not a plain number (a decimal comma) is reported, never a crash", () => {
  const clean = ex("xrechnung-cii-invoice.xml");
  for (const src of [clean.replace(/(<ram:BilledQuantity[^>]*>)8/, "$11,5"), clean.replace("<ram:ChargeAmount>120.00", "<ram:ChargeAmount>120,00")]) {
    const r = repairCii(src);
    assert.equal(r.repaired, false);
    assert.equal(r.xml, src);
    assert.ok(r.skipped.some((s) => /not a plain number/.test(s)), r.skipped.join(" | "));
  }
});

test("a kept line total that is not a number stops the recompute instead of writing NaN", () => {
  // Line 1 gets its own allowance, so its total is kept as written: "960,00" cannot be summed.
  const src = ex("xrechnung-cii-invoice.xml").replace("<ram:LineTotalAmount>960.00", "<ram:LineTotalAmount>960,00")
    .replace("<ram:SpecifiedTradeSettlementLineMonetarySummation>", "<ram:SpecifiedTradeAllowanceCharge><ram:ChargeIndicator><udt:Indicator>false</udt:Indicator></ram:ChargeIndicator><ram:ActualAmount>0.00</ram:ActualAmount></ram:SpecifiedTradeAllowanceCharge><ram:SpecifiedTradeSettlementLineMonetarySummation>");
  assert.ok(src.includes("960,00") && src.includes("ActualAmount>0.00"));
  const r = repairCii(src);
  assert.ok(!r.xml.includes("NaN"));
  assert.equal(r.repaired, false);
});
