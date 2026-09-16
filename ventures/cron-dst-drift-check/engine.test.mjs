import test from "node:test";
import assert from "node:assert/strict";
import {
  parseCronField,
  parseCronExpression,
  formatLocalParts,
  tzOffsetMinutesAt,
  assertValidTimeZone,
  resolveLocalTime,
  nextRuns,
  findOffsetSegments,
  utcOffsetDrift,
  summarizeRuns,
} from "./engine.mjs";

// --- parseCronField -----------------------------------------------------

test("parseCronField: wildcard covers the whole range", () => {
  assert.deepEqual([...parseCronField("*", 0, 3)].sort(), [0, 1, 2, 3]);
});

test("parseCronField: list, range, and step combine", () => {
  const values = parseCronField("1,5,10-12,*/20", 0, 59);
  assert.ok(values.has(1) && values.has(5) && values.has(10) && values.has(11) && values.has(12));
  assert.ok(values.has(0) && values.has(20) && values.has(40)); // */20
});

test("parseCronField: range with step", () => {
  assert.deepEqual([...parseCronField("10-16/2", 0, 59)].sort((a, b) => a - b), [10, 12, 14, 16]);
});

test("parseCronField: rejects out-of-range values", () => {
  assert.throws(() => parseCronField("99", 0, 59), /out of range/);
});

test("parseCronField: rejects a zero step", () => {
  assert.throws(() => parseCronField("*/0", 0, 59), /invalid step/);
});

test("parseCronField: rejects garbage", () => {
  assert.throws(() => parseCronField("mon", 0, 6), /unparseable/);
});

// --- parseCronExpression -------------------------------------------------

test("parseCronExpression: requires exactly 5 fields", () => {
  assert.throws(() => parseCronExpression("* * * *"), /expected 5/);
  assert.throws(() => parseCronExpression("* * * * * *"), /expected 5/);
});

test("parseCronExpression: dow 7 normalizes to 0 (both mean Sunday)", () => {
  const fields = parseCronExpression("0 0 * * 7");
  assert.ok(fields.dow.has(0));
  assert.ok(!fields.dow.has(7));
});

test("parseCronExpression: tracks which fields are wildcards", () => {
  const fields = parseCronExpression("30 2 * * *");
  assert.equal(fields.minuteIsWildcard, false);
  assert.equal(fields.domIsWildcard, true);
});

// --- timezone offset primitives ------------------------------------------

test("tzOffsetMinutesAt: UTC is always zero", () => {
  assert.equal(tzOffsetMinutesAt(Date.UTC(2027, 5, 15), "UTC"), 0);
});

test("tzOffsetMinutesAt: America/New_York is -300 in January (EST) and -240 in July (EDT)", () => {
  assert.equal(tzOffsetMinutesAt(Date.UTC(2027, 0, 15, 12), "America/New_York"), -300);
  assert.equal(tzOffsetMinutesAt(Date.UTC(2027, 6, 15, 12), "America/New_York"), -240);
});

test("assertValidTimeZone: rejects a made-up zone name", () => {
  assert.throws(() => assertValidTimeZone("Mars/Olympus_Mons"));
});

test("assertValidTimeZone: accepts a real IANA zone", () => {
  assert.doesNotThrow(() => assertValidTimeZone("Europe/London"));
});

test("formatLocalParts: reads back the expected wall-clock time", () => {
  const p = formatLocalParts(Date.UTC(2027, 5, 15, 16, 30, 0), "America/New_York"); // 16:30 UTC in July = 12:30 EDT
  assert.equal(p.hour, 12);
  assert.equal(p.minute, 30);
  assert.equal(p.day, 15);
});

// --- resolveLocalTime, derived against the real transition dates found by
// findOffsetSegments rather than a hardcoded calendar date, so this stays
// correct even if a future tzdata update ever moves the US transition rule.

const YEAR = 2027;
const NY_SEGMENTS = findOffsetSegments("America/New_York", YEAR);

test("findOffsetSegments: America/New_York has exactly 3 segments in a year (EST, EDT, EST)", () => {
  assert.equal(NY_SEGMENTS.length, 3);
  assert.equal(NY_SEGMENTS[0].offsetMinutes, -300);
  assert.equal(NY_SEGMENTS[1].offsetMinutes, -240);
  assert.equal(NY_SEGMENTS[2].offsetMinutes, -300);
});

test("findOffsetSegments: a zone with no DST has exactly one segment", () => {
  assert.equal(findOffsetSegments("Asia/Tokyo", YEAR).length, 1);
  assert.equal(findOffsetSegments("UTC", YEAR).length, 1);
});

test("resolveLocalTime: an ordinary time, far from any transition, resolves once", () => {
  const r = resolveLocalTime(YEAR, 6, 15, 9, 0, "America/New_York");
  assert.equal(r.kind, "normal");
  assert.equal(r.instants.length, 1);
});

test("resolveLocalTime: the spring-forward date's 02:30 does not exist", () => {
  const springForward = NY_SEGMENTS[1]; // the segment that begins EDT
  const r = resolveLocalTime(YEAR, springForward.startMonth, springForward.startDay, 2, 30, "America/New_York");
  assert.equal(r.kind, "skipped");
  assert.equal(r.instants.length, 0);
});

