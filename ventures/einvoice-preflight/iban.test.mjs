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

test("a wrong-length IBAN for a known country still looks like an IBAN", () => {
  // Country-shaped and known (DE), just short a group -- a typo'd or
  // truncated IBAN, not an internal account id. inspectPaymentIban already
  // flags this on its own (INV-024); looksLikeCompleteIban is the gate the
  // cross-field checks (BIC country match, remittance-missing,
  // means-needs-IBAN) use to decide whether an IBAN is present at all, and
  // it used to say no here, silently skipping all three.
  assert.equal(looksLikeCompleteIban("DE893704004405320130"), true);
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

test("BBAN structure per the registry: right length and mod-97 but letters where digits belong is INV-024", () => {
  // DE BBAN is 8n10n; build a mod-97-valid IBAN with a letter inside it.
  const bban = "3704004405A2013000";
  const n = [...(bban + "DE00")].map((c) => parseInt(c, 36)).join("");
  let r = 0; for (const d of n) r = (r * 10 + Number(d)) % 97;
  const iban = "DE" + String(98 - r).padStart(2, "0") + bban;
  assert.deepEqual(inspectPaymentIban(invoice(iban)).map((f) => f.rule), ["INV-024"]);
});

test("countries added from the registry are known (OM, SV, RU) and checked", () => {
  assert.deepEqual(inspectPaymentIban(invoice("OM810180000001299123456")), []);
  assert.deepEqual(inspectPaymentIban(invoice("OM81018000000129912345")).map((f) => f.rule), ["INV-024"]);
});

test("national check digits: BE, ES, ME, NO", () => {
  for (const ok of ["BE68539007547034", "ES9121000418450200051332", "ME25505000012345678951", "NO9386011117947"]) {
    assert.deepEqual(inspectPaymentIban(invoice(ok)), [], ok);
  }
  // keep the IBAN mod-97 valid but break the national digits: swap in a recomputed IBAN check.
  const recheck = (cc, bban) => {
    const n = [...(bban + cc + "00")].map((c) => parseInt(c, 36)).join("");
    let r = 0; for (const d of n) r = (r * 10 + Number(d)) % 97;
    return cc + String(98 - r).padStart(2, "0") + bban;
  };
  for (const [cc, bban] of [["BE", "539007547035"], ["ES", "21000418460200051332"], ["ME", "505000012345678952"], ["NO", "86011117948"]]) {
    assert.deepEqual(inspectPaymentIban(invoice(recheck(cc, bban))).map((f) => f.rule), ["INV-025"], cc);
  }
});

test("inspectPaymentIban returns no findings for a missing or non-object invoice", () => {
  for (const bad of [null, undefined, 5, "x"]) assert.deepEqual(inspectPaymentIban(bad), []);
});
