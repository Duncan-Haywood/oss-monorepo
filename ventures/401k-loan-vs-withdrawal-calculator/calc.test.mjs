import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, analyze, payment, balanceAfter, costs, toCsv, num } from "./calc.mjs";

const near = (a, b, e = 0.01) => assert.ok(Math.abs(a - b) <= e, `${a} vs ${b}`);

test("payment matches the standard amortisation figure and amortises to zero", () => {
  near(payment(10000, 6, 5), 193.33, 0.01);
  near(balanceAfter(10000, 6, 5, 60), 0, 0.01);
  near(payment(1200, 0, 1), 100);
  near(balanceAfter(1200, 0, 1, 6), 600);
});

test("withdrawal gross-up nets exactly the cash needed", () => {
  const o = { ...DEFAULTS };
  const c = costs(o);
  near(c.gross * (1 - o.nowTaxPct / 100 - o.penaltyPct / 100), o.need, 1e-6);
});

test("withdrawal cost is the gross amount grown to the horizon, after retirement tax", () => {
  const o = { ...DEFAULTS, growthPct: 6, horizonYears: 10, retTaxPct: 20 };
  const c = costs(o);
  near(c.withdrawalCost, 0.8 * c.gross * Math.pow(1.06, 10), 1e-6);
});

test("with zero growth, zero retirement tax and zero spare return, loan cost is just the interest net of nothing", () => {
  const o = { ...DEFAULTS, growthPct: 0, retTaxPct: 0, sparePct: 0, loanFee: 0, horizonYears: 10 };
  const c = costs(o);
  // principal leaves, payments (principal + interest) return, but the payments are cash out of pocket:
  // shortfall = L - total paid = -interest; cash = total paid; cost = L = need.
  near(c.loanCost, o.need, 1e-6);
});

test("an outside loan at 0% APR and 0% spare return costs exactly the principal", () => {
  const c = costs({ ...DEFAULTS, outsideAprPct: 0, sparePct: 0 });
  near(c.outsideCost, DEFAULTS.need, 1e-6);
});

test("higher growth makes the withdrawal worse and never helps it relative to the outside loan", () => {
  const a = analyze({});
  const lo = a.sens[0], hi = a.sens[a.sens.length - 1];
  assert.ok(hi.withdrawal > lo.withdrawal);
  assert.equal(lo.outside, hi.outside);
});

test("default example ranks loan, outside loan, withdrawal", () => {
  const a = analyze({});
  assert.deepEqual(a.result.ranked.map((r) => r.key), ["loan", "outside", "withdrawal"]);
  assert.equal(a.result.cheapest.key, "loan");
});

test("separation risk uses the balance still owed", () => {
  const a = analyze({ leaveAfterMonths: 0 });
  near(a.result.separation.owed, a.result.loanAmount, 1e-6);
  near(a.result.separation.taxAndPenalty, a.result.loanAmount * 0.37, 1e-6);
});

test("plan loan limit: greater of 10k or half, capped at 50k, never above balance", () => {
  assert.equal(costs({ ...DEFAULTS, balance: 80000 }).maxLoan, 40000);
  assert.equal(costs({ ...DEFAULTS, balance: 12000 }).maxLoan, 10000);
  assert.equal(costs({ ...DEFAULTS, balance: 6000 }).maxLoan, 6000);
  assert.equal(costs({ ...DEFAULTS, balance: 500000 }).maxLoan, 50000);
});

test("warnings and notes", () => {
  assert.ok(analyze({ need: 0 }).warnings.length);
  assert.ok(analyze({ loanTermYears: 30, horizonYears: 20 }).warnings.length);
  assert.equal(analyze({ need: 30000, balance: 30000 }).result.cheapest !== undefined, true);
  assert.ok(analyze({ need: 45000, balance: 50000 }).notes.some((n) => /above the usual plan limit/.test(n)));
  assert.ok(analyze({ penaltyPct: 0 }).notes.some((n) => /59½/.test(n)));
});

test("num parses money and percent strings; csv has a row per growth rate", () => {
  assert.equal(num("$1,250"), 1250);
  assert.ok(Number.isNaN(num("")));
  assert.equal(toCsv(analyze({})).trim().split("\n").length, 6);
});
