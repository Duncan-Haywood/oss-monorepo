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
  // 1000 h over 52 weekly periods: 19.23 h x 12.07% = 2.32 h, rounds to 2 per week = 104 h.
  const r = run({ pattern: "irregular", hoursWorked: 1000, payPeriod: "weekly", hourlyRate: 12.5, takenHours: 40 });
  assert.equal(r.unroundedHours, 120.7);
  assert.equal(r.accruedHours, 104);
  assert.equal(r.holidayPay, 1300);
  assert.equal(r.remaining, 64);
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

// Quality round 114 (portfolio/quality/audits/2026-11-26-uk-holiday-pay-calculator.json).
test("part-year entitlement rounds up from the exact figure, never down", () => {
  // 0.5 day a week, 131 of 365 days: 2.8 x 131/365 = 1.00493, so 1.5, not 1.
  const r = compute({ ...SAMPLE, yearStart: "2026-01-01", join: "2026-08-23", leave: "", daysPerWeek: 0.5, contractDays: "", bankHolidays: 0, taken: 0 });
  assert.equal(r.employedDays, 131);
  assert.equal(r.entitled, 1.5);
});

test("a leave year before 1 April 2024 is flagged, and gets no rolled-up pay finding", () => {
  const old = compute({ ...SAMPLE, pattern: "irregular", yearStart: "2023-04-01", join: "", hoursWorked: 1000 });
  assert.equal(old.preReform, true);
  assert.ok(old.findings.some((f) => f.severity === "high" && /before 1 April 2024/.test(f.title)));
  assert.ok(!old.findings.some((f) => /rolled-up holiday pay, it is paid/.test(f.title)));
  const now = compute({ ...SAMPLE, pattern: "irregular", yearStart: "2024-04-01", join: "", hoursWorked: 1000 });
  assert.equal(now.preReform, false);
  assert.ok(now.findings.some((f) => /rolled-up holiday pay, it is paid/.test(f.title)));
});

// Quality fix (audit 2026-11-26, defect 0): reg 15B(3)(b) and (5) accrue per pay
// period and round each period to the nearest hour, half an hour rounding up.
test("irregular hours accrue per pay period, rounded to the nearest hour (reg 15B(5))", () => {
  const base = { ...SAMPLE, pattern: "irregular", yearStart: "2026-04-01", join: "", leave: "", takenHours: 0, hourlyRate: 0 };
  // 30 h in one weekly period: 3.621 h rounds to 4 (the GOV.UK worked example).
  assert.equal(compute({ ...base, periodHours: "30" }).accruedHours, 4);
  // A year of 30-hour weeks: 52 x 4 = 208, not 1560 x 12.07% = 188.29.
  const year = compute({ ...base, hoursWorked: 1560, payPeriod: "weekly", periodHours: "" });
  assert.equal(year.accruedHours, 208);
  assert.equal(year.unroundedHours, 188.29);
  assert.equal(year.periodCount, 52);
  // Under half an hour rounds down: 4 h x 12.07% = 0.48 h -> 0; 4.15 h -> 0.50 h -> 1.
  assert.equal(compute({ ...base, periodHours: "4" }).accruedHours, 0);
  assert.equal(compute({ ...base, periodHours: "4.15" }).accruedHours, 1);
  // Uneven periods round one by one: 30, 25, 0, 40 -> 4 + 3 + 0 + 5 = 12.
  const uneven = compute({ ...base, periodHours: "30, 25, 0, 40" });
  assert.equal(uneven.accruedHours, 12);
  assert.equal(uneven.hoursYear, 95);
  assert.equal(uneven.evenSpread, false);
  // Monthly pay spreads the total over 12 periods: 1000 / 12 x 12.07% = 10.06 -> 10, x 12 = 120.
  assert.equal(compute({ ...base, hoursWorked: 1000, payPeriod: "monthly" }).accruedHours, 120);
  assert.ok(compute({ ...base, periodHours: "30, abc" }).errors.length);
  assert.ok(compute({ ...base, periodHours: "", payPeriod: "daily" }).errors.length);
});
