import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, monthlyPayment, perCup, sampleInput, toCsv, validate } from "./calc.mjs";

// Everything zero except the numbers each test names, so the arithmetic can be done by hand.
const zero = Object.fromEntries(Object.keys(sampleInput()).map((k) => [k, 0]));
const base = { ...zero, price: 5, drinkCost: 1, packagingCost: 0.5, cupsPerDay: 100, daysPerMonth: 30, rent: 3000, loanTermMonths: 12, rampMonths: 1, startVolumePct: 100 };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("contribution per cup = revenue - ingredients - percent costs", () => {
  const pc = perCup({ ...base, toppingAttachPct: 50, toppingPrice: 1, toppingCost: 0.2, wastePct: 10, cardFeePct: 10 });
  near(pc.revenue, 5.5);
  near(pc.ingredients, (1 + 0.1 + 0.5) * 1.1);
  near(pc.percent, 0.55);
  near(pc.contribution, 5.5 - 1.76 - 0.55);
});

test("delivery commission applies to the delivery share only", () => {
  near(perCup({ ...base, deliverySharePct: 20, deliveryCommissionPct: 30 }).percent, 5 * 0.2 * 0.3);
});

test("monthly profit and break-even cups, by hand", () => {
  const r = analyze(base);
  near(r.operating, 100 * 30 * 3.5 - 3000); // 7500
  assert.equal(r.breakEvenOperatingCupsDay, 29); // 3000 / (30 * 3.5) = 28.57
  assert.equal(r.breakEvenCupsDay, 29);
});

test("loan payment is added to break-even", () => {
  const r = analyze({ ...base, startupCost: 12000, equity: 0, loanRatePct: 0 });
  near(r.payment, 1000);
  assert.equal(r.breakEvenCupsDay, 39); // 4000 / 105 = 38.1
  near(r.net, 7500 - 1000);
});

test("amortised payment matches the standard formula", () => {
  near(monthlyPayment(100000, 6, 360), 599.55, 0.01);
  assert.equal(monthlyPayment(0, 6, 360), 0);
});

test("equity above the startup cost means no loan", () => {
  assert.equal(analyze({ ...base, startupCost: 10000, equity: 20000 }).payment, 0);
});

test("labour = hours x days x wage x (1 + payroll tax)", () => {
  near(analyze({ ...base, staffHoursPerDay: 20, wage: 15, payrollTaxPct: 10 }).labour, 20 * 30 * 15 * 1.1);
});

test("the target-margin price round-trips to exactly the target margin", () => {
  const input = { ...base, cardFeePct: 3, deliverySharePct: 20, deliveryCommissionPct: 25, startupCost: 12000, loanRatePct: 0, targetMarginPct: 15, toppingAttachPct: 50, toppingPrice: 1, toppingCost: 0.2 };
  const r = analyze(input);
  const again = analyze({ ...input, price: r.targetPrice });
  near(again.netMarginPct, 15, 1e-6);
});

test("an unreachable target margin gives no price instead of a wrong one", () => {
  assert.equal(analyze({ ...base, cardFeePct: 60, deliverySharePct: 100, deliveryCommissionPct: 50, targetMarginPct: 20 }).targetPrice, null);
});

test("volume sweep is linear in cups and cost shock lowers profit", () => {
  const r = analyze(base);
  near(r.sweep.find((s) => s.changePct === 0).net, r.net);
  near(r.sweep.find((s) => s.changePct === 10).net - r.net, 10 * 30 * 3.5);
  assert.ok(r.costShock[3].net < r.costShock[0].net);
});

test("ramp: equity is spent up front, loan stops after its term, payback is the first non-negative month", () => {
  const r = analyze({ ...base, startupCost: 12000, equity: 12000, rent: 3000 });
  assert.equal(r.ramp.length, 60);
  assert.equal(r.payback, 2); // 7500 a month recoups 12000 in month 2
  near(r.ramp[0].cumulative, -12000 + 7500);
  const looped = analyze({ ...base, startupCost: 24000, equity: 0, loanRatePct: 0, loanTermMonths: 12 });
  near(looped.ramp[0].cash, 7500 - 2000);
  near(looped.ramp[12].cash, 7500); // month 13: loan is paid off
});

test("a ramp from 50% volume burns a working-capital reserve", () => {
  const r = analyze({ ...base, rent: 6000, startVolumePct: 50, rampMonths: 4, equity: 1000, startupCost: 1000 });
  assert.ok(r.reserveNeeded > 0);
  assert.ok(r.lowestMonth >= 1);
});

test("bad input is rejected, not clamped", () => {
  assert.match(analyze({ ...base, price: -1 }).error, /price/);
  assert.match(analyze({ ...base, wastePct: 120 }).error, /wastePct/);
  assert.match(analyze({ ...base, cupsPerDay: "" }).error, /empty/);
  assert.match(analyze({ ...base, rent: "abc" }).error, /not a number/);
  assert.match(analyze({ ...base, loanTermMonths: 0 }).error, /loanTermMonths/);
  assert.equal(validate(sampleInput()), null);
});

test("sample input analyses and the CSV has 60 months", () => {
  const r = analyze(sampleInput());
  assert.ok(!r.error);
  assert.ok(r.advice.length >= 5);
  assert.equal(toCsv(r).split("\n").length, 61);
});
