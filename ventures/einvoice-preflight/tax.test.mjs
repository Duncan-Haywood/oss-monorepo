import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectTaxExemption, looksLikeExemptionCategory, normalizeTaxCategory } from "./tax.mjs";
import { parseUblInvoice } from "./ubl.mjs";

function invoice(overrides = {}) {
  return {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
    ...overrides,
  };
}

function zeroLine(overrides = {}) {
  return {
    description: "Intra-community",
    quantity: 1,
    unit_price: 200,
    tax_percent: 0,
    net: 200,
    ...overrides,
  };
}

const UBL_ZERO = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-ZERO</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">0</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount>200</cbc:TaxableAmount><cbc:TaxAmount>0</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>K</cbc:ID><cbc:Percent>0</cbc:Percent>
        <cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>Intra-community supply</cbc:TaxExemptionReason>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Work</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>K</cbc:ID><cbc:Percent>0</cbc:Percent>
        <cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>
        <cbc:TaxExemptionReason>Intra-community supply</cbc:TaxExemptionReason>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount>200</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>200</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("normalize category IDs", () => {
  assert.equal(normalizeTaxCategory(" k "), "K");
  assert.equal(normalizeTaxCategory("AE"), "AE");
  assert.equal(normalizeTaxCategory(""), null);
});

test("exemption categories", () => {
  for (const code of ["E", "AE", "K", "G", "O", "Z", "e"]) {
    assert.equal(looksLikeExemptionCategory(code), true, code);
  }
  assert.equal(looksLikeExemptionCategory("S"), false);
});

test("taxed line needs no reason", () => {
  assert.deepEqual(inspectTaxExemption(invoice()), []);
});

test("zero percent without reason is INV-035", () => {
  const findings = inspectTaxExemption(invoice({
    lines: [zeroLine()],
    totals: { net: 200, tax: 0, gross: 200 },
  }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-035"]);
  assert.equal(findings[0].path, "/lines/0/tax_reason");
  assert.ok(!findings[0].message.includes("Intra-community"));
});

test("line reason or code passes", () => {
  assert.deepEqual(inspectTaxExemption(invoice({
    lines: [zeroLine({ tax_reason: "Intra-community supply" })],
    totals: { net: 200, tax: 0, gross: 200 },
  })), []);
  assert.deepEqual(inspectTaxExemption(invoice({
    lines: [zeroLine({ tax_reason_code: "VATEX-EU-IC" })],
    totals: { net: 200, tax: 0, gross: 200 },
  })), []);
});

test("document reason covers zero lines", () => {
  assert.deepEqual(inspectTaxExemption(invoice({
    tax_exemption_reason: "Intra-community supply",
    lines: [zeroLine()],
    totals: { net: 200, tax: 0, gross: 200 },
  })), []);
});

test("empty reason is INV-036 and does not echo", () => {
  const findings = inspectTaxExemption(invoice({
    lines: [zeroLine({ tax_reason: "   " })],
    totals: { net: 200, tax: 0, gross: 200 },
  }));
  assert.ok(findings.some((item) => item.rule === "INV-036"));
  assert.ok(findings.some((item) => item.rule === "INV-035"));
  assert.ok(findings.every((item) => !item.message.includes("Intra-community")));
});

test("zero percent fails preflight without reason", () => {
  const errors = checkInvoice(invoice({
    lines: [zeroLine()],
    totals: { net: 200, tax: 0, gross: 200 },
  }));
  assert.ok(errors.some((item) => item.rule === "INV-035"));
});

test("UBL zero-rated maps reason and stays clean", () => {
  const mapped = parseUblInvoice(UBL_ZERO);
  assert.equal(mapped.lines[0].tax_percent, 0);
  assert.equal(mapped.lines[0].tax_category, "K");
  assert.equal(mapped.lines[0].tax_reason_code, "VATEX-EU-IC");
  assert.equal(mapped.tax_exemption_reason_code, "VATEX-EU-IC");
  assert.deepEqual(checkInvoice(mapped), []);
});

test("UBL zero-rated without reason is INV-035", () => {
  const source = UBL_ZERO
    .replaceAll("<cbc:TaxExemptionReasonCode>VATEX-EU-IC</cbc:TaxExemptionReasonCode>", "")
    .replaceAll("<cbc:TaxExemptionReason>Intra-community supply</cbc:TaxExemptionReason>", "");
  const errors = checkInvoice(parseUblInvoice(source));
  assert.ok(errors.some((item) => item.rule === "INV-035"));
  assert.ok(errors.every((item) => !item.message.includes("VATEX")));
  assert.ok(errors.every((item) => !item.message.includes("Intra-community")));
});
