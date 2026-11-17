// INV-062 / INV-063: OpenPeppol's PEPPOL-COMMON id rules on PartyIdentification/ID and
// PartyLegalEntity/CompanyID (UBL), GlobalID and SpecifiedLegalOrganization/ID (CII), and
// legal_id / party_ids in JSON. Whole-file differential: eval/party-id-peppol-differential.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkInvoice } from "./checks.mjs";
import { inspectPartyIdentifiers } from "./endpoint.mjs";
import { parseUblInvoice } from "./ubl.mjs";
import { parseCiiInvoice } from "./cii.mjs";

const CASES = JSON.parse(readFileSync(new URL("./tests/endpoint_peppol_cases.json", import.meta.url), "utf8"));
const UBL = readFileSync(new URL("./examples/peppol-credit-note.xml", import.meta.url), "utf8");
const CII = readFileSync(new URL("./examples/cii-invoice.xml", import.meta.url), "utf8");

const json = (supplier = {}, customer = {}) => ({
  invoice_number: "INV-1",
  issue_date: "2026-08-24",
  currency: "EUR",
  supplier: { id: "S1", name: "Supplier BV", ...supplier },
  customer: { id: "C1", name: "Customer NV", ...customer },
  lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 21, net: 200 }],
  totals: { net: 200, tax: 42, gross: 242 },
});
const idRules = (findings) => findings.filter((f) => f.rule === "INV-062" || f.rule === "INV-063").map((f) => [f.rule, f.path, f.severity || "error"]);

test("the endpoint's Peppol verdicts hold for legal_id and party_ids too", () => {
  for (const [scheme, id] of CASES.valid) {
    assert.deepEqual(inspectPartyIdentifiers({ legal_id: { scheme, id }, party_ids: [{ scheme, id }] }, "supplier"), [], `${scheme} ${id}`);
  }
  for (const [scheme, id] of CASES.invalid) {
    const found = inspectPartyIdentifiers({ legal_id: { scheme, id }, party_ids: [{ scheme: "0088", id: "4012345000009" }, { scheme, id }] }, "customer");
    assert.deepEqual(found.map((f) => [f.rule, f.path]), [["INV-062", "/customer/legal_id/id"], ["INV-062", "/customer/party_ids/1/id"]], `${scheme} ${id}`);
    for (const f of found) assert.ok(!f.message.includes(id) && !f.fix.includes(id), "never echoes the id");
  }
});

test("a mistyped Belgian KBO number as legal registration blocks a JSON invoice", () => {
  const findings = checkInvoice(json({ legal_id: { scheme: "0208", id: "0403.170.701" } }));
  assert.deepEqual(idRules(findings), [["INV-062", "/supplier/legal_id/id", "error"]]);
  assert.match(findings.find((f) => f.rule === "INV-062").fix, /no dots or BE prefix/);
  assert.deepEqual(idRules(checkInvoice(json({ legal_id: { scheme: "0208", id: "0403170701" } }))), []);
});

test("warning-level schemes are INV-063 warnings naming Peppol's rule", () => {
  const findings = checkInvoice(json({}, { legal_id: { scheme: "0106", id: "1234567" }, party_ids: [{ scheme: "9944", id: "NL123456789B1" }] }));
  assert.deepEqual(idRules(findings), [["INV-063", "/customer/legal_id/id", "warning"], ["INV-063", "/customer/party_ids/0/id", "warning"]]);
  assert.match(findings.find((f) => f.path === "/customer/legal_id/id").message, /PEPPOL-COMMON-R054/);
});

test("schemes Peppol has no rule for, empty values and odd shapes are left alone", () => {
  for (const party of [
    { legal_id: { scheme: "0002", id: "anything" } },
    { legal_id: { scheme: "", id: "123" } },
    { legal_id: { scheme: "0208", id: "  " } },
    { legal_id: "0403170701" },
    { party_ids: "nope" },
    { party_ids: [null, 5, { scheme: "EM", id: "no-at-sign" }] },
  ]) assert.deepEqual(inspectPartyIdentifiers(party, "supplier"), [], JSON.stringify(party));
});

