import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { repairUbl, fmt } from "./repair-ubl.mjs";

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

test("a header allowance with no tax category stops the repair", () => {
  const src = ex("ubl-invoice.xml").replace("<cac:TaxTotal>", '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="EUR">10.00</cbc:Amount></cac:AllowanceCharge><cac:TaxTotal>');
  const r = repairUbl(src);
  assert.equal(r.repaired, false);
  assert.ok(r.skipped.some((s) => /document-level allowance or charge has no readable/.test(s)));
});

test("DTDs are refused", () => {
  assert.throws(() => repairUbl('<!DOCTYPE x [<!ENTITY a "b">]><Invoice/>'));
});

test("repair amounts round half up on a half cent that binary floats store just under", () => {
  assert.equal(fmt(1.005), "1.01");
  assert.equal(fmt(0.285), "0.29");
  assert.equal(fmt(10.075), "10.08");
  assert.equal(fmt(-1.005), "-1.01");
  assert.equal(fmt(2), "2.00");
});

// --- 2026-11-12: line-level TaxTotal (ZATCA), document allowances and charges, line
// allowances. Before, every one of ZATCA's 19 good cases was declined (a line's own
// TaxTotal counted as a second document TaxTotal, or a header allowance stopped the
// tax part); eval/repair-seeded.mjs measures it on the publisher files.
const pre = () => ex("zatca-prepayment-rate-change.xml");
const simple = () => ex("zatca-simplified-invoice.xml");

test("ZATCA files reach the tax recompute and a clean one comes back byte for byte", () => {
  for (const src of [pre(), simple()]) {
    const r = repairUbl(src);
    assert.equal(r.xml, src);
    assert.ok(!r.skipped.some((s) => /not recomputed/.test(s)), r.skipped.join(" | "));
  }
});

test("a wrong document tax on a ZATCA file is fixed in BT-110 and in its SAR repeat (BT-111)", () => {
  const src = simple().replace(/(<cac:TaxTotal>\s*<cbc:TaxAmount currencyID="SAR">)15\.00/, "$122.00");
  assert.notEqual(src, simple());
  const r = repairUbl(src);
  assert.deepEqual(r.changes.map((c) => c.path), ["/totals/tax_accounting_currency"]);
  assert.equal(r.xml, simple());
});

test("a wrong line VAT (KSA-11) is recomputed and the line amount with VAT (KSA-12) follows it", () => {
  const src = simple().replace(/(<cbc:TaxAmount currencyID="SAR">)15\.00(<\/cbc:TaxAmount>\s*<cbc:RoundingAmount currencyID="SAR">)115\.00/, "$118.00$2118.00");
  const r = repairUbl(src);
  assert.deepEqual(r.changes.map((c) => [c.path, c.to]), [["/lines/0/vat", "15.00"], ["/lines/0/amount_with_vat", "115.00"]]);
  assert.equal(r.xml, simple());
});

test("a line VAT a cent under net x rate is kept (VAT-inclusive pricing); KSA-12 still has to add up", () => {
  const src = simple().replace(/(<cbc:TaxAmount currencyID="SAR">)15\.00(<\/cbc:TaxAmount>\s*<cbc:RoundingAmount currencyID="SAR">)115\.00/, "$114.99$2115.00");
  const r = repairUbl(src);
  assert.deepEqual(r.changes.map((c) => [c.path, c.to]), [["/lines/0/amount_with_vat", "114.99"]]);
});

test("a prepayment line's VAT (KSA-32) is recomputed from KSA-31 and its rate (BR-KSA-79)", () => {
  const src = pre().replace(/(<cbc:TaxableAmount currencyID="SAR">200\.00<\/cbc:TaxableAmount>\s*<cbc:TaxAmount currencyID="SAR">)10\.00/, "$130.00");
  assert.notEqual(src, pre());
  const r = repairUbl(src);
  assert.deepEqual(r.changes.map((c) => [c.path, c.from, c.to]), [["/lines/1/prepayment/0/tax", "30.00", "10.00"]]);
  assert.equal(r.xml, pre());
});

test("a prepaid amount that is not KSA-31 + KSA-32 is reported, never edited (BR-KSA-80)", () => {
  const src = pre().replace("<cbc:PrepaidAmount currencyID=\"SAR\">210.00", "<cbc:PrepaidAmount currencyID=\"SAR\">200.00");
  const r = repairUbl(src);
  assert.ok(r.skipped.some((s) => /BR-KSA-80/.test(s) && /210\.00/.test(s)));
  assert.ok(r.xml.includes("<cbc:PrepaidAmount currencyID=\"SAR\">200.00"));
  assert.ok(!r.changes.some((c) => c.path === "/totals/prepaid"));
});

