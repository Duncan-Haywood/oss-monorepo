import { test } from "node:test";
import assert from "node:assert/strict";
import { newBooks, importStatement, confirm } from "./engine.mjs";
import { annualizedInstallments, PERIODS } from "./annualized.mjs";

// Income only in the autumn: 60,000 on Oct 1. Hand check below; client names made up.
function books(rows) {
  const csv = "Date,Description,Amount\n" + rows.map(([d, a]) => `${d},CLIENT PAYMENT ACME,${a}`).join("\n") + "\n";
  const { books: b } = importStatement(newBooks(), csv, "1000");
  return confirm(b, Object.fromEntries(b.transactions.map((t) => [t.id, "4000"])));
}

test("income only in the autumn owes nothing until the fourth installment", () => {
  const r = annualizedInstallments(books([["2026-10-01", "60000.00"]]), { year: 2026 });
  assert.deepEqual(r.rows.map((x) => x.installment), [0, 0, 0, r.rows[3].installment]);
  assert.equal(r.rows[3].installment, Math.min(r.rows[3].annualizedRequired, r.regularQuarter * 4));
  assert.ok(r.rows[3].installment > 0);
  // the regular method wanted a quarter by April 15, the annualized method wanted none
  assert.equal(r.rows[0].regularCumulative, r.regularQuarter);
  assert.equal(r.rows[0].cumulativeRequired, 0);
  assert.equal(r.saved[0], r.regularQuarter);
});

test("even income gives installments close to the regular quarters and never above the carry cap", () => {
  const rows = [];
  for (let m = 1; m <= 12; m++) rows.push([`2026-${String(m).padStart(2, "0")}-05`, "5000.00"]);
  const r = annualizedInstallments(books(rows), { year: 2026 });
  const total = r.rows.reduce((s, x) => s + x.installment, 0);
  assert.ok(total <= r.regularQuarter * 4);
  r.rows.forEach((x) => assert.ok(x.cumulativeRequired <= x.regularCumulative + 1));
});

test("payments and even withholding reduce the shortfall; a payment after the due date does not", () => {
  const b = books([["2026-01-10", "30000.00"], ["2026-10-01", "30000.00"]]);
  const none = annualizedInstallments(b, { year: 2026 });
  const first = none.rows[0];
  assert.ok(first.cumulativeRequired > 0);
  const late = annualizedInstallments(b, { year: 2026, payments: [{ date: "2026-12-01", cents: first.cumulativeRequired }] });
  assert.equal(late.rows[0].shortfall, first.shortfall);
  const onTime = annualizedInstallments(b, { year: 2026, payments: [{ date: first.due, cents: first.cumulativeRequired }] });
  assert.equal(onTime.rows[0].shortfall, 0);
});

test("a prior-year safe harbour that is smaller caps the regular quarter", () => {
  const b = books([["2026-10-01", "60000.00"]]);
  const r = annualizedInstallments(b, { year: 2026, priorYearTax: 400000, priorAgi: 3000000 });
  assert.equal(r.requiredAnnual, 400000);
  assert.equal(r.regularQuarter, 100000);
  assert.ok(r.rows.every((x) => x.cumulativeRequired <= 400000));
});

test("period factors are 12 over the months elapsed and percentages are 22.5% a step", () => {
  const months = [3, 5, 8, 12];
  PERIODS.forEach((p, i) => {
    assert.ok(p.end.startsWith(String(months[i]).padStart(2, "0")), p.label);
    assert.equal(p.factor, 12 / months[i]);
    assert.ok(Math.abs(p.pct - 0.225 * (i + 1)) < 1e-12);
  });
});

// Figures printed on the 2025 Form 2210, Schedule AI (irs.gov/pub/irs-pdf/f2210.pdf, read 2026-11-11).
import { annualizedSelfEmployment } from "./annualized.mjs";
import { selfEmployment, SS_WAGE_BASE } from "./taxforms.mjs";

test("Schedule AI as printed on the 2025 form: lines 2, 20, 29, 32 and 34", () => {
  assert.deepEqual(PERIODS.map((p) => p.factor), [4, 2.4, 1.5, 1]); // line 2
  assert.deepEqual(PERIODS.map((p) => p.pct), [0.225, 0.45, 0.675, 0.9]); // line 20
  assert.deepEqual(PERIODS.map((p) => p.seSs), [0.496, 0.2976, 0.186, 0.124]); // line 32
  assert.deepEqual(PERIODS.map((p) => p.seMed), [0.116, 0.0696, 0.0435, 0.029]); // line 34
  // line 29, "Prorated social security tax limit": $44,025, $73,375, $117,400, $176,100
  assert.deepEqual([0, 1, 2, 3].map((i) => annualizedSelfEmployment(1e9, i, { year: 2025 }).line29), [4402500, 7337500, 11740000, 17610000]);
  // and each line 32/34 amount is 12.4% / 2.9% times line 2, so Part II is the year's tax on annualized earnings
  PERIODS.forEach((p) => {
    assert.ok(Math.abs(p.seSs - 0.124 * p.factor) < 1e-12);
    assert.ok(Math.abs(p.seMed - 0.029 * p.factor) < 1e-12);
  });
  assert.equal(SS_WAGE_BASE[2025], 17610000);
});

