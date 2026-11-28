// Miss. Code Ann. § 1-3-67 (via § 85-7-425) and § 3-3-7(1), checked against the text as read in
// sources/ms-1-3-67-and-3-3-7.txt.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { msClosedDay, msLegalHoliday, msPeriodEnd } from "../src/ms-dates.ts";

const source = readFileSync(new URL("../sources/ms-1-3-67-and-3-3-7.txt", import.meta.url), "utf8")
  .split("\n")
  .filter((l) => !l.startsWith("#"))
  .join(" ");

test("the rules encoded are the ones the source says", () => {
  for (const words of [
    "the day of the act, event or default from which the designated period of time begins to run shall not be included",
    "The last day of the period so computed shall be included unless it is a Saturday, a Sunday or a legal holiday",
    "the period runs until the end of the next day which is not a Saturday, a Sunday, a legal holiday",
    "When the period of time prescribed or allowed is less than seven (7) days, intermediate Saturdays, Sundays and legal holidays shall be excluded in the computation.",
    "In the event any holiday hereinbefore declared legal shall fall on Sunday, then the next following day shall be a legal holiday.",
  ]) {
    assert.ok(source.includes(words), words);
  }
  // Each of § 3-3-7(1)'s ten names, in the words the module uses.
  for (const name of [
    "New Year's Day",
    "Robert E. Lee's birthday and Dr. Martin Luther King, Jr.'s birthday",
    "Washington's birthday",
    "Confederate Memorial Day",
    "National Memorial Day and Jefferson Davis' birthday",
    "Independence Day",
    "Labor Day",
    "Armistice or Veterans' Day",
    "Thanksgiving Day",
    "Christmas Day",
  ]) {
    assert.ok(source.includes(`(${name})`), name);
  }
});

test("§ 3-3-7(1): the ten holidays of 2026 and 2027 on the days the statute names", () => {
  const y2026 = {
    "2026-01-01": "New Year's Day",
    "2026-01-19": "Robert E. Lee's birthday and Dr. Martin Luther King, Jr.'s birthday",
    "2026-02-16": "Washington's birthday",
    "2026-04-27": "Confederate Memorial Day",
    "2026-05-25": "National Memorial Day and Jefferson Davis' birthday",
    "2026-07-04": "Independence Day",
    "2026-09-07": "Labor Day",
    "2026-11-11": "Armistice or Veterans' Day",
    "2026-11-26": "Thanksgiving Day",
    "2026-12-25": "Christmas Day",
  };
  for (const [day, name] of Object.entries(y2026)) assert.equal(msLegalHoliday(day), name, day);
  // Not legal holidays: the Friday after Thanksgiving, Christmas Eve, Juneteenth, Elvis Presley Day
  // and Hernando de Soto Day ((3), (4)), Tuskegee Airmen Day ((7)).
  for (const day of [
    "2026-11-27",
    "2026-12-24",
    "2026-06-19",
    "2026-08-16",
    "2026-05-08",
    "2026-03-26",
  ]) {
    assert.equal(msLegalHoliday(day), null, day);
  }
  // 2027: Independence Day falls on a Sunday, so Monday 5 July is the legal holiday too.
  assert.equal(msLegalHoliday("2027-07-04"), "Independence Day");
  assert.equal(msLegalHoliday("2027-07-05"), "Independence Day (observed)");
  // A Saturday holiday is not moved to the Friday: the statute moves only a Sunday one.
  assert.equal(msLegalHoliday("2026-07-03"), null);
  // 2028: 25 December is a Monday; 2033: Christmas on a Sunday, the 26th observed.
  assert.equal(msLegalHoliday("2033-12-26"), "Christmas Day (observed)");
  assert.equal(msLegalHoliday("2029-04-30"), "Confederate Memorial Day");
});

test("msClosedDay: weekends and legal holidays", () => {
  assert.equal(msClosedDay("2026-12-05"), true); // Saturday
  assert.equal(msClosedDay("2026-12-06"), true); // Sunday
  assert.equal(msClosedDay("2026-11-26"), true); // Thanksgiving
  assert.equal(msClosedDay("2026-11-27"), false); // the Friday after
});

test("§ 1-3-67, seven days or more: the last day moves past weekends and holidays", () => {
  // Day 60 on a weekday: unmoved.
  assert.deepEqual(msPeriodEnd("2026-10-05", 60), {
    from: "2026-10-05",
    days: 60,
    calendarEnd: "2026-12-04",
    lastDay: "2026-12-04",
    moved: false,
    holidays: [],
  });
  // Day 60 on a Saturday: Monday.
  assert.equal(msPeriodEnd("2026-10-06", 60).lastDay, "2026-12-07");
  // Day 60 on Christmas Day 2026 (a Friday), then the weekend: Monday 28 December.
  assert.deepEqual(msPeriodEnd("2026-10-26", 60), {
    from: "2026-10-26",
    days: 60,
    calendarEnd: "2026-12-25",
    lastDay: "2026-12-28",
    moved: true,
    holidays: ["Christmas Day"],
  });
  // Intermediate weekends and holidays count when the period is seven days or more.
  assert.equal(msPeriodEnd("2026-11-20", 7).lastDay, "2026-11-27");
});

test("§ 1-3-67, under seven days: the weekends and holidays in between are left out", () => {
  // Filed on a Friday: Monday and Tuesday are the two days.
  assert.equal(msPeriodEnd("2026-12-04", 2).lastDay, "2026-12-08");
  // Filed on a Wednesday before Thanksgiving: Wednesday not counted, Thursday a holiday, so Friday
  // is day one and Monday day two.
  assert.deepEqual(msPeriodEnd("2026-11-25", 2), {
    from: "2026-11-25",
    days: 2,
    calendarEnd: "2026-11-27",
    lastDay: "2026-11-30",
    moved: true,
    holidays: ["Thanksgiving Day"],
  });
  // Filed on a Monday with nothing in the way: Wednesday.
  assert.equal(msPeriodEnd("2026-12-07", 2).lastDay, "2026-12-09");
  // Filed on a Saturday (the day itself is not counted): Monday and Tuesday.
  assert.equal(msPeriodEnd("2026-12-05", 2).lastDay, "2026-12-08");
});

test("the computed day is never before a plain calendar count", () => {
  for (let i = 0; i < 800; i++) {
    const from = new Date(Date.UTC(2026, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
    for (const days of [1, 2, 6, 7, 60, 90]) {
      const p = msPeriodEnd(from, days);
      assert.ok(p.lastDay >= p.calendarEnd, `${from} + ${days}`);
      assert.equal(msClosedDay(p.lastDay), false, `${from} + ${days}`);
    }
  }
});

test("bad input is refused", () => {
  assert.throws(() => msPeriodEnd("2026-02-30", 2), RangeError);
  assert.throws(() => msPeriodEnd("2026-02-01", 0), RangeError);
  assert.throws(() => msLegalHoliday("26-1-1"), RangeError);
});
