import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectTaxBreakdown } from "./breakdown.mjs";
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

function mixed(overrides = {}) {
  return invoice({
    lines: [
      { description: "Consulting", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 },
      { description: "Books", quantity: 1, unit_price: 100, tax_percent: 7, net: 100 },
    ],
    totals: { net: 300, tax: 45, gross: 345 },
    tax_breakdown: [
      { tax_percent: 19, taxable: 200, tax: 38 },
      { tax_percent: 7, taxable: 100, tax: 7 },
    ],
    ...overrides,
  });
}

const UBL_MIXED = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-MIX</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">45</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount>200</cbc:TaxableAmount><cbc:TaxAmount>38</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal><cbc:TaxableAmount>100</cbc:TaxableAmount><cbc:TaxAmount>7</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>AA</cbc:ID><cbc:Percent>7</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Consulting</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:InvoiceLine><cbc:InvoicedQuantity>1</cbc:InvoicedQuantity><cbc:LineExtensionAmount>100</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Books</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>AA</cbc:ID><cbc:Percent>7</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>300</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>345</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("single rate without breakdown is ok", () => {
  assert.deepEqual(inspectTaxBreakdown(invoice()), []);
});

test("mixed rates without breakdown is INV-037", () => {
  const doc = mixed();
  delete doc.tax_breakdown;
  const findings = inspectTaxBreakdown(doc);
  assert.deepEqual(findings.map((item) => item.rule), ["INV-037"]);
  assert.equal(findings[0].path, "/tax_breakdown");
});

test("matching breakdown is ok", () => {
  assert.deepEqual(inspectTaxBreakdown(mixed()), []);
  assert.deepEqual(checkInvoice(mixed()), []);
});

test("wrong taxable is INV-038", () => {
  const findings = inspectTaxBreakdown(mixed({
    tax_breakdown: [
      { tax_percent: 19, taxable: 150, tax: 28.5 },
      { tax_percent: 7, taxable: 100, tax: 7 },
    ],
  }));
  assert.ok(findings.some((item) => item.rule === "INV-038" && item.path === "/tax_breakdown/0/taxable"));
});

test("tax not equal to rate is INV-038", () => {
  const findings = inspectTaxBreakdown(mixed({
    tax_breakdown: [
      { tax_percent: 19, taxable: 200, tax: 20 },
      { tax_percent: 7, taxable: 100, tax: 7 },
    ],
  }));
  assert.ok(findings.some((item) => item.path === "/tax_breakdown/0/tax"));
});

test("missing rate row is INV-038", () => {
  const findings = inspectTaxBreakdown(mixed({
    tax_breakdown: [{ tax_percent: 19, taxable: 200, tax: 38 }],
  }));
  assert.ok(findings.some((item) => item.message.includes("missing a row")));
});

test("findings do not echo line text", () => {
  const doc = mixed();
  delete doc.tax_breakdown;
  doc.lines[0].description = "SECRET-LINE";
  const findings = inspectTaxBreakdown(doc);
  assert.ok(findings.every((item) => !item.message.includes("SECRET-LINE") && !item.fix.includes("SECRET-LINE")));
});

test("checkInvoice flags mixed without breakdown", () => {
  const doc = mixed();
  delete doc.tax_breakdown;
  assert.ok(checkInvoice(doc).some((item) => item.rule === "INV-037"));
});

test("UBL mixed maps and passes", () => {
  const mapped = parseUblInvoice(UBL_MIXED);
  assert.equal(mapped.tax_breakdown.length, 2);
  assert.equal(mapped.tax_breakdown[0].tax_percent, 19);
  assert.equal(mapped.tax_breakdown[1].tax_percent, 7);
  assert.equal(mapped.tax_breakdown[0].tax_category, "S");
  assert.deepEqual(checkInvoice(mapped), []);
});

test("UBL mixed without subtotals is INV-037", () => {
  const source = UBL_MIXED.replace(
    `<cac:TaxSubtotal><cbc:TaxableAmount>200</cbc:TaxableAmount><cbc:TaxAmount>38</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>19</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
    <cac:TaxSubtotal><cbc:TaxableAmount>100</cbc:TaxableAmount><cbc:TaxAmount>7</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>AA</cbc:ID><cbc:Percent>7</cbc:Percent></cac:TaxCategory>
    </cac:TaxSubtotal>
`,
    "",
  );
  const mapped = parseUblInvoice(source);
  assert.equal(mapped.tax_breakdown, undefined);
  assert.ok(checkInvoice(mapped).some((item) => item.rule === "INV-037"));
});
