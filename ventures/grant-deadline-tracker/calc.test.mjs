import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_GRANTS,
  addMonths,
  compareLateReport,
  csvReport,
  icsCalendar,
  lateReportNote,
  loadGrants,
  nextDueFromInterval,
  normalizeGrant,
  removeGrant,
  summarize,
} from "./calc.mjs";

const FOOD_RISK = {
  award: 24000,
  spent: 8500,
  nextInstallment: 6000,
  renewalAtRisk: 0,
  clawbackPercent: 0,
  edHours: 14,
  edRate: 42,
  writerHours: 8,
  writerRate: 85,
  nextDate: "2026-09-15",
};

const food = {
  name: "Food, Inc.",
  funder: 'A "quoted" funder',
  status: "awarded",
  award: 1000,
  spent: 250,
  nextDate: "2026-09-15",
  nextType: "Report",
};

test("sorts obligations and calculates remaining funds and urgency", () => {
  const result = summarize(
    [
      { ...food, nextDate: "2026-08-30" },
      { ...food, name: "Later", nextDate: "2026-10-01" },
    ],
    "2026-08-25",
  );
  assert.equal(result[0].days, 5);
  assert.equal(result[0].remaining, 750);
  assert.equal(result[0].urgency, "soon");
  assert.equal(result[1].urgency, "upcoming");
});

test("labels an overdue report from a calendar date", () => {
  const result = summarize([{ ...food, nextDate: "2026-08-01" }], "2026-08-25");
  assert.equal(result[0].days, -24);
  assert.equal(result[0].urgency, "overdue");
});

test("rejects missing names, invalid dates, and overspend", () => {
  assert.throws(() => normalizeGrant({ nextDate: "2026-09-01" }));
  assert.throws(() => normalizeGrant({ name: "X", nextDate: "nope" }));
  assert.throws(() => normalizeGrant({ name: "X", award: 1, spent: 2, nextDate: "2026-09-01" }));
});

test("fills nextDate from award date and interval when the user omitted it", () => {
  const grant = normalizeGrant({
    name: "Garden",
    awardDate: "2026-03-15",
    intervalMonths: 6,
    award: 100,
    spent: 0,
  }, "2026-08-26");
  assert.equal(grant.nextDate, "2026-09-15");
});

test("adds months without overflowing short months", () => {
  assert.equal(addMonths("2026-01-31", 1), "2026-02-28");
});

test("addMonths refuses a fractional interval instead of silently flooring it", () => {
  // Before this fix, addMonths(..., 1.5) floored to 1 whole month and
  // returned a real-looking date -- a "6.5 month" reporting interval landed
  // exactly where a 6-month one would, one interval early, with no signal
  // that anything was wrong.
  assert.equal(addMonths("2026-01-15", 1.5), null);
  assert.equal(addMonths("2026-01-15", 0.5), null);
});

test("normalizeGrant rejects a fractional reporting interval instead of silently truncating it", () => {
  // 1.5 used to reach addMonths, which floored it to 1 -- the grant saved
  // with a due date one full "half interval" earlier than what was typed,
  // and no error at all despite the validator's own message promising a
  // whole-number check.
  assert.throws(
    () => normalizeGrant({ name: "Garden", awardDate: "2026-03-15", intervalMonths: 1.5 }, "2026-08-26"),
    /Reporting interval for Garden must be a whole number of months\./,
  );
  // 0.5 used to fail too, but as a confusing "Invalid date" error instead of
  // naming the interval as the actual problem.
  assert.throws(
    () => normalizeGrant({ name: "Garden", awardDate: "2026-03-15", intervalMonths: 0.5 }, "2026-08-26"),
    /Reporting interval for Garden must be a whole number of months\./,
  );
});

test("normalizeGrant still fills nextDate from a whole-number interval", () => {
  const grant = normalizeGrant({
    name: "Garden",
    awardDate: "2026-03-15",
    intervalMonths: 6,
  }, "2026-08-26");
  assert.equal(grant.nextDate, "2026-09-15");
});

test("nextDueFromInterval returns the current overdue period, not the first interval", () => {
  assert.equal(nextDueFromInterval("2025-01-01", 6, "2026-08-26"), "2026-07-01");
  assert.equal(nextDueFromInterval("2026-01-01", 12, "2026-08-26"), "2027-01-01");
  assert.equal(nextDueFromInterval("2026-03-01", 6, "2026-08-26"), "2026-09-01");
});

test("nextDueFromInterval reports the report due today, not a full interval overdue, when today lands exactly on the boundary", () => {
  // Award 2025-01-01, every 6 months: boundaries fall on 2025-07-01,
  // 2026-01-01, 2026-07-01, 2027-01-01 (three periods elapsed by the last).
  // The day before, and the day after, both already read correctly (one
  // interval apart, as expected for a still-open and a freshly-overdue
  // report). Only the exact boundary day was wrong: it fell back all the
  // way to the *previous* boundary, six months too early, instead of the
  // one landing on today.
  assert.equal(nextDueFromInterval("2025-01-01", 6, "2026-12-31"), "2026-07-01");
  assert.equal(nextDueFromInterval("2025-01-01", 6, "2027-01-01"), "2027-01-01");
  assert.equal(nextDueFromInterval("2025-01-01", 6, "2027-01-02"), "2027-01-01");
});

