import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY, wholeYears } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("sample: 13 years, age 46, 6 years at 1.5 weeks and 7 at 1 = 16 weeks at the 2026 cap", () => {
  const r = run({});
  assert.equal(r.serviceYears, 13);
  assert.equal(r.age, 46);
  assert.equal(r.weeks, 16);
  assert.equal(r.weekPay, 751);
  assert.equal(r.capped, true);
  assert.equal(r.statutory, 12016);
  assert.equal(r.excess, 0);
  assert.equal(r.net, 12016);
  assert.equal(r.noticeWeeks, 12);
});

test("cap follows the dismissal date: 719 before 6 April 2026", () => {
  const r = run({ end: "2026-04-05" });
  assert.equal(r.cap, 719);
  assert.equal(run({ end: "2026-04-06" }).cap, 751);
});

test("under 22 earns half a week a year", () => {
  const r = run({ dob: "2005-01-01", start: "2022-01-10", end: "2025-07-01", weekly: 500 });
  assert.equal(r.age, 20);
  assert.equal(r.serviceYears, 3);
  assert.equal(r.weeks, 1.5);
  assert.equal(r.statutory, 750);
});

test("age band is per year of service, counting back", () => {
  // 22 now, 4 years service: ages 22,21,20,19 -> 1 + 0.5*3
  const r = run({ dob: "2003-01-01", start: "2021-02-01", end: "2025-07-01", weekly: 400 });
  assert.equal(r.age, 22);
  assert.equal(r.weeks, 2.5);
});

test("under two years gets nothing statutory", () => {
  const r = run({ start: "2025-01-01", end: "2026-06-30" });
  assert.equal(r.eligible, false);
  assert.equal(r.statutory, 0);
});

test("exactly two years counts, the last day included", () => {
  assert.equal(run({ start: "2024-07-01", end: "2026-06-30" }).serviceYears, 2);
  assert.equal(run({ start: "2024-07-01", end: "2026-06-29" }).serviceYears, 1);
});

test("service is capped at 20 years", () => {
  const r = run({ dob: "1960-01-01", start: "1990-01-01", end: "2026-06-30" });
  assert.equal(r.counted, 20);
  assert.equal(r.weeks, 30);
  assert.equal(r.statutory, 30 * 751);
  assert.equal(r.statutory, r.maxStatutory);
});

test("an offer below statutory is flagged, above is treated as enhanced", () => {
  assert.ok(run({ offered: 5000 }).findings.some((f) => f.title.includes("below the statutory minimum")));
  const r = run({ offered: 40000, rate: 0.4 });
  assert.equal(r.excess, 10000);
  assert.equal(r.tax, 4000);
  assert.equal(r.net, 36000);
});

test("other termination payments use up the 30,000 limit first", () => {
  const r = run({ other: 25000 });
  assert.equal(r.excess, 12016 + 25000 - 30000);
});

test("notice is a week a year up to 12", () => {
  assert.equal(run({ start: "2022-07-01", end: "2026-06-30" }).noticeWeeks, 4);
});

test("bad input is rejected, not clamped", () => {
  assert.ok(compute({ ...SAMPLE, weekly: -1 }).errors.length);
  assert.ok(compute({ ...SAMPLE, dob: "2013-02-31" }).errors.length);
  assert.ok(compute({ ...SAMPLE, end: "2010-01-01" }).errors.length);
  assert.ok(compute({ ...SAMPLE, rate: 0.3 }).errors.length);
  assert.ok(compute({}).errors.length);
});

test("wholeYears handles anniversaries", () => {
  assert.equal(wholeYears({ y: 2000, mo: 2, d: 29 }, { y: 2001, mo: 2, d: 28 }), 0);
  assert.equal(wholeYears({ y: 2000, mo: 2, d: 1 }, { y: 2001, mo: 2, d: 1 }), 1);
});

test("summary names its source and disclaims advice", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /Not tax or legal advice/);
});
