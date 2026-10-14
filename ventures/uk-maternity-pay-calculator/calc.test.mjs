import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parse, rateFor, weekStart, SAMPLE, summaryText, RATES } from "./calc.mjs";

const base = { ...SAMPLE };

test("sample: 6 weeks at 90% then 33 weeks at the flat rate", () => {
  const r = compute(base);
  assert.deepEqual(r.errors, []);
  assert.ok(r.eligible);
  assert.equal(r.weeks, 39);
  assert.equal(r.schedule[0].weekly, 576);
  assert.equal(r.schedule[0].amount, 3456);
  assert.equal(r.schedule[1].weekly, 194.32);
  assert.equal(r.total, 3456 + 33 * 194.32);
});

test("qualifying week is the 15th week before the week the baby is due", () => {
  const r = compute(base);
  assert.equal(r.qualifyingWeek, "2026-08-02");
  assert.equal(r.qualifyingWeekEnd, "2026-08-08");
  assert.equal(r.earliestStart, "2026-08-30");
  assert.equal(new Date(r.qualifyingWeek).getUTCDay(), 0);
});

test("low earners get 90% throughout, not the flat rate", () => {
  const r = compute({ ...base, awe: 150 });
  assert.ok(r.eligible);
  assert.ok(r.schedule.every((s) => s.weekly === 135));
  assert.equal(r.total, 135 * 39);
});

test("below the lower earnings limit is not eligible", () => {
  const r = compute({ ...base, awe: 100 });
  assert.equal(r.eligible, false);
  assert.equal(r.total, 0);
  assert.match(r.findings[0].title, /lower earnings limit/);
});

test("under 26 weeks of employment in the qualifying week is not eligible; exactly 26 is", () => {
  assert.equal(compute({ ...base, start: "2026-03-01" }).eligible, false);
  // 182 days counting both ends ending on 2026-08-08 starts on 2026-02-08
  assert.equal(compute({ ...base, start: "2026-02-08" }).eligible, true);
  assert.equal(compute({ ...base, start: "2026-02-09" }).eligible, false);
});

test("rate changes mid-period use the rate in force on each week's start", () => {
  const r = compute({ ...base, due: "2026-03-20", start: "2020-01-06", payStart: "2026-01-04" });
  const flats = r.schedule.map((s) => s.weekly);
  assert.ok(flats.includes(187.18) && flats.includes(194.32), JSON.stringify(flats));
});

test("rateFor and weekStart", () => {
  assert.equal(rateFor(Date.UTC(2026, 3, 4)).flat, 187.18);
  assert.equal(rateFor(Date.UTC(2026, 3, 5)).flat, 194.32);
  assert.equal(new Date(weekStart(Date.UTC(2026, 10, 20))).toISOString().slice(0, 10), "2026-11-15");
  assert.equal(RATES.length, 2);
});

test("paternity pay: lower of flat rate and 90%, for one or two weeks", () => {
  const r = compute({ ...base, kind: "paternity", payStart: "2026-12-01", paternityWeeks: 2 });
  assert.equal(r.total, 2 * 194.32);
  assert.equal(compute({ ...base, kind: "paternity", payStart: "2026-12-01", paternityWeeks: 1 }).total, 194.32);
  assert.equal(compute({ ...base, kind: "paternity", payStart: "2026-12-01", awe: 150 }).total, 270);
});

test("a start before the earliest allowed date is flagged", () => {
  const r = compute({ ...base, payStart: "2026-08-23" });
  assert.ok(r.findings.some((f) => /earliest maternity pay can start/.test(f.title)));
});

test("shortfall against normal pay", () => {
  const r = compute(base);
  assert.equal(r.normalForPeriod, 640 * 39);
  assert.equal(r.gap, r.normalForPeriod - r.total);
});

test("bad input is rejected with messages, never clamped", () => {
  assert.ok(compute({}).errors.length >= 4);
  assert.match(compute({ ...base, due: "2026-02-31" }).errors[0], /due date/);
  assert.match(compute({ ...base, awe: -5 }).errors[0], /zero or more/);
  assert.match(compute({ ...base, kind: "x" }).errors[0], /maternity or paternity/);
  assert.match(compute({ ...base, kind: "paternity", paternityWeeks: 3 }).errors[0], /1 or 2/);
  assert.match(compute({ ...base, topUp: 150 }).errors[0], /0 to 100/);
  assert.ok(parse(base).errors.length === 0);
});

test("summary names the source and carries the disclaimer", () => {
  const t = summaryText(compute(base));
  assert.match(t, /Verify against: GOV\.UK/);
  assert.match(t, /No warranty/);
  assert.match(t, /Total statutory pay/);
});
