// INV-059: a VAT total in the VAT accounting currency (BT-111) that is the invoice
// currency must equal the document VAT total (BT-110). On 2026-11-12 the seeded-fault
// run on ZATCA's 19 good cases (eval/repair-seeded.mjs --rules) found that a changed
// SAR repeat drew no finding from our checks or ZATCA's rules in 17 of 17 seeds; with
// this check it is flagged in 17 of 17, and none of the 141 publisher-valid files in
// eval/phive-corpus.mjs --good draws it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice } from "./ubl.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import { checkInvoice } from "./checks.mjs";
import { repairUbl } from "./repair-ubl.mjs";
import { inspectAccountingCurrencyTax } from "./taxcurrency.mjs";

const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const zatca = read("zatca-simplified-invoice.xml");
const REPEAT = '<cac:TaxTotal>\n    <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>\n  </cac:TaxTotal>';
const seeded = zatca.replace(REPEAT, REPEAT.replace("15.00", "22.00"));
const rules = (invoice) => checkInvoice(invoice).filter((f) => f.rule === "INV-059");

test("the seed is where the test thinks it is", () => {
  assert.ok(zatca.includes(REPEAT));
  assert.notEqual(seeded, zatca);
});

test("a SAR invoice whose repeat matches draws nothing", () => {
  const invoice = parseUblInvoice(zatca);
  assert.equal(invoice.totals.tax_accounting_currency, 15);
  assert.deepEqual(rules(invoice), []);
});

test("a SAR repeat that differs from BT-110 is INV-059, and BT-110 is still the one counted", () => {
  const invoice = parseUblInvoice(seeded);
  assert.equal(invoice.totals.tax, 15);
  assert.equal(invoice.totals.tax_accounting_currency, 22);
  const found = rules(invoice);
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "/totals/tax_accounting_currency");
  assert.match(found[0].message, /22\.00.*15\.00.*SAR/);
  assert.match(found[0].fix, /15\.00/);
});

test("the repair pass brings the repeat back, and the finding goes away", () => {
  const repaired = repairUbl(seeded);
  assert.ok(repaired.changes.some((c) => c.path === "/totals/tax_accounting_currency"), JSON.stringify(repaired.changes));
  assert.deepEqual(rules(parseUblInvoice(repaired.xml)), []);
});

test("a BT-111 in another currency is not compared (it needs an exchange rate)", () => {
  const usd = seeded
    .replace("<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>", "<cbc:TaxCurrencyCode>USD</cbc:TaxCurrencyCode>")
    .replace('<cbc:TaxAmount currencyID="SAR">22.00</cbc:TaxAmount>\n  </cac:TaxTotal>', '<cbc:TaxAmount currencyID="USD">22.00</cbc:TaxAmount>\n  </cac:TaxTotal>');
  assert.notEqual(usd, seeded);
  const invoice = parseUblInvoice(usd);
  assert.equal(invoice.totals.tax_accounting_currency, undefined);
  assert.deepEqual(rules(invoice), []);
});

test("an invoice with one TaxTotal has no repeat to compare", () => {
  const invoice = parseUblInvoice(read("ubl-invoice.xml"));
  assert.equal(invoice.totals.tax_accounting_currency, undefined);
  assert.deepEqual(rules(invoice), []);
});

test("CII: a second TaxTotalAmount in the invoice currency is compared too", () => {
  const xml = read("xrechnung-cii-invoice.xml");
  const one = '<ram:TaxTotalAmount currencyID="EUR">190.00</ram:TaxTotalAmount>';
  assert.ok(xml.includes(one));
  const same = parseCiiInvoice(xml.replace(one, `${one}\n        ${one}`));
  assert.deepEqual(rules(same), []);
  const off = parseCiiInvoice(xml.replace(one, `${one}\n        ${one.replace("190.00", "191.00")}`));
  assert.equal(Number(off.totals.tax), 190);
  assert.equal(rules(off).length, 1);
});

test("the inspector reads strings and numbers and ignores what it cannot read", () => {
  const base = { currency: "EUR", totals: { tax: "10.00" } };
  assert.deepEqual(inspectAccountingCurrencyTax(base), []);
  assert.deepEqual(inspectAccountingCurrencyTax({ ...base, totals: { tax: "10.00", tax_accounting_currency: 10 } }), []);
  assert.equal(inspectAccountingCurrencyTax({ ...base, totals: { tax: "10.00", tax_accounting_currency: "10.01" } }).length, 1);
  assert.deepEqual(inspectAccountingCurrencyTax({ ...base, totals: { tax: "10.00", tax_accounting_currency: "ten" } }), []);
  assert.deepEqual(inspectAccountingCurrencyTax(null), []);
});
