import { test } from "node:test";
import assert from "node:assert/strict";
import { compute, parseStays, toDay, fromDay, maxStay, SAMPLE, summaryText } from "./calc.mjs";

const run = (o) => compute({ ...SAMPLE, ...o });

test("dates round-trip and impossible dates are rejected", () => {
  assert.equal(fromDay(toDay("2026-02-28")), "2026-02-28");
  assert.equal(toDay("2026-02-30"), null);
  assert.equal(toDay("not a date"), null);
});

test("entry and exit days both count", () => {
  const r = run({ stays: "2026-06-01 2026-06-01", refDate: "2026-06-01", planEntry: "", planLength: "" });
  assert.equal(r.used, 1);
  const s = run({ stays: "2026-06-01 2026-06-30", refDate: "2026-06-30", planEntry: "", planLength: "" });
  assert.equal(s.used, 30);
});

test("sample: 82 used, 8 left on 1 December 2026", () => {
  const r = run({});
  assert.equal(r.used, 82);
  assert.equal(r.remaining, 8);
  assert.equal(r.freeUp[0].date, toDay("2026-12-02"));
});

test("exactly 90 days is allowed; day 91 is not", () => {
  const days = new Set();
  for (let d = toDay("2026-01-01"); d < toDay("2026-01-01") + 89; d++) days.add(d);
  assert.equal(maxStay(days, toDay("2026-01-01") + 89), 1);
  assert.equal(maxStay(new Set(), toDay("2026-01-01")), 90);
});

test("a fresh traveller can stay 90 days and the last exit is day 90", () => {
  const r = run({ stays: "", refDate: "2026-03-01", planEntry: "2026-03-01", planLength: "90" });
  assert.equal(r.plan.maxDays, 90);
  assert.equal(fromDay(r.plan.lastExit), "2026-05-29");
  assert.equal(r.plan.fits, true);
});

test("a trip that does not fit reports the earliest workable entry", () => {
  const r = run({ stays: "2026-01-01 2026-03-31", refDate: "2026-04-05", planEntry: "2026-04-05", planLength: "30" });
  assert.equal(r.used, 90);
  assert.equal(r.plan.maxDays, 0);
  assert.equal(r.plan.fits, false);
  // Jan 1 leaves the window on day 181: 2026-06-30. A 30-day trip needs 30 days freed.
  assert.ok(r.plan.earliest > toDay("2026-06-29"));
  assert.ok(maxStay(new Set([...Array(90)].map((_, i) => toDay("2026-01-01") + i)), r.plan.earliest, 30) >= 30);
});

test("overlapping stays are not double counted", () => {
  const r = run({ stays: "2026-06-01 2026-06-10\n2026-06-05 2026-06-15", refDate: "2026-06-20", planEntry: "", planLength: "" });
  assert.equal(r.used, 15);
});

test("an existing overstay is flagged", () => {
  const r = run({ stays: "2026-01-01 2026-04-15", refDate: "2026-04-20", planEntry: "", planLength: "" });
  assert.ok(r.overstayDays > 0);
  assert.equal(fromDay(r.firstOverstay), "2026-04-01");
  assert.ok(r.findings.some((f) => f.severity === "high"));
});

test("bad input is reported, not guessed", () => {
  assert.ok(parseStays("2026-06-10 2026-06-01").errors[0].includes("exit is before entry"));
  assert.ok(parseStays("hello").errors.length);
  assert.ok(compute({ stays: "", refDate: "", planEntry: "", planLength: "" }).errors.length);
  assert.ok(run({ planLength: "120" }).errors.length);
});

test("summary names the verification source and carries the disclaimer", () => {
  const t = summaryText(run({}));
  assert.match(t, /home-affairs\.ec\.europa\.eu/);
  assert.match(t, /Not legal or immigration advice/);
});
