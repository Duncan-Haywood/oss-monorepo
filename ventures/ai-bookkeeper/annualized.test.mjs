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
