import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, parse, statutoryWeeks, weeksForAge } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("weeks by age bands", () => {
  assert.equal(weeksForAge(21), 0.5);
  assert.equal(weeksForAge(22), 1);
  assert.equal(weeksForAge(40), 1);
  assert.equal(weeksForAge(41), 1.5);
});

test("sample: age 46, 12 years: six years at 1.5 and six at 1 = 15 weeks, capped at 719", () => {
  const r = run({});
  assert.equal(r.weeks, 15);
  assert.equal(r.cappedWeekly, 719);
  assert.equal(r.statutory, 10785);
  assert.equal(r.employerOffer, 16177.5);
  assert.equal(r.redundancy, 16177.5);
  assert.equal(r.lostToCap, r2(15 * (850 - 719)));
});
const r2 = (n) => Math.round(n * 100) / 100;

test("service that straddles the age bands counts back from the redundancy date", () => {
  // age 43, 6 years: ages 43,42,41 -> 1.5 each; 40,39,38 -> 1 each
  assert.equal(statutoryWeeks(43, 6).weeks, 7.5);
  // age 23, 3 years: ages 23,22 -> 1; 21 -> 0.5
  assert.equal(statutoryWeeks(23, 3).weeks, 2.5);
});

test("only the last 20 years count", () => {
  const r = run({ age: 60, years: 30, mode: "none", pilon: 0 });
  assert.equal(r.counted, 20);
  assert.equal(r.weeks, 30);
  assert.equal(r.statutory, 30 * 719);
  assert.equal(r.statutory, r.maxStatutory);
});

test("under two years gets no statutory pay", () => {
  const r = run({ years: 1, mode: "none" });
  assert.equal(r.eligible, false);
  assert.equal(r.statutory, 0);
  assert.equal(r.redundancy, 0);
});

test("two years is the first eligible year", () => {
  assert.equal(run({ years: 2, age: 30, mode: "none" }).eligible, true);
});

test("pay below the cap is used in full", () => {
  const r = run({ weekly: 400, age: 30, years: 5, mode: "none", pilon: 0 });
  assert.equal(r.statutory, 2000);
  assert.equal(r.lostToCap, 0);
});

test("caps differ by dismissal year", () => {
  assert.equal(run({ cap: 2024, mode: "none" }).cappedWeekly, 700);
  assert.equal(run({ cap: 2026, mode: "none" }).cappedWeekly, 751);
});

test("an offer below statutory is flagged and the statutory amount is used", () => {
  const r = run({ mode: "multiple", offer: 0.5, pilon: 0 });
  assert.equal(r.underStatutory, true);
  assert.equal(r.redundancy, r.statutory);
  assert.ok(r.findings.some((f) => f.title.includes("less than the statutory")));
});

test("weeks-per-year offers use uncapped pay", () => {
  const r = run({ mode: "weeks", offer: 2, pilon: 0 });
  assert.equal(r.employerOffer, 2 * 12 * 850);
});

test("tax: the first 30,000 is free, the excess and notice pay are taxed", () => {
  const r = run({ mode: "weeks", offer: 3, pilon: 4, rate: 0.4 });
  assert.equal(r.redundancy, 3 * 12 * 850);
  assert.equal(r.taxFreeRedundancy, 30000);
  assert.equal(r.taxableRedundancy, 600);
  assert.equal(r.pilonPay, 3400);
  assert.equal(r.taxable, 4000);
  assert.equal(r.tax, 1600);
  assert.equal(r.net, 30600 + 3400 - 1600);
});

test("pay in lieu of notice never uses the exemption", () => {
  const r = run({ mode: "none", pilon: 8 });
  assert.equal(r.taxableRedundancy, 0);
  assert.equal(r.taxable, 8 * 850);
});

test("statutory notice is a week per year to 12", () => {
  assert.equal(run({ years: 5 }).noticeWeeks, 5);
  assert.equal(run({ years: 15, age: 45 }).noticeWeeks, 12);
});

test("bad input is rejected, never clamped", () => {
  assert.ok(compute({ ...SAMPLE, weekly: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, weekly: 0 }).errors.length);
  assert.ok(compute({ ...SAMPLE, age: 15 }).errors.length);
  assert.ok(compute({ ...SAMPLE, years: 40 }).errors.length);
  assert.ok(compute({ ...SAMPLE, years: 2.5 }).errors.length);
  assert.ok(compute({ ...SAMPLE, cap: 1999 }).errors.length);
  assert.ok(compute({ ...SAMPLE, mode: "bogus" }).errors.length);
  assert.ok(compute({ ...SAMPLE, offer: "" }).errors.length);
  assert.ok(compute({ ...SAMPLE, rate: 0.3 }).errors.length);
  assert.ok(compute({ ...SAMPLE, pilon: 60 }).errors.length);
  assert.ok(parse(undefined).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.ok(t.includes("Not legal or tax advice"));
  assert.ok(t.includes("Statutory redundancy pay: GBP 10,785"));
});