test("the UBL reader carries every schemed PartyIdentification and the CompanyID scheme", () => {
  const xml = UBL
    .replace('<cbc:EndpointID schemeID="0088">4012345000009</cbc:EndpointID>', '$&<cac:PartyIdentification><cbc:ID>internal-7</cbc:ID></cac:PartyIdentification><cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification>')
    .replace("<cbc:RegistrationName>Customer AG</cbc:RegistrationName>", '$&<cbc:CompanyID schemeID="0192">981276958</cbc:CompanyID>');
  const invoice = parseUblInvoice(xml);
  assert.deepEqual(invoice.supplier.party_ids, [{ id: "4012345000008", scheme: "0088" }]);
  assert.equal(invoice.supplier.id, "internal-7");
  assert.deepEqual(idRules(checkInvoice(invoice)), [["INV-062", "/supplier/party_ids/0/id", "error"], ["INV-062", "/customer/legal_id/id", "error"]]);
});

test("the CII reader carries GlobalID and a schemed SpecifiedLegalOrganization/ID", () => {
  const xml = CII
    .replace("<ram:Name>Supplier GmbH</ram:Name>", '<ram:GlobalID schemeID="0007">5560360794</ram:GlobalID>$&')
    .replace("<ram:Name>Acheteur SARL</ram:Name>", '$&<ram:SpecifiedLegalOrganization><ram:ID schemeID="0217">12345</ram:ID></ram:SpecifiedLegalOrganization>');
  const invoice = parseCiiInvoice(xml);
  assert.deepEqual(invoice.supplier.party_ids, [{ id: "5560360794", scheme: "0007" }]);
  assert.deepEqual(idRules(checkInvoice(invoice)), [["INV-062", "/supplier/party_ids/0/id", "error"], ["INV-063", "/customer/legal_id/id", "warning"]]);
});

test("every shipped example stays free of INV-062 and INV-063", () => {
  const dir = new URL("./examples/", import.meta.url);
  for (const name of ["peppol-credit-note.xml", "peppol-nl-credit-note.xml", "cii-invoice.xml", "nlcius-invoice.xml", "nlcius-cii-invoice.xml", "xrechnung-cii-invoice.xml"]) {
    const xml = readFileSync(new URL(name, dir), "utf8");
    const invoice = xml.includes("CrossIndustryInvoice") ? parseCiiInvoice(xml) : parseUblInvoice(xml);
    assert.deepEqual(idRules(checkInvoice(invoice)), [], name);
  }
});

test("the payee (BG-10) and tax representative (BG-11) ids meet the same Peppol rules (UBL)", () => {
  const xml = UBL.replace("</cac:AccountingCustomerParty>", '$&'
    + '<cac:PayeeParty><cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Factor AB</cbc:Name></cac:PartyName><cac:PartyLegalEntity><cbc:CompanyID schemeID="0007">5560360794</cbc:CompanyID></cac:PartyLegalEntity></cac:PayeeParty>'
    + '<cac:TaxRepresentativeParty><cac:PartyName><cbc:Name>Fiscal Rep BV</cbc:Name></cac:PartyName><cac:PartyLegalEntity><cbc:CompanyID schemeID="0106">1234567</cbc:CompanyID></cac:PartyLegalEntity></cac:TaxRepresentativeParty>');
  const invoice = parseUblInvoice(xml);
  assert.deepEqual(invoice.payee_party, { legal_id: { id: "5560360794", scheme: "0007" }, party_ids: [{ id: "4012345000008", scheme: "0088" }] });
  const findings = checkInvoice(invoice);
  assert.deepEqual(idRules(findings), [
    ["INV-062", "/payee_party/legal_id/id", "error"],
    ["INV-062", "/payee_party/party_ids/0/id", "error"],
    ["INV-063", "/tax_representative/legal_id/id", "warning"],
  ]);
  assert.match(findings.find((f) => f.path === "/payee_party/legal_id/id").message, /^Payee legal registration identifier/);
  assert.match(findings.find((f) => f.path === "/tax_representative/legal_id/id").message, /^Tax representative /);
});

