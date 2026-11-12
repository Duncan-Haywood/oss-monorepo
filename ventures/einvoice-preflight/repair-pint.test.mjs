// The UBL repair on PINT files (added 2026-11-12). Before this, on OpenPeppol's published
// examples (eval/repair-seeded.mjs): the repair wrote a three-decimal Oman line net back
// with two decimals and left a wrong Oman line VAT (BTOM-016) alone; it added 5% VAT to
// correct UAE reverse-charge and margin-scheme invoices, whose tax is 0 by rule; it
// rounded UAE subtotals written to more decimals; and it re-netted LHDN's Malaysian
// sample, which states a base quantity but nets the line as quantity x price.
// Every invoice below is made up and built in the test.
import test from "node:test";
import assert from "node:assert/strict";
import { repairUbl, roundBaisa, fmtBaisa, fmtAs } from "./repair-ubl.mjs";

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

// UAE line VAT (BTAE-08) and line amount payable (BTAE-10), added 2026-11-12 (later).
// Before, the repair left both as written: 0 of 76 seeded on OpenPeppol's PINT AE examples.
const AE = "urn:peppol:pint:billing-1@ae-1";
const ae = (l, rest = {}) => invoice({ customization: AE, currency: "AED", lines: [l], ...rest });

test("written-precision formatter: keeps 2 to 4 decimals the file used", () => {
  assert.equal(fmtAs(49.96875, "56.9688"), "49.9688");
  assert.equal(fmtAs(178.125, "185.125"), "178.125");
  assert.equal(fmtAs(524.3, "531.3"), "524.30");
  assert.equal(fmtAs(1.23456789, "9.123456"), "1.2346");
  assert.equal(fmtAs(-0.125, "1.125"), "-0.125");
});

test("a correct UAE line (999.375 at 5%: 49.9688 VAT, 1049.3438 payable) comes back unchanged", () => {
  const xml = ae({ qty: "50", price: "19.9875", net: "999.375", vat: "49.9688", amount: "1049.3438" }, { taxable: "999.38", rowTax: "49.97" });
  assert.deepEqual(repairUbl(xml).changes, []);
});

test("a wrong UAE line VAT (BTAE-08) is rewritten from net x rate, with the file's decimals", () => {
  const xml = ae({ qty: "50", price: "19.9875", net: "999.375", vat: "56.9688", amount: "1049.3438" }, { taxable: "999.38", rowTax: "49.97" });
  const c = changed(repairUbl(xml));
  assert.equal(c["/lines/0/vat"], "49.9688");
  assert.equal(c["/lines/0/amount_with_vat"], undefined, "the amount was already net + the right VAT");
});

test("a wrong UAE line amount payable (BTAE-10) is rewritten as net plus line VAT", () => {
  const xml = ae({ qty: "10", price: "100", net: "1000", vat: "50", amount: "1057" }, { taxable: "1000", rowTax: "50" });
  assert.deepEqual(changed(repairUbl(xml)), { "/lines/0/amount_with_vat": "1050.00" });
});

test("a UAE line VAT within 0.01 of net x rate is kept (a VAT-inclusive price rounds that way)", () => {
  const xml = ae({ qty: "1", price: "95.24", net: "95.24", vat: "4.76", amount: "100.00" }, { taxable: "95.24", rowTax: "4.76" });
  assert.deepEqual(repairUbl(xml).changes, []);
});

test("UAE reverse charge and zero rated lines: a non-zero BTAE-08 goes back to 0 (ibr-162-ae, ibr-165-ae)", () => {
  const rc = invoice({ customization: AE, currency: "AED", category: "AE", lines: [{ qty: "30", price: "99", net: "2970", vat: "148.5", amount: "3118.5" }], taxable: "2970", rowTax: "0" });
  assert.deepEqual(changed(repairUbl(rc)), { "/lines/0/vat": "0.00", "/lines/0/amount_with_vat": "2970.00" });
  const z = invoice({ customization: AE, currency: "AED", category: "Z", percent: "0", lines: [{ qty: "1", price: "100", net: "100", vat: "7", amount: "107" }], taxable: "100", rowTax: "0" });
  assert.deepEqual(changed(repairUbl(z)), { "/lines/0/vat": "0.00", "/lines/0/amount_with_vat": "100.00" });
});

