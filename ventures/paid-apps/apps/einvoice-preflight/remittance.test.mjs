import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import {
  inspectPaymentRemittance,
  looksLikeStructuredRf,
  normalizeRemittance,
} from "./remittance.mjs";
import { parseUblInvoice } from "./ubl.mjs";

function invoice({ iban, remittance } = {}) {
  const document = {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
  const payment = {};
  if (iban !== undefined) payment.iban = iban;
  if (remittance !== undefined) payment.remittance = remittance;
  if (Object.keys(payment).length) document.payment = payment;
  return document;
}

const UBL_WITH_PAYMENT = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-RF</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("normalizeRemittance strips separators", () => {
  assert.equal(normalizeRemittance("rf18 5390 0754 7034"), "RF18539007547034");
  assert.equal(normalizeRemittance("INV-1001"), "INV1001");
  assert.equal(normalizeRemittance("   "), null);
  assert.equal(normalizeRemittance(null), null);
});

test("structured RF shape", () => {
  assert.equal(looksLikeStructuredRf("RF18 5390 0754 7034"), true);
  assert.equal(looksLikeStructuredRf("RF06INV1001"), true);
  assert.equal(looksLikeStructuredRf("INV-1001"), false);
  assert.equal(looksLikeStructuredRf("RF"), false);
});

test("complete IBAN without remittance is INV-030", () => {
  const findings = inspectPaymentRemittance(invoice({ iban: "DE89 3704 0044 0532 0130 00" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-030"]);
  assert.equal(findings[0].path, "/payment/remittance");
  assert.equal(findings[0].message.includes("37040044"), false);
});

test("internal account does not require remittance", () => {
  assert.deepEqual(inspectPaymentRemittance(invoice({ iban: "123456" })), []);
  assert.deepEqual(inspectPaymentRemittance(invoice()), []);
});

test("wrong-length IBAN without remittance is still INV-030", () => {
  // Truncated (20 chars, DE needs 22), but still an IBAN, not an internal
  // account id -- a buyer still needs a remittance reference to quote on
  // the transfer. This used to be silently skipped because
  // looksLikeCompleteIban read any wrong-length IBAN as "no IBAN here".
  const findings = inspectPaymentRemittance(invoice({ iban: "DE893704004405320130" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-030"]);
  assert.equal(findings[0].path, "/payment/remittance");
});

test("unstructured and valid RF pass through checkInvoice", () => {
  assert.deepEqual(checkInvoice(invoice({
    iban: "DE89370400440532013000",
    remittance: "INV-1001",
  })), []);
  assert.deepEqual(checkInvoice(invoice({
    iban: "DE89370400440532013000",
    remittance: "RF18 5390 0754 7034",
  })), []);
});

test("RF checksum failure does not echo the reference", () => {
  const findings = inspectPaymentRemittance(invoice({
    iban: "DE89370400440532013000",
    remittance: "RF18539007547035",
  }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-031"]);
  assert.equal(findings[0].path, "/payment/remittance");
  assert.equal(findings[0].message.includes("RF18539007547035"), false);
  assert.match(findings[0].message, /checksum/i);
});

test("overlong unstructured note is INV-031", () => {
  const findings = inspectPaymentRemittance(invoice({
    iban: "DE89370400440532013000",
    remittance: "X".repeat(141),
  }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-031"]);
  assert.match(findings[0].message, /140/);
  assert.equal(findings[0].message.includes("XXXX"), false);
});

test("UBL PaymentID maps into remittance", () => {
  const parsed = parseUblInvoice(UBL_WITH_PAYMENT);
  assert.equal(parsed.payment.iban, "DE89370400440532013000");
  assert.equal(parsed.payment.remittance, "RF18539007547034");
  assert.deepEqual(checkInvoice(parsed), []);
});

test("UBL InstructionNote is used when PaymentID is absent", () => {
  const source = UBL_WITH_PAYMENT.replace(
    "<cbc:PaymentID>RF18539007547034</cbc:PaymentID>",
    "<cbc:InstructionNote>INV-XML-RF</cbc:InstructionNote>",
  );
  const parsed = parseUblInvoice(source);
  assert.equal(parsed.payment.remittance, "INV-XML-RF");
  assert.deepEqual(checkInvoice(parsed), []);
});

test("UBL IBAN without remittance is INV-030", () => {
  const source = UBL_WITH_PAYMENT.replace(
    "<cbc:PaymentID>RF18539007547034</cbc:PaymentID>\n    ",
    "",
  );
  const parsed = parseUblInvoice(source);
  assert.equal(parsed.payment.remittance, undefined);
  const errors = checkInvoice(parsed);
  assert.ok(errors.some((error) => error.rule === "INV-030"));
  assert.ok(errors.every((error) => !error.message.includes("RF18539007547034")));
});
