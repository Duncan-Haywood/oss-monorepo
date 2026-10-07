import { test } from "node:test";
import assert from "node:assert/strict";
import * as c from "./calc.mjs";

const csv = (rows) => "property,check-in,check-out\n" + rows.join("\n");
const props = (t = "") => c.parseProperties(t, ["A", "B"]);

test("dates parse and reject impossible days", () => {
  assert.equal(c.dayLabel(c.dayIndex("20261012")), "2026-10-12");
  assert.equal(c.dayIndex("2026-02-30"), null);
  assert.equal(c.dayLabel(c.dayIndex("2026-10-12") + 1), "2026-10-13");
});

test("clock parsing accepts 24h and am/pm", () => {
  assert.equal(c.parseClock("11:00", 0), 11);
  assert.equal(c.parseClock("4pm", 0), 16);
  assert.equal(c.parseClock("12am", 9), 0);
  assert.equal(c.parseClock("junk", 9), 9);
});

test("iCal feed: stays kept, blocked days ignored, property named from the calendar", () => {
  const r = c.parseBookings(c.sampleBookings());
  assert.equal(r.skippedBlocks, 1);
  assert.equal(r.duplicates, 1);
  assert.deepEqual([...new Set(r.bookings.map((b) => b.property))].sort(), ["Harbor Loft", "Main St Studio", "Pine Cabin"]);
});

test("the same stay in two feeds counts once; a true overlap is a double booking", () => {
  const r = c.parseBookings(csv(["A,2026-10-01,2026-10-04", "A,2026-10-01,2026-10-04", "A,2026-10-03,2026-10-06"]));
  assert.equal(r.duplicates, 1);
  assert.equal(r.conflicts.length, 1);
  assert.equal(r.bookings.length, 2);
});

test("CSV rows with bad dates are reported, not guessed", () => {
  const r = c.parseBookings(csv(["A,2026-10-01,2026-10-04", "A,nope,2026-10-06", "B,2026-10-05,2026-10-05"]));
  assert.equal(r.bookings.length, 1);
  assert.equal(r.errors.length, 2);
});

test("a same-day turnover is a job with a window from checkout to check-in", () => {
  const { bookings } = c.parseBookings(csv(["A,2026-10-01,2026-10-04", "A,2026-10-04,2026-10-06"]));
  const jobs = c.buildJobs(bookings, props("A,2,100,11:00,16:00"));
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].sameDay, true);
  assert.equal(jobs[0].windowMin, 300);
  assert.equal(jobs[1].deadline, null);
});

test("one cleaner cannot do two same-day cleans that need the same hours; two can", () => {
  const { bookings } = c.parseBookings(csv(["A,2026-10-01,2026-10-04", "A,2026-10-04,2026-10-05", "B,2026-10-02,2026-10-04", "B,2026-10-04,2026-10-05"]));
  const p = c.parseProperties("A,4,100,11:00,15:00\nB,4,100,11:00,15:00", ["A", "B"]);
  const jobs = c.buildJobs(bookings, p);
  assert.ok(c.schedule(jobs, { cleaners: 1 }).late >= 1);
  assert.equal(c.schedule(jobs, { cleaners: 2 }).late, 0);
  const sweep = c.crewSweep(jobs, {});
  assert.equal(sweep.minCrew, 2);
});

test("travel time between properties delays the second job", () => {
  const { bookings } = c.parseBookings(csv(["A,2026-10-01,2026-10-04", "B,2026-10-01,2026-10-04"]));
  const jobs = c.buildJobs(bookings, c.parseProperties("A,2,0,11:00,16:00\nB,2,0,11:00,16:00", ["A", "B"]));
  const r = c.schedule(jobs, { cleaners: 1, travelMin: 30 });
  const [a, b] = r.jobs.filter((j) => j.cleaner).sort((x, y) => x.start - y.start);
  assert.equal(b.start - a.end, 30);
});

test("a window shorter than the clean is flagged and no crew size fixes it", () => {
  const out = c.analyze(csv(["A,2026-10-01,2026-10-04", "A,2026-10-04,2026-10-05"]), "A,6,100,11:00,15:00", { maxCrew: 4 });
  assert.equal(out.sweep.minCrew, null);
  assert.equal(out.sweep.impossible, 1);
  assert.ok(out.warnings.some((w) => /No crew size fixes this/.test(w.text)));
});

test("jobs with slack are not forced past the end of the shift", () => {
  const rows = []; for (let i = 0; i < 6; i++) rows.push(`P${i},2026-10-01,2026-10-04`);
  const out = c.analyze(csv(rows), "", { cleaners: 1, cleanHours: 3, shiftEnd: 17 });
  assert.equal(out.summary.late, 0);
  assert.equal(out.summary.overtime, 0);
  assert.ok(out.jobs.every((j) => j.end % 1440 <= 17 * 60 || j.end > 1440));
  const days = new Set(out.jobs.map((j) => Math.floor(j.start / 1440)));
  assert.ok(days.size >= 2);
});

test("economics: fee minus labour per clean", () => {
  const out = c.analyze(csv(["A,2026-10-01,2026-10-04"]), "A,2,100,11:00,16:00", { hourlyRate: 20 });
  assert.equal(out.economics[0].perClean, 60);
  assert.equal(out.economics[0].margin, 60);
});

test("empty input explains what to paste", () => {
  assert.match(c.analyze("", "").errors[0], /No bookings found/);
});

test("exports: CSV, cleaner messages and a valid calendar file", () => {
  const out = c.analyze(c.sampleBookings(), c.DEFAULT_PROPS, { cleaners: 2 });
  assert.match(c.scheduleCsv(out), /^job,property,checkout date,cleaner/);
  assert.match(c.cleanerText(out), /Cleaner 1/);
  const ics = c.icsExport(out);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, out.jobs.filter((j) => j.cleaner).length);
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
});

test("sample shows a double booking, lateness at two cleaners, and needs three", () => {
  const out = c.analyze(c.sampleBookings(), c.DEFAULT_PROPS, { cleaners: 2 });
  assert.ok(out.warnings.some((w) => /Double booking at Pine Cabin/.test(w.text)));
  assert.equal(out.summary.minCrew, 3);
  assert.ok(out.summary.late > 0);
});
