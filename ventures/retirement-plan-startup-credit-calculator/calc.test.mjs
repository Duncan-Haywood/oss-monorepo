import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, creditForYear, parse, summaryText, SAMPLE, money } from "./calc.mjs";

const near = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`);

test("sample: 12 employees get 100% of setup, auto-enrol and full contribution credit in year 1", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  const y = r.years[0];
  near(y.startup, 2500); // cap = max(500, 250*10) = 2500 < 3000 cost
  near(y.auto, 500);
  near(y.contrib, 10 * 1000); // 1,500 capped at 1,000
  near(y.total, 13000);
});

test("setup and auto-enrol credits stop after 3 years; contribution phases 100/100/75/50/25", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.years.map((y) => y.startup > 0), [true, true, true, false, false]);
  assert.deepEqual(r.years.map((y) => y.auto > 0), [true, true, true, false, false]);
  assert.deepEqual(r.years.map((y) => y.contrib), [10000, 10000, 7500, 5000, 2500]);
});

test("setup cap is the greater of $500 or $250 per NHCE, never over $5,000", () => {
  const base = parse({ ...SAMPLE, startupCost: 20000 });
  near(creditForYear({ ...base, nhce: 1 }, 1).startup, 500);
  near(creditForYear({ ...base, nhce: 10 }, 1).startup, 2500);
  near(creditForYear({ ...base, nhce: 40, employees: 45 }, 1).startup, 5000);
});

test("51-100 employees: 50% of setup and contribution credit reduced 2% per employee over 50", () => {
  const p = parse({ ...SAMPLE, employees: 60, nhce: 60, startupCost: 4000, contribEmployees: 50 });
  const y = creditForYear(p, 1);
  near(y.startup, 2000);
  near(y.phaseOut, 0.8);
  near(y.contrib, 50 * 1000 * 0.8);
});

test("over 100 employees or a prior plan means no credit", () => {
  assert.equal(compute({ ...SAMPLE, employees: 101, nhce: 50 }).total5, 0);
  const r = compute({ ...SAMPLE, noPriorPlan: false });
  assert.equal(r.total5, 0);
  assert.equal(r.eligible, false);
});

test("after-tax benefit nets the lost deduction", () => {
  const r = compute(SAMPLE);
  near(r.netBenefit, r.total5 * (1 - 0.24));
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({ ...SAMPLE, employees: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, nhce: 99 }).errors.length);
  assert.ok(compute({ ...SAMPLE, contribEmployees: 99 }).errors.length);
  assert.ok(compute({ ...SAMPLE, taxRate: 90 }).errors.length);
  assert.ok(compute({ ...SAMPLE, startupCost: "" }).errors.length);
});

test("summary names sources and the dollar total", () => {
  const t = summaryText(compute(SAMPLE));
  assert.match(t, /Form 8881/);
  assert.ok(t.includes(money(compute(SAMPLE).total5)));
});
