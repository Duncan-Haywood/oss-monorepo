import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectDocumentType, normalizeDocumentType } from "./document.mjs";
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

const UBL_CREDIT = `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>CN-1</cbc:ID><cbc:IssueDate>2026-08-25</cbc:IssueDate>
  <cbc:CreditNoteTypeCode>381</cbc:CreditNoteTypeCode>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-1001</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:CreditNoteLine><cbc:CreditedQuantity>2</cbc:CreditedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:CreditNoteLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</CreditNote>`;

test("normalize names and UNCL codes", () => {
  assert.equal(normalizeDocumentType("credit_note"), "credit_note");
  assert.equal(normalizeDocumentType("Credit-Note"), "credit_note");
  assert.equal(normalizeDocumentType(381), "credit_note");
  assert.equal(normalizeDocumentType("380"), "invoice");
  assert.equal(normalizeDocumentType(""), null);
  assert.equal(normalizeDocumentType("proforma"), "invalid");
});

test("ordinary invoice needs no original", () => {
  assert.deepEqual(inspectDocumentType(invoice()), []);
  assert.deepEqual(inspectDocumentType(invoice({ document_type: "invoice" })), []);
});

test("unknown type is INV-032", () => {
  const findings = inspectDocumentType(invoice({ document_type: "proforma" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-032"]);
  assert.equal(findings[0].path, "/document_type");
  assert.equal(findings[0].message.includes("proforma"), false);
});

test("credit note without original is INV-033", () => {
  const findings = inspectDocumentType(invoice({ document_type: "credit_note" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-033"]);
  assert.equal(findings[0].path, "/original_invoice");
});

test("credit note with original passes", () => {
  assert.deepEqual(
    inspectDocumentType(invoice({ document_type: "credit_note", original_invoice: "INV-1001" })),
    [],
  );
});

test("self-reference is INV-034 and does not echo the number", () => {
  const findings = inspectDocumentType(invoice({
    invoice_number: "CN-SELF",
    document_type: "credit_note",
    original_invoice: "cn-self",
  }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-034"]);
  assert.equal(findings.every((item) => !item.message.includes("CN-SELF")), true);
});

test("invoice envelope with credit type code is INV-034", () => {
  const findings = inspectDocumentType(invoice({ document_type: "invoice", document_code: "381" }));
  const rules = findings.map((item) => item.rule);
  assert.ok(rules.includes("INV-034"));
  assert.ok(rules.includes("INV-033"));
});

test("checkInvoice wires document findings", () => {
  assert.deepEqual(checkInvoice(invoice()), []);
  assert.ok(checkInvoice(invoice({ document_type: "credit_note" })).some((item) => item.rule === "INV-033"));
  assert.deepEqual(
    checkInvoice(invoice({ document_type: "credit_note", original_invoice: "INV-1001" })),
    [],
  );
});

test("UBL credit note maps type and billing reference", () => {
  const mapped = parseUblInvoice(UBL_CREDIT);
  assert.equal(mapped.document_type, "credit_note");
  assert.equal(mapped.document_code, "381");
  assert.equal(mapped.original_invoice, "INV-1001");
  assert.deepEqual(checkInvoice(mapped), []);
});

test("UBL credit note without reference is INV-033", () => {
  const source = UBL_CREDIT.replace(
    "<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>INV-1001</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>",
    "",
  );
  const mapped = parseUblInvoice(source);
  assert.equal("original_invoice" in mapped, false);
  const errors = checkInvoice(mapped);
  assert.ok(errors.some((item) => item.rule === "INV-033"));
  assert.ok(errors.every((item) => !item.message.includes("INV-1001")));
});

test("every UNCL 1001 code in the table normalizes to its document kind", () => {
  const invoices = [71, 82, 102, 130, 202, 203, 204, 211, 218, 219, 262, 295, 296, 308, 325, 326, 331,
    380, 382, 384, 385, 386, 387, 388, 389, 390, 393, 394, 395, 420, 457, 553, 575, 623, 633, 751, 780, 877, 935];
  for (const code of invoices) assert.equal(normalizeDocumentType(code), "invoice", `code ${code}`);
  for (const code of [81, 83, 381, 396, 458]) assert.equal(normalizeDocumentType(code), "credit_note", `code ${code}`);
  for (const code of [80, 84, 383, 456, 527]) assert.equal(normalizeDocumentType(code), "debit_note", `code ${code}`);
});