test("the payee and tax representative ids are read from CII too, and valid ones pass", () => {
  const xml = CII
    .replace("<ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>", '$&<ram:PayeeTradeParty><ram:GlobalID schemeID="0192">981276958</ram:GlobalID><ram:Name>Factor AB</ram:Name></ram:PayeeTradeParty>')
    .replace("</ram:BuyerTradeParty>", '$&<ram:SellerTaxRepresentativeTradeParty><ram:Name>Fiscal Rep BV</ram:Name><ram:SpecifiedLegalOrganization><ram:ID schemeID="0007">5560360793</ram:ID></ram:SpecifiedLegalOrganization></ram:SellerTaxRepresentativeTradeParty>');
  const invoice = parseCiiInvoice(xml);
  assert.deepEqual(invoice.payee_party, { party_ids: [{ id: "981276958", scheme: "0192" }] });
  assert.deepEqual(invoice.tax_representative, { legal_id: { id: "5560360793", scheme: "0007" } });
  assert.deepEqual(idRules(checkInvoice(invoice)), [["INV-062", "/payee_party/party_ids/0/id", "error"]]);
  assert.equal(parseCiiInvoice(CII).payee_party, undefined);
});

test("the deliver-to party's ids meet the same Peppol rules (UBL DeliveryParty), DeliveryLocation's id does not", () => {
  const xml = UBL.replace("</cac:AccountingCustomerParty>", '$&'
    + '<cac:Delivery><cac:DeliveryLocation><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:DeliveryLocation>'
    + '<cac:DeliveryParty><cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification>'
    + '<cac:PartyIdentification><cbc:ID schemeID="0088">4012345000009</cbc:ID></cac:PartyIdentification>'
    + '<cac:PartyName><cbc:Name>Warehouse 3</cbc:Name></cac:PartyName>'
    + '<cac:PartyLegalEntity><cbc:CompanyID schemeID="0106">1234567</cbc:CompanyID></cac:PartyLegalEntity></cac:DeliveryParty></cac:Delivery>');
  const invoice = parseUblInvoice(xml);
  assert.deepEqual(invoice.delivery_party, {
    legal_id: { id: "1234567", scheme: "0106" },
    party_ids: [{ id: "4012345000008", scheme: "0088" }, { id: "4012345000009", scheme: "0088" }],
  });
  const findings = checkInvoice(invoice);
  assert.deepEqual(idRules(findings), [
    ["INV-063", "/delivery_party/legal_id/id", "warning"],
    ["INV-062", "/delivery_party/party_ids/0/id", "error"],
  ]);
  assert.match(findings.find((f) => f.path === "/delivery_party/party_ids/0/id").message, /^Deliver-to party /);
  assert.equal(parseUblInvoice(UBL).delivery_party, undefined);
});

test("the deliver-to party's ids are read from CII ShipToTradeParty (BT-71's ID and GlobalID)", () => {
  const xml = CII.replace("<ram:ApplicableHeaderTradeDelivery/>",
    '<ram:ApplicableHeaderTradeDelivery><ram:ShipToTradeParty><ram:ID schemeID="0088">4012345000008</ram:ID>'
    + '<ram:GlobalID schemeID="0088">4012345000009</ram:GlobalID><ram:Name>Warehouse 3</ram:Name></ram:ShipToTradeParty></ram:ApplicableHeaderTradeDelivery>');
  const invoice = parseCiiInvoice(xml);
  assert.deepEqual(invoice.delivery_party, { party_ids: [{ id: "4012345000008", scheme: "0088" }, { id: "4012345000009", scheme: "0088" }] });
  assert.deepEqual(idRules(checkInvoice(invoice)), [["INV-062", "/delivery_party/party_ids/0/id", "error"]]);
  assert.equal(parseCiiInvoice(CII).delivery_party, undefined);
});

