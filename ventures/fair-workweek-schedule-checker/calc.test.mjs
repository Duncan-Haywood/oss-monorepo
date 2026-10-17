import { test } from "node:test";
import assert from "node:assert/strict";
import { RULE_PRESETS, fieldsToRules, parseDateTime, parseShiftSpec, parseSchedule, parseChanges, analyze, toCsv, toText, fmt } from "./calc.mjs";

const seattle = fieldsToRules(RULE_PRESETS.seattle.fields);
const chicago = fieldsToRules(RULE_PRESETS.chicago.fields);
const posted = parseDateTime("2026-10-05 09:00");
const SCHED = "Ana, 2026-10-20, 09:00-17:00, 20\nBen, 2026-10-20, 10:00-18:00, 15";

test("date and shift parsing", () => {
  assert.equal(fmt(parseDateTime("2026-10-05 09:00")), "2026-10-05 09:00");
  assert.equal(parseDateTime("2026-02-30 09:00"), null);
  assert.equal(parseDateTime("nope"), null);
  const night = parseShiftSpec("2026-10-20 22:00-06:00");
  assert.equal((night.end - night.start) / 60, 8);
  assert.equal(parseShiftSpec("2026-10-20 9-5"), null);
});

test("schedule and change parsing report bad lines", () => {
  const s = parseSchedule("Ana, 2026-10-20, 09:00-17:00\nbad line\n# comment\nBen, 2026-10-20, 10:00-18:00, abc");
  assert.equal(s.shifts.length, 1);
  assert.equal(s.errors.length, 2);
  const c = parseChanges("Ana | cancel | 2026-10-20 09:00-17:00 | notified 2026-10-19 09:00\nAna | change | 2026-10-20 09:00-17:00 | notified 2026-10-19 09:00");
  assert.equal(c.changes.length, 1);
  assert.equal(c.errors.length, 1);
});

test("Seattle: short-notice cancel pays half the lost hours; add pays one hour", () => {
  const r = analyze({
    postedAt: posted, scheduleText: SCHED, rules: seattle, defaultRate: 15,
    changesText: "Ana | cancel | 2026-10-20 09:00-17:00 | notified 2026-10-19 09:00\nBen | add | 2026-10-22 10:00-14:00 | notified 2026-10-20 10:00",
  });
  assert.deepEqual(r.errors, []);
  const cancel = r.findings.find((f) => f.type === "cancel");
  assert.equal(cancel.premium, 80); // 0.5 * 8 h * $20
  assert.equal(cancel.noticeHours, 24);
  assert.equal(r.findings.find((f) => f.type === "add-move").premium, 15);
  assert.equal(r.total, 95);
});

test("Chicago: cancellation with exactly 24 h notice is outside the window", () => {
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules: chicago, defaultRate: 15,
    changesText: "Ana | cancel | 2026-10-20 09:00-17:00 | notified 2026-10-19 09:00" });
  assert.equal(r.total, 0);
  const r2 = analyze({ postedAt: posted, scheduleText: SCHED, rules: chicago, defaultRate: 15,
    changesText: "Ana | cancel | 2026-10-20 09:00-17:00 | notified 2026-10-19 09:01" });
  assert.equal(r2.total, 80);
});

test("shortening a shift pays on the hours lost only", () => {
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules: seattle, defaultRate: 15,
    changesText: "Ben | change | 2026-10-20 10:00-18:00 -> 2026-10-20 10:00-14:00 | notified 2026-10-20 08:00" });
  assert.equal(r.total, 30); // 0.5 * 4 h * $15
  assert.equal(r.findings.length, 1);
});

test("moving a shift without losing hours is an add/move premium", () => {
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules: seattle, defaultRate: 15,
    changesText: "Ben | change | 2026-10-20 10:00-18:00 -> 2026-10-21 10:00-18:00 | notified 2026-10-18 10:00" });
  assert.equal(r.total, 15);
});

test("notice at or beyond the window costs nothing", () => {
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules: seattle, defaultRate: 15,
    changesText: "Ben | add | 2026-10-30 10:00-14:00 | notified 2026-10-16 10:00" });
  assert.equal(r.total, 0); // exactly 14 days
});

test("employee-requested changes are exempt and recorded as such", () => {
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules: seattle, defaultRate: 15,
    changesText: "Ana | cancel | 2026-10-20 09:00-17:00 | notified 2026-10-20 07:00 | requested" });
  assert.equal(r.total, 0);
  assert.equal(r.findings[0].type, "exempt");
  assert.equal(r.count, 0);
});

test("late posting is flagged without a dollar figure", () => {
  const r = analyze({ postedAt: parseDateTime("2026-10-10 09:00"), scheduleText: SCHED, rules: seattle, defaultRate: 15, changesText: "" });
  assert.equal(r.findings.filter((f) => f.type === "late-posting").length, 2);
  assert.equal(r.total, 0);
});

test("rest rule: closing then opening pays the multiplier on hours inside the window", () => {
  const r = analyze({ postedAt: posted, rules: seattle, defaultRate: 10, changesText: "",
    scheduleText: "Cy, 2026-10-20, 18:00-23:00, 10\nCy, 2026-10-21, 06:00-12:00, 10" });
  const rest = r.findings.find((f) => f.type === "rest");
  assert.equal(rest.premium, 7.5); // 0.25 * 3 h * $10
  const ok = analyze({ postedAt: posted, rules: seattle, defaultRate: 10, changesText: "",
    scheduleText: "Cy, 2026-10-20, 18:00-23:00, 10\nCy, 2026-10-21, 09:00-12:00, 10" });
  assert.equal(ok.findings.length, 0); // exactly 10 h
});

test("rest check sees the schedule after changes are applied", () => {
  const r = analyze({ postedAt: posted, rules: seattle, defaultRate: 10,
    scheduleText: "Cy, 2026-10-20, 18:00-23:00, 10\nCy, 2026-10-21, 09:00-12:00, 10",
    changesText: "Cy | change | 2026-10-21 09:00-12:00 -> 2026-10-21 06:00-12:00 | notified 2026-10-01 09:00" });
  assert.ok(r.findings.some((f) => f.type === "rest"));
});

test("a change that matches no shift is an error, not a silent zero", () => {
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules: seattle, defaultRate: 15,
    changesText: "Ana | cancel | 2026-10-20 08:00-16:00 | notified 2026-10-19 09:00" });
  assert.equal(r.errors.length, 1);
  assert.match(r.errors[0], /No scheduled shift for Ana/);
});

test("custom fields: flat dollar premiums and a notice window", () => {
  const rules = fieldsToRules({ noticeDays: 7, addMoveWindowHours: 72, addMoveHoursOfPay: 0, addMoveFlat: 10, cancelWindowHours: 72, cancelFractionOfLost: 0, cancelFlat: 45, restHours: 0, restMultiplier: 1 });
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules, defaultRate: 15,
    changesText: "Ana | cancel | 2026-10-20 09:00-17:00 | notified 2026-10-19 09:00\nBen | add | 2026-10-22 10:00-14:00 | notified 2026-10-20 10:00" });
  assert.equal(r.total, 55);
});

test("CSV and text exports carry every finding and the total", () => {
  const r = analyze({ postedAt: posted, scheduleText: SCHED, rules: seattle, defaultRate: 15,
    changesText: "Ana | cancel | 2026-10-20 09:00-17:00 | notified 2026-10-19 09:00" });
  const csv = toCsv(r).split("\n");
  assert.equal(csv.length, 3);
  assert.match(csv[2], /^TOTAL,,,,80\.00/);
  assert.match(toText(r), /premium pay to review \$80\.00/);
});
