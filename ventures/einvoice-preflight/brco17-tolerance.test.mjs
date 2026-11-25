// EN 16931 BR-CO-17 within one currency unit (CEN's Schematron) is a warning on the
// built-in route, not a blocking error: quality audit 2026-11-19 found every invoice
// with VAT rounded per line (a cent off the per-rate figure) blocked here and passed
// by CEN. The official route is unchanged (en16931-ubl/cii.json carry CEN's test).
import { test } from "node:test";
import assert from "node:assert/strict";
import { checkInvoice } from "./checks.mjs";
import { brCo17Tolerated } from "./breakdown.mjs";
import { isBlocking } from "./report.mjs";

// Three lines of 10.07 at 19%: per line 1.91 each, 5.73 summed; per rate 30.21 x 19% = 5.74.
function invoice(rowTax, totalTax = rowTax, percent = 19, taxable = 30.21) {
  const net = taxable;
  return {
    invoice_number: "INV-1", issue_date: "2026-08-24", currency: "EUR",
    supplier: { id: "S1", name: "S" }, customer: { id: "C1", name: "C" },
    lines: [1, 2, 3].map((i) => ({ description: `L${i}`, quantity: 1, unit_price: taxable / 3, tax_percent: percent, net: taxable / 3 })),
    tax_breakdown: [{ tax_percent: percent, taxable, tax: rowTax }],
    totals: { net, tax: totalTax, gross: Math.round((net + totalTax) * 100) / 100 },
  };
}
const blocking = (inv) => checkInvoice(inv).filter(isBlocking).map((f) => f.rule);

test("per-line rounding a cent off the per-rate VAT is a warning, and the file passes", () => {
  const findings = checkInvoice(invoice(5.73));
  assert.deepEqual(findings.map((f) => [f.rule, f.severity]), [["INV-038", "warning"]]);
  assert.match(findings[0].message, /0\.01 away/);
  assert.match(findings[0].fix, /5\.74/);
});

test("the exact figure still passes with no finding", () => {
  assert.deepEqual(checkInvoice(invoice(5.74)), []);
});

test("0.99 off is tolerated; a full unit off blocks (CEN's UBL test is strictly under one)", () => {
  assert.deepEqual(blocking(invoice(6.73)), []);
  assert.deepEqual(blocking(invoice(4.75)), []);
  assert.deepEqual(blocking(invoice(6.74)).sort(), ["INV-018", "INV-038"]);
  assert.deepEqual(blocking(invoice(4.74)).sort(), ["INV-018", "INV-038"]);
});

test("a tax total that disagrees with its tolerated rows is still INV-018 (BR-CO-14)", () => {
  assert.deepEqual(blocking(invoice(5.73, 5.72)), ["INV-018"]);
});

test("stricter than CEN on sign; a 0% row needs a tax under 0.50", () => {
  assert.equal(brCo17Tolerated(-5.73, 5.74, 19), false);
  assert.equal(brCo17Tolerated(0.3, 0, 0), true);
  assert.equal(brCo17Tolerated(0.5, 0, 0), false);
  assert.equal(brCo17Tolerated(5.74, 5.74, 19), false, "equal is not a tolerance case");
});
