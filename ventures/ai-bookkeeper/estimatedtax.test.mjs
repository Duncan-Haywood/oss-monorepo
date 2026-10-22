import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { bracketTax, estimatedTax, BRACKETS } from "./estimatedtax.mjs";

const B26 = BRACKETS[2026].single.b;
function books(income) {
  const { books: b } = importStatement(newBooks(), `Date,Description,Amount\n2026-03-01,CLIENT PAYMENT ACME,${income}\n`, "1000");
  return confirm(b, { [b.transactions[0].id]: "4000" });
}

test("bracket tax is hand-checkable", () => {
  // 10% of 12,400 = 1,240; 12% of (50,400-12,400) = 4,560; 22% of 9,600 = 2,112 at 60,000
  assert.equal(bracketTax(6000000, B26), 124000 + 456000 + 211200);
  assert.equal(bracketTax(0, B26), 0);
  assert.equal(bracketTax(100000, B26), 10000);
});

test("a $100,000 sole proprietor: SE tax, QBI, income tax and plan tie out by hand", () => {
  const r = estimatedTax(books("100000.00"), { year: 2026, wageBase: 18450000 });
  // net earnings 92,350; SE tax 15.3% = 14,129.55 (12.4% of 92,350 = 11,451.40 + 2.9% = 2,678.15)
  assert.equal(r.se.tax, 1145140 + 267815);
  assert.equal(r.se.deduction, Math.round(r.se.tax / 2));
  assert.equal(r.agi, 10000000 - r.se.deduction);
  assert.equal(r.qbiDeduction, Math.round(0.2 * (r.agi - 1610000))); // the smaller of 20% of profit and 20% of taxable income
  assert.equal(r.taxable, r.agi - 1610000 - r.qbiDeduction);
  assert.equal(r.incomeTax, bracketTax(r.taxable, B26));
  assert.equal(r.totalTax, r.incomeTax + r.se.tax);
  assert.equal(r.payments.reduce((s, p) => s + p.cents, 0), r.safeHarbor.required);
  assert.equal(r.safeHarbor.required, r.safeHarbor.current90);
});

test("last year's tax lowers the plan when it is smaller (100%, or 110% over $150k AGI)", () => {
  const b = books("100000.00");
  const base = estimatedTax(b, { year: 2026 });
  const low = estimatedTax(b, { year: 2026, priorYearTax: 500000, priorAgi: 4000000 });
  assert.equal(low.safeHarbor.required, 500000);
  assert.ok(low.safeHarbor.required < base.safeHarbor.required);
  const hi = estimatedTax(b, { year: 2026, priorYearTax: 500000, priorAgi: 20000000 });
  assert.equal(hi.safeHarbor.required, 550000);
  assert.ok(low.warnings.every((w) => !/No prior-year/.test(w)));
});

test("withholding and payments already made reduce what is still due, over the dates left", () => {
  const b = books("100000.00");
  const r = estimatedTax(b, { year: 2026, asOf: "2026-06-16", paid: 200000, withholding: 100000 });
  assert.deepEqual(r.payments.map((p) => p.status), ["past", "past", "due", "due"]);
  assert.equal(r.payments[0].cents, 0);
  assert.equal(r.payments[2].cents + r.payments[3].cents, r.safeHarbor.required - 200000);
  assert.equal(r.safeHarbor.required, Math.round(r.totalTax * 0.9) - 100000);
});

test("a small bill after withholding needs no estimates; a loss pays nothing", () => {
  const small = estimatedTax(books("5000.00"), { year: 2026 });
  assert.ok(small.safeHarbor.exempt);
  assert.equal(small.payments.reduce((s, p) => s + p.cents, 0), 0);
  const loss = estimatedTax(books("-3000.00"), { year: 2026 });
  assert.equal(loss.totalTax, 0);
});

test("annualising a part year, W-2 wages in the base, and married filing jointly", () => {
  const b = books("50000.00");
  assert.equal(estimatedTax(b, { year: 2026, monthsElapsed: 6 }).profit, 10000000);
  const w = estimatedTax(b, { year: 2026, wages: 6000000, filing: "mfj" });
  assert.equal(w.agi, 5000000 - w.se.deduction + 6000000);
  assert.equal(w.standardDeduction, 3220000);
});

test("unknown year needs brackets, and unchecked tables carry a warning", () => {
  assert.throws(() => estimatedTax(books("1000.00"), { year: 2031 }), /No single brackets/);
  const r = estimatedTax(books("1000.00"), { year: 2031, brackets: [[Infinity, 0.1]], standardDeduction: 0 });
  assert.ok(r.incomeTax >= 0);
  assert.ok(estimatedTax(books("1000.00"), { year: 2026 }).warnings.some((w) => /from memory/.test(w)));
});
