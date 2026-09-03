import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectInvoicePeriod, parseIsoDate } from "./period.mjs";
import { parseUblInvoice } from "./ubl.mjs";

function invoice(period, includePeriod = true) {
  const document = {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
  if (includePeriod) document.period = period;
  return document;
}

const UBL_WITH_PERIOD = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-P</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate></cac:InvoicePeriod>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine>
    <cbc:InvoicedQuantity>2</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:InvoicePeriod><cbc:StartDate>2026-08-01</cbc:StartDate><cbc:EndDate>2026-08-15</cbc:EndDate></cac:InvoicePeriod>
    <cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("parseIsoDate accepts the extended form only", () => {
  assert.equal(parseIsoDate("2026-07-01").toISOString().slice(0, 10), "2026-07-01");
  assert.equal(parseIsoDate("20260701"), null);
  assert.equal(parseIsoDate("2026-13-01"), null);
  assert.equal(parseIsoDate("2026-02-30"), null);
  assert.equal(parseIsoDate(null), null);
});

test("omitted period is not a finding", () => {
  assert.deepEqual(inspectInvoicePeriod(invoice(undefined, false)), []);
  assert.deepEqual(inspectInvoicePeriod(invoice(null)), []);
  assert.deepEqual(inspectInvoicePeriod(invoice("")), []);
});

test("complete period produces no finding", () => {
  assert.deepEqual(inspectInvoicePeriod(invoice({ start: "2026-07-01", end: "2026-07-31" })), []);
  assert.deepEqual(inspectInvoicePeriod(invoice({ start: "2026-07-01", end: "2026-07-01" })), []);
});

test("string period is INV-042", () => {
  const findings = inspectInvoicePeriod(invoice("2026-07-01"));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-042"]);
  assert.equal(findings[0].path, "/period");
});

test("missing start is INV-042", () => {
  const findings = inspectInvoicePeriod(invoice({ end: "2026-07-31" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-042"]);
  assert.equal(findings[0].path, "/period/start");
});

test("missing end is INV-042", () => {
  const findings = inspectInvoicePeriod(invoice({ start: "2026-07-01" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-042"]);
  assert.equal(findings[0].path, "/period/end");
});

test("invalid start is INV-042 and does not echo the date", () => {
  const findings = inspectInvoicePeriod(invoice({ start: "2026-13-01", end: "2026-07-31" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-042"]);
  assert.equal(findings[0].path, "/period/start");
  assert.ok(!findings[0].message.includes("2026-13-01"));
  assert.ok(!findings[0].fix.includes("2026-13-01"));
});

test("end before start is INV-043 and does not echo the dates", () => {
  const findings = inspectInvoicePeriod(invoice({ start: "2026-07-31", end: "2026-07-01" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-043"]);
  assert.equal(findings[0].path, "/period/end");
  assert.ok(!findings[0].message.includes("2026-07-31"));
  assert.ok(!findings[0].message.includes("2026-07-01"));
});

test("invoice without period stays clean", () => {
  assert.deepEqual(checkInvoice(invoice(undefined, false)), []);
});

test("good period keeps a clean invoice clean", () => {
  assert.deepEqual(checkInvoice(invoice({ start: "2026-07-01", end: "2026-07-31" })), []);
});

test("reversed period fails preflight", () => {
  const errors = checkInvoice(invoice({ start: "2026-07-31", end: "2026-07-01" }));
  assert.ok(errors.some((item) => item.rule === "INV-043"));
  assert.ok(errors.some((item) => item.path === "/period/end"));
});

test("UBL invoice period is mapped and line period is ignored", () => {
  const parsed = parseUblInvoice(UBL_WITH_PERIOD);
  assert.deepEqual(parsed.period, { start: "2026-07-01", end: "2026-07-31" });
  assert.deepEqual(checkInvoice(parsed), []);
});

test("UBL without invoice-level period stays clean", () => {
  const source = UBL_WITH_PERIOD.replace(
    "<cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate></cac:InvoicePeriod>",
    "",
  );
  const parsed = parseUblInvoice(source);
  assert.equal("period" in parsed, false);
  assert.deepEqual(checkInvoice(parsed), []);
});

test("UBL period missing end is INV-042", () => {
  const source = UBL_WITH_PERIOD.replace(
    "<cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate></cac:InvoicePeriod>",
    "<cac:InvoicePeriod><cbc:StartDate>2026-07-01</cbc:StartDate></cac:InvoicePeriod>",
  );
  const parsed = parseUblInvoice(source);
  assert.deepEqual(parsed.period, { start: "2026-07-01" });
  const errors = checkInvoice(parsed);
  assert.ok(errors.some((item) => item.rule === "INV-042" && item.path === "/period/end"));
});

test("UBL reversed period is INV-043", () => {
  const source = UBL_WITH_PERIOD.replace(
    "<cbc:StartDate>2026-07-01</cbc:StartDate><cbc:EndDate>2026-07-31</cbc:EndDate>",
    "<cbc:StartDate>2026-07-31</cbc:StartDate><cbc:EndDate>2026-07-01</cbc:EndDate>",
  );
  const errors = checkInvoice(parseUblInvoice(source));
  assert.ok(errors.some((item) => item.rule === "INV-043" && item.path === "/period/end"));
  assert.ok(errors.every((item) => !item.message.includes("2026-07-31")));
  assert.ok(errors.every((item) => !item.message.includes("2026-07-01")));
});
