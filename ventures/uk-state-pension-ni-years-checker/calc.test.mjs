import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, statePensionAge, addAge, parseDate, taxYearsToSpa, gapDeadlines, summaryText, SAMPLE } from "./calc.mjs";

const spaOf = (s) => statePensionAge(parseDate(s));

test("State Pension age table", () => {
  assert.equal(spaOf("1959-12-31"), null);
  assert.deepEqual(spaOf("1960-04-06"), { years: 66, months: 1 });
  assert.deepEqual(spaOf("1960-05-05"), { years: 66, months: 1 });
  assert.deepEqual(spaOf("1960-05-06"), { years: 66, months: 2 });
  assert.deepEqual(spaOf("1961-03-05"), { years: 66, months: 11 });
  assert.deepEqual(spaOf("1961-03-06"), { years: 67, months: 0 });
  assert.deepEqual(spaOf("1975-06-15"), { years: 67, months: 0 });
  assert.deepEqual(spaOf("1977-04-05"), { years: 67, months: 0 });
  assert.deepEqual(spaOf("1977-04-06"), { years: 67, months: 1 });
  assert.deepEqual(spaOf("1978-03-06"), { years: 67, months: 11 });
  assert.deepEqual(spaOf("1978-04-06"), { years: 68, months: 0 });
});

test("SPA date is birthday plus age, clamped for short months", () => {
  assert.deepEqual(addAge(parseDate("1975-06-15"), { years: 67, months: 0 }), { y: 2042, m: 6, d: 15 });
  assert.deepEqual(addAge(parseDate("1960-12-31"), { years: 66, months: 2 }), { y: 2027, m: 2, d: 28 });
});

test("date parsing rejects impossible dates", () => {
  assert.equal(parseDate("2026-02-30"), null);
  assert.equal(parseDate("15/06/1975"), null);
});

test("tax years left before SPA", () => {
  // 14 Oct 2026 is in 2026/27; SPA 15 Jun 2042 falls in 2042/43 -> years 2026..2041 = 16
  assert.equal(taxYearsToSpa(parseDate("2026-10-14"), { y: 2042, m: 6, d: 15 }), 16);
  // SPA 1 Apr 2042 falls in 2041/42 -> 15
  assert.equal(taxYearsToSpa(parseDate("2026-10-14"), { y: 2042, m: 4, d: 1 }), 15);
});

test("the worked example: 18 years + 16 to go reaches 34, one short; buying 1 reaches 35", () => {
  const r = compute(SAMPLE);
  assert.deepEqual(r.errors, []);
  assert.equal(r.projected, 34);
  assert.equal(r.buy, 1);
  assert.equal(r.extraWeekly, 6.89);
  assert.equal(r.cost, 923);
  assert.equal(r.after, 241.3);
  assert.ok(r.paybackYears > 2.5 && r.paybackYears < 2.8);
});

test("no value when already at 35 years", () => {
  const r = compute({ ...SAMPLE, currentYears: "30" });
  assert.equal(r.buy, 0);
  assert.equal(r.cost, 0);
  assert.equal(r.extraWeekly, 0);
  assert.equal(r.paybackYears, null);
});

test("the 10-year minimum cliff is worth a full 10/35 entitlement", () => {
  const r = compute({ ...SAMPLE, currentYears: "6", futureYears: "2", gapYears: "2" });
  assert.equal(r.projected, 8);
  assert.equal(r.base, 0);
  assert.equal(r.after, 68.94);
  assert.ok(r.findings.some((f) => /10-year minimum/.test(f.title)));
});

test("a forecast figure overrides the 35ths count and is capped at the full rate", () => {
  const r = compute({ ...SAMPLE, currentYears: "20", futureYears: "5", gapYears: "6", forecast: "200" });
  assert.equal(r.base, 200);
  assert.ok(r.after <= 241.3);
  assert.equal(r.buy, 6);
  assert.equal(r.after, 241.3);
});

test("validation", () => {
  assert.match(compute({ ...SAMPLE, dob: "" }).errors[0], /date of birth/);
  assert.match(compute({ ...SAMPLE, gapYears: "7" }).errors[0], /0 to 6/);
  assert.match(compute({ ...SAMPLE, currentYears: "" }).errors[0], /qualifying years/);
  assert.match(compute({ ...SAMPLE, dob: "1950-01-01" }).errors[0], /6 April 1960/);
  assert.match(compute({ ...SAMPLE, dob: "1960-04-10", today: "2030-01-01" }).errors[0], /reached State Pension age/);
});

test("gap deadlines run six tax years back", () => {
  const d = gapDeadlines(parseDate("2026-10-14"));
  assert.equal(d.length, 6);
  assert.deepEqual(d[0], { year: "2025/26", deadline: "5 April 2032" });
  assert.deepEqual(d[5], { year: "2020/21", deadline: "5 April 2027" });
});

test("summary text names the cost, the gain and the caveat", () => {
  const s = summaryText(compute(SAMPLE));
  assert.match(s, /Years worth buying: 1 of 4/);
  assert.match(s, /not advice/);
});
