import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, run, employee, grossFromAvailable, dayRateFor, SAMPLE, summaryText, VERIFY } from "./calc.mjs";

const near = (a, b, d = 0.05) => assert.ok(Math.abs(a - b) <= d, `${a} vs ${b}`);

test("sample works through to the documented figures", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.invoice, 92000);
  assert.equal(r.marginYear, 1150);
  near(r.gross, 77299.58);
  near(r.employerNi, 10844.94);
  near(r.tax, 18351.83);
  near(r.ni, 3556.59);
  near(r.takeHome, 55391.16);
});

test("every pound the agency pays is accounted for", () => {
  for (const [rate, days, wk, m, p] of [[400, 5, 46, 25, 3], [180, 5, 48, 20, 0], [650, 4, 40, 30, 5], [120, 3, 30, 25, 3]]) {
    const a = run(rate, days, wk, m, p, "none");
    near(a.marginYear + a.employerNi + a.levy + a.pension + a.gross, a.invoice, 0.1);
  }
});

test("below the employer NI threshold no employer NI is charged", () => {
  const a = run(100, 1, 20, 0, 0, "none");
  assert.equal(a.employerNi, 0);
  near(a.gross * (1 + 0.005), a.invoice, 0.05);
});

test("employee deductions: 40% band, taper and student loan", () => {
  const e = employee(60000, "2");
  near(e.tax, 11432);
  near(e.sl, (60000 - 28470) * 0.09);
  const t = employee(110000, "none");
  near(t.allowance, 12570 - 5000);
});

test("take-home rises with day rate and falls with margin", () => {
  assert.ok(run(450, 5, 46, 25, 3, "none").takeHome > run(400, 5, 46, 25, 3, "none").takeHome);
  assert.ok(run(400, 5, 46, 45, 3, "none").takeHome < run(400, 5, 46, 25, 3, "none").takeHome);
});

test("dayRateFor inverts run", () => {
  const rate = dayRateFor(40000, 5, 46, 25, 3, "none");
  near(run(rate, 5, 46, 25, 3, "none").takeHome, 40000, 5);
});

test("grossFromAvailable is continuous across the threshold", () => {
  const a = grossFromAvailable(5000 * 1.035, 3);
  near(a, 5000, 0.5);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({}).errors.length);
  assert.ok(compute({ dayRate: -5 }).errors.length);
  assert.ok(compute({ dayRate: 400, weeks: 60 }).errors.length);
  assert.ok(compute({ dayRate: 400, plan: "9" }).errors.length);
  assert.ok(compute({ dayRate: 400, target: "abc" }).errors.length);
  assert.ok(parse({ dayRate: 99999 }).errors.length);
});

test("defaults apply when optional fields are blank", () => {
  const r = compute({ dayRate: 300 });
  assert.equal(r.weeks, 46);
  assert.equal(r.daysPerWeek, 5);
  assert.equal(r.margin, 25);
});

test("target take-home produces a needed day rate finding", () => {
  const r = compute({ ...SAMPLE, target: 60000 });
  assert.ok(r.neededRate > 400);
  assert.ok(r.findings.some((f) => /agency day rate of about/.test(f.title)));
});

test("high earner gets the allowance taper warning", () => {
  const r = compute({ ...SAMPLE, dayRate: 600, weeks: 46 });
  assert.ok(r.gross > 100000);
  assert.ok(r.findings.some((f) => f.severity === "high"));
});

test("summary names its source and disclaims", () => {
  const s = summaryText(compute(SAMPLE));
  assert.match(s, /Take-home pay per year/);
  assert.match(s, /Not tax advice\. No warranty\./);
  assert.ok(s.includes(VERIFY));
});