test("resolveLocalTime: an hour either side of the spring-forward gap is normal", () => {
  const springForward = NY_SEGMENTS[1];
  const before = resolveLocalTime(YEAR, springForward.startMonth, springForward.startDay, 1, 30, "America/New_York");
  const after = resolveLocalTime(YEAR, springForward.startMonth, springForward.startDay, 3, 30, "America/New_York");
  assert.equal(before.kind, "normal");
  assert.equal(after.kind, "normal");
});

test("resolveLocalTime: the fall-back date's 01:30 happens twice, 60 minutes apart", () => {
  const fallBack = NY_SEGMENTS[2]; // the segment that resumes EST
  const r = resolveLocalTime(YEAR, fallBack.startMonth, fallBack.startDay, 1, 30, "America/New_York");
  assert.equal(r.kind, "ambiguous");
  assert.equal(r.instants.length, 2);
  assert.equal(r.instants[1] - r.instants[0], 60 * 60 * 1000);
});

// --- nextRuns --------------------------------------------------------------

test("nextRuns: a daily UTC cron in the UTC zone never flags anything", () => {
  const { occurrences, flagged } = nextRuns("0 9 * * *", "UTC", { from: new Date(Date.UTC(2027, 0, 1)), count: 5 });
  assert.equal(occurrences.length, 5);
  assert.equal(flagged.length, 0);
  for (const occ of occurrences) assert.equal(occ.local.hour, 9);
});

test("nextRuns: a daily 02:30 America/New_York cron flags the spring-forward gap", () => {
  const springForward = NY_SEGMENTS[1];
  const from = new Date(Date.UTC(YEAR, springForward.startMonth - 1, springForward.startDay - 2, 0, 0));
  const { flagged } = nextRuns("30 2 * * *", "America/New_York", { from, count: 3 });
  assert.ok(flagged.some((f) => f.kind === "skipped" && f.local.day === springForward.startDay));
});

test("nextRuns: a daily 01:30 America/New_York cron flags the fall-back overlap", () => {
  const fallBack = NY_SEGMENTS[2];
  const from = new Date(Date.UTC(YEAR, fallBack.startMonth - 1, fallBack.startDay - 2, 0, 0));
  const { flagged } = nextRuns("30 1 * * *", "America/New_York", { from, count: 3 });
  const hit = flagged.find((f) => f.kind === "ambiguous" && f.local.day === fallBack.startDay);
  assert.ok(hit);
  assert.equal(hit.instants.length, 2);
});

test("nextRuns: dom-and-dow both restricted matches on OR, per standard cron semantics", () => {
  // 15th of the month OR a Monday -- so a non-15th Monday must appear.
  const { occurrences } = nextRuns("0 9 15 * 1", "UTC", { from: new Date(Date.UTC(2027, 0, 1)), count: 4 });
  assert.ok(occurrences.some((o) => o.local.day !== 15));
});

test("nextRuns: rejects an unrecognized timezone", () => {
  assert.throws(() => nextRuns("0 9 * * *", "Not/AZone"));
});

test("summarizeRuns: clean run reports no risk", () => {
  const { occurrences, flagged } = nextRuns("0 9 * * *", "UTC", { from: new Date(Date.UTC(2027, 0, 1)), count: 3 });
  assert.equal(summarizeRuns({ occurrences, flagged }).status, "clean");
});

test("summarizeRuns: a run carrying a skip reports dst-risk", () => {
  const springForward = NY_SEGMENTS[1];
  const from = new Date(Date.UTC(YEAR, springForward.startMonth - 1, springForward.startDay - 2, 0, 0));
  const result = nextRuns("30 2 * * *", "America/New_York", { from, count: 3 });
  assert.equal(summarizeRuns(result).status, "dst-risk");
});

// --- utcOffsetDrift ----------------------------------------------------

test("utcOffsetDrift: America/New_York drifts 60 minutes and needs two UTC times", () => {
  const drift = utcOffsetDrift(9, 0, "America/New_York", YEAR);
  assert.equal(drift.observesDst, true);
  assert.equal(drift.driftMinutes, 60);
  assert.equal(drift.singleUtcCronSuffices, false);
  assert.equal(drift.segments.length, 3);
  // Winter (EST, UTC-5): 09:00 local = 14:00 UTC. Summer (EDT, UTC-4): 09:00 local = 13:00 UTC.
  assert.equal(drift.segments[0].utcHour, 14);
  assert.equal(drift.segments[1].utcHour, 13);
});

test("utcOffsetDrift: a non-DST zone needs exactly one UTC time, zero drift", () => {
  const drift = utcOffsetDrift(9, 0, "Asia/Tokyo", YEAR);
  assert.equal(drift.observesDst, false);
  assert.equal(drift.driftMinutes, 0);
  assert.equal(drift.singleUtcCronSuffices, true);
});

test("utcOffsetDrift: a target time near midnight can shift the UTC calendar day", () => {
  // 00:30 America/New_York in winter (UTC-5) is 05:30 UTC the same day; nothing
  // to assert about day-shift specifically here beyond "it computes", but the
  // wrap must stay within 0-23 for the hour.
  const drift = utcOffsetDrift(0, 30, "America/New_York", YEAR);
  for (const seg of drift.segments) {
    assert.ok(seg.utcHour >= 0 && seg.utcHour <= 23);
  }
});
