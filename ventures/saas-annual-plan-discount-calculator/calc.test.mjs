import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annualDiscountOutcome, annualPlanPV, monthlyPlanPV, breakEvenDiscount,
  breakEvenDiscountClosedForm, sensitivityTable,
} from "./calc.mjs";

const base = {
  price: 100, grossMargin: 0.8, monthlyChurn: 0.03, renewalRate: 0.7,
  discount: 0.15, costOfCapital: 0.12, horizonMonths: 12,
};
const inp = (o = {}) => annualDiscountOutcome({ ...base, ...o }).input;
const close = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

test("no churn, no cost of capital, 12 months: monthly PV is 12 months of profit", () => {
  const i = inp({ monthlyChurn: 0, costOfCapital: 0 });
  close(monthlyPlanPV(i), 12 * 100 * 0.8);
});

test("no discount, no churn, no discounting: plans are identical over 12 months", () => {
  const i = inp({ monthlyChurn: 0, costOfCapital: 0, discount: 0 });
  close(annualPlanPV(i), monthlyPlanPV(i));
});

test("annual PV at 15% discount, zero cost of capital, 12 months, by hand", () => {
  // Charge 12*100*0.85 = 1020; cost 20/month * 12 = 240; profit 780.
  const i = inp({ costOfCapital: 0, discount: 0.15 });
  close(annualPlanPV(i), 780);
});

test("monthly PV with churn and zero discount rate is a geometric sum", () => {
  const i = inp({ costOfCapital: 0 });
  let expected = 0;
  for (let t = 0; t < 12; t += 1) expected += 80 * 0.97 ** t;
  close(monthlyPlanPV(i), expected);
});

test("second year is weighted by the renewal rate and discounted", () => {
  const i = inp({ horizonMonths: 24, costOfCapital: 0, discount: 0.2, renewalRate: 0.5 });
  // year profit = 12*100*0.8 - 240 = 720; total = 720 + 0.5*720
  close(annualPlanPV(i), 1080);
});

test("cost of capital raises the value of up-front cash", () => {
  const lo = annualDiscountOutcome({ ...base, costOfCapital: 0 });
  const hi = annualDiscountOutcome({ ...base, costOfCapital: 0.4 });
  assert.ok(hi.advantage > lo.advantage);
});

test("bisection matches the closed form across many inputs", () => {
  for (const churn of [0, 0.01, 0.03, 0.08]) {
    for (const renew of [0.5, 0.7, 0.9, 1]) {
      for (const h of [12, 24, 36]) {
        for (const k of [0, 0.1, 0.3]) {
          const i = inp({ monthlyChurn: churn, renewalRate: renew, horizonMonths: h, costOfCapital: k });
          const be = breakEvenDiscount(i);
          close(be.discount, breakEvenDiscountClosedForm(i), 1e-9);
        }
      }
    }
  }
});

test("at the break-even discount the two plans are worth the same", () => {
  const i = inp();
  const be = breakEvenDiscount(i);
  assert.equal(be.reason, "found");
  close(annualPlanPV(i, be.discount), monthlyPlanPV(i), 1e-6);
});

test("break-even is 0 with reason never when annual is worse at full price", () => {
  const i = inp({ renewalRate: 0.1, monthlyChurn: 0.01, horizonMonths: 24 });
  const be = breakEvenDiscount(i);
  assert.equal(be.discount, 0);
  assert.equal(be.reason, "never");
  const r = annualDiscountOutcome({ ...base, renewalRate: 0.1, monthlyChurn: 0.01, horizonMonths: 24 });
  assert.match(r.findings[0].title, /worth less even at full price/);
});

test("months free is 12 x discount", () => {
  const r = annualDiscountOutcome({ ...base, discount: 0.25 });
  assert.equal(r.monthsFree, 3);
  close(r.breakEvenMonthsFree, 12 * r.breakEven.discount, 0.01);
});

test("cash collected up front", () => {
  const r = annualDiscountOutcome({ ...base, discount: 0.2 });
  assert.equal(r.annualUpfront, 960);
  assert.equal(r.monthlyUpfront, 100);
});

test("higher churn on monthly plans raises the break-even discount", () => {
  const a = annualDiscountOutcome({ ...base, monthlyChurn: 0.02 }).breakEven.discount;
  const b = annualDiscountOutcome({ ...base, monthlyChurn: 0.06 }).breakEven.discount;
  assert.ok(b > a);
});

test("the switch share scales the dollar effect but not the break-even", () => {
  const full = annualDiscountOutcome({ ...base, switchShare: 1 });
  const part = annualDiscountOutcome({ ...base, switchShare: 0.25 });
  close(part.blended.pvChangePerCustomer, 0.25 * full.advantage, 0.01);
  assert.equal(part.breakEven.discount, full.breakEven.discount);
  assert.equal(annualDiscountOutcome(base).blended, null);
});

test("payment fee reduces both plans' value and is off by default", () => {
  const i0 = inp();
  const i1 = inp({ paymentFee: 0.03 });
  assert.ok(monthlyPlanPV(i1) < monthlyPlanPV(i0));
  assert.ok(annualPlanPV(i1) < annualPlanPV(i0));
});

test("sensitivity table has 7 discounts and a column per churn; 0% row equals annual-at-full-price gap", () => {
  const s = sensitivityTable(inp());
  assert.equal(s.rows.length, 7);
  assert.equal(s.rows[0].discount, 0);
  assert.equal(s.churns.length, 4);
  const i = inp();
  close(s.rows[0].cells[1], annualPlanPV(i, 0) - monthlyPlanPV(i), 0.01);
  // more discount always lowers the advantage
  for (let c = 0; c < 4; c += 1) {
    for (let r = 1; r < s.rows.length; r += 1) assert.ok(s.rows[r].cells[c] < s.rows[r - 1].cells[c]);
  }
});

test("zero churn falls back to fixed churn columns", () => {
  assert.deepEqual(sensitivityTable(inp({ monthlyChurn: 0 })).churns, [0.01, 0.02, 0.03, 0.05]);
});

test("invalid inputs are rejected with a reason", () => {
  for (const bad of [{ price: 0 }, { grossMargin: 1.2 }, { monthlyChurn: 1 }, { renewalRate: -0.1 },
    { discount: 1.5 }, { horizonMonths: 18 }, { switchShare: 2 }, { costOfCapital: -1 }]) {
    const r = annualDiscountOutcome({ ...base, ...bad });
    assert.ok(r.invalid, JSON.stringify(bad));
  }
});

test("a discount above the break-even is flagged high severity", () => {
  const r = annualDiscountOutcome({ ...base, discount: 0.9 });
  assert.equal(r.better, "monthly");
  assert.equal(r.findings[0].severity, "high");
  assert.match(r.findings[0].title, /above the break-even/);
});
