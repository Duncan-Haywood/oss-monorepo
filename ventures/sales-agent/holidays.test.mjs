import { test } from "node:test";
import assert from "node:assert/strict";
import { usFederalHolidays, usBusinessHolidays, holidayChecker } from "./holidays.mjs";
import { addBusinessDays, businessDaysBetween } from "./engine.mjs";

// Pinned from the rules (fixed dates moved off weekends; nth-weekday ones counted). 2026: July 4 is a Saturday, so
// Friday July 3 is observed. 2027: June 19 and December 25 are Saturdays, July 4 a Sunday; New Year's Day 2028 is a
// Saturday, so it is observed on Friday 2027-12-31.
test("US federal holidays, 2026 and 2027, with the weekend rule", () => {
  assert.deepEqual(usFederalHolidays(2026).map((h) => h.date), ["2026-01-01", "2026-01-19", "2026-02-16", "2026-05-25", "2026-06-19", "2026-07-03", "2026-09-07", "2026-10-12", "2026-11-11", "2026-11-26", "2026-12-25"]);
  assert.deepEqual(usFederalHolidays(2027).map((h) => h.date), ["2027-01-01", "2027-01-18", "2027-02-15", "2027-05-31", "2027-06-18", "2027-07-05", "2027-09-06", "2027-10-11", "2027-11-11", "2027-11-25", "2027-12-24"]);
  assert.equal(usFederalHolidays(2028)[0].date, "2027-12-31");
  assert.deepEqual(usBusinessHolidays(2026).map((h) => h.name), ["New Year's Day", "Memorial Day", "Independence Day", "Labor Day", "Thanksgiving Day", "Christmas Day"]);
});

test("holidayChecker: presets, dates and mixes; the year-before observed day; bad input throws", () => {
  const us = holidayChecker("us");
  assert.ok(us("2026-11-26") && us("2026-07-03") && !us("2026-07-04") && !us("2026-11-27"));
  assert.ok(us("2027-12-31"), "New Year's Day 2028 observed in 2027");
  const biz = holidayChecker("us-business, 2026-11-27");
  assert.ok(biz("2026-11-26") && biz("2026-11-27") && !biz("2026-10-12"), "Columbus Day is not a business holiday");
  assert.ok(holidayChecker(["2026-12-24"])("2026-12-24"));
  assert.equal(holidayChecker("")("2026-12-25"), false);
  assert.throws(() => holidayChecker("uk"), /not a date/);
});

test("business days skip holidays when given, weekends always", () => {
  const us = holidayChecker("us");
  assert.equal(addBusinessDays("2026-11-25", 1), "2026-11-26", "no list: Thanksgiving counts");
  assert.equal(addBusinessDays("2026-11-25", 1, us), "2026-11-27");
  assert.equal(addBusinessDays("2026-12-24", 1, us), "2026-12-28", "Christmas Friday, then the weekend");
  assert.equal(businessDaysBetween("2026-10-28", "2026-10-30"), 2);
  assert.equal(businessDaysBetween("2026-11-25", "2026-11-30", us), 2, "Thanksgiving skipped: Friday and Monday");
  assert.equal(businessDaysBetween("2026-10-30", "2026-10-28"), 0);
});
