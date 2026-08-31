import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import {
  inspectPartyEndpoint,
  inspectPartyEndpoints,
  looksLikeKnownScheme,
  normalizeEndpointId,
  normalizeScheme,
} from "./endpoint.mjs";
import { parseUblInvoice } from "./ubl.mjs";

function invoice(customerEndpoint, supplierEndpoint) {
  const document = {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
  if (supplierEndpoint !== undefined) document.supplier.endpoint = supplierEndpoint;
  if (customerEndpoint !== undefined) document.customer.endpoint = customerEndpoint;
  return document;
}

const UBL_WITH_ENDPOINTS = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-EP</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0088">1234567890128</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0088">1234567890129</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("normalizeScheme and normalizeEndpointId", () => {
  assert.equal(normalizeScheme(" 0088 "), "0088");
  assert.equal(normalizeScheme("em"), "EM");
  assert.equal(normalizeScheme("   "), null);
  assert.equal(normalizeEndpointId("  ap@buyer.example  "), "ap@buyer.example");
  assert.equal(normalizeEndpointId("   "), null);
  assert.equal(looksLikeKnownScheme("0088"), true);
  assert.equal(looksLikeKnownScheme("088"), false);
});

test("valid published endpoints produce no finding", () => {
  const valid = [
    { scheme: "0088", id: "1234567890128" },
    { scheme: "0088", id: "0614141000005" },
    { scheme: "EM", id: "ap@customer.example" },
    { scheme: "0192", id: "981276957" },
    { scheme: "0208", id: "0123456789" },
    { scheme: "0184", id: "12345678" },
    { scheme: "9930", id: "DE136695976" },
  ];
  for (const endpoint of valid) {
    assert.deepEqual(inspectPartyEndpoint({ endpoint }, "customer"), []);
    assert.deepEqual(checkInvoice(invoice(endpoint)), []);
  }
});

test("GLN checksum failure does not echo the number", () => {
  const findings = inspectPartyEndpoint({ endpoint: { scheme: "0088", id: "1234567890129" } }, "customer");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-041"]);
  assert.equal(findings[0].path, "/customer/endpoint/id");
  assert.equal(findings[0].message.includes("1234567890129"), false);
  assert.match(findings[0].message, /0088/);
});

test("unknown scheme is INV-039", () => {
  const findings = inspectPartyEndpoint({ endpoint: { scheme: "088", id: "1234567890128" } }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-039"]);
  assert.equal(findings[0].path, "/supplier/endpoint/scheme");
});

test("missing scheme is INV-039", () => {
  const findings = inspectPartyEndpoint({ endpoint: { id: "1234567890128" } }, "customer");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-039"]);
});

test("empty id is INV-040", () => {
  const findings = inspectPartyEndpoint({ endpoint: { scheme: "0088", id: "  " } }, "customer");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-040"]);
});

test("email without at is INV-041 and does not echo", () => {
  const findings = inspectPartyEndpoint({ endpoint: { scheme: "EM", id: "not-an-email" } }, "customer");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-041"]);
  assert.equal(findings[0].message.includes("not-an-email"), false);
});

test("omitted endpoint stays silent", () => {
  assert.deepEqual(inspectPartyEndpoint({}, "customer"), []);
  assert.deepEqual(inspectPartyEndpoints({}), []);
  assert.deepEqual(checkInvoice(invoice()), []);
});

test("UBL EndpointID and schemeID are mapped", () => {
  const mapped = parseUblInvoice(UBL_WITH_ENDPOINTS);
  assert.deepEqual(mapped.supplier.endpoint, { scheme: "0088", id: "1234567890128" });
  assert.deepEqual(mapped.customer.endpoint, { scheme: "0088", id: "1234567890129" });
  assert.ok(checkInvoice(mapped).some((item) => item.rule === "INV-041" && item.path === "/customer/endpoint/id"));
  assert.equal(checkInvoice(mapped).some((item) => item.message.includes("1234567890129")), false);
});

test("UBL without EndpointID stays clean", () => {
  const source = UBL_WITH_ENDPOINTS
    .replace('<cbc:EndpointID schemeID="0088">1234567890128</cbc:EndpointID>', "")
    .replace('<cbc:EndpointID schemeID="0088">1234567890129</cbc:EndpointID>', "");
  const mapped = parseUblInvoice(source);
  assert.equal(mapped.supplier.endpoint, undefined);
  assert.equal(mapped.customer.endpoint, undefined);
  assert.deepEqual(checkInvoice(mapped), []);
});
