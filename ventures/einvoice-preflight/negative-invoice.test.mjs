// Cases from the official Peppol BIS Billing 3.0 examples and the KoSIT-valid
// German test documents (read only, not copied): a negative invoice, a
// negative prepaid amount and the wider UNCL 1001 code list.
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";

const NEG = {
  invoice_number: "INV-N1", issue_date: "2026-08-24", currency: "EUR",
  supplier: { id: "S1", name: "Supplier" }, customer: { id: "C1", name: "Customer" },
  lines: [{ description: "Work", quantity: -2, unit_price: 100, tax_percent: 25, net: -200 }],
  adjustments: [{ kind: "charge", amount: -25, reason: "Insurance", tax_percent: 25 }],
  totals: { net: -225, tax: -56.25, gross: -281.25, due: -281.25 },
};
const rules = (invoice) => checkInvoice(invoice).map((e) => e.rule);
const clone = (v) => JSON.parse(JSON.stringify(v));

test("a consistent negative invoice with a negative header charge passes", () => {
  assert.deepEqual(rules(NEG), []);
});

test("a negative invoice with wrong arithmetic is still caught", () => {
  const bad = clone(NEG);
  bad.totals.gross = -300;
  assert.ok(rules(bad).includes("INV-017"));
  const badDue = clone(NEG);
  badDue.totals.due = -1;
  assert.ok(rules(badDue).includes("INV-029"));
});

test("a negative header charge on a positive invoice is still refused", () => {
  const bad = clone(NEG);
  bad.lines = [{ description: "Work", quantity: 2, unit_price: 100, tax_percent: 25, net: 200 }];
  bad.totals = { net: 175, tax: 43.75, gross: 218.75 };
  assert.ok(rules(bad).includes("INV-050"));
});

test("a negative prepaid amount is accepted only when the amount due follows from it", () => {
  const base = {
    invoice_number: "INV-P1", issue_date: "2026-08-24", currency: "EUR",
    supplier: { id: "S1", name: "S" }, customer: { id: "C1", name: "C" },
    lines: [{ description: "Work", quantity: 1, unit_price: 100, tax_percent: 19, net: 100 }],
    totals: { net: 100, tax: 19, gross: 119, prepaid: -20, due: 139 },
  };
  assert.deepEqual(rules(base), []);
  base.totals.due = 119;
  assert.ok(rules(base).includes("INV-028"));
});

test("other UNCL 1001 invoice codes are known document types", () => {
  for (const code of ["387", "575", "204", "877", "751"]) {
    const invoice = clone(NEG);
    invoice.document_code = code;
    assert.ok(!rules(invoice).includes("INV-032"), code);
  }
  const bogus = clone(NEG);
  bogus.document_code = "999";
  assert.ok(rules(bogus).includes("INV-032"));
});
