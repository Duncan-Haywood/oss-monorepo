// The document's tax (BT-110) and breakdown (BG-23) come from the TaxTotal elements
// that are children of the root, not from a line's own TaxTotal. ZATCA invoices carry
// one on every line (KSA-11/12), and a prepayment-deduction line puts the advance's
// subtotal at its own rate there (KSA-31/32). Before 2026-11-12 the reader took every
// TaxSubtotal and every TaxTotal in the file, so all 19 of ZATCA's good-case examples
// drew INV-017/018 and the prepayment ones INV-038 (eval/phive-corpus.mjs --good);
// the report dropped those ids under ZATCA instead. Made-up invoice:
// examples/zatca-prepayment-rate-change.xml.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";
import { inspectTaxBreakdown } from "./breakdown.mjs";

const read = (name) => readFileSync(new URL(`./examples/${name}`, import.meta.url), "utf8");
const ids = (findings) => [...new Set(findings.map((f) => f.rule))].sort();

test("a line's own TaxTotal is not the document breakdown or the document tax", () => {
  const invoice = parseUblInvoice(read("zatca-prepayment-rate-change.xml"));
  assert.deepEqual(invoice.tax_breakdown, [{ tax_percent: 15, taxable: 1000, tax: 150, tax_category: "S" }]);
  assert.equal(invoice.totals.tax, 150, "BT-110 once: not the SAR repeat (BT-111) and not the lines' KSA-11 amounts");
});

test("the prepayment invoice at the old rate draws no tax arithmetic finding", () => {
  const invoice = parseUblInvoice(read("zatca-prepayment-rate-change.xml"));
  const found = ids(checkInvoice(invoice));
  for (const id of ["INV-017", "INV-018", "INV-038"]) assert.ok(!found.includes(id), `${id} in ${found}`);
});

test("the simplified invoice's SAR repeat of BT-110 is not added twice", () => {
  const invoice = parseUblInvoice(read("zatca-simplified-invoice.xml"));
  assert.equal(invoice.totals.tax, 15);
  const found = ids(checkInvoice(invoice));
  assert.ok(!found.includes("INV-017") && !found.includes("INV-018"), String(found));
});

test("a TaxTotal in another currency is still BT-111 and still left out", () => {
  const xml = read("zatca-simplified-invoice.xml")
    .replace("<cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>", "<cbc:TaxCurrencyCode>USD</cbc:TaxCurrencyCode>")
    .replace('<cac:TaxTotal>\n    <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>\n  </cac:TaxTotal>', '<cac:TaxTotal>\n    <cbc:TaxAmount currencyID="USD">4.00</cbc:TaxAmount>\n  </cac:TaxTotal>');
  assert.equal(parseUblInvoice(xml).totals.tax, 15);
});

test("two document TaxTotals that both carry subtotals are still summed", () => {
  // UBL allows a TaxTotal per tax scheme; only a subtotal-less repeat is dropped.
  const xml = read("zatca-simplified-invoice.xml").replace(
    '<cac:TaxTotal>\n    <cbc:TaxAmount currencyID="SAR">15.00</cbc:TaxAmount>\n  </cac:TaxTotal>',
    '<cac:TaxTotal>\n    <cbc:TaxAmount currencyID="SAR">2.00</cbc:TaxAmount>\n    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">100.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">2.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>2</cbc:Percent><cac:TaxScheme><cbc:ID>OTH</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>\n  </cac:TaxTotal>',
  );
  const invoice = parseUblInvoice(xml);
  assert.equal(invoice.totals.tax, 17);
  assert.equal(invoice.tax_breakdown.length, 2);
});

test("a repeated header rate is still INV-038 under the line-level reading", () => {
  const xml = read("zatca-prepayment-rate-change.xml").replace(
    "</cac:TaxSubtotal>\n  </cac:TaxTotal>",
    '</cac:TaxSubtotal>\n    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="SAR">0.00</cbc:TaxableAmount><cbc:TaxAmount currencyID="SAR">0.00</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>15.00</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>\n  </cac:TaxTotal>',
  );
  const found = inspectTaxBreakdown(parseUblInvoice(xml));
  assert.ok(found.some((f) => f.rule === "INV-038" && /repeats the same tax percentage/.test(f.message)));
});

test("lines that net to zero at a rate need no breakdown row; a non-zero one still does", () => {
  const base = {
    lines: [
      { description: "Widgets", quantity: 1, unit_price: 100, net: 100, tax_percent: 15 },
      { description: "Advance deducted", quantity: 0, unit_price: 0, net: 0, tax_percent: 5 },
    ],
    tax_breakdown: [{ tax_percent: 15, taxable: 100, tax: 15 }],
  };
  assert.deepEqual(inspectTaxBreakdown(base), []);
  const owed = structuredClone(base);
  owed.lines[1] = { description: "Gadget", quantity: 1, unit_price: 10, net: 10, tax_percent: 5 };
  assert.ok(inspectTaxBreakdown(owed).some((f) => /missing a row/.test(f.message)));
});
