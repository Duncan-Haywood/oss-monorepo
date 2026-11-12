// The UBL repair on PINT files (added 2026-11-12). Before this, on OpenPeppol's published
// examples (eval/repair-seeded.mjs): the repair wrote a three-decimal Oman line net back
// with two decimals and left a wrong Oman line VAT (BTOM-016) alone; it added 5% VAT to
// correct UAE reverse-charge and margin-scheme invoices, whose tax is 0 by rule; it
// rounded UAE subtotals written to more decimals; and it re-netted LHDN's Malaysian
// sample, which states a base quantity but nets the line as quantity x price.
// Every invoice below is made up and built in the test.
import test from "node:test";
import assert from "node:assert/strict";
import { repairUbl, roundBaisa, fmtBaisa } from "./repair-ubl.mjs";

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

const changed = (r) => Object.fromEntries(r.changes.map((c) => [c.path, c.to]));

// Oman: ten lines of 0.047 at 5%, each stating 0.002 VAT (BTOM-016) and 0.049 with VAT (BTOM-017).
const omLines = (n = 10, over = {}) => Array.from({ length: n }, (_, i) => ({ qty: "1", price: "0.047", net: "0.047", vat: "0.002", amount: "0.049", ...(over[i] || {}) }));
const om = (over = {}, rest = {}) => invoice({ lines: omLines(10, over), taxable: "0.47", rowTax: "0.02", ...rest });

test("baisa rounding helpers: half up to three decimals, written with two when there is no baisa part", () => {
  assert.equal(roundBaisa(0.0475), 0.048);
  assert.equal(roundBaisa(-0.0475), -0.048);
  assert.equal(fmtBaisa(0.047), "0.047");
  assert.equal(fmtBaisa(0.05), "0.05");
  assert.equal(fmtBaisa(1.5), "1.50");
});

test("a correct Oman invoice comes back unchanged", () => {
  const xml = om();
  const r = repairUbl(xml);
  assert.deepEqual(r.changes, []);
  assert.equal(r.xml, xml);
});

test("an Oman line net is rewritten to the baisa, not to the cent", () => {
  const r = repairUbl(om({ 3: { net: "7.05" } }));
  assert.equal(changed(r)["/lines/3/net"], "0.047");
  assert.equal(r.xml, om(), "every other amount is left as it was");
});

test("a wrong Oman line VAT is rewritten from net x rate, to the baisa (IBR-168-OM)", () => {
  const r = repairUbl(om({ 2: { vat: "7.002" } }));
  assert.equal(changed(r)["/lines/2/vat"], "0.002");
  assert.equal(r.xml, om());
});

test("an Oman line VAT within 0.001 of net x rate is kept (IBR-168-OM's own tolerance)", () => {
  const xml = om({ 0: { vat: "0.003", amount: "0.050" } });
  const r = repairUbl(xml);
  assert.equal(changed(r)["/lines/0/vat"], undefined);
});

test("the line VAT is fixed before the subtotal is summed from it", () => {
  // Wrong line VAT and wrong subtotal tax together: the subtotal comes back as the sum
  // of the corrected line VATs (0.02, ALIGNED-IBRP-S-09-OM), not 5% of 0.47 (0.02 too, so
  // use eleven lines: 11 x 0.002 = 0.022 -> 0.02 against 0.517 x 5% = 0.026 -> 0.03).
  const lines = omLines(11);
  const good = invoice({ lines, taxable: "0.52", rowTax: "0.02" });
  const bad = invoice({ lines: omLines(11, { 4: { vat: "7.002" } }), taxable: "0.52", rowTax: "7.02", tax: "0.02" });
  const r = repairUbl(bad);
  assert.equal(changed(r)["/lines/4/vat"], "0.002");
  assert.equal(changed(r)["/tax_breakdown/0/tax"], "0.02");
  assert.equal(r.xml, good);
});

test("a wrong Oman line amount with VAT (BTOM-017) is rewritten as net plus VAT (IBR-158-OM)", () => {
  const r = repairUbl(om({ 5: { amount: "7.049" } }));
  assert.equal(changed(r)["/lines/5/amount_with_vat"], "0.049");
  assert.equal(r.xml, om());
});

test("an Oman BTOM-017 written to the cent is kept (IBR-158-OM allows 0.01)", () => {
  const xml = om({ 5: { amount: "0.05" } });
  assert.equal(changed(repairUbl(xml))["/lines/5/amount_with_vat"], undefined);
});

test("on a profit margin invoice BTOM-017 is the item's sale value and is left alone", () => {
  const xml = om({ 5: { amount: "9.00" } }, { typeName: "10000000010000000000" });
  assert.equal(changed(repairUbl(xml))["/lines/5/amount_with_vat"], undefined);
});

test("outside Oman a line net is still rewritten to the cent", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@aunz-1", currency: "AUD", lines: [{ qty: "1", price: "0.047", net: "7.05" }], taxable: "0.05", rowTax: "0.00" });
  assert.equal(changed(repairUbl(xml))["/lines/0/net"], "0.05");
});

