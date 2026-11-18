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
    { scheme: "0208", id: "0123456749" },
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

// Red-team run 2026-11-12: three mutants of endpoint.mjs escaped the suite.
test("a GLN of the wrong length is INV-041 before its check digit is read", () => {
  for (const id of ["123456789012", "12345678901280", "1"]) {
    const findings = inspectPartyEndpoint({ endpoint: { scheme: "0088", id } }, "customer");
    assert.deepEqual(findings.map((item) => item.rule), ["INV-041"], id);
  }
});

test("0212 (Finnish business id) takes 8 or 9 characters, digits before the last", () => {
  for (const id of ["1234567-8", "12345678", "1234567-89"]) {
    assert.deepEqual(inspectPartyEndpoint({ endpoint: { scheme: "0212", id } }, "supplier"), [], id);
  }
  for (const id of ["1234567", "1234567890", "12345A7-8"]) {
    const findings = inspectPartyEndpoint({ endpoint: { scheme: "0212", id } }, "supplier");
    assert.deepEqual(findings.map((item) => item.rule), ["INV-041"], id);
  }
});

test("a party that is not an object gives no finding and does not throw", () => {
  for (const party of [null, undefined, "ACME", 42, false]) {
    assert.deepEqual(inspectPartyEndpoint(party, "customer"), []);
  }
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

// 2026-11-17: the checksummed schemes follow OpenPeppol's PEPPOL-COMMON rules
// (eval/endpoint-peppol-differential.mjs: 0 disagreements on 21,264 ids). Before,
// 0208/0192/0007 were only digit counts and 0151/0096/0198 unchecked.
import { readFileSync } from "node:fs";
const PEPPOL_CASES = JSON.parse(readFileSync(new URL("./tests/endpoint_peppol_cases.json", import.meta.url), "utf8"));

test("Peppol-valid ids in the checksummed schemes pass", () => {
  for (const [scheme, id] of PEPPOL_CASES.valid) {
    assert.deepEqual(inspectPartyEndpoint({ endpoint: { scheme, id } }, "customer"), [], `${scheme} ${id}`);
  }
});

test("ids OpenPeppol rejects are INV-041, with the scheme's shape in the fix and no id echoed", () => {
  for (const [scheme, id] of PEPPOL_CASES.invalid) {
    const findings = inspectPartyEndpoint({ endpoint: { scheme, id } }, "supplier");
    assert.deepEqual(findings.map((item) => item.rule), ["INV-041"], `${scheme} ${id}`);
    assert.equal(findings[0].message.includes(id), false);
    assert.equal(findings[0].fix.includes(id), false);
    assert.match(findings[0].fix, /digits/);
  }
});

test("a Belgian KBO number with a wrong check pair is caught in a UBL file too", () => {
  const xml = UBL_WITH_ENDPOINTS
    .replace('<cbc:EndpointID schemeID="0088">1234567890128</cbc:EndpointID>', '<cbc:EndpointID schemeID="0208">0403170702</cbc:EndpointID>')
    .replace('<cbc:EndpointID schemeID="0088">1234567890129</cbc:EndpointID>', '<cbc:EndpointID schemeID="0208">0403170701</cbc:EndpointID>');
  const findings = inspectPartyEndpoints(parseUblInvoice(xml));
  assert.deepEqual(findings.map((item) => [item.rule, item.path]), [["INV-041", "/supplier/endpoint/id"]]);
});

test("EAS codes in EN 16931's BR-CL-25 list are known (0225 FRCTC, 0217 KVK establishment)", () => {
  for (const scheme of ["0225", "0217", "0147", "0170", "0194", "0203", "0205", "9960", "AN", "AQ", "AS", "AU"]) {
    assert.equal(looksLikeKnownScheme(scheme), true, scheme);
    // 0217 has a format of its own (PEPPOL-COMMON-R057, 12 digits), so this id draws the
    // INV-061 warning there; what matters here is that no scheme draws INV-039.
    const rules = inspectPartyEndpoint({ endpoint: { scheme, id: "315143296_1" } }, "customer").map((f) => f.rule);
    assert.deepEqual(rules, scheme === "0217" ? ["INV-061"] : [], scheme);
  }
});

// 2026-11-17: OpenPeppol's warning-level PEPPOL-COMMON rules (R044, R045, R047, R054,
// R055, R056-1, R057) as INV-061, a warning (eval/endpoint-peppol-warnings.mjs: 0
// disagreements on 23,999 ids). Before, these schemes took any non-empty text.
test("ids in Peppol's warning-level formats pass silently", () => {
  for (const [scheme, id] of [
    ["0201", "UFABCD"], ["0201", "a1b2c3"],
    ["0210", "RSSMRA85T10A562S"], ["0210", "00743110157"],
    ["0211", "IT00743110157"], ["0211", "it00743110157"], ["0211", "00743110157"],
    ["0106", "12345678"], ["0190", "00000001234567890000"],
    ["9944", "NL123456789B12"], ["0217", "123456789012"],
  ]) {
    assert.deepEqual(inspectPartyEndpoint({ endpoint: { scheme, id } }, "customer"), [], `${scheme} ${id}`);
  }
});

test("ids Peppol warns on are INV-061 warnings, naming the Peppol rule, never echoing the id", () => {
  for (const [scheme, id, rule] of [
    ["0201", "UFABC", "R044"], ["0201", "UF-ABC", "R044"],
    ["0210", "RSSMRA85T10A56", "R045"], ["0210", "RSSMRA8OT10A562S", "R045"],
    ["0211", "IT00743110158", "R047"], ["0211", "IT0074311015", "R047"],
    ["0106", "7654321", "R054"], ["0106", "KVK87654321", "R054"],
    ["0190", "0000 0001 2345 6789 0000", "R055"],
    ["9944", "NL987654321b12", "R056-1"], ["9944", "987654321B12", "R056-1"],
    ["0217", "98765432109", "R057"],
  ]) {
    const findings = inspectPartyEndpoint({ endpoint: { scheme, id } }, "supplier");
    assert.deepEqual(findings.map((f) => [f.rule, f.severity]), [["INV-061", "warning"]], `${scheme} ${id}`);
    assert.match(findings[0].message, new RegExp(`PEPPOL-COMMON-${rule}\\b`));
    assert.equal(findings[0].message.includes(id) || findings[0].fix.includes(id), false);
  }
});

test("stricter than Peppol on purpose: an 11-digit codice fiscale or partita IVA needs its check digit", () => {
  for (const [scheme, id] of [["0210", "00743110158"], ["0211", "00743110158"], ["0211", "IT-00743110157"]]) {
    assert.deepEqual(inspectPartyEndpoint({ endpoint: { scheme, id } }, "customer").map((f) => f.rule), ["INV-061"], `${scheme} ${id}`);
  }
});

test("INV-061 reaches checkInvoice as a warning, and a blocking INV-041 is not doubled by it", () => {
  const warned = checkInvoice(invoice({ scheme: "0106", id: "1234567" })).filter((f) => f.rule.startsWith("INV-04") || f.rule === "INV-061");
  assert.deepEqual(warned.map((f) => [f.rule, f.severity]), [["INV-061", "warning"]]);
  const blocked = inspectPartyEndpoint({ endpoint: { scheme: "0190", id: "1234" } }, "customer").map((f) => f.rule);
  assert.deepEqual(blocked, ["INV-041"]);
});
