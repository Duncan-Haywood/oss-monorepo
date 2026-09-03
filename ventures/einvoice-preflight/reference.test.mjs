import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectCommercialReferences, looksLikePlaceholder, normalizeReference } from "./reference.mjs";
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

const UBL_WITH_REFS = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-R</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate>
  <cbc:BuyerReference>COST-441</cbc:BuyerReference>
  <cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:OrderReference><cbc:ID>PO-9001</cbc:ID></cac:OrderReference>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("normalizeReference strips and rejects empty", () => {
  assert.equal(normalizeReference(" PO-1 "), "PO-1");
  assert.equal(normalizeReference(""), null);
  assert.equal(normalizeReference(12), null);
});

test("looksLikePlaceholder catches tokens without treating a real PO as empty", () => {
  assert.equal(looksLikePlaceholder("N/A"), true);
  assert.equal(looksLikePlaceholder("n.a."), true);
  assert.equal(looksLikePlaceholder("none"), true);
  assert.equal(looksLikePlaceholder("PO-9001"), false);
});

test("omitted refs are not a finding", () => {
  assert.deepEqual(inspectCommercialReferences(invoice()), []);
});

test("real refs are clean", () => {
  assert.deepEqual(inspectCommercialReferences(invoice({
    buyer_reference: "COST-441",
    order_reference: "PO-9001",
  })), []);
});

test("empty buyer reference is INV-047", () => {
  const findings = inspectCommercialReferences(invoice({ buyer_reference: "" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-047"]);
  assert.equal(findings[0].path, "/buyer_reference");
});

test("placeholder buyer reference is INV-047 and does not echo", () => {
  const findings = inspectCommercialReferences(invoice({ buyer_reference: "N/A" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-047"]);
  assert.equal(findings[0].message.includes("N/A"), false);
});

test("empty order reference is INV-048", () => {
  const findings = inspectCommercialReferences(invoice({ order_reference: "" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-048"]);
});

test("placeholder order reference is INV-048 and does not echo", () => {
  const findings = inspectCommercialReferences(invoice({ order_reference: "TBD" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-048"]);
  assert.equal(findings[0].message.includes("TBD"), false);
});

test("order repeating the invoice number is INV-049 and does not echo", () => {
  const findings = inspectCommercialReferences(invoice({ order_reference: "inv-1" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-049"]);
  assert.equal(findings[0].path, "/order_reference");
  assert.equal(findings[0].message.includes("INV-1"), false);
  assert.equal(findings[0].message.includes("inv-1"), false);
});

test("invoice without refs stays clean", () => {
  assert.deepEqual(checkInvoice(invoice()), []);
});

test("good refs keep a clean invoice clean", () => {
  assert.deepEqual(checkInvoice(invoice({
    buyer_reference: "COST-441",
    order_reference: "PO-9001",
  })), []);
});

test("repeated invoice number fails preflight", () => {
  const errors = checkInvoice(invoice({ order_reference: "INV-1" }));
  assert.ok(errors.some((item) => item.rule === "INV-049"));
});

test("UBL maps buyer and order references", () => {
  const mapped = parseUblInvoice(UBL_WITH_REFS);
  assert.equal(mapped.buyer_reference, "COST-441");
  assert.equal(mapped.order_reference, "PO-9001");
  assert.deepEqual(checkInvoice(mapped), []);
});

test("UBL order repeating invoice id is INV-049", () => {
  const mapped = parseUblInvoice(UBL_WITH_REFS.replace("<cbc:ID>PO-9001</cbc:ID>", "<cbc:ID>INV-XML-R</cbc:ID>"));
  assert.equal(mapped.order_reference, "INV-XML-R");
  const errors = checkInvoice(mapped);
  assert.ok(errors.some((item) => item.rule === "INV-049" && item.path === "/order_reference"));
  assert.ok(errors.every((item) => !item.message.includes("INV-XML-R")));
});

test("UBL placeholder buyer reference is INV-047", () => {
  const mapped = parseUblInvoice(UBL_WITH_REFS.replace(
    "<cbc:BuyerReference>COST-441</cbc:BuyerReference>",
    "<cbc:BuyerReference>none</cbc:BuyerReference>",
  ));
  assert.equal(mapped.buyer_reference, "none");
  const errors = checkInvoice(mapped);
  assert.ok(errors.some((item) => item.rule === "INV-047" && item.path === "/buyer_reference"));
  assert.ok(errors.every((item) => !item.message.includes("none")));
});

test("UBL without refs stays clean", () => {
  const mapped = parseUblInvoice(
    UBL_WITH_REFS
      .replace("  <cbc:BuyerReference>COST-441</cbc:BuyerReference>\n", "")
      .replace("  <cac:OrderReference><cbc:ID>PO-9001</cbc:ID></cac:OrderReference>\n", ""),
  );
  assert.equal("buyer_reference" in mapped, false);
  assert.equal("order_reference" in mapped, false);
  assert.deepEqual(checkInvoice(mapped), []);
});
