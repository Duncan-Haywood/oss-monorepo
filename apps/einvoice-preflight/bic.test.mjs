import { test } from "node:test";
import assert from "node:assert/strict";
import { abaChecksumOk, classifyProviderId, inspectPaymentBic, looksLikeCompleteBic, normalizeBic } from "./bic.mjs";
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

// BT-86 admits a national clearing code as well as a BIC (2026-11-12).
test("national clearing codes are not malformed BICs", () => {
  for (const code of ["20-00-00", "37040044", "062-000", "021000021", "SBIN0001234", "7171", "951234567"]) {
    assert.deepEqual(inspectPaymentBic({ payment: { bic: code } }), [], code);
    assert.equal(classifyProviderId(code), "clearing", code);
  }
  assert.equal(classifyProviderId("COBADEFFXXX"), "bic");
  for (const code of ["BA11", "[BIC]", "US33", "COBADEFFXX"]) assert.equal(classifyProviderId(code), "unknown", code);
});

test("a nine-digit US routing number with a bad check digit is INV-026, a leading 0 only a note", () => {
  assert.equal(abaChecksumOk("021000021"), true); // JPMorgan Chase, New York (published routing number)
  assert.equal(abaChecksumOk("121000358"), true); // Bank of America, California
  const bad = inspectPaymentBic({ payment: { bic: "121000359" } });
  assert.deepEqual(bad.map((f) => f.rule), ["INV-026"]);
  assert.equal(bad[0].severity, undefined);
  assert.equal(bad[0].message.includes("121000359"), false);
  const maybe = inspectPaymentBic({ payment: { bic: "021000022" } });
  assert.deepEqual(maybe.map((f) => [f.rule, f.severity]), [["INV-026", "note"]]);
});

test("a clearing code is checked against the bank code inside the IBAN (INV-027)", () => {
  const cases = [
    ["DE89370400440532013000", "37040044", []],
    ["DE89370400440532013000", "37040045", ["INV-027"]],
    ["GB29NWBK60161331926819", "60-16-13", []],
    ["GB29NWBK60161331926819", "20-00-00", ["INV-027"]],
    ["CH9300762011623852957", "762", []], // IID written without its leading zeros
    ["CH9300762011623852957", "9000", ["INV-027"]],
    ["IT60X0542811101000000123456", "05428", []], // ABI alone
    ["IT60X0542811101000000123456", "0542811101", []], // ABI + CAB
    ["FR1420041010050500013M02606", "2004101005", []], // code banque + guichet
    ["NL91ABNA0417164300", "123456", []], // no domestic clearing code in a Dutch IBAN: not compared
  ];
  for (const [iban, bic, rules] of cases) {
    const findings = inspectPaymentBic({ payment: { iban, bic } });
    assert.deepEqual(findings.map((f) => f.rule), rules, `${iban} ${bic}`);
    for (const f of findings) assert.equal(f.message.includes(bic), false);
  }
});

test("a clearing code mismatch fails checkInvoice", () => {
  const rules = checkInvoice(invoice({ iban: "DE89370400440532013000", bic: "10010010" })).map((f) => f.rule);
  assert.ok(rules.includes("INV-027"), rules.join(" "));
});
