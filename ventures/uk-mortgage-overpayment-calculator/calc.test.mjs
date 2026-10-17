import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, SAMPLE, summaryText, scheduledPayment, simulate, extraForTarget } from "./calc.mjs";

test("scheduled payment matches the standard annuity figure", () => {
  assert.equal(Math.round(scheduledPayment(200000, 4.5, 300) * 100) / 100, 1111.66);
  assert.equal(scheduledPayment(120000, 0, 240), 500);
});

test("with no overpayment the loan ends at the original term", () => {
  const s = simulate({ balance: 200000, ratePct: 4.5, months: 300, monthly: 0, lump: 0, savingsRatePct: 0 });
  assert.equal(s.paidOffMonth, 300);
  assert.equal(Math.round(s.interest), 133499);
});

test("monthly overpayment shortens the term and saves interest", () => {
  const r = compute(SAMPLE);
  assert.equal(r.errors.length, 0);
  assert.equal(r.over.paidOffMonth, 227);
  assert.equal(r.monthsSaved, 73);
  assert.ok(r.interestSaved > 36000 && r.interestSaved < 36600);
});

test("a lump sum alone saves interest", () => {
  const r = compute({ ...SAMPLE, monthly: "0", lump: "20000" });
  assert.equal(r.errors.length, 0);
  assert.ok(r.interestSaved > 0 && r.monthsSaved > 0);
});

test("overpaying beats saving only when the mortgage rate is higher", () => {
  assert.ok(compute({ ...SAMPLE, savingsRate: "3.5" }).advantage > 0);
  const r = compute({ ...SAMPLE, rate: "2", savingsRate: "5" });
  assert.ok(r.advantage < 0);
  assert.ok(r.findings.some((f) => f.severity === "high" && /Saving the same money/.test(f.title)));
});

test("zero-rate savings: advantage equals interest saved", () => {
  const r = compute({ ...SAMPLE, savingsRate: "0" });
  assert.ok(Math.abs(r.advantage - r.interestSaved) < 0.5);
});

test("early repayment charge allowance is flagged", () => {
  assert.equal(compute(SAMPLE).withinErc, true);
  const r = compute({ ...SAMPLE, monthly: "0", lump: "30000" });
  assert.equal(r.withinErc, false);
  assert.ok(r.findings.some((f) => /early repayment charge/.test(f.title)));
});

test("target payoff solves for the needed monthly overpayment", () => {
  const need = extraForTarget(200000, 4.5, 300, 240);
  assert.equal(need, 154);
  assert.ok(simulate({ balance: 200000, ratePct: 4.5, months: 300, monthly: need, lump: 0, savingsRatePct: 0 }).paidOffMonth <= 240);
  assert.equal(compute({ ...SAMPLE, targetYears: "20" }).targetExtra, need);
  assert.equal(extraForTarget(200000, 4.5, 300, 300), 0);
});

test("bad input is refused with a message", () => {
  assert.ok(compute({ ...SAMPLE, balance: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, monthly: "0", lump: "0" }).errors.length);
  assert.ok(compute({ ...SAMPLE, rate: "-1" }).errors.length);
  assert.ok(compute({ ...SAMPLE, years: "50" }).errors.length);
  assert.ok(compute({ ...SAMPLE, monthly: "0", lump: "300000" }).errors.length);
});

test("overpaying more than the balance never leaves a negative balance", () => {
  const s = simulate({ balance: 10000, ratePct: 5, months: 60, monthly: 5000, lump: 0, savingsRatePct: 0 });
  assert.equal(s.endBalance, 0);
  assert.equal(s.paidOffMonth, 2);
});

test("summary names the saving and the disclaimer", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /saving £36,/);
  assert.match(t, /Not financial advice/);
});
