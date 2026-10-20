import test from "node:test";
import assert from "node:assert/strict";
import { normalizeSchedule, toggleDay, scheduleSuggestion, suggestWithSchedule, DEFAULT_SCHEDULE } from "./src/schedule.mjs";
import { readyToConfirm } from "./src/places.mjs";

const on = { ...DEFAULT_SCHEDULE, enabled: true };
const at = (y, m, d, h, min = 0) => Date.UTC(y, m - 1, d, h, min);
// 2026-07-14 is a Tuesday, 2026-07-18 a Saturday.

test("off by default: no suggestion", () => {
  assert.equal(scheduleSuggestion(DEFAULT_SCHEDULE, { startedAt: at(2026, 7, 14, 10) }), null);
});

test("weekday inside hours suggests business, labelled as a guess and never auto", () => {
  const s = scheduleSuggestion(on, { startedAt: at(2026, 7, 14, 10) });
  assert.equal(s.category, "business");
  assert.equal(s.auto, false);
  assert.equal(s.source, "schedule");
  assert.match(s.reason, /guess/);
});

test("weekend, before start and at/after end give nothing", () => {
  assert.equal(scheduleSuggestion(on, { startedAt: at(2026, 7, 18, 10) }), null);
  assert.equal(scheduleSuggestion(on, { startedAt: at(2026, 7, 14, 7, 59) }), null);
  assert.equal(scheduleSuggestion(on, { startedAt: at(2026, 7, 14, 18, 0) }), null);
  assert.ok(scheduleSuggestion(on, { startedAt: at(2026, 7, 14, 17, 59) }));
});

test("the phone's UTC offset decides the local hour", () => {
  // 02:00 UTC Wednesday is 19:00 Tuesday in UTC-7: outside hours; 16:00 UTC is 09:00 there: inside.
  assert.equal(scheduleSuggestion(on, { startedAt: at(2026, 7, 15, 2) }, { utcOffsetMin: -420 }), null);
  assert.ok(scheduleSuggestion(on, { startedAt: at(2026, 7, 14, 16) }, { utcOffsetMin: -420 }));
});

test("history wins over the schedule", () => {
  const hist = { category: "commute", confidence: 0.95, auto: true, reason: "x" };
  assert.equal(suggestWithSchedule(hist, on, { startedAt: at(2026, 7, 14, 10) }), hist);
  assert.equal(suggestWithSchedule(null, on, { startedAt: at(2026, 7, 14, 10) }).category, "business");
});

test("a schedule guess is never filed by 'confirm drives I recognise'", () => {
  const drive = { id: "a", to: { lat: 1, lon: 1 }, from: { lat: 2, lon: 2 }, startedAt: at(2026, 7, 14, 10) };
  const places = [{ id: "p", name: "Shop", lat: 1, lon: 1, purpose: "pickup" }];
  const ready = readyToConfirm([drive], (d) => scheduleSuggestion(on, d), places);
  assert.deepEqual(ready, []);
});

test("normalize repairs bad input; toggleDay adds and removes", () => {
  const n = normalizeSchedule({ enabled: "yes", days: [1, 1, 9, "x", 3], startHour: 20, endHour: 5, category: "nope" });
  assert.equal(n.enabled, false);
  assert.deepEqual(n.days, [1, 3]);
  assert.equal(n.startHour, 8); assert.equal(n.endHour, 18); assert.equal(n.category, "business");
  assert.deepEqual(toggleDay(on, 1).days, [2, 3, 4, 5]);
  assert.deepEqual(toggleDay(on, 6).days, [1, 2, 3, 4, 5, 6]);
});