test("a CII item id (BT-157) filed under a Peppol COMMON scheme meets that scheme's rule; 0160 GTINs are left alone", () => {
  const item = (gid) => CII.replace("<ram:SpecifiedTradeProduct><ram:Name>", `<ram:SpecifiedTradeProduct>${gid}<ram:Name>`);
  // A mistyped check digit under 0088 (the GLN scheme): R040's mod-10 test fails, the file bounces.
  const typo = parseCiiInvoice(item('<ram:GlobalID schemeID="0088">4012345000008</ram:GlobalID>'));
  assert.deepEqual(typo.lines[0].scheme_ids, [{ id: "4012345000008", scheme: "0088" }]);
  const findings = checkInvoice(typo);
  assert.deepEqual(idRules(findings), [["INV-062", "/lines/0/scheme_ids/0/id", "error"]]);
  assert.match(findings.find((f) => f.rule === "INV-062").message, /^Line 1 identifier does not match the 0088 format/);
  // A valid EAN-13 under 0088 passes Peppol's mod-10 test; the same digits under 0160 are not a COMMON scheme.
  assert.deepEqual(idRules(checkInvoice(parseCiiInvoice(item('<ram:GlobalID schemeID="0088">4012345000009</ram:GlobalID>')))), []);
  assert.deepEqual(idRules(checkInvoice(parseCiiInvoice(item('<ram:GlobalID schemeID="0160">4012345000008</ram:GlobalID>')))), []);
  assert.equal(parseCiiInvoice(CII).lines[0].scheme_ids, undefined);
});

test("UBL line-level parties (Delivery/DeliveryParty, an Item's ManufacturerParty) meet Peppol's COMMON id rules; item ids do not", () => {
  const delivery = (inner) => UBL.replace('<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount>\n    <cac:Item>',
    `<cbc:LineExtensionAmount currencyID="EUR">200.00</cbc:LineExtensionAmount><cac:Delivery><cac:DeliveryParty>${inner}</cac:DeliveryParty></cac:Delivery>\n    <cac:Item>`);
  // A mistyped GLN check digit on a line's deliver-to party: R040 fails in Peppol, so INV-062.
  const typo = parseUblInvoice(delivery('<cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification>'));
  assert.deepEqual(typo.lines[0].scheme_ids, [{ id: "4012345000008", scheme: "0088" }]);
  const findings = checkInvoice(typo);
  assert.deepEqual(idRules(findings), [["INV-062", "/lines/0/scheme_ids/0/id", "error"]]);
  assert.match(findings.find((f) => f.rule === "INV-062").message, /^Line 1 identifier/);
  // Legal registration under 0007 (Swedish org number, Luhn): a bad one fails; a good one passes.
  const legal = (v) => delivery(`<cac:PartyLegalEntity><cbc:RegistrationName>Store 12 AB</cbc:RegistrationName><cbc:CompanyID schemeID="0007">${v}</cbc:CompanyID></cac:PartyLegalEntity>`);
  assert.deepEqual(idRules(checkInvoice(parseUblInvoice(legal("5560360795")))), [["INV-062", "/lines/0/scheme_ids/0/id", "error"]]);
  assert.deepEqual(idRules(checkInvoice(parseUblInvoice(legal("5560360793")))), []);
  // An Item's ManufacturerParty is reached the same way.
  const maker = parseUblInvoice(UBL.replace("</cac:ClassifiedTaxCategory>",
    '</cac:ClassifiedTaxCategory><cac:ManufacturerParty><cac:PartyIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:PartyIdentification></cac:ManufacturerParty>'));
  assert.deepEqual(idRules(checkInvoice(maker)), [["INV-062", "/lines/0/scheme_ids/0/id", "error"]]);
  // A GTIN as the item's standard id is outside every COMMON context, even under 0088.
  const gtin = parseUblInvoice(UBL.replace("<cbc:Name>Consulting</cbc:Name>",
    '<cbc:Name>Consulting</cbc:Name><cac:StandardItemIdentification><cbc:ID schemeID="0088">4012345000008</cbc:ID></cac:StandardItemIdentification>'));
  assert.equal(gtin.lines[0].scheme_ids, undefined);
  assert.equal(parseUblInvoice(UBL).lines[0].scheme_ids, undefined);
});
