import { test } from "node:test";
import assert from "node:assert/strict";
import { importShiftsCsv } from "./import-shifts.mjs";
import { parseShifts } from "./calc.mjs";

// Invented layouts that mimic common schedule exports; no real export has been tested.
test("counts rows per weekday, time and position; round-trips through parseShifts", () => {
  const r = importShiftsCsv("Date,Start Time,End Time,Position,Employee\n2026-11-02,7:00 AM,3:00 PM,Server,Ana\n2026-11-02,7:00 AM,3:00 PM,Server,Ben\n2026-11-02,3:00 PM,11:00 PM,Cook,Cy\n2026-11-03,7:00,15:00,Server,Ana");
  assert.equal(r.rows, 4);
  assert.equal(r.shifts, 3);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 2, , server/);
  const p = parseShifts(r.shiftsText);
  assert.deepEqual(p.errors, []);
  assert.equal(p.slots.length, 4);
});
test("several weeks use the busiest week; datetime columns and US dates", () => {
  const r = importShiftsCsv("Start,End,Role\n11/02/2026 07:00,11/02/2026 15:00,Bar\n11/02/2026 07:00,11/02/2026 15:00,Bar\n11/09/2026 07:00,11/09/2026 15:00,Bar");
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 2, , bar/);
  assert.match(r.notes.join(" "), /2 weeks/);
});
test("bad rows are skipped, missing columns reported", () => {
  const r = importShiftsCsv("Date,Start,End\nsoon,7:00,15:00\n2026-11-02,x,y\n2026-11-02,9:00,17:00");
  assert.equal(r.rows, 1);
  assert.equal(r.skipped.length, 2);
  assert.match(importShiftsCsv("Date,Role\n2026-11-02,x").notes[0], /No start and end/);
});
