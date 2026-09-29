import { test } from "node:test";
import assert from "node:assert/strict";
import { UNIFORM, rmdStartAge, distributionPeriod, rmdFor, penalty, project, analyze, sampleInput, reportCsv, money } from "./calc.mjs";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);
const base = () => ({ ...sampleInput(), qcd: "0" });

test("RMD start age follows SECURE 2.0 by birth year", () => {
  assert.equal(rmdStartAge(1950), 72);
  assert.equal(rmdStartAge(1951), 73);
  assert.equal(rmdStartAge(1959), 73);
  assert.equal(rmdStartAge(1960), 75);
  assert.equal(rmdStartAge(1975), 75);
});

test("uniform lifetime table spot checks against IRS Table III", () => {
  assert.equal(distributionPeriod(72), 27.4);
  assert.equal(distributionPeriod(73), 26.5);
  assert.equal(distributionPeriod(75), 24.6);
  assert.equal(distributionPeriod(90), 12.2);
  assert.equal(distributionPeriod(100), 6.4);
  assert.equal(distributionPeriod(120), 2.0);
  assert.equal(distributionPeriod(71), null);
});

test("the table is strictly decreasing from 72 to 119", () => {
  for (let a = 73; a <= 119; a++) assert.ok(UNIFORM[a] < UNIFORM[a - 1], String(a));
});

test("RMD is the balance divided by the distribution period", () => {
  near(rmdFor(500000, 75), 500000 / 24.6);
  near(rmdFor(100000, 73), 100000 / 26.5);
  assert.equal(rmdFor(0, 80), 0);
  assert.equal(rmdFor(100000, 70), 0);
});

test("penalty is 25%, or 10% when corrected", () => {
  assert.deepEqual(penalty(20000, 5000, false), { shortfall: 15000, rate: 0.25, tax: 3750 });
  assert.equal(penalty(20000, 5000, true).tax, 1500);
  assert.equal(penalty(20000, 25000, false).tax, 0);
});

test("first-year RMD in the sample matches hand arithmetic", () => {
  const a = analyze(base());
  near(a.first.rmd, 800000 / 26.5);
  assert.equal(a.first.age, 73);
  assert.equal(a.first.year, 2026);
});

test("balance rolls forward: withdraw at start of year, grow the rest", () => {
  const a = analyze({ ...base(), growth: "5" });
  const r0 = 800000 / 26.5;
  near(a.rows[0].end, (800000 - r0) * 1.05, 1e-4);
  near(a.rows[1].rmd, a.rows[0].end / 25.5, 1e-4);
});

test("zero growth: RMDs shrink the balance by exactly the distribution", () => {
  const a = analyze({ ...base(), growth: "0", throughAge: "75" });
  near(a.rows[2].end, 800000 - a.rows[0].rmd - a.rows[1].rmd - a.rows[2].rmd, 1e-4);
});

test("delaying the first RMD stacks two RMDs into the next year", () => {
  const a = analyze({ ...base(), delayFirst: true, growth: "0" });
  assert.equal(a.rows[0].rmd, 0);
  assert.equal(a.rows[0].delayed, true);
  near(a.rows[1].rmd, 800000 / 26.5 + (800000 / 25.5));
  assert.ok(a.delayCost > 0);
  near(a.delayCost, a.firstOnTime * 0.02);
});

test("QCD reduces taxable RMD and never goes below zero", () => {
  const a = analyze({ ...base(), qcd: "10000", growth: "0", throughAge: "73" });
  near(a.rows[0].taxable, 800000 / 26.5 - 10000);
  const big = analyze({ ...base(), qcd: "100000", growth: "0", throughAge: "73" });
  assert.equal(big.rows[0].taxable, 0);
  assert.ok(a.qcdTaxSaved > 0);
});

test("QCD is capped at the annual limit", () => {
  const a = analyze({ ...base(), qcd: "200000", qcdLimit: "111000", throughAge: "73" });
  assert.equal(a.rows[0].qcd, 111000);
});

test("missed RMD reports shortfall and both penalty rates", () => {
  const a = analyze({ ...base(), withdrawn: "10000" });
  near(a.pen.late.shortfall, 800000 / 26.5 - 10000);
  near(a.pen.late.tax, a.pen.late.shortfall * 0.25);
  near(a.pen.fixed.tax, a.pen.late.shortfall * 0.1);
});

test("bad input returns a message, not a throw", () => {
  assert.ok(analyze({ ...base(), birthYear: "" }).error);
  assert.ok(analyze({ ...base(), ira: "", plan: "" }).error);
  assert.ok(analyze({ ...base(), growth: "90" }).error);
  assert.ok(analyze({ ...base(), throughAge: "60" }).error);
  assert.ok(analyze({ ...base(), withdrawn: "abc" }).error);
});

test("balances typed with $ and commas parse", () => {
  const a = analyze({ ...base(), ira: "$620,000", plan: "180,000" });
  near(a.first.rmd, 800000 / 26.5);
});

test("project never withdraws more than the balance", () => {
  const rows = project({ birthYear: 1950, ira: 1000, plan: 0, growth: 0, qcd: 50000, qcdLimit: 111000, rateNow: 0.2, rateStacked: 0.2, delayFirst: false, throughAge: 80 });
  for (const r of rows) assert.ok(r.end >= 0);
});

test("CSV has a header and one line per year", () => {
  const a = analyze(base());
  const lines = reportCsv(a).trim().split("\n");
  assert.equal(lines.length, a.rows.length + 1);
  assert.match(lines[0], /^Year,Age,/);
});

test("money formats whole dollars", () => {
  assert.equal(money(1234.6), "1,235");
});
