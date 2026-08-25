import test from "node:test";
import assert from "node:assert/strict";
import { csvReport, normalizeGrant, summarize } from "./calc.mjs";

const rows = [{ name: "Food, Inc.", funder: "A \"quoted\" funder", status: "awarded", award: 1000, spent: 250, nextDate: "2026-09-15", nextType: "Report" }];
test("sorts obligations and calculates remaining funds and urgency", () => {
  const result = summarize([{ ...rows[0], nextDate: "2026-08-30" }, { ...rows[0], name: "Later", nextDate: "2026-10-01" }], new Date("2026-08-25"));
  assert.equal(result[0].days, 5);
  assert.equal(result[0].remaining, 750);
  assert.equal(result[0].urgency, "soon");
  assert.equal(result[1].urgency, "upcoming");
});
test("rejects missing names, invalid dates, and overspend", () => {
  assert.throws(() => normalizeGrant({ nextDate: "2026-09-01" }));
  assert.throws(() => normalizeGrant({ name: "X", nextDate: "nope" }));
  assert.throws(() => normalizeGrant({ name: "X", award: 1, spent: 2, nextDate: "2026-09-01" }));
});
test("escapes private CSV export values", () => {
  const csv = csvReport(summarize(rows, new Date("2026-08-25")));
  assert.match(csv, /"Food, Inc\."/);
  assert.match(csv, /"A ""quoted"" funder"/);
});
