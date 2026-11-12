// Baisa line nets (added 2026-11-12). PINT Oman lines carry amounts to three decimals
// (0.047 OMR) under two-decimal totals, and each line states its own VAT (BTOM-016,
// cac:ItemPriceExtension/cac:TaxTotal). Before this, the built-in checks rounded every
// line net to cents before adding (30 x 0.05 = 1.50 against 1.41) and worked the tax out
// only as rate x summed taxable (0.07 against the 0.06 Oman's ALIGNED-IBRP-S-09-OM wants),
// so OpenPeppol's four "baisa gap" examples drew INV-014/018/038 (eval/phive-corpus.mjs).
// The invoice below is our own made-up one, built in code; mirror: tests/test_baisa.py.
import test from "node:test";
import assert from "node:assert/strict";
import { parseUblInvoice } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";
import { inspectTaxBreakdown } from "./breakdown.mjs";

export function omrInvoice({ lines = 30, net = "0.047", lineTax = "0.002", total = "1.41", tax = "0.06", taxable = total, rowTax = tax } = {}) {
  const gross = (Number(total) + Number(tax)).toFixed(2);
  const line = (i) => `
  <cac:InvoiceLine>
    <cbc:ID>${i}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="OMR">${net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Sample item ${i}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="OMR">${net}</cbc:PriceAmount></cac:Price>${lineTax === null ? "" : `
    <cac:ItemPriceExtension>
      <cbc:Amount currencyID="OMR">${(Number(net) + Number(lineTax)).toFixed(3)}</cbc:Amount>
      <cac:TaxTotal><cbc:TaxAmount currencyID="OMR">${lineTax}</cbc:TaxAmount></cac:TaxTotal>
    </cac:ItemPriceExtension>`}
  </cac:InvoiceLine>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:peppol:pint:billing-1@om-1</cbc:CustomizationID>
  <cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>
  <cbc:ID>INV-OM-BAISA-1</cbc:ID>
  <cbc:IssueDate>2026-10-01</cbc:IssueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>OMR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Sample Supplier LLC</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>Sample Buyer SAOC</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="OMR">${tax}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="OMR">${taxable}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="OMR">${rowTax}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>5</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="OMR">${total}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="OMR">${total}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="OMR">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="OMR">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${Array.from({ length: lines }, (_, i) => line(i + 1)).join("")}
</Invoice>`;
}

const arithmetic = (xml) => {
  const invoice = parseUblInvoice(xml);
  const ids = [...checkInvoice(invoice), ...inspectTaxBreakdown(invoice)].map((f) => f.rule);
  return [...new Set(ids)].filter((id) => ["INV-012", "INV-014", "INV-017", "INV-018", "INV-038"].includes(id)).sort();
};

test("thirty 0.047 OMR lines sum to 1.41, not thirty cents-rounded 0.05s", () => {
  assert.deepEqual(arithmetic(omrInvoice()), []);
});

test("the line VAT is read from the line's ItemPriceExtension", () => {
  const invoice = parseUblInvoice(omrInvoice({ lines: 2 }));
  assert.equal(invoice.lines[0].tax_amount, 0.002);
  assert.equal(invoice.totals.tax, 0.06, "the line TaxTotals are not BT-110");
});

test("rate x summed taxable is still accepted where the lines state their VAT", () => {
  assert.deepEqual(arithmetic(omrInvoice({ tax: "0.07" })), []);
});

test("a tax total that is neither reading still blocks", () => {
  assert.deepEqual(arithmetic(omrInvoice({ tax: "0.05" })), ["INV-018", "INV-038"]);
});

test("a wrong net total still blocks at stated precision", () => {
  assert.deepEqual(arithmetic(omrInvoice({ total: "1.50", taxable: "1.41", tax: "0.06" })), ["INV-014"]);
});

test("line VAT that is not net x rate does not buy the line-sum reading", () => {
  // 0.02 a line is 10x the 5% of 0.047: summing them (0.60) is not accepted.
  assert.deepEqual(arithmetic(omrInvoice({ lineTax: "0.020", tax: "0.60" })), ["INV-018", "INV-038"]);
});

test("without line VAT the line-sum reading is not available", () => {
  assert.deepEqual(arithmetic(omrInvoice({ lineTax: null })), ["INV-018", "INV-038"]);
  assert.deepEqual(arithmetic(omrInvoice({ lineTax: null, tax: "0.07" })), []);
});

test("two-decimal lines read as before", () => {
  assert.deepEqual(arithmetic(omrInvoice({ lines: 3, net: "0.05", lineTax: null, total: "0.15", tax: "0.01" })), []);
  assert.deepEqual(arithmetic(omrInvoice({ lines: 3, net: "0.05", lineTax: null, total: "0.14", taxable: "0.15", tax: "0.01" })), ["INV-014"]);
});

test("the repair leaves a correct baisa invoice alone", async () => {
  const { repairUbl } = await import("./repair-ubl.mjs");
  const xml = omrInvoice();
  const r = repairUbl(xml);
  assert.deepEqual(r.changes, [], JSON.stringify(r.changes.slice(0, 3)));
  assert.equal(r.xml, xml);
  assert.ok(!r.skipped.some((s) => /own TaxTotal/.test(s)), "Oman's ItemPriceExtension TaxTotal is not ZATCA's line TaxTotal");
});

test("the repair restores a wrong baisa net total to the sum at stated precision", async () => {
  const { repairUbl } = await import("./repair-ubl.mjs");
  const r = repairUbl(omrInvoice({ total: "1.50", taxable: "1.50", tax: "0.06" }));
  const to = Object.fromEntries(r.changes.map((c) => [c.path, c.to]));
  assert.equal(to["/totals/net"], "1.41");
  assert.equal(to["/tax_breakdown/0/taxable"], "1.41");
  assert.equal(to["/tax_breakdown/0/tax"], undefined, "0.06, the sum of the line VAT, is kept");
  assert.deepEqual(arithmetic(r.xml), []);
});
