// Quality reaudit 2026-11-28: from 10^13 currency units (realistic only in IDR,
// VND and similar), rounding at 15 significant digits cut a real cent, so the
// UBL repair rewrote the gross of a correct invoice from ...196.29 to ...196.30,
// which CEN's EN 16931 Schematron 1.3.17 then rejects (BR-CO-15). Expected
// values are exact decimal arithmetic (Python decimal, ROUND_HALF_UP).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { roundHalfUpToCents } from "./checks.mjs";
import { repairUbl } from "./repair-ubl.mjs";
import { inspectTaxBreakdown } from "./breakdown.mjs";

const base = readFileSync(new URL("./examples/ubl-invoice.xml", import.meta.url), "utf8");

// One S 11% line of net 9,876,543,210,987.65 IDR: tax 1,086,419,753,208.6415 ->
// 1,086,419,753,208.64; gross 10,962,962,964,196.29.
function idrInvoice() {
  // Strip comments to a fixed point so no "<!--" survives a nested or split one.
  let bare = base, prev;
  do { prev = bare; bare = bare.replace(/<!--[\s\S]*?-->/g, ""); } while (bare !== prev);
  const [head] = bare.split("<cac:TaxTotal>");
  const c = "IDR";
  const net = "9876543210987.65", tax = "1086419753208.64", gross = "10962962964196.29";
  return head.replaceAll("EUR", c) + `<cac:TaxTotal><cbc:TaxAmount currencyID="${c}">${tax}</cbc:TaxAmount>
<cac:TaxSubtotal><cbc:TaxableAmount currencyID="${c}">${net}</cbc:TaxableAmount><cbc:TaxAmount currencyID="${c}">${tax}</cbc:TaxAmount>
<cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>11</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal></cac:TaxTotal>
<cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="${c}">${net}</cbc:LineExtensionAmount><cbc:TaxExclusiveAmount currencyID="${c}">${net}</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount currencyID="${c}">${gross}</cbc:TaxInclusiveAmount><cbc:PayableAmount currencyID="${c}">${gross}</cbc:PayableAmount></cac:LegalMonetaryTotal>
<cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="${c}">${net}</cbc:LineExtensionAmount>
<cac:Item><cbc:Name>Goods</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>11</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
<cac:Price><cbc:PriceAmount currencyID="${c}">${net}</cbc:PriceAmount></cac:Price></cac:InvoiceLine></Invoice>`;
}

test("cents survive rounding at 10^13 units; half-cent ties still round up", () => {
  assert.equal(roundHalfUpToCents(9876543210987.65 + 1086419753208.64), 10962962964196.29);
  assert.equal(roundHalfUpToCents(-10962962964196.29), -10962962964196.29);
  assert.equal(roundHalfUpToCents(1.5 * 19 / 100), 0.29);
  assert.equal(roundHalfUpToCents(1.005), 1.01);
  assert.equal(roundHalfUpToCents(1234567.125), 1234567.13);
});

test("the UBL repair leaves a correct 10^13 IDR invoice unchanged", () => {
  const src = idrInvoice();
  const r = repairUbl(src);
  assert.deepEqual(r.changes, []);
  assert.equal(r.xml, src);
});

test("a blocking INV-038 fix gives the tax with two decimals, as the CLI does", () => {
  const findings = inspectTaxBreakdown({
    lines: [{ net: 200, tax_percent: 19 }],
    tax_breakdown: [{ taxable: 200, tax_percent: 19, tax: 39.5 }],
  });
  const blocking = findings.find((f) => f.rule === "INV-038" && !f.severity);
  assert.ok(blocking, JSON.stringify(findings));
  assert.match(blocking.fix, /^Set tax to 38\.00 or /);
});
