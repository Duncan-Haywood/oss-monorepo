import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, summaryText, SAMPLE, VERIFY, STATES, STATE_LIST, money, hrs } from "./calc.mjs";

// Costing follows the headcount when a test changes only employees (covered may not exceed employees).
const run = (o) => compute({ ...SAMPLE, ...(o.employees != null && o.covered == null && Number.isInteger(o.employees) && o.employees > 0 ? { covered: Math.min(o.employees, SAMPLE.covered) } : {}), ...o });

test("sample: California part-timer accrues 1 hour per 30 worked, use capped at 40 a year, balance at 80", () => {
  const r = run({});
  assert.equal(r.errors.length, 0);
  assert.equal(r.use, 40);
  assert.ok(Math.abs(r.annualAccrual - 32 * 52 / 30) < 1e-9); // accrual is not capped; use is
  assert.equal(r.balCap, 80);
  // 55.5 hours accrue but only 40 can be used in a year (Cal. Lab. Code 246(d)): $880, not $1,220.
  assert.equal(r.usableHours, 40);
  assert.equal(r.annualCostEach, 40 * 22);
  assert.equal(r.annualCostTotal, 10560);
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

// Quality audit 2026-11-22 (portfolio/quality/audits/2026-11-22-paid-sick-leave-accrual-calculator.json).
test("Maryland: accrual capped at 40 a year, use at 64, balance at 64 (Md. Lab. & Empl. 3-1305)", () => {
  const r = run({ state: "MD", employees: 20, hoursPerWeek: 40, weeks: 52, wage: 20, covered: 1 });
  assert.equal(r.annualAccrual, 40);
  assert.equal(r.use, 64);
  assert.equal(r.balCap, 64);
  assert.equal(r.maxBalanceEach, 64 * 20);
});

test("Minnesota: accrual capped at 48 a year, balance at 80, no separate use cap (Minn. Stat. 181.9446)", () => {
  const r = run({ state: "MN", hoursPerWeek: 40, weeks: 52 });
  assert.equal(r.annualAccrual, 48);
  assert.equal(r.use, null);
  assert.equal(r.balCap, 80);
});

test("Illinois accrues 1 per 40 and Washington carries over 40 unused hours", () => {
  assert.equal(run({ state: "IL", hoursPerWeek: 20, weeks: 52 }).annualAccrual, 26);
  const wa = run({ state: "WA", hoursPerWeek: 40, weeks: 52, wage: 10, covered: 1 });
  assert.equal(wa.maxBalanceEach, (40 + 52) * 10);
});

test("New York: 4 employees unpaid, 5 paid", () => {
  assert.equal(run({ state: "NY", employees: 4 }).paid, false);
  assert.equal(run({ state: "NY", employees: 5 }).paid, true);
});

test("front-loading follows the size-dependent cap: Arizona under 15 is 24 hours, Michigan 10 or fewer is 40", () => {
  assert.equal(run({ state: "AZ", employees: 10 }).frontHours, 24);
  assert.equal(run({ state: "AZ", employees: 20 }).frontHours, 40);
  assert.equal(run({ state: "MI", employees: 10 }).frontHours, 40);
  assert.equal(run({ state: "MI", employees: 11 }).frontHours, 72);
});

// Red-team 2026-11-22: boundaries the suite did not pin.
test("Nevada accrues 1 hour per 52 worked (0.01923 an hour)", () => {
  const r = run({ state: "NV", employees: 50, hoursPerWeek: 52, weeks: 30 });
  assert.equal(r.annualAccrual, 30);
  assert.equal(r.perPay.weekly, 1);
});

test("a one-person business is a valid employer size", () => {
  const r = run({ state: "CA", employees: 1, covered: 1 });
  assert.equal(r.errors.length, 0);
  assert.ok(run({ employees: 0 }).errors.length);
});

test("money keeps the sign of a negative amount and hrs rounds to one decimal", () => {
  assert.equal(money(-5), "-$5");
  assert.equal(money(-1234), "-$1,234");
  assert.equal(money(-0.4), "$0");
  assert.equal(hrs(2), "2");
  assert.equal(hrs(55.46), "55.5");
});

test("New York's statewide use cap always comes from the size rule", () => {
  for (const n of [1, 4, 5, 99]) assert.equal(run({ state: "NY", employees: n }).use, 40);
  assert.equal(run({ state: "NY", employees: 100 }).use, 56);
});

test("Oregon: the employer may cap accrual at 40 hours a year, balance at 80 (ORS 653.606)", () => {
  const r = run({ state: "OR", employees: 12, hoursPerWeek: 40, weeks: 52 });
  assert.equal(r.annualAccrual, 40); // 69.3 hours worked out, but accrual stops at 40
  assert.equal(r.usableHours, 40);
  assert.equal(r.balCap, 80);
  assert.match(r.findings[0].title, /accrual capped at 40 hours a year/);
});

test("unpaid leave below the size threshold carries no dollar balance liability in any finding", () => {
  for (const [state, employees] of [["MD", 12], ["OR", 9], ["MA", 10], ["NY", 4]]) {
    const r = run({ state, employees, covered: Math.min(employees, 12) });
    assert.equal(r.paid, false, state);
    assert.equal(r.maxBalanceTotal, 0, state);
    for (const f of r.findings) assert.doesNotMatch(f.title, /\$[1-9]/, `${state}: ${f.title}`);
  }
});

test("you cannot cost more employees than the business has", () => {
  const r = run({ employees: 3, covered: 50 });
  assert.ok(r.errors.some((e) => /costed|employees/i.test(e)));
  assert.equal(run({ employees: 12, covered: 12 }).errors.length, 0);
});
