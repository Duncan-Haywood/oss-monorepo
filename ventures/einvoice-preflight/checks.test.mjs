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

test("tax total rounds each line to cents", () => {
  const invoice = clone(VALID);
  invoice.lines = [
    { description: "A", quantity: 1, unit_price: 0.03, tax_percent: 19, net: 0.03 },
    { description: "B", quantity: 1, unit_price: 0.03, tax_percent: 19, net: 0.03 },
  ];
  invoice.totals = { net: 0.06, tax: 0.02, gross: 0.08 };
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
