// Property test for breakEven and daysOutstanding: seeded random profit-and-loss
// shapes (made up, no outside data). Invariants: at the break-even income the
// contribution covers the fixed costs to within a cent of rounding; a business
// that earned more than break-even has a positive margin of safety and a profit,
// one that earned less a negative margin and a loss; null rather than a number
// when a sale leaves nothing; days outstanding scale with the open balance.
import test from "node:test";
import assert from "node:assert/strict";
import { breakEven, daysOutstanding } from "./ledger.mjs";

const rng = (seed) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

test("breakEven holds its invariants on 800 random profit and loss statements", () => {
  const r = rng(20261027), pick = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const codes = ["5000", "6010", "6180", "6080", "6100", "6200", "6300"];
  for (let i = 0; i < 800; i++) {
    const months = pick(1, 12), totalIncome = pick(1, 5_000_000_00);
    const expense = codes.filter(() => r() < 0.6).map((code) => ({ code, total: pick(0, Math.round(totalIncome * 0.5)) }));
    const totalExpense = expense.reduce((a, l) => a + l.total, 0);
    const pnl = { months: Array.from({ length: months }, (_, k) => `2026-${k + 1}`), totalIncome, totalExpense, expense };
    const b = breakEven(pnl), tag = JSON.stringify(pnl);
    assert.equal(b.variableCosts + b.fixedCosts, totalExpense, tag);
    assert.equal(b.months, months, tag);
    if (b.contributionMargin <= 0) {
      assert.equal(b.breakEvenMonthly, null, tag);
      assert.equal(b.marginOfSafety, null, tag);
      continue;
    }
    // Margin is rounded to 0.001 and the fixed figure to a cent, so allow their effect.
    const slack = Math.ceil(b.monthlyFixed * 0.0005 / (b.contributionMargin * b.contributionMargin)) + 2;
    assert.ok(Math.abs(b.breakEvenMonthly - b.monthlyFixed / b.contributionMargin) <= slack, "break-even income covers fixed costs " + tag);
    const profitable = totalIncome - totalExpense > months * slack;
    const losing = totalIncome - totalExpense < -months * slack;
    if (profitable) assert.ok(b.marginOfSafety > 0, "profit means a margin of safety " + tag);
    if (losing) assert.ok(b.marginOfSafety < 0, "loss means a negative margin " + tag);
    assert.ok(b.marginOfSafety <= 1, tag);
  }
});

test("daysOutstanding is proportional to the open balance and null when nothing is open", () => {
  const pnl = { months: ["2026-1", "2026-2", "2026-3"], totalIncome: 900_000, totalExpense: 450_000 };
  const bs = (ar, ap) => ({ assets: ar ? [{ code: "1100", amount: ar }] : [], liabilities: ap ? [{ code: "2050", amount: ap }] : [] });
  const one = daysOutstanding(pnl, bs(100_000, 50_000)), two = daysOutstanding(pnl, bs(200_000, 100_000));
  assert.ok(Math.abs(two.receivableDays - 2 * one.receivableDays) <= 0.2);
  assert.ok(Math.abs(two.payableDays - 2 * one.payableDays) <= 0.2);
  assert.deepEqual(daysOutstanding(pnl, bs(0, 0)), { receivableDays: null, payableDays: null });
  assert.equal(daysOutstanding({ ...pnl, totalIncome: 0 }, bs(1000, 0)).receivableDays, null);
});
