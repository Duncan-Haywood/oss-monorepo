import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, SAMPLE, VERIFY } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("full year, five days a week: 28 days, the maximum", () => {
  const r = run({ join: "", leave: "", taken: 0 });
  assert.equal(r.fullDays, 28);
  assert.equal(r.capped, false);
  assert.equal(r.entitled, 28);
  assert.equal(r.fraction, 1);
});

test("six days a week is capped at 28", () => {
  const r = run({ join: "", daysPerWeek: 6 });
  assert.equal(r.fullDays, 28);
  assert.equal(r.capped, true);
});

test("part-time: 3 days a week is 16.8 days", () => {
  const r = run({ join: "", daysPerWeek: 3 });
  assert.equal(r.fullDays, 16.8);
  assert.equal(r.entitled, 17);
});

test("starter on 14 April 2026: 262 of 365 days, 20.1 days accrued, rounds up to 20.5", () => {
  const r = run({});
  assert.equal(r.employedDays, 262);
  assert.equal(r.accrued, 20.1);
  assert.equal(r.entitled, 20.5);
  assert.equal(r.remaining, 17.5);
  assert.equal(r.dailyPay, 120);
  assert.equal(r.value, 2100);
});

test("leaver is pro-rated to the last day and owed unused days", () => {
  const r = run({ join: "", leave: "2026-06-30", taken: 5, daysPerWeek: 5 });
  assert.equal(r.employedDays, 181);
  assert.equal(r.accrued, 13.88);
  assert.equal(r.entitled, 14);
  assert.equal(r.remaining, 9);
  assert.ok(r.findings.some((f) => /must pay for them/.test(f.title)));
  assert.ok(r.obligations.some((o) => o.ref === "Final pay"));
});

test("overtaken leave is flagged, not hidden", () => {
  const r = run({ join: "", leave: "2026-01-31", taken: 10 });
  assert.ok(r.remaining < 0);
  assert.ok(r.findings.some((f) => /more than you have accrued/.test(f.title)));
});

test("contract below statutory is called out", () => {
  const r = run({ join: "", contractDays: 20 });
  assert.ok(r.findings.some((f) => /below the statutory/.test(f.title)));
});

test("bank holidays reduce days left to choose", () => {
  const r = run({ join: "", bankHolidays: 8 });
  assert.equal(r.afterBank, 20);
});

test("irregular hours: 12.07% of hours worked", () => {
  const r = run({ pattern: "irregular", hoursWorked: 1000, hourlyRate: 12.5, takenHours: 40 });
  assert.equal(r.accruedHours, 120.7);
  assert.equal(r.holidayPay, 1508.75);
  assert.equal(r.remaining, 80.7);
  assert.equal(r.uplift, 1508.75);
});

test("leap-year leave year has 366 days", () => {
  const r = run({ yearStart: "2028-01-01", join: "", daysPerWeek: 5 });
  assert.equal(r.yearDays, 366);
  assert.equal(r.yearEnd, "2028-12-31");
});

test("bad input is rejected with a message", () => {
  assert.ok(run({ yearStart: "" }).errors.length);
  assert.ok(run({ daysPerWeek: 0 }).errors.length);
  assert.ok(run({ daysPerWeek: 8 }).errors.length);
  assert.ok(run({ join: "2026-05-01", leave: "2026-04-01" }).errors.length);
  assert.ok(run({ pattern: "irregular", hoursWorked: -1 }).errors.length);
  assert.ok(run({ pattern: "nope" }).errors.length);
  assert.ok(run({ join: "2027-02-01" }).errors.length);
  assert.ok(run({ join: "", leave: "2025-12-01" }).errors.length);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.ok(t.includes(VERIFY));
  assert.match(t, /No warranty/);
  assert.match(summaryText(run({ pattern: "irregular" })), /12\.07%/);
});
