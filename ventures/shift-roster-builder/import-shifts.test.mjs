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

test("long dates and a weekday prefix are read (2026-11-04)", () => {
  for (const d of ['"Nov 2, 2026"', "2 Nov 2026", "Mon 11/2/2026", '"Mon, 11/2/2026"', "November 2nd 2026"]) {
    const r = importShiftsCsv(`Date,Start,End,Position\n${d},7:00 AM,3:00 PM,Cook\n`);
    assert.equal(r.rows, 1, d);
    assert.match(r.shiftsText, /Mon, 7:00, 15:00, 1, , cook/, d);
  }
  assert.equal(importShiftsCsv("Date,Start,End\nFeb 30 2026,7:00,15:00\n").rows, 0);
});

test("one shift-range column is split into start and end (2026-11-04)", () => {
  for (const r of ["7:00 AM - 3:00 PM", "7:00 AM to 3:00 PM", "7:00 AM – 3:00 PM", "07:00-15:00"]) {
    const out = importShiftsCsv(`Date,Shift,Position\n2026-11-02,${r},Cook\n`);
    assert.equal(out.rows, 1, r);
    assert.match(out.shiftsText, /Mon, 7:00, 15:00/, r);
  }
  const bad = importShiftsCsv("Date,Shift\n2026-11-02,8.0\n");
  assert.equal(bad.rows, 0);
  assert.match(bad.skipped[0], /could not split/);
});

test("in/out and time in/time out headers are read as start and end", () => {
  const r = importShiftsCsv("Date,In,Out,Position Name\n2026-11-02,7:00 AM,3:00 PM,Cook\n");
  assert.equal(r.rows, 1);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 1, , cook/);
  const q = importShiftsCsv("Date,Time In,Time Out,Role Name\n2026-11-02,7:00,15:00,Bar\n");
  assert.equal(q.rows, 1);
});

test("start datetime / ends at style headers are read (2026-11-05)", () => {
  const r = importShiftsCsv("Start DateTime,End DateTime,Role\n2026-11-02 07:00,2026-11-02 15:00,Cook\n");
  assert.equal(r.rows, 1);
  assert.match(r.shiftsText, /Mon, 7:00, 15:00, 1, , cook/);
  const q = importShiftsCsv("Shift Day,Starts At,Ends At,Position\nTuesday,9:00 AM,5:00 PM,Bar\n");
  assert.equal(q.rows, 1);
  assert.match(q.shiftsText, /Tue, 9:00, 17:00, 1, , bar/);
});