test("UAE reverse charge (AE at 5%) keeps a tax of 0 (aligned-ibrp-ae-09-ae)", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@ae-1", currency: "AED", category: "AE", lines: [{ qty: "10", price: "297", net: "2970" }], taxable: "2970", rowTax: "0" });
  const r = repairUbl(xml);
  assert.deepEqual(r.changes, [], "the old repair added 148.50 of VAT here");
});

test("UAE margin scheme (N at 5%) keeps a tax of 0 (ibr-108-ae), and a wrong one goes back to 0", () => {
  const ok = invoice({ customization: "urn:peppol:pint:billing-1@ae-1", currency: "AED", category: "N", lines: [{ qty: "1", price: "1000", net: "1000" }], taxable: "1000", rowTax: "0" });
  assert.deepEqual(repairUbl(ok).changes, []);
  const bad = invoice({ customization: "urn:peppol:pint:billing-1@ae-1", currency: "AED", category: "N", lines: [{ qty: "1", price: "1000", net: "1000" }], taxable: "1000", rowTax: "50.00", tax: "0" });
  assert.equal(changed(repairUbl(bad))["/tax_breakdown/0/tax"], "0.00");
});

test("category N outside the UAE is not assumed to be zero-tax", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@sg-1", currency: "SGD", category: "N", lines: [{ qty: "1", price: "1000", net: "1000" }], taxable: "1000", rowTax: "0" });
  assert.equal(changed(repairUbl(xml))["/tax_breakdown/0/tax"], "50.00");
});

test("a PINT subtotal written to more decimals that rounds to the right cent is kept", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@ae-1", currency: "AED", lines: [{ qty: "1", price: "10643.29", net: "10643.29" }], taxable: "10643.29", rowTax: "532.1645", tax: "532.16" });
  const r = repairUbl(xml);
  assert.deepEqual(r.changes, []);
});

test("a net stated as quantity x price beside a base quantity is kept (LHDN's sample reading)", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@my-1", currency: "MYR", percent: "5", lines: [{ qty: "10", price: "10.00", base: "10", net: "100.00" }], taxable: "100.00", rowTax: "5.00" });
  assert.deepEqual(repairUbl(xml).changes, [], "the old repair re-netted it to 10.00");
  // A net that is neither reading is still rewritten, to the base-quantity one.
  const bad = invoice({ customization: "urn:peppol:pint:billing-1@my-1", currency: "MYR", lines: [{ qty: "10", price: "10.00", base: "10", net: "107.00" }], taxable: "100.00", rowTax: "5.00" });
  assert.equal(changed(repairUbl(bad))["/lines/0/net"], "10.00");
});

test("an amount inside an XML comment is not read, and the comment is kept byte for byte", () => {
  // LHDN's PINT MY tourism tax samples keep a commented-out <cbc:Percent>10</cbc:Percent>.
  const good = invoice({ customization: "urn:peppol:pint:billing-1@my-1", currency: "MYR", percent: "6", lines: [{ qty: "1", price: "200.00", net: "200.00" }], taxable: "200.00", rowTax: "12.00" })
    .replace("<cbc:Percent>6</cbc:Percent><cac:TaxScheme>", "<!-- <cbc:Percent>10</cbc:Percent> --><cbc:Percent>6</cbc:Percent><cac:TaxScheme>");
  assert.deepEqual(repairUbl(good).changes, []);
  const bad = good.replace('<cbc:TaxAmount currencyID="MYR">12.00</cbc:TaxAmount>\n      <cac:TaxCategory>', '<cbc:TaxAmount currencyID="MYR">19.00</cbc:TaxAmount>\n      <cac:TaxCategory>');
  const r = repairUbl(bad);
  assert.equal(changed(r)["/tax_breakdown/0/tax"], "12.00");
  assert.ok(r.xml.includes("<!-- <cbc:Percent>10</cbc:Percent> -->"));
});

test("a per-unit tax subtotal (PerUnitAmount) stops the tax recompute instead of applying a rate", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@my-1", currency: "MYR", percent: "10", lines: [{ qty: "2", price: "100.00", net: "200.00" }], taxable: "200.00", rowTax: "20.00" })
    .replace('<cbc:TaxAmount currencyID="MYR">20.00</cbc:TaxAmount>\n      <cac:TaxCategory>', '<cbc:TaxAmount currencyID="MYR">20.00</cbc:TaxAmount>\n      <cbc:PerUnitAmount currencyID="MYR">10.00</cbc:PerUnitAmount>\n      <cac:TaxCategory>');
  const r = repairUbl(xml.replace(/<cbc:TaxAmount currencyID="MYR">20.00<\/cbc:TaxAmount>\n    <cac:TaxSubtotal>/, '<cbc:TaxAmount currencyID="MYR">27.00</cbc:TaxAmount>\n    <cac:TaxSubtotal>'));
  assert.equal(changed(r)["/totals/tax"], undefined);
  assert.ok(r.skipped.some((s) => /per-unit/.test(s)));
});
