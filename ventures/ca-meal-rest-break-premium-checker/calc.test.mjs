import { test } from "node:test";
import assert from "node:assert/strict";
import { analyze, fieldsToRules, RULE_PRESETS, restOwed, parseTimecards, toCsv, toText } from "./calc.mjs";

const R = fieldsToRules(RULE_PRESETS.california.fields);
const run = (text, defaultRate = 16) => analyze({ text, rules: R, defaultRate });
const kinds = (r) => r.findings.map((f) => f.kind);

test("rest breaks owed: 10 minutes per 4 hours or major fraction", () => {
  const h = (x) => restOwed(x * 60, R);
  assert.equal(h(3.4), 0);
  assert.equal(h(3.5), 1);
  assert.equal(h(6), 1);      // exactly 2 hours into the fraction is not a major fraction
  assert.equal(h(6.01), 2);
  assert.equal(h(10), 2);
  assert.equal(h(10.01), 3);
  assert.equal(h(14), 3);
  assert.equal(h(14.01), 4);
});

test("a compliant 8.5 hour day has no findings", () => {
  const r = run("Ana, 2026-10-20, 08:00, 16:30, 12:00-12:30, , 2, 20");
  assert.deepEqual(r.errors, []);
  assert.equal(r.findings.length, 0);
  assert.equal(r.total, 0);
});

test("meal starting exactly at the end of hour five is on time; one minute later is late", () => {
  assert.deepEqual(kinds(run("A, 2026-10-20, 08:00, 16:30, 13:00-13:30, , 2")), []);
  const late = run("A, 2026-10-20, 08:00, 16:30, 13:01-13:31, , 2, 20");
  assert.deepEqual(kinds(late), ["meal-late"]);
  assert.equal(late.total, 20);
});

test("a 29 minute meal is short; a 25 minute late meal is two findings but one premium", () => {
  assert.deepEqual(kinds(run("A, 2026-10-20, 08:00, 16:30, 12:00-12:29, , 2")), ["meal-short"]);
  const both = run("A, 2026-10-20, 08:00, 16:30, 13:30-13:55, , 2, 20");
  assert.deepEqual(kinds(both), ["meal-short", "meal-late"]);
  assert.equal(both.total, 20);
});

test("no meal on a shift over five hours is missed; exactly five hours needs none", () => {
  assert.deepEqual(kinds(run("A, 2026-10-20, 09:00, 14:00, , , 1")), []);
  assert.deepEqual(kinds(run("A, 2026-10-20, 09:00, 14:01, , , 1")), ["meal-missed"]);
});

test("first meal waiver works up to six hours and not beyond", () => {
  assert.deepEqual(kinds(run("A, 2026-10-20, 09:00, 15:00, , , 1, 16, waiver")), ["waived"]);
  assert.deepEqual(kinds(run("A, 2026-10-20, 09:00, 15:01, , , 2, 16, waiver")), ["meal-missed"]);
});

test("second meal: required after ten hours of work, waivable to twelve only if the first was taken", () => {
  assert.deepEqual(kinds(run("A, 2026-10-20, 06:00, 16:30, 10:00-10:30, , 3")), []);              // 10:00 work, none needed
  assert.deepEqual(kinds(run("A, 2026-10-20, 06:00, 16:31, 10:00-10:30, , 3")), ["meal-missed"]);  // 10:01 work
  assert.deepEqual(kinds(run("A, 2026-10-20, 06:00, 18:30, 10:00-10:30, , 3, 16, waive2")), ["waived"]);  // 12:00 work
  assert.deepEqual(kinds(run("A, 2026-10-20, 06:00, 18:31, 10:00-10:30, , 4, 16, waive2")), ["meal-missed"]);
  assert.deepEqual(kinds(run("A, 2026-10-20, 06:00, 17:00, , , 3, 16, waive2")).filter((k) => k === "waived"), []);
});

test("late second meal is measured in work time after the first meal", () => {
  // in 06:00, meal1 10:00-10:30, meal2 starts 16:30 -> 10h30 elapsed minus 30 = 10h00 work: on time
  assert.deepEqual(kinds(run("A, 2026-10-20, 06:00, 17:30, 10:00-10:30, 16:30-17:00, 3")), []);
  assert.deepEqual(kinds(run("A, 2026-10-20, 06:00, 17:30, 10:00-10:30, 16:31-17:01, 3")), ["meal-late"]);
});

