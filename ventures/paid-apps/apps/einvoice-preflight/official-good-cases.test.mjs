// Two false failures found by scoring the rule authors' own good-case examples
// (eval/phive-corpus.mjs --good, 2026-11-11). Made-up invoices; the shapes are the ones
// ANAF's CIUS-RO examples and SimplerInvoicing's BR-NL warning examples use.
import test from "node:test";
import assert from "node:assert/strict";
import { parseUblInvoice } from "./ubl.mjs";
import { checkInvoice } from "./checks.mjs";
import { isBlocking, severityLabel, summarizePreflight, buildJsonReport, buildMarkdown } from "./report.mjs";

const party = (taxSchemes) => `<cac:Party>
  <cac:PostalAddress><cbc:StreetName>Str. Exemplu 1</cbc:StreetName><cbc:CityName>Bucuresti</cbc:CityName>
    <cac:Country><cbc:IdentificationCode>RO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
  ${taxSchemes}
  <cac:PartyLegalEntity><cbc:RegistrationName>Ministerul Exemplu</cbc:RegistrationName></cac:PartyLegalEntity>
</cac:Party>`;

const ubl = (customerTaxSchemes) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>F1</cbc:ID><cbc:IssueDate>2026-11-11</cbc:IssueDate><cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>RON</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>${party('<cac:PartyTaxScheme><cbc:CompanyID>RO12345674</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>')}</cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>${party(customerTaxSchemes)}</cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="RON">19.00</cbc:TaxAmount></cac:TaxTotal>
  <cac:LegalMonetaryTotal><cbc:LineExtensionAmount currencyID="RON">100.00</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="RON">100.00</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="RON">119.00</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="RON">119.00</cbc:PayableAmount></cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="C62">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="RON">100.00</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Servicii</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="RON">100.00</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
</Invoice>`;

test("CIUS-RO: a bare fiscal code in an unlabelled tax scheme is not read as a VAT number", () => {
  const inv = parseUblInvoice(ubl("<cac:PartyTaxScheme><cbc:CompanyID>8609468</cbc:CompanyID><cac:TaxScheme></cac:TaxScheme></cac:PartyTaxScheme>"));
  assert.equal(inv.customer.vat_id, undefined);
  assert.ok(!checkInvoice(inv).some((e) => e.rule === "INV-022"), "no INV-022 on a non-VAT buyer");
});

test("an unlabelled scheme with a country-prefixed number is still a VAT number", () => {
  const inv = parseUblInvoice(ubl("<cac:PartyTaxScheme><cbc:CompanyID>RO76543210</cbc:CompanyID><cac:TaxScheme></cac:TaxScheme></cac:PartyTaxScheme>"));
  assert.equal(inv.customer.vat_id, "RO76543210");
});

test("a bare number under TaxScheme/ID VAT is still checked (BR-CO-9 reads that one)", () => {
  const inv = parseUblInvoice(ubl("<cac:PartyTaxScheme><cbc:CompanyID>8609468</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>"));
  assert.equal(inv.customer.vat_id, "8609468");
  assert.ok(checkInvoice(inv).some((e) => e.rule === "INV-022"));
});

test("an official rule flagged warning is listed but does not fail the file", () => {
  const warning = { rule: "BR-NL-28-2", message: "m", fix: "f", path: "/x", severity: "warning" };
  const fatal = { rule: "BR-NL-2", message: "m", fix: "f", path: "/y", severity: "fatal" };
  assert.equal(isBlocking(warning), false);
  assert.equal(isBlocking(fatal), true);
  assert.equal(severityLabel(warning), "warning");
  assert.equal(severityLabel(fatal), "");
  const onlyWarning = { reports: [{ file: "a.xml", errors: [warning] }], readErrors: [] };
  assert.equal(summarizePreflight(onlyWarning).status, "pass");
  assert.equal(buildJsonReport(onlyWarning).exit_code, 0);
  assert.match(buildMarkdown(onlyWarning), /_warning_ \*\*BR-NL-28-2\*\*/);
  const both = { reports: [{ file: "a.xml", errors: [warning, fatal] }], readErrors: [] };
  assert.equal(summarizePreflight(both).status, "fail");
  assert.equal(buildJsonReport(both).exit_code, 1);
});

test("a long-repeat regex is rewritten to the same whole-string length test", async () => {
  const { rewriteLongRepeat } = await import("./plain-schematron.mjs");
  assert.equal(rewriteLongRepeat("matches(.,'^(.{1,6826666})$')"),
    "(string-length(.) ge 1 and string-length(.) le 6826666 and not(matches(., '[\\n\\r]')))");
  assert.equal(rewriteLongRepeat("matches(.,'^(.{1,200})$')"), "matches(.,'^(.{1,200})$')"); // small bounds untouched
});

test("CIUS-PT: an invoice with an attachment finishes (DT-CIUS-PT-111.1 used to hang)", async (t) => {
  const { runPlain, plainAvailable } = await import("./plain-node.mjs");
  const { existsSync, readFileSync } = await import("node:fs");
  if (!plainAvailable() || !existsSync(new URL("./plain/cius-pt-ubl.json", import.meta.url))) return t.skip("npm i --no-save slimdom fontoxpath");
  const attachment = `<cac:AdditionalDocumentReference><cbc:ID>ANEXO-1</cbc:ID><cac:Attachment>
    <cbc:EmbeddedDocumentBinaryObject mimeCode="application/pdf" filename="anexo.pdf">${"QUJD".repeat(2000)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment></cac:AdditionalDocumentReference>`;
  const xml = readFileSync(new URL("./examples/pt-invoice.xml", import.meta.url), "utf8").replace("<cac:AccountingSupplierParty>", `${attachment}<cac:AccountingSupplierParty>`);
  const started = Date.now();
  const r = await runPlain(xml);
  assert.equal(r.status, "ok");
  assert.ok(r.sets.includes("cius-pt"), "CIUS-PT add-on ran");
  assert.ok(!r.findings.some((f) => f.rule === "DT-CIUS-PT-111.1"), "an 8,000-character attachment is within 1..6826666");
  assert.ok(!(r.skipped || []).includes("DT-CIUS-PT-111.1"), "checked, not skipped");
  assert.ok(Date.now() - started < 30_000, `took ${Date.now() - started} ms`);
});