const withAllowance = (amount, allowanceTotal, cat = "<cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>") =>
  simple()
    .replace(/(\s*)<cac:TaxTotal>/, `$1<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:AllowanceChargeReason>discount</cbc:AllowanceChargeReason><cbc:Amount currencyID="SAR">${amount}</cbc:Amount>${cat}</cac:AllowanceCharge>$1<cac:TaxTotal>`)
    .replace(/<cbc:AllowanceTotalAmount currencyID="SAR">0\.00/, `<cbc:AllowanceTotalAmount currencyID="SAR">${allowanceTotal}`);

test("a document allowance is taken off its tax group's taxable amount and the net total", () => {
  const r = repairUbl(withAllowance("10.00", "0.00"));
  const got = Object.fromEntries(r.changes.map((c) => [c.path, c.to]));
  assert.equal(got["/tax_breakdown/0/taxable"], "90.00");
  assert.equal(got["/tax_breakdown/0/tax"], "13.50");
  assert.equal(got["/totals/tax"], "13.50");
  assert.equal(got["/totals/tax_accounting_currency"], "13.50");
  assert.equal(got["/totals/allowances"], "10.00");
  assert.equal(got["/totals/net"], "90.00");
  assert.equal(got["/totals/gross"], "103.50");
  assert.equal(got["/totals/due"], "103.50");
  assert.equal(got["/totals/lines"], undefined, "the line total does not include document allowances");
  // Repairing the repaired file changes nothing.
  assert.equal(repairUbl(r.xml).changes.length, 0);
});

test("a document allowance in a category with no subtotal stops the tax part", () => {
  const r = repairUbl(withAllowance("10.00", "10.00", "<cac:TaxCategory><cbc:ID>Z</cbc:ID><cbc:Percent>0</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>"));
  assert.ok(r.skipped.some((s) => /tax groups do not match/.test(s)));
  assert.ok(!r.changes.some((c) => c.path.startsWith("/tax_breakdown")));
});

test("a line's own allowance is part of its net; a price-level discount is not", () => {
  const base = ex("ubl-invoice.xml");
  const lineAc = '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="EUR">20.00</cbc:Amount></cac:AllowanceCharge>';
  const src = base.replace(/(<cac:InvoiceLine>[\s\S]*?<\/cbc:LineExtensionAmount>)/, `$1${lineAc}`);
  const r = repairUbl(src);
  assert.equal(r.changes[0].path, "/lines/0/net");
  assert.equal(r.changes[0].to, (Number(r.changes[0].from) - 20).toFixed(2));
  const priceAc = '<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="EUR">5.00</cbc:Amount><cbc:BaseAmount currencyID="EUR">105.00</cbc:BaseAmount></cac:AllowanceCharge>';
  const src2 = base.replace(/(<cac:InvoiceLine>[\s\S]*?<cbc:PriceAmount[^>]*>[^<]*<\/cbc:PriceAmount>)/, `$1${priceAc}`);
  assert.notEqual(src2, base);
  assert.equal(repairUbl(src2).changes.length, 0);
});

test("a net written with more decimals that rounds to the right cent is kept (PINT)", () => {
  const src = ex("ubl-invoice.xml").replace(/(<cac:InvoiceLine>[\s\S]*?<cbc:LineExtensionAmount currencyID="EUR">)200\.00/, "$1200.0012");
  assert.ok(src.includes("200.0012"));
  assert.ok(!repairUbl(src).changes.some((c) => c.path === "/lines/0/net"));
});

test("outside ZATCA a line's own TaxTotal is left as written and said so", () => {
  const src = ex("ubl-invoice.xml").replace(/(<cac:InvoiceLine>[\s\S]*?<\/cbc:LineExtensionAmount>)/, '$1<cac:TaxTotal><cbc:TaxAmount currencyID="EUR">99.00</cbc:TaxAmount></cac:TaxTotal>');
  const r = repairUbl(src);
  assert.ok(r.skipped.some((s) => /own TaxTotal; it was left as written/.test(s)));
  assert.ok(r.xml.includes(">99.00<"));
  assert.ok(!r.skipped.some((s) => /Tax was not recomputed/.test(s)), "a line TaxTotal is not a second document TaxTotal");
});

test("BT-111 in another currency is left for a person, with the reason", () => {
  const src = simple().replace(/(<cac:TaxTotal>\s*<cbc:TaxAmount currencyID=")SAR(">)15\.00/, "$1USD$24.00");
  const r = repairUbl(src);
  assert.ok(r.skipped.some((s) => /BT-111, USD/.test(s)));
  assert.ok(r.xml.includes('currencyID="USD">4.00'));
});
