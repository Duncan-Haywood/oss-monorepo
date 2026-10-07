import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, monthlyPayment, principalFromMonthly, cashFlowAvailable, coverage, maxLoan, assess, termGrid, rateGrid, cashFlowStress, cashFlowNeeded, num, money, ratio } from "./calc.mjs";

const base = { ...DEFAULTS };
const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("payment matches the textbook figure", () => {
  near(monthlyPayment(100000, 6, 30), 599.55, 0.01);
  near(monthlyPayment(12000, 0, 1), 1000);
});

test("principal is the inverse of payment", () => {
  near(principalFromMonthly(monthlyPayment(250000, 9.25, 10), 9.25, 10), 250000, 0.001);
  assert.equal(principalFromMonthly(0, 9, 10), 0);
});

test("cash flow available restores add-backs and subtracts capex", () => {
  assert.equal(cashFlowAvailable({ ...base, netIncome: 100, interestExpense: 10, depreciation: 20, otherAddBacks: 5, ownerCompAdjustment: -15, maintenanceCapex: 4 }), 116);
});

test("max loan lands exactly on the required DSCR", () => {
  const m = maxLoan(base);
  const ds = m.loan > 0 ? (m.payment * 12) : 0;
  near(m.cfads / (ds + base.existingDebtService), base.requiredDscr, 1e-9);
  const a = assess({ ...base, requestedLoan: m.loan });
  near(a.businessDscr, base.requiredDscr, 1e-9);
  assert.ok(Math.abs(a.cushionPct) < 1e-6);
});

test("fee reduces net proceeds, not capacity", () => {
  const a = maxLoan(base), b = maxLoan({ ...base, feePct: 0 });
  near(a.loan, b.loan, 1e-6);
  assert.ok(a.netProceeds < b.netProceeds);
});

test("a longer term or a lower rate supports a bigger loan", () => {
  const t = termGrid(base);
  for (let i = 1; i < t.length; i++) assert.ok(t[i].loan > t[i - 1].loan);
  const r = rateGrid(base);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].loan < r[i - 1].loan);
});

test("existing debt eats capacity; too much debt gives zero, never negative", () => {
  assert.ok(maxLoan({ ...base, existingDebtService: 60000 }).loan < maxLoan(base).loan);
  const none = maxLoan({ ...base, existingDebtService: 500000 });
  assert.equal(none.loan, 0);
  assert.ok(none.roomYear < 0);
});

test("stress shrinks capacity step by step", () => {
  const s = cashFlowStress(base);
  assert.equal(s[0].loan, maxLoan(base).loan);
  for (let i = 1; i < s.length; i++) assert.ok(s[i].loan <= s[i - 1].loan);
});

test("assess flags a loan that is too big and sizes the owner's cash in", () => {
  const big = assess({ ...base, requestedLoan: 2000000 });
  assert.equal(big.passes, false);
  assert.ok(big.cushionPct < 0);
  const ok = assess({ ...base, requestedLoan: 100000, projectCost: 100000 });
  assert.equal(ok.passes, true);
  assert.equal(ok.cashIn, 10000);
  assert.equal(ok.fee, 3500);
});

test("cash in covers the gap the loan, net of fee, leaves", () => {
  const a = assess({ ...base, requestedLoan: 300000, projectCost: 500000, equityPct: 10 });
  assert.equal(a.cashIn, 500000 - (300000 - 10500));
  assert.equal(a.fundsProject, true);
});

test("global coverage counts the household", () => {
  const a = coverage(base, 50000);
  const worse = coverage({ ...base, livingExpenses: 90000 }, 50000);
  assert.ok(worse.global < a.global);
  assert.equal(worse.business, a.business);
});

test("cash flow needed equals coverage times debt service", () => {
  const o = { ...base, requestedLoan: 300000 };
  near(cashFlowNeeded(o), 1.25 * (monthlyPayment(300000, 10.5, 10) * 12 + 18000), 1e-6);
});

test("num and money helpers", () => {
  assert.equal(num("$1,250.5"), 1250.5);
  assert.ok(Number.isNaN(num("")));
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(ratio(Infinity), "n/a");
});
