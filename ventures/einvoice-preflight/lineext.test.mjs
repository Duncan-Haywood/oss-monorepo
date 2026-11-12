// INV-060: a PINT line's own VAT and amount with VAT (UAE BTAE-08/BTAE-10, Oman
// BTOM-016/BTOM-017) must add up. Added 2026-11-12. Before, a seeded BTAE-10 drew no
// finding from our checks or the UAE's rules in 0 of 40 seeds on OpenPeppol's PINT AE
// examples, and the built-in checks flagged 0 of 76 UAE and 0 of 248 Oman line seeds;
// with this check every one is flagged and none of the 136 correct AE and OM examples
// (and none of the 26 MY ones, left out on purpose) draws it (README, "UAE line VAT").
// Every invoice below is made up and built in the test.
import test from "node:test";
import assert from "node:assert/strict";
import { parseUblInvoice } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";
import { repairUbl } from "./repair-ubl.mjs";
import { inspectLineExtension } from "./lineext.mjs";

function invoice({
  customization = "urn:peppol:pint:billing-1@om-1",
  currency = "OMR",
  typeName = null,
  category = "S",
  percent = "5",
  lines = [{ qty: "1", price: "0.047", net: "0.047", vat: "0.002", amount: "0.049" }],
  taxable = "0.05",
  rowTax = "0.00",
  tax = rowTax,
  net = taxable,
  gross = (Number(net) + Number(tax)).toFixed(2),
} = {}) {
  const c = `currencyID="${currency}"`;
  const line = (l, i) => `
  <cac:InvoiceLine>
    <cbc:ID>${i + 1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="H87">${l.qty}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount ${c}>${l.net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Sample item ${i + 1}</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${percent}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount ${c}>${l.price}</cbc:PriceAmount>${l.base ? `<cbc:BaseQuantity unitCode="H87">${l.base}</cbc:BaseQuantity>` : ""}</cac:Price>${l.vat === undefined ? "" : `
    <cac:ItemPriceExtension>
      <cbc:Amount ${c}>${l.amount}</cbc:Amount>
      <cac:TaxTotal><cbc:TaxAmount ${c}>${l.vat}</cbc:TaxAmount></cac:TaxTotal>
    </cac:ItemPriceExtension>`}
  </cac:InvoiceLine>`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>${customization}</cbc:CustomizationID>
  <cbc:ProfileID>urn:peppol:bis:billing</cbc:ProfileID>
  <cbc:ID>INV-SAMPLE-1</cbc:ID>
  <cbc:IssueDate>2026-10-01</cbc:IssueDate>
  <cbc:InvoiceTypeCode${typeName ? ` name="${typeName}"` : ""}>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cac:TaxTotal>
    <cbc:TaxAmount ${c}>${tax}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount ${c}>${taxable}</cbc:TaxableAmount>
      <cbc:TaxAmount ${c}>${rowTax}</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>${category}</cbc:ID><cbc:Percent>${percent}</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount ${c}>${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount ${c}>${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount ${c}>${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount ${c}>${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${lines.map(line).join("")}
</Invoice>`;
}

const AE = "urn:peppol:pint:billing-1@ae-1";
const ae = (l, rest = {}) => invoice({ customization: AE, currency: "AED", lines: [l], ...rest });
const inv060 = (xml) => checkInvoice(parseUblInvoice(xml)).filter((f) => f.rule === "INV-060");

test("the UBL reader keeps the line amount with VAT (ItemPriceExtension/Amount)", () => {
  const line = parseUblInvoice(ae({ qty: "10", price: "100", net: "1000", vat: "50", amount: "1050" }, { taxable: "1000", rowTax: "50" })).lines[0];
  assert.equal(line.tax_amount, 50);
  assert.equal(line.amount_with_vat, 1050);
});

test("a correct UAE line, written to four decimals, draws nothing", () => {
  assert.deepEqual(inv060(ae({ qty: "50", price: "19.9875", net: "999.375", vat: "49.9688", amount: "1049.3438" }, { taxable: "999.38", rowTax: "49.97" })), []);
});

test("a wrong UAE line amount payable (BTAE-10) is flagged with the right figure", () => {
  const found = inv060(ae({ qty: "10", price: "100", net: "1000", vat: "50", amount: "1057" }, { taxable: "1000", rowTax: "50" }));
  assert.equal(found.length, 1);
  assert.equal(found[0].path, "/lines/0/amount_with_vat");
  assert.match(found[0].message, /BTAE-10/);
  assert.match(found[0].fix, /1050\.00/);
});

test("a wrong UAE line VAT (BTAE-08) is flagged once; an amount right for the true VAT is not", () => {
  const found = inv060(ae({ qty: "50", price: "19.9875", net: "999.375", vat: "56.9688", amount: "1049.3438" }, { taxable: "999.38", rowTax: "49.97" }));
  assert.deepEqual(found.map((f) => f.path), ["/lines/0/tax_amount"]);
  assert.match(found[0].fix, /49\.9688/);
});

test("within 0.01 of net x rate is kept (a VAT-inclusive price rounds that way)", () => {
  assert.deepEqual(inv060(ae({ qty: "1", price: "95.24", net: "95.24", vat: "4.76", amount: "100.00" }, { taxable: "95.24", rowTax: "4.76" })), []);
});

test("UAE reverse charge (AE) and margin scheme (N): line VAT is 0 whatever the rate", () => {
  const ok = invoice({ customization: AE, currency: "AED", category: "AE", lines: [{ qty: "30", price: "99", net: "2970", vat: "0", amount: "2970" }], taxable: "2970", rowTax: "0" });
  assert.deepEqual(inv060(ok), []);
  const bad = invoice({ customization: AE, currency: "AED", category: "AE", lines: [{ qty: "30", price: "99", net: "2970", vat: "148.5", amount: "3118.5" }], taxable: "2970", rowTax: "0" });
  assert.deepEqual(inv060(bad).map((f) => f.path), ["/lines/0/tax_amount", "/lines/0/amount_with_vat"]);
  const margin = invoice({ customization: AE, currency: "AED", category: "N", lines: [{ qty: "1", price: "1000", net: "1000", vat: "50", amount: "1050" }], taxable: "1000", rowTax: "0" });
  assert.equal(inv060(margin)[0].path, "/lines/0/tax_amount");
});

test("a UAE exempt line states no VAT, and its amount payable is the net", () => {
  const xml = (amount) => invoice({ customization: AE, currency: "AED", category: "E", percent: "0", lines: [{ qty: "1", price: "727.5", net: "727.5" }], taxable: "727.5", rowTax: "0" })
    .replace("</cac:Price>", `</cac:Price>\n    <cac:ItemPriceExtension><cbc:Amount currencyID="AED">${amount}</cbc:Amount></cac:ItemPriceExtension>`);
  assert.deepEqual(inv060(xml("727.5")), []);
  assert.deepEqual(inv060(xml("734.5")).map((f) => f.path), ["/lines/0/amount_with_vat"]);
});

test("Oman lines (BTOM-016/017) are checked too; correct baisa lines draw nothing", () => {
  const lines = (over) => Array.from({ length: 10 }, (_, i) => ({ qty: "1", price: "0.047", net: "0.047", vat: "0.002", amount: "0.049", ...(i === 3 ? over : {}) }));
  assert.deepEqual(inv060(invoice({ lines: lines({}), taxable: "0.47", rowTax: "0.02" })), []);
  const found = inv060(invoice({ lines: lines({ amount: "0.149" }), taxable: "0.47", rowTax: "0.02" }));
  assert.deepEqual(found.map((f) => f.path), ["/lines/3/amount_with_vat"]);
  assert.match(found[0].message, /BTOM-017/);
});

test("PINT Malaysia and non-PINT files are left out (LHDN ties the amount to nothing)", () => {
  const my = invoice({ customization: "urn:peppol:pint:billing-1@my-1", currency: "MYR", percent: "10", lines: [{ qty: "100", price: "50.00", net: "5000.00" }], taxable: "5000.00", rowTax: "500.00" })
    .replace("</cac:Price>", "</cac:Price>\n    <cac:ItemPriceExtension><cbc:Amount currencyID=\"MYR\">100.00</cbc:Amount></cac:ItemPriceExtension>");
  assert.deepEqual(inv060(my), []);
  assert.deepEqual(inspectLineExtension({ specification_id: "urn:cen.eu:en16931:2017", lines: [{ net: 100, tax_percent: 5, tax_amount: 9, amount_with_vat: 200 }] }), []);
});

test("the repair pass clears what INV-060 flags", () => {
  const xml = ae({ qty: "10", price: "100", net: "1000", vat: "57", amount: "1057" }, { taxable: "1000", rowTax: "50" });
  assert.equal(inv060(xml).length, 2);
  assert.deepEqual(inv060(repairUbl(xml).xml), []);
});
