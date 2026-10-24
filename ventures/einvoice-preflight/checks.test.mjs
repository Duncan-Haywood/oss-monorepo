import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice, flagDuplicateInvoiceNumbers } from "./checks.mjs";

const VALID = {
  invoice_number: "INV-1",
  issue_date: "2026-08-24",
  currency: "EUR",
  supplier: { id: "S1", name: "Supplier" },
  customer: { id: "C1", name: "Customer" },
  lines: [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 200 }],
  totals: { net: 200, tax: 38, gross: 238 },
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("valid invoice passes", () => {
  assert.deepEqual(checkInvoice(VALID), []);
});

test("arithmetic defect is explained", () => {
  const invoice = clone(VALID);
  invoice.totals.gross = 200;
  const errors = checkInvoice(invoice);
  assert.ok(errors.some((error) => error.rule === "INV-017"));
  assert.ok(errors.some((error) => error.message.includes("net plus tax")));
  assert.equal(errors.find((error) => error.rule === "INV-017").path, "/totals/gross");
});

test("tax total must match line tax percentages", () => {
  const invoice = clone(VALID);
  invoice.totals.tax = 0;
  invoice.totals.gross = 200;
  const rules = new Set(checkInvoice(invoice).map((error) => error.rule));
  assert.ok(rules.has("INV-018"));
});

test("prepaid and due are optional and must balance", () => {
  const balanced = clone(VALID);
  balanced.totals.prepaid = 38;
  balanced.totals.due = 200;
  assert.deepEqual(checkInvoice(balanced), []);

  const wrongDue = clone(VALID);
  wrongDue.totals.prepaid = 38;
  wrongDue.totals.due = 238;
  const dueErrors = checkInvoice(wrongDue);
  assert.ok(dueErrors.some((error) => error.rule === "INV-029"));
  assert.equal(dueErrors.find((error) => error.rule === "INV-029").path, "/totals/due");

  const overpaid = clone(VALID);
  overpaid.totals.prepaid = 300;
  const prepaidErrors = checkInvoice(overpaid);
  assert.ok(prepaidErrors.some((error) => error.rule === "INV-028"));
  assert.equal(prepaidErrors.find((error) => error.rule === "INV-028").path, "/totals/prepaid");

  const unpaidMarkedPaid = clone(VALID);
  unpaidMarkedPaid.totals.due = 0;
  const remainingErrors = checkInvoice(unpaidMarkedPaid);
  assert.ok(remainingErrors.some((error) => error.rule === "INV-029"));
  assert.ok(remainingErrors.some((error) => error.message.includes("gross minus prepaid")));
});

test("tax total is worked out per rate on the summed taxable amount (BR-CO-17)", () => {
  const invoice = clone(VALID);
  invoice.lines = [
    { description: "A", quantity: 1, unit_price: 0.03, tax_percent: 19, net: 0.03 },
    { description: "B", quantity: 1, unit_price: 0.03, tax_percent: 19, net: 0.03 },
  ];
  invoice.totals = { net: 0.06, tax: 0.01, gross: 0.07 };
  assert.deepEqual(checkInvoice(invoice), []);
});

test("fractional quantity is not rounded before line calculation", () => {
  const invoice = clone(VALID);
  invoice.lines = [{ description: "Fabric", quantity: 1.25, unit_price: 10, tax_percent: 19, net: 12.5 }];
  invoice.totals = { net: 12.5, tax: 2.38, gross: 14.88 };
  assert.deepEqual(checkInvoice(invoice), []);
});

test("fractional tax percentage is not rounded before tax calculation", () => {
  const invoice = clone(VALID);
  invoice.lines[0].tax_percent = 19.5;
  invoice.totals = { net: 200, tax: 39, gross: 239 };
  assert.deepEqual(checkInvoice(invoice), []);
});

test("line net is required", () => {
  const invoice = clone(VALID);
  delete invoice.lines[0].net;
  const errors = checkInvoice(invoice);
  assert.ok(errors.some((error) => error.rule === "INV-012"));
  assert.ok(errors.some((error) => error.message.includes("missing")));
});

test("missing fields and bad date are not valid", () => {
  const rules = new Set(checkInvoice({ issue_date: "24/08/2026" }).map((error) => error.rule));
  assert.ok(rules.has("INV-001"));
  assert.ok(rules.has("INV-003"));
});

test("due date is optional but must be ISO and not before issue date", () => {
  const invoice = clone(VALID);
  invoice.due_date = "2026-08-23";
  let errors = checkInvoice(invoice);
  assert.ok(errors.some((error) => error.rule === "INV-021"));
  assert.equal(errors.find((error) => error.rule === "INV-021").path, "/due_date");

  invoice.due_date = "23/09/2026";
  errors = checkInvoice(invoice);
  assert.ok(errors.some((error) => error.rule === "INV-020"));
});

test("due date is accepted when on or after issue date", () => {
  const invoice = clone(VALID);
  invoice.due_date = "2026-08-24";
  assert.deepEqual(checkInvoice(invoice), []);
});

test("dates require extended ISO YYYY-MM-DD form", () => {
  const invoice = clone(VALID);
  invoice.issue_date = "20260824";
  invoice.due_date = "2026-W35-1";
  const rules = new Set(checkInvoice(invoice).map((error) => error.rule));
  assert.ok(rules.has("INV-003"));
  assert.ok(rules.has("INV-020"));
});

test("impossible calendar dates are rejected", () => {
  const invoice = clone(VALID);
  invoice.issue_date = "2026-02-30";
  assert.ok(checkInvoice(invoice).some((error) => error.rule === "INV-003"));
});

