import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, fraMonthsFor, fraMonthIndex, reductionFactor, yearResult, SAMPLE, summaryText, sweepCsv, monthLabel } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("full retirement age follows the SSA birth-year table", () => {
  assert.equal(fraMonthsFor(1950), 66 * 12);
  assert.equal(fraMonthsFor(1956), 66 * 12 + 4);
  assert.equal(fraMonthsFor(1960), 67 * 12);
  assert.equal(fraMonthsFor(1940), 65 * 12 + 6);
});

test("a person born on the 1st reaches FRA the month before", () => {
  assert.equal(monthLabel(fraMonthIndex({ y: 1963, m: 6, d: 1 })), "2030-05");
  assert.equal(monthLabel(fraMonthIndex({ y: 1963, m: 6, d: 2 })), "2030-06");
});

test("early reduction is 5/9 % a month for 36 months then 5/12 %", () => {
  assert.ok(Math.abs(reductionFactor(36) - 0.2) < 1e-12);
  assert.ok(Math.abs(reductionFactor(60) - 0.3) < 1e-12);
  assert.equal(reductionFactor(0), 0);
});

test("sample: 53 months early gives a 27.08% cut and withholds 9 whole months a year", () => {
  const r = compute(raw());
  assert.equal(r.errors.length, 0);
  assert.ok(Math.abs(r.benefit - 1750) < 1e-6);
  const y = r.years[0];
  assert.equal(y.year, 2026);
  assert.equal(y.required, 15260);
  assert.equal(y.withheldMonths, 9);
  assert.ok(Math.abs(y.refund - (9 * 1750 - 15260)) < 1e-6);
  assert.ok(Math.abs(y.netLost - 15260) < 1e-6);
});

test("withheld months are credited at FRA, shrinking the early reduction", () => {
  const r = compute(raw());
  assert.equal(r.totals.months, 36);
  assert.equal(r.adjEarly, 17);
  assert.ok(Math.abs(r.newBenefit - 2400 * (1 - reductionFactor(17))) < 1e-6);
  assert.ok(r.raise > 0);
});

test("under the limit nothing is withheld and nothing is credited", () => {
  const r = compute(raw({ earnings: 24480 }));
  assert.equal(r.totals.months, 0);
  assert.equal(r.raise, 0);
  assert.equal(r.recoupMonths, null);
});

test("the FRA year uses the higher limit, 1 for 3, and only months before FRA", () => {
  const r = compute(raw({ claimMonth: "2029-10", startYear: 2029, earnings: 120000 }));
  const last = r.years[r.years.length - 1];
  assert.equal(last.year, 2030);
  assert.equal(last.months, 5);
  assert.equal(last.ratio, "1 for 3");
  assert.equal(last.earn, 50000);
  assert.equal(last.withheldMonths, 0);
  const hi = compute(raw({ claimMonth: "2029-10", startYear: 2029, earnings: 300000 })).years.at(-1);
  assert.equal(hi.limit, 65160);
  assert.equal(hi.withheldMonths, 5);
});

test("months paid in full by the monthly rule are not withheld in the first year", () => {
  const r = compute(raw({ claimMonth: "2026-01", freeMonths: 5 }));
  assert.equal(r.years[0].withheldMonths, 7);
  assert.equal(r.years[0].free, 5);
});

test("very high earnings withhold every payable month and never more than the benefit", () => {
  const y = yearResult({ months: 12, benefit: 1000, earn: 500000, limit: 24480, divisor: 2, freeMonths: 0 });
  assert.equal(y.withheldMonths, 12);
  assert.equal(y.refund, 0);
  assert.equal(y.paid, 0);
});

test("the sweep rises with earnings and the full-stop level matches", () => {
  const r = compute(raw());
  for (let i = 1; i < r.sweep.length; i++) assert.ok(r.sweep[i].netLost >= r.sweep[i - 1].netLost);
  assert.equal(r.fullStop, 24480 + 12 * 1750 * 2);
  assert.match(sweepCsv(r), /annual_earnings,withheld_months/);
});

test("inputs are validated: age 62, before FRA, numbers", () => {
  assert.ok(parse(raw({ claimMonth: "2024-01" })).errors.some((e) => /before age 62/.test(e)));
  assert.ok(parse(raw({ claimMonth: "2030-06" })).errors.some((e) => /no earnings test/.test(e)));
  assert.ok(parse(raw({ pia: "" })).errors.length);
  assert.ok(parse(raw({ earnings: "-5" })).errors.length);
  assert.ok(parse(raw({ birthDate: "13/45/1960" })).errors.length);
  assert.ok(parse(raw({ freeMonths: 2.5 })).errors.length);
});

test("summary names the figures and what is not decided", () => {
  const t = summaryText(compute(raw()));
  assert.match(t, /Total withheld: 36 month/);
  assert.match(t, /Not decided here/);
});
