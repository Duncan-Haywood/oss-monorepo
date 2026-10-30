import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, simulate } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("first-year deduction is 9% of pay over the threshold", () => {
  const r = run({ overpay: 0 });
  assert.equal(r.planYear, 857.7); // (38000-28470)*9%
  assert.equal(r.monthly, 71.48);
});

test("nothing is deducted under the threshold", () => {
  const r = run({ salary: 20000, overpay: 0 });
  assert.equal(r.yearly, 0);
  assert.match(r.findings[0].title, /under the/);
});

test("postgraduate loan adds 6% over its own threshold", () => {
  const r = run({ salary: 40000, pgBalance: 10000, pgFirstDue: 2020, overpay: 0 });
  assert.equal(r.pgYear, 1140); // (40000-21000)*6%
  assert.equal(r.yearly, r.planYear + 1140);
});

test("a high earner with a small loan clears it and overpaying saves interest", () => {
  const r = run({ salary: 70000, balance: 20000, overpay: 3000 });
  assert.equal(r.outcome, "cleared");
  assert.ok(r.base.clearYear);
  assert.ok(r.overpay.saved > 0);
});

test("a low earner with a big loan hits write-off and overpaying is wasted", () => {
  const r = run({});
  assert.equal(r.outcome, "written-off");
  assert.ok(r.base.writtenOff > 0);
  assert.ok(r.overpay.saved < 0);
});

test("write-off year follows the plan term", () => {
  assert.equal(simulate(parse({ ...SAMPLE, plan: 5, firstDue: 2024 })).writeOff, 2064);
  assert.equal(simulate(parse({ ...SAMPLE, plan: 1, firstDue: 2005 })).writeOff, 2030);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(parse({ ...SAMPLE, salary: "" }).errors.length);
  assert.ok(parse({ ...SAMPLE, balance: -1 }).errors.length);
  assert.ok(parse({ ...SAMPLE, plan: 3 }).errors.length);
  assert.ok(parse({ ...SAMPLE, interest: 50 }).errors.length);
  assert.ok(parse({ ...SAMPLE, firstDue: 1900 }).errors.length);
  assert.ok(compute({}).errors.length > 0);
});

test("summary names the source and the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax advice/);
});

// Red-team guards (2026-10-28): each pins a mutant the suite used to miss.
test("overpay is optional: leaving it out is not an error", () => {
  const { overpay, ...rest } = SAMPLE;
  assert.deepEqual(parse(rest).errors, []);
  assert.equal(parse(rest).overpay, 0);
});

test("Plan 4 threshold is applied to the first-year deduction", () => {
  const r = run({ plan: 4, salary: 40000, threshold: undefined, overpay: 0 });
  assert.equal(r.planYear, 652.95); // (40000-32745)*9%
});

test("money amounts are rounded to pence in the findings", () => {
  const r = run({ salary: 38000.5, overpay: 0 });
  assert.match(r.findings[0].title, /GBP 857\.75 is deducted/);
});

test("a sub-pound postgraduate balance is still projected", () => {
  const s = simulate(parse({ ...SAMPLE, balance: 0, pgBalance: 0.8, pgFirstDue: 2020, salary: 50000, interest: 0 }));
  assert.equal(s.years, 1);
  assert.equal(s.pgRepaid, 0.8);
});

test("extra payment is capped at the extra amount each year, not the whole balance", () => {
  const s = simulate(parse({ ...SAMPLE, salary: 28470, growth: 0, thresholdGrowth: 0, interest: 0, balance: 10000, firstDue: 2025 }), 100);
  assert.equal(s.extraPaid, 3000); // 100 a year for the 30 years to write-off
});

test("no balances gives a zero first-year deduction", () => {
  const s = simulate(parse({ ...SAMPLE, balance: 0, pgBalance: 0 }));
  assert.deepEqual(s.first, { planPay: 0, pgPay: 0 });
});