test("escapes private CSV export values", () => {
  const csv = csvReport(summarize([food], "2026-08-25"));
  assert.match(csv, /"Food, Inc\."/);
  assert.match(csv, /"A ""quoted"" funder"/);
  assert.match(csv, /"750"/);
});

test("loads only saved grant rows and recovers from damaged local storage", () => {
  assert.deepEqual(loadGrants(JSON.stringify([{ name: "Garden" }, null, "not a grant"])), [{ name: "Garden" }]);
  assert.deepEqual(loadGrants("{damaged"), []);
  assert.deepEqual(loadGrants(JSON.stringify({ name: "not a list" })), []);
});

test("removeGrant drops one row and leaves others untouched", () => {
  const kept = removeGrant(SAMPLE_GRANTS, 0);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].name, "Youth arts application");
  assert.equal(removeGrant(SAMPLE_GRANTS, 9).length, 2);
});

test("compareLateReport prices missing vs writing vs hiring on the default food grant", () => {
  const comparison = compareLateReport(FOOD_RISK, "2026-08-26");
  assert.equal(comparison.remaining, 15500);
  assert.equal(comparison.remainingAtRisk, 21500);
  assert.equal(comparison.edCost, 588);
  assert.equal(comparison.writerCost, 680);
  assert.equal(comparison.writerPremium, 92);
  assert.equal(comparison.miss.net, -21500);
  assert.equal(comparison.yourself.net, 20912);
  assert.equal(comparison.writer.net, 20820);
  assert.equal(comparison.days, 20);
  assert.equal(comparison.urgency, "soon");
  assert.equal(comparison.writerStillPays, true);
  assert.equal(comparison.edStillPays, true);
  assert.equal(comparison.cheaperFiler, "yourself");
  assert.equal(comparison.writerWorseThanMissing, false);
});

test("compareLateReport rejects a writer who costs more than the leftover crumbs", () => {
  const comparison = compareLateReport({
    award: 5000,
    spent: 4700,
    nextInstallment: 0,
    edHours: 3,
    edRate: 42,
    writerHours: 10,
    writerRate: 125,
    nextDate: "2026-09-15",
  }, "2026-08-26");
  assert.equal(comparison.remainingAtRisk, 300);
  assert.equal(comparison.writerCost, 1250);
  assert.equal(comparison.edCost, 126);
  assert.equal(comparison.writerStillPays, false);
  assert.equal(comparison.edStillPays, true);
  assert.equal(comparison.writer.net, -950);
  assert.equal(comparison.writerWorseThanMissing, true);
});

test("compareLateReport counts an overdue report and a clawback of spent funds", () => {
  const comparison = compareLateReport({
    award: 10000,
    spent: 4000,
    nextInstallment: 2000,
    clawbackPercent: 25,
    edHours: 6,
    edRate: 40,
    writerHours: 5,
    writerRate: 80,
    nextDate: "2026-08-01",
  }, "2026-08-26");
  assert.equal(comparison.remaining, 6000);
  assert.equal(comparison.clawback, 1000);
  assert.equal(comparison.remainingAtRisk, 9000);
  assert.equal(comparison.days, -25);
  assert.equal(comparison.urgency, "overdue");
  assert.equal(comparison.writerCost, 400);
  assert.equal(comparison.writerStillPays, true);
});

test("compareLateReport treats a renewal as cash the late report can still block", () => {
  const comparison = compareLateReport({
    award: 4000,
    spent: 3200,
    renewalAtRisk: 18000,
    edHours: 16,
    edRate: 55,
    writerHours: 6,
    writerRate: 90,
    nextDate: "2026-10-15",
  }, "2026-08-26");
  assert.equal(comparison.remaining, 800);
  assert.equal(comparison.remainingAtRisk, 18800);
  assert.equal(comparison.urgency, "upcoming");
  assert.equal(comparison.writerCost, 540);
  assert.equal(comparison.writerStillPays, true);
  assert.equal(comparison.cheaperFiler, "writer");
});

test("compareLateReport rejects overspend, negative rates, and clawback above 100", () => {
  assert.throws(() => compareLateReport({ award: 10, spent: 11 }), /Spent cannot exceed/);
  assert.throws(() => compareLateReport({ edRate: -1 }), /at least 0/);
  assert.throws(() => compareLateReport({ clawbackPercent: 101 }), /at most 100/);
});

test("lateReportNote names the default food-grant arithmetic a board can paste", () => {
  const note = lateReportNote(compareLateReport(FOOD_RISK, "2026-08-26"));
  assert.match(note, /20 days away/);
  assert.match(note, /\$15,500\.00/);
  assert.match(note, /\$6,000\.00/);
  assert.match(note, /\$21,500\.00/);
  assert.match(note, /\$588\.00/);
  assert.match(note, /\$680\.00/);
  assert.match(note, /\$20,820\.00/);
  assert.match(note, /\$20,912\.00/);
});

