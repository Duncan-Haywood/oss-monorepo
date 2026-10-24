import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairUbl } from "./repair-ubl.mjs";

const ex = (n) => readFileSync(new URL(`./examples/${n}`, import.meta.url), "utf8");
const rules = (r) => r.map((e) => e.rule).sort();

test("a clean UBL invoice comes back byte for byte", () => {
  const src = ex("ubl-invoice.xml");
  const r = repairUbl(src);
  assert.equal(r.repaired, false);
  assert.equal(r.xml, src);
  assert.deepEqual(r.remaining, []);
});

test("wrong VAT, document tax and gross are recomputed; identity-type findings stay", () => {
  const r = repairUbl(ex("ubl-invoice-with-defects.xml"));
  assert.deepEqual(r.changes.map((c) => [c.path, c.from, c.to]), [
    ["/tax_breakdown/0/tax", "36.10", "38.00"],
    ["/totals/tax", "46.60", "48.50"],
    ["/totals/gross", "380.00", "398.50"],
  ]);
  // The due date and missing IBAN are for a person.
  assert.deepEqual(rules(r.remaining), ["INV-021", "INV-045"]);
  // Everything outside the edited amounts is untouched, comment included.
  assert.ok(r.xml.includes("INV-029  ...and the amount due"));
  assert.equal(r.xml.length, ex("ubl-invoice-with-defects.xml").length + 0);
});

test("a credit note's wrong totals are fixed and the original reference is left to a person", () => {
  const r = repairUbl(ex("ubl-credit-note-with-defects.xml"));
  assert.ok(r.changes.length > 0);
  assert.deepEqual(rules(r.remaining), ["INV-034"]);
});

test("a wrong line net is recomputed from quantity and price", () => {
  const src = ex("ubl-invoice.xml").replace(/(<cbc:LineExtensionAmount currencyID="EUR">)200\.00/, "$1250.00");
  assert.notEqual(src, ex("ubl-invoice.xml"));
  const r = repairUbl(src);
  assert.equal(r.changes[0].path, "/lines/0/net");
  assert.equal(r.changes[0].from, "250.00");
  assert.deepEqual(r.remaining, []);
  assert.equal(r.xml, ex("ubl-invoice.xml"));
});

test("a tax group with no subtotal is reported and tax is not invented", () => {
  const src = ex("ubl-invoice.xml").replace(/<cac:TaxSubtotal>[\s\S]*?<\/cac:TaxSubtotal>\s*(?=<cac:TaxSubtotal>)/, "");
  const r = repairUbl(src);
  assert.ok(r.skipped.some((s) => /Tax was not recomputed/.test(s)));
  assert.ok(!r.changes.some((c) => c.path.startsWith("/totals/gross")));
});

test("a document with a header allowance is not touched", () => {
  const src = ex("ubl-invoice.xml").replace("<cac:TaxTotal>", '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="EUR">10.00</cbc:Amount></cac:AllowanceCharge><cac:TaxTotal>');
  const r = repairUbl(src);
  assert.equal(r.repaired, false);
  assert.ok(r.skipped.some((s) => /header allowances/.test(s)));
});

test("DTDs are refused", () => {
  assert.throws(() => repairUbl('<!DOCTYPE x [<!ENTITY a "b">]><Invoice/>'));
});
