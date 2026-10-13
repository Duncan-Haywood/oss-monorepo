import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, monthlyPayment, perOrder, sampleInput, toCsv, validate } from "./calc.mjs";

// Everything zero except the numbers each test names, so the arithmetic can be done by hand.
const zero = Object.fromEntries(Object.keys(sampleInput()).map((k) => [k, 0]));
const base = { ...zero, ticket: 20, foodCostPct: 30, packagingCost: 1, ordersPerDay: 100, daysPerMonth: 30, rent: 3000, loanTermMonths: 12, rampMonths: 1, startVolumePct: 100 };
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) < e, `${a} !~ ${b}`);

test("contribution per order = ticket - food - packaging - percent costs - drivers", () => {
  const po = perOrder({ ...base, wastePct: 10, cardFeePct: 10, ownDeliverySharePct: 50, driverCostPerOrder: 6 });
  near(po.revenue, 20);
  near(po.ingredients, 20 * 0.3 * 1.1 + 1);
  near(po.percent, 2);
  near(po.driver, 3);
  near(po.contribution, 20 - 7.6 - 2 - 3);
});

test("app commission applies to the app share only; driver cost to own-delivery share only", () => {
  near(perOrder({ ...base, appSharePct: 20, appCommissionPct: 30 }).percent, 20 * 0.2 * 0.3);
  near(perOrder({ ...base, ownDeliverySharePct: 40, driverCostPerOrder: 5 }).driver, 2);
});

test("monthly profit and break-even orders, by hand", () => {
  const r = analyze(base);
  near(r.operating, 100 * 30 * 13 - 3000); // contribution 20 - 6 - 1 = 13
  assert.equal(r.breakEvenOperatingOrdersDay, 8); // 3000 / (30*13) = 7.69
  assert.equal(r.breakEvenOrdersDay, 8);
});

test("loan payment is added to break-even", () => {
  const r = analyze({ ...base, startupCost: 12000, equity: 0, loanRatePct: 0 });
  near(r.payment, 1000);
  assert.equal(r.breakEvenOrdersDay, 11); // 4000 / 390 = 10.26
  near(r.net, 39000 - 3000 - 1000);
});

test("amortised payment matches the standard formula", () => {
  near(monthlyPayment(100000, 6, 360), 599.55, 0.01);
  assert.equal(monthlyPayment(0, 6, 360), 0);
});

test("target ticket reproduces the target margin when fed back in", () => {
  const input = { ...sampleInput(), targetMarginPct: 10 };
  const r = analyze(input);
  assert.ok(r.targetTicket > 0);
  const again = analyze({ ...input, ticket: r.targetTicket });
  near(again.netMarginPct, 10, 1e-6);
});

test("target ticket is null when percent costs leave no room", () => {
  const r = analyze({ ...base, foodCostPct: 90, cardFeePct: 5, targetMarginPct: 10 });
  assert.equal(r.targetTicket, null);
});

test("rejects blank, non-numeric, out-of-range and over-100% channel shares instead of clamping", () => {
  assert.match(validate({ ...base, ticket: "" }), /empty/);
  assert.match(validate({ ...base, ticket: "abc" }), /not a number/);
  assert.match(validate({ ...base, foodCostPct: 101 }), /between/);
  assert.match(validate({ ...base, ownDeliverySharePct: 60, appSharePct: 50 }), /exceed 100/);
  assert.equal(validate(base), null);
  assert.ok(analyze({ ...base, ticket: -1 }).error);
});

test("a ticket that cannot cover its own costs reports no break-even", () => {
  const r = analyze({ ...base, ticket: 1 });
  assert.equal(r.breakEvenOrdersDay, null);
  assert.match(r.advice[1], /no volume reaches break-even/);
});

test("ramp: cumulative starts at minus cash in; reserve is the dip beyond it; payback month found", () => {
  const input = { ...sampleInput() };
  const r = analyze(input);
  assert.equal(r.ramp.length, 60);
  near(r.ramp[0].volumePct, input.startVolumePct);
  near(r.ramp[input.rampMonths - 1].volumePct, 100);
  let cum = -input.equity;
  for (const m of r.ramp) { cum += m.cash; near(m.cumulative, cum, 1e-6); }
  assert.ok(r.reserveNeeded >= 0);
  if (r.payback !== null) assert.ok(r.ramp[r.payback - 1].cumulative >= 0 && (r.payback === 1 || r.ramp[r.payback - 2].cumulative < 0));
});

test("sample input analyses cleanly and the CSV has 61 rows", () => {
  const r = analyze(sampleInput());
  assert.ok(!r.error);
  assert.equal(toCsv(r).split("\n").length, 61);
  assert.ok(r.advice.length >= 5);
});

test("cost shock lowers net monotonically", () => {
  const r = analyze(sampleInput());
  for (let i = 1; i < r.costShock.length; i++) assert.ok(r.costShock[i].net < r.costShock[i - 1].net);
});
