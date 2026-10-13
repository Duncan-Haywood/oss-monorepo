import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, SAMPLE, VERIFY, STATES, STATE_LIST } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: California part-timer accrues 1 hour per 30 worked, use capped at 40 a year, balance at 80", () => {
  const r = run({});
  assert.equal(r.errors.length, 0);
  assert.equal(r.use, 40);
  assert.ok(Math.abs(r.annualAccrual - 32 * 52 / 30) < 1e-9); // accrual is not capped; use is
  assert.equal(r.balCap, 80);
  assert.ok(Math.abs(r.annualCostEach - (32 * 52 / 30) * 22) < 1e-6);
  assert.equal(r.maxBalanceTotal, 80 * 22 * 12);
});

test("a 20 hour a week employee in Washington accrues 1 per 40 with no annual cap", () => {
  const r = run({ state: "WA", hoursPerWeek: 20, weeks: 52 });
  assert.equal(r.annualAccrual, 26);
  assert.equal(r.use, null);
});

test("New York use cap depends on employer size and tiny employers are unpaid", () => {
  assert.equal(run({ state: "NY", employees: 3 }).paid, false);
  assert.equal(run({ state: "NY", employees: 50, hoursPerWeek: 40 }).use, 40);
  assert.equal(run({ state: "NY", employees: 150, hoursPerWeek: 40 }).use, 56);
  assert.equal(run({ state: "NY", employees: 150, hoursPerWeek: 40 }).annualAccrual, 56);
});

test("Massachusetts: 11 employees pay, 10 do not", () => {
  assert.equal(run({ state: "MA", employees: 10 }).paid, false);
  assert.equal(run({ state: "MA", employees: 11 }).paid, true);
  assert.equal(run({ state: "MA", employees: 10 }).annualCostEach, 0);
});

test("Nevada does not reach employers under 50", () => {
  const r = run({ state: "NV", employees: 49 });
  assert.equal(r.applies, false);
  assert.equal(r.annualAccrual, 0);
  assert.equal(run({ state: "NV", employees: 50 }).applies, true);
});

test("Arizona and Michigan use caps step with employer size", () => {
  assert.equal(run({ state: "AZ", employees: 14 }).use, 24);
  assert.equal(run({ state: "AZ", employees: 15 }).use, 40);
  assert.equal(run({ state: "MI", employees: 10 }).use, 40);
  assert.equal(run({ state: "MI", employees: 11 }).use, 72);
});

test("pay-period accrual is hours per week divided by the rate", () => {
  const r = run({ state: "CA", hoursPerWeek: 30 });
  assert.equal(r.perPay.weekly, 1);
  assert.equal(r.perPay.biweekly, 2);
});

test("bad input is rejected with messages, never clamped", () => {
  assert.ok(compute({}).errors.length >= 5);
  assert.ok(run({ hoursPerWeek: 0 }).errors.length);
  assert.ok(run({ wage: -5 }).errors.length);
  assert.ok(run({ employees: 2.5 }).errors.length);
  assert.ok(run({ state: "ZZ" }).errors[0].match(/state/i));
  assert.ok(run({ weeks: 60 }).errors.length);
});

test("every state has a rate, a note and a size rule", () => {
  assert.ok(STATE_LIST.length >= 14);
  for (const [id, s] of Object.entries(STATES)) {
    assert.ok(s.per > 0 && s.note && typeof s.size === "function", id);
    assert.ok(parse({ ...SAMPLE, state: id }).errors.length === 0, id);
  }
});

test("summary names the source to verify and says it is not legal advice", () => {
  const t = summaryText(run({}));
  assert.match(t, /not legal advice/);
  assert.ok(t.includes(VERIFY));
});

test("California findings warn that combined PTO is vested wages", () => {
  assert.ok(run({}).findings.some((f) => /vested wages/.test(f.title)));
});
