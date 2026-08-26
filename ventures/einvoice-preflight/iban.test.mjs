import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectPaymentIban, looksLikeCompleteIban, normalizeIban } from "./iban.mjs";

function invoice(iban) {
  const document = {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier: { id: "S1", name: "Supplier GmbH" },
    customer: { id: "C1", name: "Customer GmbH" },
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
  if (iban !== undefined) document.payment = { iban, remittance: "INV-1" };
  return document;
}

test("normalizeIban strips separators", () => {
  assert.equal(normalizeIban("de89 3704 0044 0532 0130 00"), "DE89370400440532013000");
  assert.equal(normalizeIban("GB82-WEST-1234-5698-7654-32"), "GB82WEST12345698765432");
  assert.equal(normalizeIban("   "), null);
  assert.equal(normalizeIban(null), null);
});

test("short internal accounts are not complete IBANs", () => {
  assert.equal(looksLikeCompleteIban("123456"), false);
  assert.equal(looksLikeCompleteIban("DE89"), false);
  assert.equal(looksLikeCompleteIban("S1"), false);
  assert.equal(looksLikeCompleteIban("DE89 3704 0044 0532 0130 00"), true);
  assert.equal(looksLikeCompleteIban("NL91ABNA0417164300"), true);
});

test("valid published IBANs produce no finding", () => {
  const valid = [
    "DE89 3704 0044 0532 0130 00",
    "GB82WEST12345698765432",
    "FR1420041010050500013M02606",
    "NL91ABNA0417164300",
    "BE68539007547034",
    "AT611904300234573201",
    "IT60X0542811101000000123456",
    "ES9121000418450200051332",
    "IE29AIBK93115212345678",
    "PT50000201231234567890154",
    "SE4550000000058398257466",
    "DK5000400440116243",
    "FI2112345600000785",
    "LU280019400644750000",
  ];
  for (const number of valid) {
    assert.deepEqual(inspectPaymentIban(invoice(number)), []);
    assert.deepEqual(checkInvoice(invoice(number)), []);
  }
});

test("checksum failure does not echo the account", () => {
  const findings = inspectPaymentIban(invoice("DE89370400440532013001"));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-025"]);
  assert.equal(findings[0].path, "/payment/iban");
  assert.equal(findings[0].message.includes("32013001"), false);
  assert.match(findings[0].message, /checksum/i);
});

test("wrong national length is format not checksum", () => {
  const findings = inspectPaymentIban(invoice("DE893704004405320130"));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-024"]);
  assert.equal(findings[0].message.includes("DE893704"), false);
});

test("omitted payment stays silent", () => {
  assert.deepEqual(inspectPaymentIban(invoice()), []);
  assert.deepEqual(checkInvoice(invoice()), []);
});
