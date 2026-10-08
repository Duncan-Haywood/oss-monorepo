import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULTS, benchmark, fica, shapes, analyze, num, money, toCsv } from "./calc.mjs";

test("benchmark is one to three weeks per year with a mid at the chosen rate", () => {
  const b = benchmark({ ...DEFAULTS, yearsService: 6, offeredWeeks: 8, benchmarkWeeksPerYear: 2 });
  assert.equal(b.low, 6);
  assert.equal(b.mid, 12);
  assert.equal(b.high, 18);
  assert.equal(b.gapWeeks, 4);
  assert.ok(Math.abs(b.gapPay - 4 * 120000 / 52) < 1e-9);
});

test("no gap when the offer meets the benchmark", () => {
  assert.equal(benchmark({ ...DEFAULTS, offeredWeeks: 20 }).gapWeeks, 0);
});

test("fica: social security stops at the wage base, medicare does not", () => {
  assert.ok(Math.abs(fica(10000, 0, 184500) - 10000 * 0.0765) < 1e-9);
  assert.ok(Math.abs(fica(10000, 180000, 184500) - (4500 * 0.062 + 10000 * 0.0145)) < 1e-9);
  assert.ok(Math.abs(fica(10000, 200000, 184500) - 10000 * 0.0145) < 1e-9);
});

test("supplemental withholding is 22% to $1M and 37% above", () => {
  const o = { ...DEFAULTS };
  assert.equal(shapes(o, 50000).lumpNow.fedWithheld, 11000);
  assert.equal(shapes(o, 1200000).lumpNow.fedWithheld, 220000 + 200000 * 0.37);
});

test("filing gap: marginal rate above 22% means a bill at filing", () => {
  const s = shapes({ ...DEFAULTS, fedRateThisYear: 32 }, 50000);
  assert.ok(Math.abs(s.lumpNow.filingGap - 5000) < 1e-9);
  const r = shapes({ ...DEFAULTS, fedRateThisYear: 12 }, 50000);
  assert.ok(r.lumpNow.filingGap < 0);
});

test("salary continuation splits across the year end", () => {
  const s = shapes({ ...DEFAULTS, weeksLeftInYear: 4 }, 8 * 120000 / 52);
  assert.ok(Math.abs(s.continuation.thisYear - 4 * 120000 / 52) < 1e-6);
  assert.ok(Math.abs(s.continuation.nextYear - 4 * 120000 / 52) < 1e-6);
  assert.ok(Math.abs(s.continuation.gross - (s.continuation.thisYear + s.continuation.nextYear)) < 1e-6);
});

test("default example", () => {
  const a = analyze({});
  assert.equal(a.verdict, "low-mid");
  assert.ok(Math.abs(a.severance - 8 * 120000 / 52) < 1e-9);
  assert.ok(Math.abs(a.pto - 12 * 120000 / 260) < 1e-9);
  assert.ok(a.shapes.lumpJan.net > 0);
  assert.ok(a.runwayMonths > a.runwayMonthsNoSeverance);
  assert.ok(a.checklist.some((c) => /OWBPA/.test(c)));
});

test("PTO is excluded when the state does not require payout", () => {
  assert.equal(analyze({ ptoPaidOutByLaw: false }).pto, 0);
});

test("under 40 gets the general timing line, not the OWBPA one", () => {
  assert.ok(!analyze({ age: 35 }).checklist.some((c) => /OWBPA/.test(c)));
});

test("verdict bands", () => {
  assert.equal(analyze({ offeredWeeks: 2 }).verdict, "below");
  assert.equal(analyze({ offeredWeeks: 12 }).verdict, "at-or-above");
  assert.equal(analyze({ offeredWeeks: 40 }).verdict, "high");
});

test("health gap and COBRA subsidy", () => {
  const a = analyze({ cobraMonthly: 2000, employerPaidMonthly: 1500, coveredMonths: 4 });
  assert.equal(a.healthPerMonthGap, 500);
  assert.equal(a.subsidyValue, 6000);
});

test("bad input is reported", () => {
  assert.equal(analyze({ annualSalary: 0 }).result, null);
  assert.ok(analyze({ stateRate: 120 }).warnings.length > 0);
  assert.ok(analyze({ savings: NaN }).warnings.length > 0);
});

test("num, money, csv", () => {
  assert.equal(num("$1,200"), 1200);
  assert.equal(money(-1234.4), "-$1,234");
  assert.match(toCsv(analyze({})), /Net if lump sum paid in January/);
});
