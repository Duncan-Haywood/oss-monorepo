// PEPPOL-COMMON-R056-2 reaches every VAT PartyTaxScheme (UBL) and VA
// SpecifiedTaxRegistration (CII), and Saxon's normalize-space keeps a trailing
// no-break space. Added 2026-11-17; eval/nl-vat-r056-2-payee-refs-2026-11-17.md.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseUblInvoice, xmlValue } from "./ubl.mjs";
import { parseCiiInvoice } from "./cii.mjs";
import { checkInvoice } from "./checks.mjs";

const UBL = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const CII = readFileSync(new URL("./examples/cii-invoice.xml", import.meta.url), "utf8");
const vatFindings = (invoice) => checkInvoice(invoice).filter((f) => ["INV-022", "INV-023", "INV-064"].includes(f.rule));
const ublSeller = (v) => UBL.replace("<cbc:CompanyID>DE136695976</cbc:CompanyID>", `<cbc:CompanyID>${v}</cbc:CompanyID>`);
const taxScheme = (v) => `<cac:PartyTaxScheme><cbc:CompanyID>${v}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`;

test("xmlValue decodes references and trims XML whitespace only", () => {
  assert.equal(xmlValue({ text: " NL123456782&#66;01&#160;\n" }), "NL123456782B01 ");
  assert.equal(xmlValue({ text: "A&amp;B &#x42;" }), "A&B B");
  assert.equal(xmlValue({ text: "&#0;x" }), "&#0;x");
});

test("a valid Dutch VAT number written with a character reference is not INV-022", () => {
  for (const v of ["NL123456782&#66;01", "NL123456782&#x42;01", "&#78;L123456782B01"]) {
    const invoice = parseUblInvoice(ublSeller(v));
    assert.equal(invoice.supplier.vat_id, "NL123456782B01");
    assert.deepEqual(vatFindings(invoice), [], v);
  }
});

test("a trailing no-break space draws INV-064, a warning, as Saxon's R056-2 does", () => {
  for (const v of ["NL123456782B01&#160;", "NL123456782B01 "]) {
    const findings = vatFindings(parseUblInvoice(ublSeller(v)));
    assert.deepEqual(findings.map((f) => [f.rule, f.severity, f.path]), [["INV-064", "warning", "/supplier/vat_id"]], v);
  }
  const cii = CII.replace('<ram:ID schemeID="VA">DE136695976</ram:ID>', '<ram:ID schemeID="VA">NL123456782B01&#160;</ram:ID>');
  assert.deepEqual(vatFindings(parseCiiInvoice(cii)).map((f) => f.rule), ["INV-064"]);
  // A leading one: normalize-space keeps it, so the value does not start with
  // NL and R056-2 does not read it.
  assert.deepEqual(vatFindings(parseUblInvoice(ublSeller("&#160;NL123456782B01"))), []);
});

test("UBL payee, deliver-to, line and second-scheme VAT numbers draw INV-064", () => {
  const xml = UBL
    .replace("</cac:AccountingCustomerParty>", `$&<cac:PayeeParty><cac:PartyName><cbc:Name>Factor BV</cbc:Name></cac:PartyName>${taxScheme("NL 123456782B01")}</cac:PayeeParty><cac:Delivery><cac:DeliveryParty>${taxScheme("NL123456782.B01")}</cac:DeliveryParty></cac:Delivery>`)
    .replace("</cac:CreditNoteLine>", `<cac:Delivery><cac:DeliveryParty>${taxScheme("nl123456782b01")}</cac:DeliveryParty></cac:Delivery>$&`)
    .replace("<cbc:CompanyID>DE136695976</cbc:CompanyID>", `$&<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme><cac:PartyTaxScheme><cbc:CompanyID>NL123456782B01 </cbc:CompanyID>`);
  const invoice = parseUblInvoice(xml);
  assert.equal(invoice.supplier.vat_id, "DE136695976");
  assert.deepEqual(invoice.vat_registrations.map((r) => [r.party, r.label, r.value]), [
    ["supplier", "Seller", "NL123456782B01"],
    ["payee_party", "Payee", "NL 123456782B01"],
    ["delivery_party", "Deliver-to party", "NL123456782.B01"],
    ["delivery_party", "Line 1 deliver-to party", "nl123456782b01"],
  ]);
  const findings = vatFindings(invoice);
  // The seller's second number is well formed; the lowercase one does not
  // start with "NL", so R056-2 (and INV-064) leave it alone.
  assert.deepEqual(findings.map((f) => [f.rule, f.severity, f.path]), [
    ["INV-064", "warning", "/vat_registrations/1/value"],
    ["INV-064", "warning", "/vat_registrations/2/value"],
  ]);
  assert.match(findings[0].message, /^Payee Dutch VAT number/);
  assert.match(findings[1].message, /^Deliver-to party Dutch VAT number/);
});

test("CII payee and ship-to VA registrations draw INV-064; other schemes do not", () => {
  const xml = CII
    .replace("<ram:ApplicableHeaderTradeSettlement>", '$&<ram:PayeeTradeParty><ram:Name>Factor BV</ram:Name><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">NL123456782 B01</ram:ID></ram:SpecifiedTaxRegistration><ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">NL 1</ram:ID></ram:SpecifiedTaxRegistration></ram:PayeeTradeParty>')
    .replace("<ram:ApplicableHeaderTradeDelivery/>", '<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">NL123456782B01</ram:ID></ram:SpecifiedTaxRegistration></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>');
  const invoice = parseCiiInvoice(xml);
  assert.deepEqual(invoice.vat_registrations.map((r) => r.party), ["delivery_party", "payee_party"]);
  assert.deepEqual(vatFindings(invoice).map((f) => [f.rule, f.path]), [["INV-064", "/vat_registrations/1/value"]]);
});

test("the shipped examples keep no extra registrations", () => {
  assert.equal(parseUblInvoice(UBL).vat_registrations, undefined);
  assert.equal(parseCiiInvoice(CII).vat_registrations, undefined);
});