test("Part II matches self-employment tax on annualized profit, within rounding, above $400 and under the wage base", () => {
  for (const profit of [500000, 2000000, 6000000, 15000000]) {
    PERIODS.forEach((p, i) => {
      const part = annualizedSelfEmployment(profit, i, { year: 2025 });
      const whole = selfEmployment(Math.round(profit * p.factor), { year: 2025 });
      assert.ok(Math.abs(part.line36 - whole.tax) <= 3, `${profit} col ${i}: ${part.line36} vs ${whole.tax}`);
    });
  }
});

test("period earnings under $400 owe no self-employment tax in that column (instructions, Line 28)", () => {
  // $300 of profit by March 31: $277 of net earnings, annualized $1,108, which the old shortcut taxed.
  const p = annualizedSelfEmployment(30000, 0, { year: 2025 });
  assert.equal(p.line28, 0);
  assert.equal(p.line36, 0);
  assert.ok(selfEmployment(120000, { year: 2025 }).tax > 0);
  // wages for the period use up the prorated base first (line 30, 31)
  const w = annualizedSelfEmployment(5000000, 0, { year: 2025, periodWages: 4402500 });
  assert.equal(w.line31, 0);
  assert.equal(w.line33, 0);
  assert.equal(w.line35, Math.round(Math.round(5000000 * 0.9235) * 0.116));
});

test("the penalty is figured both ways and box C is suggested when Schedule AI lowers it", () => {
  // 60,000 earned on Oct 1, 2025, single, nothing paid until January 15: the regular method is late
  // on three dates; Schedule AI asks for nothing before January.
  const b = books([["2025-10-01", "60000.00"]]);
  const none = annualizedInstallments(b, { year: 2025 });
  const due = none.rows[3].installment;
  const r = annualizedInstallments(b, { year: 2025, payments: [{ date: "2026-01-15", cents: none.regularQuarter * 4 }] });
  assert.ok(r.penalty.regular > 0);
  assert.equal(r.penalty.annualized, 0);
  assert.equal(r.penalty.useScheduleAI, true);
  assert.ok(r.warnings.some((w) => /box C/.test(w)));
  assert.ok(due > 0);
  // hand check of the regular method: each quarter q unpaid from its date to 1/15/26 at 7%
  const q = r.regularQuarter, amt = (n) => Math.round((q * n * 0.07) / 365);
  assert.equal(r.penalty.regular, amt(76) + amt(92) + amt(92) + amt(15) /* 4/15 */ + amt(15) + amt(92) + amt(92) + amt(15) /* 6/15 */ + amt(15) + amt(92) + amt(15) /* 9/15 */);
});

test("under $1,000 of tax after withholding owes no penalty", () => {
  const r = annualizedInstallments(books([["2025-10-01", "3000.00"]]), { year: 2025 });
  assert.equal(r.penalty.exempt, true);
  assert.equal(r.penalty.regular, 0);
});

test("tax paid with a return filed by January 31 removes the January 15 penalty", () => {
  const b = books([["2025-10-01", "60000.00"]]);
  const q = annualizedInstallments(b, { year: 2025 }).regularQuarter;
  const jan15 = annualizedInstallments(b, { year: 2025, payments: [{ date: "2026-01-15", cents: q * 4 }] });
  const filed = annualizedInstallments(b, { year: 2025, payments: [{ date: "2026-01-30", cents: q * 4, withReturn: true }] });
  // Filed January 30 it lands in column (d) as a January 15 payment would; the earlier columns of
  // the regular method run 15 more days, and Schedule AI (nothing due before January) owes nothing.
  assert.equal(filed.penalty.annualized, 0);
  assert.ok(filed.penalty.regular > jan15.penalty.regular);
  assert.equal(filed.rows[3].creditsByDue, q * 4);
  assert.ok(!filed.warnings.some((w) => /January 31 \(mark it/.test(w)));
  assert.ok(jan15.warnings.some((w) => /January 31 \(mark it/.test(w)));
});
