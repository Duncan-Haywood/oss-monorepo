import { test } from "node:test";
import assert from "node:assert/strict";
import { inspectPaymentBic, looksLikeCompleteBic, normalizeBic } from "./bic.mjs";
import { checkInvoice } from "./checks.mjs";

function invoice({ iban, bic } = {}) {
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
  if (iban !== undefined) {
    payment.iban = iban;
    payment.remittance = "INV-1";
  }
  if (bic !== undefined) payment.bic = bic;
  if (Object.keys(payment).length) document.payment = payment;
  return document;
}

test("normalizeBic strips separators", () => {
  assert.equal(normalizeBic("coba deff xxx"), "COBADEFFXXX");
  assert.equal(normalizeBic("DEUT-DEFF"), "DEUTDEFF");
  assert.equal(normalizeBic("   "), null);
  assert.equal(normalizeBic(null), null);
});

test("short internal codes are not complete BICs", () => {
  assert.equal(looksLikeCompleteBic("BANK1"), false);
  assert.equal(looksLikeCompleteBic("COBADE"), false);
  assert.equal(looksLikeCompleteBic("S1"), false);
  assert.equal(looksLikeCompleteBic("COBADEFFXXX"), true);
  assert.equal(looksLikeCompleteBic("DEUTDEFF"), true);
});

test("valid BICs produce no finding", () => {
  for (const code of ["COBADEFFXXX", "DEUTDEFF", "NEDSZAJJ", "BARCGB22", "BNPAFRPP"]) {
    assert.deepEqual(inspectPaymentBic({ payment: { bic: code } }), []);
  }
});

test("wrong length is format and does not echo the code", () => {
  const findings = inspectPaymentBic({ payment: { bic: "COBADEFFXX" } });
  assert.deepEqual(findings.map((item) => item.rule), ["INV-026"]);
  assert.equal(findings[0].path, "/payment/bic");
  assert.equal(findings[0].message.includes("COBADEFFXX"), false);
});

test("BIC country mismatch against a complete IBAN is INV-027", () => {
  const findings = inspectPaymentBic(invoice({
    iban: "DE89370400440532013000",
    bic: "BARCGB22",
  }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-027"]);
  assert.equal(findings[0].path, "/payment/bic");
  assert.equal(findings[0].message.includes("BARCGB22"), false);
  assert.equal(findings[0].message.includes("37040044"), false);
});

test("matching IBAN and BIC countries pass through checkInvoice", () => {
  assert.deepEqual(checkInvoice(invoice({
    iban: "DE89370400440532013000",
    bic: "COBADEFFXXX",
  })), []);
});

test("omitted BIC stays silent", () => {
  assert.deepEqual(inspectPaymentBic(invoice({ iban: "DE89370400440532013000" })), []);
});

test("BIC country mismatch is still caught against a wrong-length IBAN", () => {
  // The IBAN is truncated (20 chars, DE needs 22) and gets its own INV-024
  // finding elsewhere, but its country prefix is still readable, and a
  // mismatched BIC country is a second, independent typo the truncation
  // does not excuse. This used to be silently skipped because
  // looksLikeCompleteIban read any wrong-length IBAN as "no IBAN here".
  const findings = inspectPaymentBic(invoice({
    iban: "DE893704004405320130",
    bic: "BARCGB22",
  }));
  assert.deepEqual(findings.map((item) => item.rule), ["INV-027"]);
  assert.equal(findings[0].path, "/payment/bic");
});
