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

// Header rows copied from two real exports (eval/real-schedule-exports.mjs); every data row below is invented.
const WFM = "﻿Location,LocationID,Initial TM Employee Id,Initial TM First Name,Initial TM Last Name,Initial TM Job Title,Initial Shift Date,Initial Shift Start Time,Initial Shift End Time,Initial Shift Work Role,Final TM Employee Id,Final TM First Name,Final TM Last Name,Final TM Job Title,Final Shift Date,Final Shift Start Time,Final Shift End Time,Final Shift Worker Role,Initial equals Final,Location Type,LocationSubType";
test("first-published and final shifts side by side: Final is read, Initial on request; a Sun-Sat file is one week (2026-11-13)", () => {
  const rows = [
    "Shop,S1,1,Ana,A,Advisor,2026/01/18,11:30,18:00,Selling,1,Ana,A,Advisor,2026/01/18,11:30,18:00,Selling,Yes,Real,Real",
    "Shop,S1,2,Ben,B,Tailor,2026/01/19,10:00,19:00,Tailor,,,,,,,,,No,Real,Real", // removed before the week ended
    "Shop,S1,,,,,,,,,3,Cy,C,Advisor,2026/01/24,12:00,20:00,Selling,No,Real,Real", // added later
  ];
  const r = importShiftsCsv([WFM, ...rows].join("\n"));
  assert.equal(r.rows, 2);
  assert.deepEqual(r.families, ["final", "initial"]);
  assert.match(r.shiftsText, /Sun, 11:30, 18:00, 1, , selling/);
  assert.match(r.shiftsText, /Sat, 12:00, 20:00, 1, , selling/);
  assert.doesNotMatch(r.shiftsText, /tailor/);
  assert.match(r.notes.join(" "), /1 row had no Final shift/);
  assert.doesNotMatch(r.notes.join(" "), /weeks/);
  const i = importShiftsCsv([WFM, ...rows].join("\n"), { use: "initial" });
  assert.equal(i.rows, 2);
  assert.match(i.shiftsText, /Mon, 10:00, 19:00, 1, , tailor/);
  assert.match(importShiftsCsv([WFM, ...rows].join("\n"), { use: "timesheet" }).notes[0], /No timesheet start and end columns/);
});

const DEPUTY_HEAD = "Payroll ID,Display Name,Timesheet Date,Timesheet Start Time,Timesheet End Time,Is Leave,Discarded,First Name,Last Name,Start Date,Position,Schedule Date,Schedule Start Time,Schedule End Time,Schedule Open,Area Name,Location Name";
test("rostered beside worked times: the roster is read, leave and discarded rows dropped, dates day first, locations offered (2026-11-13)", () => {
  const rows = [
    ",A [1],13/05/2026,9:05,17:00,FALSE,FALSE,A,X,4/11/2024,,13/05/2026,9:00,17:00,FALSE,Patrols,North",
    ",B [2],8/05/2026,18:00,6:10,FALSE,,B,Y,1/02/2025,Patrols,8/05/2026,18:00,6:00,FALSE,Patrols,North", // 8 May is a Friday, not 5 Aug
    ",C [3],8/05/2026,9:00,17:00,TRUE,,C,Z,1/02/2025,,,,,,,", // leave
    ",D [4],8/05/2026,9:00,17:00,FALSE,TRUE,D,W,1/02/2025,,8/05/2026,9:00,17:00,FALSE,Patrols,North", // discarded
    ",E [5],9/05/2026,7:00,15:00,FALSE,FALSE,E,V,1/02/2025,,,,,,,", // worked with no rostered shift
    ",F [6],9/05/2026,7:00,15:00,FALSE,FALSE,F,U,1/02/2025,,9/05/2026,7:00,15:00,FALSE,Front desk,South",
  ];
  const text = [DEPUTY_HEAD, ...rows].join("\n");
  const r = importShiftsCsv(text);
  assert.equal(r.rows, 3);
  assert.match(r.shiftsText, /Wed, 9:00, 17:00, 1, , patrols/);
  assert.match(r.shiftsText, /Fri, 18:00, 6:00, 1, , patrols/);
  assert.match(r.shiftsText, /Sat, 7:00, 15:00, 1, , front desk/);
  const notes = r.notes.join(" ");
  for (const re of [/1 leave row left out/, /1 discarded row left out/, /1 row had no Schedule shift/, /day first/, /2 locations/]) assert.match(notes, re);
  assert.deepEqual(r.locations, [{ name: "North", rows: 3 }, { name: "South", rows: 1 }]);
  const south = importShiftsCsv(text, { location: "south" });
  assert.equal(south.rows, 1);
  assert.match(south.notes.join(" "), /Only South/);
  assert.match(importShiftsCsv(text, { location: "Mars" }).notes[0], /No rows at location "Mars"/);
  const worked = importShiftsCsv(text, { use: "timesheet" });
  assert.equal(worked.rows, 4);
  assert.match(worked.shiftsText, /Wed, 9:05, 17:00/);
  assert.deepEqual(parseShifts(r.shiftsText).errors, []);
});

test("the busier of two role columns is read; a plain hire date is not taken for the shift date (2026-11-13)", () => {
  const r = importShiftsCsv("Position,Area Name,Start Date,Schedule Date,Schedule Start Time,Schedule End Time\n,Bar,01/02/2020,2026-11-02,9:00,17:00\nCook,Kitchen,01/02/2020,2026-11-03,9:00,17:00\n");
  assert.match(r.shiftsText, /Mon, 9:00, 17:00, 1, , bar/);
  assert.match(r.shiftsText, /Tue, 9:00, 17:00, 1, , kitchen/);
});

test("dateOrder settles d/m vs m/d from the whole file", async () => {
  const { dateOrder } = await import("./import-shifts.mjs");
  assert.equal(dateOrder(["8/05/2026", "13/05/2026"]), "dmy");
  assert.equal(dateOrder(["05/08/2026", "05/13/2026"]), "mdy");
  assert.equal(dateOrder(["05/08/2026"]), "");
  assert.equal(dateOrder(["13/05/2026", "05/13/2026"]), "");
});