test("icsCalendar produces a well-formed RFC 5545 calendar with one all-day VEVENT per row", () => {
  const rows = summarize([food], "2026-08-25");
  const ics = icsCalendar(rows, new Date("2026-08-25T12:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /\r\nEND:VCALENDAR\r\n$/);
  assert.match(ics, /VERSION:2\.0\r\n/);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal((ics.match(/END:VEVENT/g) || []).length, 1);
  // All-day: DTSTART is the due date itself, DTEND is the day after (the
  // ICS all-day convention -- an all-day event's end date is exclusive).
  assert.match(ics, /DTSTART;VALUE=DATE:20260915\r\n/);
  assert.match(ics, /DTEND;VALUE=DATE:20260916\r\n/);
  assert.match(ics, /SUMMARY:Food\\, Inc\. — Report due\r\n/);
});

test("icsCalendar sets a reminder alarm three days ahead of each obligation", () => {
  const rows = summarize([food], "2026-08-25");
  const ics = icsCalendar(rows, new Date("2026-08-25T12:00:00Z"));
  assert.match(ics, /BEGIN:VALARM\r\nACTION:DISPLAY\r\n/);
  assert.match(ics, /TRIGGER:-P3D\r\n/);
  assert.match(ics, /END:VALARM\r\n/);
});

test("icsCalendar escapes commas, semicolons, and backslashes in free text so a calendar app parses the file correctly", () => {
  // Reuses the same "Food, Inc." name and quoted funder that the CSV escape
  // test above locks, so both export formats are held to the same input.
  const rows = summarize([{ ...food, name: 'Ross; Building\\Co, LLC' }], "2026-08-25");
  const ics = icsCalendar(rows, new Date("2026-08-25T12:00:00Z"));
  assert.match(ics, /SUMMARY:Ross\\; Building\\\\Co\\, LLC — Report due\r\n/);
  // The raw delimiter characters must never appear unescaped in the property value.
  const summaryLine = ics.split("\r\n").find((line) => line.startsWith("SUMMARY:"));
  assert.doesNotMatch(summaryLine, /[^\\];/);
  assert.doesNotMatch(summaryLine, /[^\\],/);
});

test("icsCalendar folds a content line longer than 75 octets on a UTF-8 character boundary", () => {
  const longName = "É".repeat(40) + " Community Development Fund and Neighborhood Partnership";
  const rows = summarize([{ ...food, name: longName }], "2026-08-25");
  const ics = icsCalendar(rows, new Date("2026-08-25T12:00:00Z"));
  const summaryBlock = ics.split("BEGIN:VEVENT")[1].split("DESCRIPTION")[0];
  // A folded property is spread across a CRLF + single-space continuation.
  assert.match(summaryBlock, /SUMMARY:[\s\S]*\r\n [\s\S]*due\r\n/);
  // Every physical line (before the trailing property terminator) must stay
  // within the 75-octet limit, and no multi-byte character is split.
  for (const line of ics.split("\r\n")) {
    if (!line) continue;
    assert.ok(new TextEncoder().encode(line).length <= 75, `line exceeds 75 octets: ${line}`);
    assert.doesNotMatch(line, /�/, "a folded line split a multi-byte character");
  }
});

test("icsCalendar gives each grant a stable UID that is unchanged across exports and unique per row", () => {
  const rows = summarize([food, { ...food, name: "Second Grant" }], "2026-08-25");
  const first = icsCalendar(rows, new Date("2026-08-25T12:00:00Z"));
  const second = icsCalendar(rows, new Date("2026-09-01T09:00:00Z"));
  const uidsOf = (ics) => [...ics.matchAll(/UID:([^\r\n]+(?:\r\n [^\r\n]+)*)/g)].map((m) => m[1].replace(/\r\n /g, ""));
  const uidsFirst = uidsOf(first);
  const uidsSecond = uidsOf(second);
  assert.equal(uidsFirst.length, 2);
  assert.deepEqual(uidsFirst, uidsSecond); // stable across a different DTSTAMP/export time
  assert.notEqual(uidsFirst[0], uidsFirst[1]); // unique within one export
});

test("icsCalendar returns a structurally valid empty calendar when there is nothing to export", () => {
  const ics = icsCalendar([], new Date("2026-08-25T12:00:00Z"));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n[\s\S]*END:VCALENDAR\r\n$/);
  assert.equal(ics.includes("BEGIN:VEVENT"), false);
});

test("summarize keeps the original row index after sorting by due date", () => {
  const result = summarize(
    [
      { ...food, name: "Later", nextDate: "2026-10-01" },
      { ...food, name: "Sooner", nextDate: "2026-08-30" },
    ],
    "2026-08-25",
  );
  assert.equal(result[0].name, "Sooner");
  assert.equal(result[0].sourceIndex, 1);
  assert.equal(result[1].sourceIndex, 0);
});