test("rest breaks: short count is a violation, blank is only a note", () => {
  const short = run("A, 2026-10-20, 08:00, 16:30, 12:00-12:30, , 1, 20");
  assert.deepEqual(kinds(short), ["rest-short"]);
  assert.equal(short.total, 20);
  const blank = run("A, 2026-10-20, 08:00, 16:30, 12:00-12:30, , , 20");
  assert.deepEqual(kinds(blank), ["rest-unrecorded"]);
  assert.equal(blank.total, 0);
});

test("one meal premium and one rest premium per workday, however many violations", () => {
  const r = run("A, 2026-10-20, 08:00, 12:30, , , 0, 20\nA, 2026-10-20, 13:00, 20:30, , , 0, 20");
  // shift 1: 4.5h, no meal needed, 1 rest owed, 0 taken -> rest. shift 2: 7.5h no meal -> meal missed + rest.
  assert.equal(r.total, 40);
  assert.equal(r.rollup.length, 1);
  assert.equal(r.rollup[0].mealPremium, 20);
  assert.equal(r.rollup[0].restPremium, 20);
});

test("premium uses the shift's own rate, else the default rate", () => {
  assert.equal(run("A, 2026-10-20, 09:00, 15:00, , , 1, 25.5").total, 25.5);
  assert.equal(run("A, 2026-10-20, 09:00, 15:00, , , 1", 18).total, 18);
});

test("an overnight shift and its meal after midnight are read correctly", () => {
  const r = run("A, 2026-10-20, 22:00, 06:30, 02:00-02:30, , 2, 20");
  assert.deepEqual(r.errors, []);
  assert.equal(r.findings.length, 0);
  const late = run("A, 2026-10-20, 22:00, 06:30, 03:30-04:00, , 2, 20");
  assert.deepEqual(kinds(late), ["meal-late"]);
});

test("different days are different workdays; summary and violation rate", () => {
  const r = run("A, 2026-10-20, 09:00, 15:00, , , 1, 20\nA, 2026-10-21, 09:00, 15:00, , , 1, 20\nB, 2026-10-20, 09:00, 15:00, 12:00-12:30, , 2, 10");
  assert.equal(r.total, 40);
  assert.equal(r.premiumDays, 2);
  assert.equal(r.workdays, 3);
  assert.equal(Math.round(r.violationRate * 100), 67);
  assert.equal(r.employees[0].name, "A");
  assert.equal(r.employees[0].premiumDays, 2);
});

test("annualised exposure appears only for a week or more of data", () => {
  assert.equal(run("A, 2026-10-20, 09:00, 15:00, , , 1, 20").annualized, null);
  const r = run("A, 2026-10-01, 09:00, 15:00, , , 1, 20\nA, 2026-10-07, 09:00, 15:00, , , 1, 20");
  assert.equal(r.spanDays, 7);
  assert.equal(r.annualized, Math.round(40 * 365 / 7 * 100) / 100);
});

test("bad lines are reported with their line number and do not stop the rest", () => {
  const r = run("garbage\nA, 2026-10-20, 09:00, 15:00, , , 1, 20\nB, 2026-02-31, 09:00, 15:00\nC, 2026-10-20, 09:00, 15:00, 12:00-99:00\nD, 2026-10-20, 09:00, 15:00, , , x");
  assert.equal(r.shiftCount, 1);
  assert.equal(r.errors.length, 4);
  assert.match(r.errors[0], /^Line 1:/);
});

test("header and comment lines are skipped", () => {
  const { shifts, errors } = parseTimecards("name, date, in, out\n# note\nA, 2026-10-20, 09:00, 15:00");
  assert.equal(shifts.length, 1);
  assert.deepEqual(errors, []);
});

test("CSV and text exports; spreadsheet formula names are neutralised", () => {
  const r = run("=cmd, 2026-10-20, 09:00, 15:00, , , 1, 20");
  const csv = toCsv(r);
  assert.match(csv, /^employee,date,meal_premium,rest_premium,total_premium,issues\n/);
  assert.match(csv, /'=cmd,2026-10-20,20\.00,0\.00,20\.00,meal-missed/);
  assert.match(csv, /TOTAL,,,,20\.00,/);
  assert.match(toText(r), /\$20\.00 total/);
});

test("custom rules: a 6 hour first-meal limit moves the late line", () => {
  const rules = fieldsToRules({ ...RULE_PRESETS.custom.fields, mealMaxStartHours: 6 });
  const r = analyze({ text: "A, 2026-10-20, 08:00, 16:30, 13:30-14:00, , 2, 20", rules, defaultRate: 16 });
  assert.deepEqual(r.findings, []);
});
