import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, summaryText, scenariosCsv, dollars, SAMPLE } from "./calc.mjs";

const raw = (o = {}) => ({ ...SAMPLE, ...o });

test("total follows the stated rule on the sample", () => {
  const r = compute(raw());
  const aircraft = 65 * 185;
  const instructor = ((65 - 12) * 1.5 + 10) * 65;
  const fixed = 250 + 150 + 175 + 800 + 500;
  assert.ok(Math.abs(r.total - (aircraft + instructor + fixed)) < 0.01);
  assert.ok(Math.abs(r.aircraft - aircraft) < 0.01);
  assert.ok(Math.abs(r.instructor - instructor) < 0.01);
  assert.ok(Math.abs(r.perFlightHour - r.total / 65) < 0.01);
});

test("ten more hours cost ten marginal hours", () => {
  const a = compute(raw()), b = compute(raw({ hours: "75" }));
  assert.ok(Math.abs(b.total - a.total - 10 * a.marginalHour) < 0.01);
});

test("scenario table includes the 40 hour minimum, the plan, and is sorted", () => {
  const r = compute(raw());
  assert.deepEqual(r.scenarios.map((s) => s.hours), [40, 50, 60, 65, 70, 80, 100]);
  assert.ok(r.scenarios.every((s, i, a) => i === 0 || s.total > a[i - 1].total));
  const lines = scenariosCsv(r).split("\n");
  assert.equal(lines[0], "flight_hours,total_cost");
  assert.equal(lines.length, 8);
});

test("pace and monthly spend follow flights per week", () => {
  const r = compute(raw());
  assert.ok(Math.abs(r.weeks - 65 / (2 * 1.3)) < 0.01);
  assert.ok(Math.abs(r.perMonth - r.total / (r.weeks * 12 / 52)) < 0.05);
  assert.equal(compute(raw({ flightsPerWeek: "0" })).weeks, null);
});

test("club saving is rate difference times hours, less dues over the months", () => {
  const r = compute(raw());
  const months = r.weeks * 12 / 52;
  assert.ok(Math.abs(r.club.saving - (65 * 35 - 75 * months)) < 0.05);
  assert.ok(Math.abs(r.club.breakEvenHoursPerMonth - 75 / 35) < 0.01);
  const noSave = compute(raw({ clubDues: "400" }));
  assert.ok(noSave.club.saving < 0);
  assert.ok(noSave.findings.some((f) => /costs about .* more than renting/.test(f.title)));
});

test("a club that is not cheaper has no break-even", () => {
  assert.equal(compute(raw({ clubRate: "200" })).club.breakEvenHoursPerMonth, null);
});

test("planning below 60 hours is flagged", () => {
  assert.ok(compute(raw({ hours: "45" })).findings.some((f) => /commonly quote totals/.test(f.title)));
  assert.ok(!compute(raw({ hours: "70" })).findings.some((f) => /commonly quote totals/.test(f.title)));
});

test("optional fields may be blank", () => {
  const r = compute({ hours: "50", aircraftRate: "150", instructorRate: "60" });
  assert.equal(r.errors.length, 0);
  assert.equal(r.club, null);
  assert.equal(r.weeks, null);
});

test("FAA minimums are enforced and bad input is reported", () => {
  assert.ok(compute(raw({ hours: "39" })).errors.length);
  assert.ok(compute(raw({ solo: "5" })).errors.length);
  assert.ok(compute(raw({ hours: "40", solo: "25" })).errors.length);
  assert.ok(compute(raw({ aircraftRate: "0" })).errors.length);
  assert.ok(compute(raw({ instructorRate: "abc" })).errors.length);
  assert.ok(compute(raw({ medical: "-1" })).errors.length);
  assert.ok(compute(raw({ hoursPerFlight: "9" })).errors.length);
});

test("summary and dollars format", () => {
  assert.equal(dollars(-1234.5), "-$1,234.50");
  assert.match(summaryText(compute(raw())), /Private pilot training: 65 flight hours \(53 with an instructor, 12 solo\)/);
});
