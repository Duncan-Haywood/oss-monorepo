import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedToUtc, zonedParts, parseWeekly, formatWeekly, parseTimeOff, computeSlots, groupByDay, validZone } from "./slots.mjs";

const NY = "America/New_York";
const iso = (ms) => new Date(ms).toISOString();

test("wall-clock times convert across daylight saving", () => {
  assert.equal(iso(zonedToUtc(2026, 1, 15, 9, 0, NY)), "2026-01-15T14:00:00.000Z");
  assert.equal(iso(zonedToUtc(2026, 7, 15, 9, 0, NY)), "2026-07-15T13:00:00.000Z");
  assert.equal(zonedToUtc(2026, 3, 8, 2, 30, NY), null, "the hour that does not exist");
  assert.equal(iso(zonedToUtc(2026, 11, 1, 1, 30, NY)), "2026-11-01T05:30:00.000Z", "the repeated hour takes the first");
  assert.equal(iso(zonedToUtc(2026, 6, 1, 12, 0, "Asia/Kolkata")), "2026-06-01T06:30:00.000Z");
  assert.deepEqual(zonedParts(Date.UTC(2026, 0, 1, 0, 0), "Pacific/Auckland").d, 1);
});

test("weekly hours parse, merge and round trip", () => {
  const w = parseWeekly("weekdays 09:00-12:00, 11:00-13:00\nsat 10:00-11:00\nwed closed");
  assert.deepEqual(w[1], [[540, 780]]);
  assert.deepEqual(w[3], []);
  assert.deepEqual(w[6], [[600, 660]]);
  assert.deepEqual(parseWeekly(formatWeekly(w)), w);
  assert.deepEqual(parseWeekly("fri-mon 08:00-09:00")[0], [[480, 540]], "ranges wrap the week");
  for (const bad of ["monday-ish 9-5", "mon 17:00-09:00", "mon 25:00-26:00", "funday 09:00-10:00", "09:00-17:00"]) assert.throws(() => parseWeekly(bad), bad);
});

test("days off parse as single days and ranges", () => {
  assert.deepEqual(parseTimeOff("2026-12-24 # eve\n2026-12-30 to 2027-01-02"), [["2026-12-24", "2026-12-24"], ["2026-12-30", "2027-01-02"]]);
  assert.throws(() => parseTimeOff("christmas"));
  assert.throws(() => parseTimeOff("2026-12-30 to 2026-12-01"));
});

const cfg = { tz: NY, weekly: parseWeekly("weekdays 09:00-12:00"), timeOff: [] };
const type = { minutes: 60, buffer: 0, step: 60, notice: 0, horizonDays: 60 };
const mon = Date.UTC(2026, 9, 19, 0, 0); // Monday 19 Oct 2026, 00:00 UTC = Sunday evening in New York

test("slots follow the host's hours in the host's zone", () => {
  const s = computeSlots({ cfg, type, now: mon, from: mon, to: mon + 86_400_000 * 2 });
  assert.deepEqual(s.map(iso), ["2026-10-19T13:00:00.000Z", "2026-10-19T14:00:00.000Z", "2026-10-19T15:00:00.000Z", "2026-10-20T13:00:00.000Z", "2026-10-20T14:00:00.000Z", "2026-10-20T15:00:00.000Z"]);
});

test("slots survive the spring-forward weekend", () => {
  const sat = Date.UTC(2026, 2, 7, 12, 0);
  const s = computeSlots({ cfg: { ...cfg, weekly: parseWeekly("daily 09:00-10:00") }, type, now: sat, from: sat, to: sat + 3 * 86_400_000 });
  assert.deepEqual(s.map(iso), ["2026-03-07T14:00:00.000Z", "2026-03-08T13:00:00.000Z", "2026-03-09T13:00:00.000Z"]);
});

test("a window inside the missing hour yields no slot instead of a wrong one", () => {
  const sun = Date.UTC(2026, 2, 8, 0, 0);
  const s = computeSlots({ cfg: { ...cfg, weekly: parseWeekly("sun 02:00-03:00") }, type: { ...type, minutes: 30, step: 30 }, now: sun - 86_400_000, from: sun - 86_400_000, to: sun + 86_400_000 });
  assert.deepEqual(s, []);
});

test("busy time, buffers, notice, horizon, days off and daily caps all remove slots", () => {
  const w = Date.UTC(2026, 9, 19, 12, 0);
  const base = { cfg, type: { ...type, buffer: 15 }, now: w, from: w, to: w + 86_400_000 };
  const free = computeSlots(base);
  assert.equal(free.length, 3);
  // 14:00Z booking blocks 13:00 and 15:00 as well because of the 15 minute buffer
  const blocked = computeSlots({ ...base, busy: [{ id: "x", start: Date.UTC(2026, 9, 19, 14, 0), end: Date.UTC(2026, 9, 19, 15, 0), kind: "booking" }] });
  assert.deepEqual(blocked, []);
  assert.equal(computeSlots({ ...base, type: { ...type, notice: 120 } }).length, 2, "notice hides the 13:00Z slot");
  assert.equal(computeSlots({ ...base, type: { ...type, horizonDays: 0.01 } }).length, 0);
  assert.equal(computeSlots({ ...base, cfg: { ...cfg, timeOff: [["2026-10-19", "2026-10-19"]] } }).length, 0);
  assert.equal(computeSlots({ ...base, type: { ...type, maxPerDay: 1 }, busy: [{ id: "y", start: Date.UTC(2026, 9, 19, 13, 0), end: Date.UTC(2026, 9, 19, 14, 0), kind: "booking" }] }).length, 0);
  assert.equal(computeSlots({ ...base, type: { ...type, maxPerDay: 1 }, ignoreId: "y", busy: [{ id: "y", start: Date.UTC(2026, 9, 19, 13, 0), end: Date.UTC(2026, 9, 19, 14, 0), kind: "booking" }] }).length, 3, "moving a booking does not count against itself");
  assert.equal(computeSlots({ ...base, type: { ...type, weekly: parseWeekly("mon 09:00-10:00") } }).length, 1, "a type can carry its own hours");
});

test("slots group by the visitor's day, which can differ from the host's", () => {
  const w = Date.UTC(2026, 9, 19, 0, 0);
  const s = computeSlots({ cfg: { ...cfg, weekly: parseWeekly("mon 20:00-23:00") }, type, now: w, from: w, to: w + 86_400_000 * 2 });
  const g = groupByDay(s, "Asia/Tokyo");
  assert.equal(g.length, 1); assert.equal(g[0].date, "2026-10-20");
});

test("time zone names are validated", () => {
  assert.ok(validZone("Europe/Berlin")); assert.ok(!validZone("Mars/Base")); assert.ok(!validZone("")); assert.ok(!validZone(undefined));
});