test("a UAE exempt line states no BTAE-08, and its BTAE-10 is the net", () => {
  const xml = invoice({ customization: AE, currency: "AED", category: "E", percent: "0", lines: [{ qty: "1", price: "727.5", net: "727.5" }], taxable: "727.5", rowTax: "0" })
    .replace("</cac:Price>", "</cac:Price>\n    <cac:ItemPriceExtension><cbc:Amount currencyID=\"AED\">734.5</cbc:Amount></cac:ItemPriceExtension>");
  assert.deepEqual(changed(repairUbl(xml)), { "/lines/0/amount_with_vat": "727.50" });
});

test("a wrong UAE subtotal written to four decimals is rewritten with four", () => {
  const xml = ae({ qty: "1", price: "10643.29", net: "10643.29", vat: "532.1645", amount: "11175.4545" }, { taxable: "10643.29", rowTax: "539.1645", tax: "532.16" });
  assert.equal(changed(repairUbl(xml))["/tax_breakdown/0/tax"], "532.1645");
});

test("PINT Malaysia's ItemPriceExtension amount is left as written (LHDN ties it to nothing)", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@my-1", currency: "MYR", percent: "10", lines: [{ qty: "100", price: "50.00", net: "5000.00", amount: "100.00" }], taxable: "5000.00", rowTax: "500.00" })
    .replace("</cac:Price>", "</cac:Price>\n    <cac:ItemPriceExtension><cbc:Amount currencyID=\"MYR\">100.00</cbc:Amount></cac:ItemPriceExtension>");
  assert.deepEqual(repairUbl(xml).changes, []);
});

test("outside the UAE and Oman, ItemPriceExtension VAT is not touched", () => {
  const xml = invoice({ customization: "urn:peppol:pint:billing-1@sg-1", currency: "SGD", percent: "9", lines: [{ qty: "1", price: "100", net: "100", vat: "15", amount: "115" }], taxable: "100", rowTax: "9" });
  assert.equal(changed(repairUbl(xml))["/lines/0/vat"], undefined);
});

test("a reverse-charge header allowance at AE 0% beside AE 5% lines still reaches the tax recompute", () => {
  // PINT UAE's "Doc-level allowance AE category" example: before, the 0% and 5% rows read as two
  // groups against one subtotal, so a wrong total was left alone with "groups do not match".
  const xml = invoice({ customization: AE, currency: "AED", category: "AE", lines: [{ qty: "10", price: "100", net: "1000", vat: "0", amount: "1000" }], taxable: "900", rowTax: "0", net: "900", tax: "7", gross: "907" })
    .replace("<cac:TaxTotal>", `<cac:AllowanceCharge><cbc:ChargeIndicator>false</cbc:ChargeIndicator><cbc:Amount currencyID="AED">100</cbc:Amount><cac:TaxCategory><cbc:ID>AE</cbc:ID><cbc:Percent>0</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:AllowanceCharge>\n  <cac:TaxTotal>`)
    .replace(`<cbc:LineExtensionAmount currencyID="AED">900</cbc:LineExtensionAmount>`, `<cbc:LineExtensionAmount currencyID="AED">1000</cbc:LineExtensionAmount><cbc:AllowanceTotalAmount currencyID="AED">100</cbc:AllowanceTotalAmount>`);
  const r = repairUbl(xml);
  assert.ok(!r.skipped.some((s) => /groups do not match/.test(s)), r.skipped.join("; "));
  const c = changed(r);
  assert.equal(c["/totals/tax"], "0.00");
  assert.equal(c["/totals/gross"], "900.00");
});
