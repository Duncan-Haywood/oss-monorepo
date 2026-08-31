import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_GRANTS,
  addMonths,
  compareLateReport,
  csvReport,
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