test("non-object invoice fails with INV-001", () => {
  assert.equal(checkInvoice([]).length, 1);
  assert.equal(checkInvoice("nope")[0].rule, "INV-001");
});

test("duplicate invoice numbers are flagged without repeating the number", () => {
  const duplicates = flagDuplicateInvoiceNumbers([
    { name: "first.json", invoice: VALID },
    { name: "second.json", invoice: VALID },
  ]);
  assert.deepEqual([...duplicates].sort(), ["first.json", "second.json"]);
});

test("the same invoice number from different sellers is not a duplicate", () => {
  const other = { ...VALID, supplier: { id: "S2", name: "Other Supplier" } };
  const duplicates = flagDuplicateInvoiceNumbers([
    { name: "a.json", invoice: VALID },
    { name: "b.json", invoice: other },
    { name: "c.json", invoice: VALID },
  ]);
  assert.deepEqual([...duplicates].sort(), ["a.json", "c.json"]);
});

test("a negative quantity is a credit line, not an error", () => {
  const invoice = clone(VALID);
  invoice.lines = [
    { description: "Goods", quantity: 3, unit_price: 10, tax_percent: 19, net: 30 },
    { description: "Returned", quantity: -1, unit_price: 10, tax_percent: 19, net: -10 },
  ];
  invoice.totals = { net: 20, tax: 3.8, gross: 23.8 };
  assert.deepEqual(checkInvoice(invoice), []);
});

test("unit price keeps full precision and honours the price base quantity", () => {
  const invoice = clone(VALID);
  invoice.lines = [
    { description: "kWh", quantity: 16000, unit_price: 0.0088, tax_percent: 21, net: 140.8 },
    { description: "Box of 12", quantity: 2, unit_price: 441, price_base_quantity: 12, tax_percent: 21, net: 73.5 },
  ];
  invoice.totals = { net: 214.3, tax: 45.0, gross: 259.3 };
  assert.deepEqual(checkInvoice(invoice), []);
});

test("line allowances and charges are part of the line net", () => {
  const invoice = clone(VALID);
  invoice.lines = [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 190,
    adjustments: [{ kind: "allowance", amount: 15 }, { kind: "charge", amount: 5 }] }];
  invoice.totals = { net: 190, tax: 36.1, gross: 226.1 };
  assert.deepEqual(checkInvoice(invoice), []);
});

test("a wrong stated line net is reported once, not again in every total", () => {
  const invoice = clone(VALID);
  invoice.lines = [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 19, net: 150 }];
  invoice.totals = { net: 150, tax: 28.5, gross: 178.5 };
  invoice.source_format = "ubl"; // a parsed file: totals are summed from the stated line nets
  assert.deepEqual(checkInvoice(invoice).map((e) => e.rule), ["INV-012"]);
});

test("a buyer identifier is optional on a parsed UBL or CII file", () => {
  const invoice = clone(VALID);
  delete invoice.customer.id;
  assert.ok(checkInvoice(invoice).some((e) => e.rule === "INV-005"));
  invoice.source_format = "ubl";
  assert.ok(checkInvoice(invoice).some((e) => e.rule === "INV-005"), "name alone is not an identifier");
  invoice.customer.vat_id = "DE123456789";
  assert.equal(checkInvoice(invoice).some((e) => e.rule === "INV-005"), false);
});

test("HUF tax total may be rounded to whole forints", () => {
  const invoice = clone(VALID);
  invoice.currency = "HUF";
  invoice.lines = [{ description: "Work", quantity: 1, unit_price: 1001, tax_percent: 27, net: 1001 }];
  // 27% of 1001 = 270.27, stated as 270 in forints.
  invoice.totals = { net: 1001, tax: 270, gross: 1271 };
  assert.deepEqual(checkInvoice(invoice), []);
  invoice.totals = { net: 1001, tax: 271, gross: 1272 };
  assert.ok(checkInvoice(invoice).some((e) => e.rule === "INV-018"));
});

test("whole-unit tax rounding is not accepted outside HUF", () => {
  const invoice = clone(VALID);
  invoice.lines = [{ description: "Work", quantity: 1, unit_price: 1001, tax_percent: 27, net: 1001 }];
  invoice.totals = { net: 1001, tax: 270, gross: 1271 };
  assert.ok(checkInvoice(invoice).some((e) => e.rule === "INV-018"));
});

// Found by running the KoSIT XRechnung test suite.
const totalsCase = (totals) => checkInvoice({
  invoice_number: "T-1", issue_date: "2026-08-24", currency: "EUR",
  supplier: { id: "S1", name: "Supplier GmbH" }, customer: { id: "C1", name: "Customer GmbH" },
  lines: [{ description: "Work", quantity: 1, unit_price: 100, tax_percent: 19, net: 100 }],
  totals: { net: 100, tax: 19, gross: 119, ...totals },
}).map((e) => e.rule);

test("a payable rounding amount (BT-114) is part of the amount due", () => {
  assert.deepEqual(totalsCase({ due: 119.01, rounding: 0.01 }), []);
  assert.deepEqual(totalsCase({ due: 119, rounding: 0.01 }), ["INV-029"]);
});

test("prepayments above the gross give a stated credit balance, not an error", () => {
  assert.deepEqual(totalsCase({ prepaid: 150, due: -31 }), []);
  assert.deepEqual(totalsCase({ prepaid: 150, due: -20 }), ["INV-028", "INV-029"]);
  assert.deepEqual(totalsCase({ due: -5 }), ["INV-029"]);
});
