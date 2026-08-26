import test from "node:test";
import assert from "node:assert/strict";
import {
  SAMPLE_GRANTS,
  addMonths,
  csvReport,
  loadGrants,
  nextDueFromInterval,
  normalizeGrant,
  removeGrant,
  summarize,
} from "./calc.mjs";

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
