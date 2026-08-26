import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectPaymentMeans, looksLikeKnownMeans, normalizeMeans } from "./means.mjs";
import { parseUblInvoice } from "./ubl.mjs";

function invoice(payment, includePayment = true) {
  const document = {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
  if (includePayment) document.payment = payment;
  return document;
}

const UBL_WITH_MEANS = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
 xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
 xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ID>INV-XML-M</cbc:ID><cbc:IssueDate>2026-08-24</cbc:IssueDate><cbc:DocumentCurrencyCode>EUR</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party><cac:PartyIdentification><cbc:ID>S1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Supplier</cbc:Name></cac:PartyName></cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party><cac:PartyIdentification><cbc:ID>C1</cbc:ID></cac:PartyIdentification><cac:PartyName><cbc:Name>Customer</cbc:Name></cac:PartyName></cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="EUR">38</cbc:TaxAmount></cac:TaxTotal>
  <cac:InvoiceLine><cbc:InvoicedQuantity>2</cbc:InvoicedQuantity><cbc:LineExtensionAmount>200</cbc:LineExtensionAmount><cac:Item><cbc:Name>Work</cbc:Name><cac:ClassifiedTaxCategory><cbc:Percent>19</cbc:Percent></cac:ClassifiedTaxCategory></cac:Item><cac:Price><cbc:PriceAmount>100</cbc:PriceAmount></cac:Price></cac:InvoiceLine>
  <cac:LegalMonetaryTotal><cbc:TaxExclusiveAmount>200</cbc:TaxExclusiveAmount><cbc:TaxInclusiveAmount>238</cbc:TaxInclusiveAmount></cac:LegalMonetaryTotal>
</Invoice>`;

test("normalizeMeans accepts int and text", () => {
  assert.equal(normalizeMeans(30), "30");
  assert.equal(normalizeMeans(" 58 "), "58");
  assert.equal(normalizeMeans(""), null);
  assert.equal(normalizeMeans(null), null);
  assert.equal(normalizeMeans(true), null);
});

test("looksLikeKnownMeans", () => {
  assert.equal(looksLikeKnownMeans("30"), true);
  assert.equal(looksLikeKnownMeans(58), true);
  assert.equal(looksLikeKnownMeans("99"), false);
  assert.equal(looksLikeKnownMeans("030"), false);
});

test("omitted means is not a finding", () => {
  assert.deepEqual(inspectPaymentMeans(invoice(undefined, false)), []);
  assert.deepEqual(inspectPaymentMeans(invoice({})), []);
  assert.deepEqual(inspectPaymentMeans(invoice({ iban: "DE89370400440532013000" })), []);
});

test("known means with matching IBAN is clean", () => {
  assert.deepEqual(inspectPaymentMeans(invoice({
    means: "58",
    iban: "DE89370400440532013000",
  })), []);
  assert.deepEqual(inspectPaymentMeans(invoice({ means: 30, iban: "DE89370400440532013000" })), []);
  assert.deepEqual(inspectPaymentMeans(invoice({ means: "10" })), []);
});

test("empty means is INV-044", () => {
  const findings = inspectPaymentMeans(invoice({ means: "" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-044"]);
  assert.equal(findings[0].path, "/payment/means");
});

test("unknown means is INV-044 and does not echo", () => {
  const findings = inspectPaymentMeans(invoice({ means: "99" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-044"]);
  assert.equal(findings[0].path, "/payment/means");
  assert.ok(!findings[0].message.includes("99"));
  assert.ok(!findings[0].fix.includes("99"));
});

test("SEPA without IBAN is INV-045", () => {
  const findings = inspectPaymentMeans(invoice({ means: "58" }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-045"]);
  assert.equal(findings[0].path, "/payment/iban");
});

test("cash with IBAN is INV-046 and does not echo the account", () => {
  const findings = inspectPaymentMeans(invoice({
    means: "10",
    iban: "DE89370400440532013000",
  }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-046"]);
  assert.equal(findings[0].path, "/payment/means");
  assert.ok(!findings[0].message.includes("DE89370400440532013000"));
});

test("invoice without means stays clean", () => {
  assert.deepEqual(checkInvoice(invoice(undefined, false)), []);
});

test("good SEPA keeps a clean invoice clean", () => {
  assert.deepEqual(checkInvoice(invoice({
    means: "58",
    iban: "DE89370400440532013000",
    remittance: "RF18539007547034",
  })), []);
});

test("SEPA without IBAN fails preflight", () => {
  const errors = checkInvoice(invoice({ means: "58" }));
  assert.ok(errors.some((item) => item.rule === "INV-045"));
  assert.ok(errors.some((item) => item.path === "/payment/iban"));
});

test("UBL maps PaymentMeansCode", () => {
  const parsed = parseUblInvoice(UBL_WITH_MEANS);
  assert.equal(parsed.payment.means, "58");
  assert.equal(parsed.payment.iban, "DE89370400440532013000");
  assert.deepEqual(checkInvoice(parsed), []);
});

test("UBL means-only SEPA is INV-045", () => {
  const source = UBL_WITH_MEANS.replace(
    `    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
`,
    "",
  );
  const parsed = parseUblInvoice(source);
  assert.deepEqual(parsed.payment, { means: "58" });
  const errors = checkInvoice(parsed);
  assert.ok(errors.some((item) => item.rule === "INV-045" && item.path === "/payment/iban"));
});

test("UBL cash with IBAN is INV-046", () => {
  const source = UBL_WITH_MEANS.replace(
    "<cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>",
    "<cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>",
  );
  const parsed = parseUblInvoice(source);
  assert.equal(parsed.payment.means, "10");
  const errors = checkInvoice(parsed);
  assert.ok(errors.some((item) => item.rule === "INV-046" && item.path === "/payment/means"));
  assert.ok(errors.every((item) => !item.message.includes("DE89370400440532013000")));
});

test("UBL without PaymentMeans stays clean", () => {
  const source = UBL_WITH_MEANS.replace(
    `  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>58</cbc:PaymentMeansCode>
    <cbc:PaymentID>RF18539007547034</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>DE89370400440532013000</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
`,
    "",
  );
  const parsed = parseUblInvoice(source);
  assert.equal("payment" in parsed, false);
  assert.deepEqual(checkInvoice(parsed), []);
});
