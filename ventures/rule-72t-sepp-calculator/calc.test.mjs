import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, amortizationPayment, lockYears, modificationExposure, samplePlan, reportCsv, num, SINGLE_LIFE } from "./calc.mjs";

const base = { age: "50", balance: "1000000", rate: "5", growth: "0", target: "" };

test("lock-in is the later of five years and reaching 59 1/2", () => {
  assert.equal(lockYears(50), 10);
  assert.equal(lockYears(40), 20);
  assert.equal(lockYears(55), 5);
  assert.equal(lockYears(59), 5);
});

test("RMD method first year is balance over the life expectancy factor", () => {
  const r = analyze(base);
  assert.equal(r.lifeExpectancy, 36.2);
  assert.ok(Math.abs(r.rmd - 1000000 / 36.2) < 1e-6);
});

test("amortization payment matches the annuity formula by hand", () => {
  // 1,000,000 at 5% over 36.2 years: 50000 / (1 - 1.05^-36.2)
  const expected = 50000 / (1 - Math.pow(1.05, -36.2));
  assert.ok(Math.abs(analyze(base).amort - expected) < 1e-6);
  assert.ok(Math.abs(analyze(base).amort - 60312.23) < 0.01); // about 6.03% of balance
  assert.equal(amortizationPayment(1200, 0, 12), 100);
});

test("amortization exceeds the RMD method at a positive rate", () => {
  const r = analyze(base);
  assert.equal(r.higher, "amort");
  assert.ok(r.amort > r.rmd);
});

test("RMD path recalculates each year and fixed path stays level", () => {
  const r = analyze({ ...base, growth: "0" });
  assert.equal(r.rows.length, 10);
  assert.ok(Math.abs(r.rows[1].rmd - (1000000 - r.rows[0].rmd) / 35.3) < 1e-6);
  assert.equal(r.rows[0].amort, r.rows[9].amort);
  assert.ok(Math.abs(r.totals.amort - r.amort * 10) < 1e-6);
});

test("balance needed for a target income inverts the first-year payment", () => {
  const r = analyze({ ...base, target: "50000" });
  assert.ok(Math.abs(r.need.rmd - 50000 * 36.2) < 1e-6);
  const check = analyze({ ...base, balance: String(r.need.amort) });
  assert.ok(Math.abs(check.amort - 50000) < 1e-3);
});

test("penalty avoided is 10% of distributions and modification exposure grows", () => {
  const r = analyze(base);
  assert.ok(Math.abs(r.penaltyAvoided.amort - r.totals.amort * 0.1) < 1e-6);
  const e3 = modificationExposure(r, 3), e10 = modificationExposure(r, 10);
  assert.ok(e10.amort > e3.amort);
  assert.ok(Math.abs(e3.amort - r.amort * 3 * 0.1) < 1e-6);
});

test("validation rejects out-of-range and bad input", () => {
  assert.match(analyze({ ...base, age: "39" }).error, /age/i);
  assert.match(analyze({ ...base, age: "60" }).error, /age/i);
  assert.match(analyze({ ...base, age: "50.5" }).error, /age/i);
  assert.match(analyze({ ...base, balance: "0" }).error, /balance/i);
  assert.match(analyze({ ...base, rate: "20" }).error, /rate/i);
  assert.match(analyze({ ...base, target: "-1" }).error, /income/i);
  assert.equal(analyze({ ...base, rate: "6" }).rateWarning, true);
});

test("table covers every age the schedule can reach and falls with age", () => {
  for (let a = 40; a <= 65; a++) assert.ok(SINGLE_LIFE[a] > 0, String(a));
  for (let a = 41; a <= 65; a++) assert.ok(SINGLE_LIFE[a] < SINGLE_LIFE[a - 1]);
  for (let a = 40; a <= 59; a++) assert.doesNotThrow(() => analyze({ ...base, age: String(a) }));
});

test("num parses currency and rejects junk; sample and csv work", () => {
  assert.equal(num("$1,250,000"), 1250000);
  assert.ok(Number.isNaN(num("abc")));
  const r = analyze(samplePlan());
  assert.ok(!r.error);
  assert.equal(reportCsv(r).trim().split("\n").length, r.years + 1);
});
