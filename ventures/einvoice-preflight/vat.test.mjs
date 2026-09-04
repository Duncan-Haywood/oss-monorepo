import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { inspectPartyVat, looksLikeCompleteVat, normalizeVat } from "./vat.mjs";

function invoice({ supplierId = "S1", customerId = "C1", supplierVat, customerVat } = {}) {
  const supplier = { id: supplierId, name: "Supplier GmbH" };
  const customer = { id: customerId, name: "Customer GmbH" };
  if (supplierVat !== undefined) supplier.vat_id = supplierVat;
  if (customerVat !== undefined) customer.vat_id = customerVat;
  return {
    invoice_number: "INV-1",
    issue_date: "2026-08-24",
    currency: "EUR",
    supplier,
    customer,
    lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
    totals: { net: 200, tax: 38, gross: 238 },
  };
}

test("normalizeVat strips separators", () => {
  assert.equal(normalizeVat("de 136 695 976"), "DE136695976");
  assert.equal(normalizeVat("AT-U-12345675"), "ATU12345675");
  assert.equal(normalizeVat("   "), null);
  assert.equal(normalizeVat(null), null);
});

test("short internal ids are not complete VAT numbers", () => {
  assert.equal(looksLikeCompleteVat("S1"), false);
  assert.equal(looksLikeCompleteVat("DE123"), false);
  assert.equal(looksLikeCompleteVat("DE456"), false);
  assert.equal(looksLikeCompleteVat("DE136695976"), true);
  assert.equal(looksLikeCompleteVat("de 136 695 976"), true);
});

test("valid published VAT shapes produce no finding", () => {
  const valid = [
    "DE136695976",
    "ATU12345675",
    "FR40303265045",
    "BE0411905847",
    "NL123456782B01",
    "IT00743110157",
    "PL5260250274",
    "SE556188740601",
    "DK13585628",
    "FI09853608",
    "PT502757191",
    "LU15027442",
    "IE6433435F",
    "GB434031494",
    "ESA58818501",
  ];
  for (const number of valid) {
    assert.deepEqual(inspectPartyVat({ id: "S1", name: "A", vat_id: number }, "supplier"), []);
    assert.deepEqual(checkInvoice(invoice({ supplierVat: number })), []);
  }
});

test("checksum failure does not echo the number", () => {
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "DE136695977" }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-023"]);
  assert.equal(findings[0].path, "/supplier/vat_id");
  assert.equal(findings[0].message.includes("136695977"), false);
  assert.equal(findings[0].fix.includes("136695977"), false);
  assert.match(findings[0].message, /checksum/i);
});

test("NL elfproef weighs the check digit at -1, not +1", () => {
  // 9*1+8*2+7*3+6*4+5*5+4*6+3*7+2*8-1*2 = 154, divisible by 11: a genuine
  // valid Dutch VAT number under the real elfproef.
  assert.deepEqual(inspectPartyVat({ id: "S1", name: "A", vat_id: "NL123456782B01" }, "supplier"), []);
  // Same 8 digits, wrong check digit: 156 - 3 = 153, not divisible by 11.
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "NL123456783B01" }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-023"]);
  // The old code weighed the check digit at +1 instead of -1, so it summed
  // to 158 (not 154) for .782 — 158 % 11 = 4, which it read as invalid. It
  // rejected a genuinely valid Dutch VAT number outright, on the very
  // example the Dutch tax authority format uses.
});

test("explicit wrong shape is format not checksum", () => {
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "DE123" }, "customer");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-022"]);
  assert.equal(findings[0].path, "/customer/vat_id");
  assert.equal(findings[0].message.includes("DE123"), false);
});

test("unrecognized prefix on explicit vat_id is INV-022", () => {
  const findings = inspectPartyVat({ id: "S1", name: "A", vat_id: "XX123456789" }, "supplier");
  assert.deepEqual(findings.map((item) => item.rule), ["INV-022"]);
});

test("complete VAT in id is checked without treating short ids as VAT", () => {
  assert.deepEqual(checkInvoice(invoice({ supplierId: "DE136695976" })), []);
  const errors = checkInvoice(invoice({ supplierId: "DE136695977" }));
  assert.ok(errors.some((error) => error.rule === "INV-023" && error.path === "/supplier/id"));
  assert.deepEqual(checkInvoice(invoice({ supplierId: "DE123" })), []);
});
