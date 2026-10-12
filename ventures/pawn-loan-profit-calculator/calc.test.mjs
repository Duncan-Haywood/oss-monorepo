import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, num, money, pct, saleFactor, loanEconomics, maxLoan, minLoan, breakEvenRedemption, redemptionLadder, ltvLadder, realizationLadder, analyze, toCsv } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
// Round numbers: no carry, no storage, no ticket cost, no fee, no shrink or selling cost, one month either way.
const plain = { ...DEFAULTS, avgLoan: 100, ltvPct: 50, redeemPct: 80, monthlyRatePct: 10, monthlyFee: 0, redeemMonths: 1, forfeitMonths: 3,
  forfeitPaidMonths: 1, realizationPct: 100, sellCostPct: 0, shrinkPct: 0, daysToSell: 0, ticketCost: 0, storagePerMonth: 0, capitalRatePct: 0 };

test("a redeemed loan earns its interest, a forfeited one earns interest plus the sale gain", () => {
  const e = loanEconomics(plain);
  near(e.profitRedeemed, 10);              // 100 x 10% x 1 month
  near(e.profitForfeited, 10 + 200 - 100); // item resells for 200
  near(e.profit, 0.8 * 10 + 0.2 * 110);    // 30
  near(e.margin, 30);
});

test("sale factor multiplies realization, selling cost and shrink", () => {
  near(saleFactor({ ...plain, realizationPct: 80, sellCostPct: 10, shrinkPct: 5 }), 0.8 * 0.9 * 0.95);
});

test("a forfeited item that sells below the loan is a loss", () => {
  const e = loanEconomics({ ...plain, ltvPct: 100, realizationPct: 70 });
  near(e.profitForfeited, 10 - 30);
  assert.ok(e.expectedLoss > 0);
});

test("ticket cost, storage and the cost of money come off both outcomes", () => {
  const e = loanEconomics({ ...plain, ticketCost: 5, storagePerMonth: 1, capitalRatePct: 12 });
  near(e.profitRedeemed, 10 - 5 - 1 - 100 * 0.01);
  near(e.profitForfeited, 110 - 5 - 3 - 100 * 0.01 * 3);
});

test("redemption rate moves profit linearly", () => {
  const a = loanEconomics(plain, { redeem: 0 }).profit, b = loanEconomics(plain, { redeem: 100 }).profit;
  near(loanEconomics(plain, { redeem: 40 }).profit, a + 0.4 * (b - a));
});

test("break-even redemption: zero when both outcomes pay, NaN when neither does", () => {
  assert.equal(breakEvenRedemption(plain), 0);
  assert.ok(Number.isNaN(breakEvenRedemption({ ...plain, monthlyRatePct: 0, ticketCost: 5, ltvPct: 100, realizationPct: 90 })));
});

test("break-even redemption lands where profit is zero", () => {
  const o = { ...plain, ltvPct: 100, realizationPct: 60, ticketCost: 2 };
  const be = breakEvenRedemption(o);
  assert.ok(be > 0 && be < 100);
  near(loanEconomics(o, { redeem: be }).profit, 0, 1e-6);
});

test("max loan on an item earns exactly the target margin", () => {
  const o = { ...DEFAULTS, monthlyRatePct: 6, redeemPct: 60 };
  const L = maxLoan(o, 400, 12);
  assert.ok(L > 0 && L < 400);
  const e = loanEconomics(o, { loan: L, retail: 400 });
  near(e.margin, 12, 1e-6);
});

test("a lower profit target allows a bigger loan", () => {
  const o = { ...DEFAULTS };
  const t = { ...o, monthlyRatePct: 6 };
  assert.ok(maxLoan(t, 400, 5) > maxLoan(t, 400, 20));
});

test("max loan is never more than the item's value and never negative", () => {
  assert.ok(maxLoan({ ...DEFAULTS, monthlyRatePct: 60 }, 400, 1) <= 400);
  assert.equal(maxLoan({ ...DEFAULTS, realizationPct: 1, ticketCost: 500 }, 400, 12), 0);
});

test("smallest loan that pays is where profit crosses zero", () => {
  const o = { ...DEFAULTS };
  const L = minLoan(o);
  near(loanEconomics(o, { loan: L, retail: L / (o.ltvPct / 100) }).profit, 0, 1e-6);
  assert.ok(minLoan({ ...o, ticketCost: 12 }) > L);
});

test("ladders have one row per step and profit falls as loan-to-value rises", () => {
  const o = { ...DEFAULTS };
  assert.equal(redemptionLadder(o).length, 7);
  const l = ltvLadder(o);
  for (let i = 1; i < l.length; i++) assert.ok(l[i].profit <= l[i - 1].profit);
  const r = realizationLadder(o);
  for (let i = 1; i < r.length; i++) assert.ok(r[i].profit >= r[i - 1].profit);
});

test("analyze: defaults produce a result, book totals and no warnings about validity", () => {
  const a = analyze({});
  assert.ok(a.result);
  near(a.result.monthlyProfit, a.result.base.profit * DEFAULTS.loansPerMonth);
  assert.ok(a.result.capitalOut > 0);
  near(a.result.effectiveApr, 120);
});

test("analyze rejects impossible input", () => {
  assert.equal(analyze({ avgLoan: 0 }).result, null);
  assert.equal(analyze({ ltvPct: 120 }).result, null);
  assert.equal(analyze({ redeemPct: 130 }).result, null);
  assert.equal(analyze({ ticketCost: -1 }).result, null);
  assert.equal(analyze({ sellCostPct: 100 }).result, null);
});

test("analyze warns on a losing book and on loans below the smallest that pays", () => {
  const a = analyze({ ltvPct: 100, realizationPct: 50, redeemPct: 40 });
  assert.ok(a.warnings.some((w) => /loses money/.test(w)));
  const b = analyze({ avgLoan: 5, ticketCost: 12 });
  assert.ok(b.warnings.some((w) => /smallest loan that pays/.test(w)));
});

test("analyze accepts formatted numbers and falls back to defaults on junk", () => {
  assert.equal(num("$1,250"), 1250);
  assert.equal(num("12%"), 12);
  assert.equal(analyze({ avgLoan: "abc" }).opts.avgLoan, DEFAULTS.avgLoan);
});

test("money and pct format", () => {
  assert.equal(money(-1234.4), "-$1,234");
  assert.equal(pct(12.34), "12.3%");
});

test("csv has the three blocks", () => {
  const csv = toCsv(analyze({}));
  assert.match(csv, /^redemption_pct,profit_per_loan/);
  assert.match(csv, /loan_to_value_pct,/);
  assert.match(csv, /sale_realization_pct,/);
  assert.equal(toCsv(null), "");
});
