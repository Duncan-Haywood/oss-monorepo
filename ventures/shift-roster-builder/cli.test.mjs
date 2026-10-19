import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, run } from "./cli.mjs";
import { sampleStaff, sampleShifts, buildRoster, parseStaff, parseShifts, rosterCsv } from "./calc.mjs";

test("parseArgs reads options, files and modes", () => {
  const o = parseArgs(["--rest", "11", "--balance", "250", "--check", "--csv", "a.txt", "b.txt"]);
  assert.equal(o.options.minRestHours, 11);
  assert.equal(o.options.balance, 100);
  assert.equal(o.mode, "csv");
  assert.equal(o.check, true);
  assert.deepEqual(o.files, ["a.txt", "b.txt"]);
  assert.throws(() => parseArgs(["--rest", "x"]), /needs a number/);
  assert.throws(() => parseArgs(["--nope"]), /Unknown option/);
  assert.throws(() => parseArgs(["--week-start", "monday"]), /date/);
});

test("report matches the library roster on the sample week", () => {
  const r = run(sampleStaff(), sampleShifts(), {});
  const lib = buildRoster(parseStaff(sampleStaff()).staff, parseShifts(sampleShifts()).slots, {});
  assert.equal(r.code, 0);
  assert.match(r.out, new RegExp(`${lib.slots - lib.unfilledSlots} of ${lib.slots} shifts covered`));
  assert.match(r.out, /Shifts left open:/);
  assert.match(r.out, /Planning aid, not legal advice/);
});

test("--csv is exactly the page's roster CSV", () => {
  const r = run(sampleStaff(), sampleShifts(), { mode: "csv" });
  const lib = buildRoster(parseStaff(sampleStaff()).staff, parseShifts(sampleShifts()).slots, {});
  assert.equal(r.out, rosterCsv(lib));
});

test("--check exits 1 only when a shift stays open", () => {
  assert.equal(run(sampleStaff(), sampleShifts(), { check: true }).code, 1);
  const easy = run("name, wage, max hours, min hours, availability\nAna, 15, 40, 0, any", "day, start, end, people needed\nMon, 9, 17, 1", { check: true });
  assert.equal(easy.code, 0);
  assert.match(easy.out, /1 of 1 shifts covered/);
});

test("bad input exits 2 with the parser's message and no roster", () => {
  const r = run("", sampleShifts(), {});
  assert.equal(r.code, 2);
  assert.match(r.out, /at least one person/i);
});

test("--json is parseable and names the open shifts", () => {
  const j = JSON.parse(run(sampleStaff(), sampleShifts(), { mode: "json" }).out);
  assert.equal(j.unfilled.length, j.unfilledShifts);
  assert.ok(j.assignments.length > 0);
});

test("carrying last week's late close forbids an early Monday open", () => {
  const staff = "name, wage, max hours, min hours, availability\nAna, 15, 40, 0, any";
  const shifts = "day, start, end, people needed\nMon, 6, 12, 1";
  assert.equal(run(staff, shifts, {}).code, 0);
  const csv = "day,start,end,hours,label,assigned_to,role\nSun,2pm,11pm,9.00,close,Ana,\n";
  const r = run(staff, shifts, { lastWeekCsv: csv, check: true });
  assert.equal(r.code, 1);
  assert.match(r.out, /rest/);
});

test("the executable runs --example and --help", () => {
  const out = execFileSync(process.execPath, ["cli.mjs", "--example"], { cwd: import.meta.dirname, encoding: "utf8" });
  assert.match(out, /shifts covered/);
  assert.match(execFileSync(process.execPath, ["cli.mjs", "--help"], { cwd: import.meta.dirname, encoding: "utf8" }), /Usage:/);
  const bad = spawnSync(process.execPath, ["cli.mjs"], { cwd: import.meta.dirname, encoding: "utf8" });
  assert.equal(bad.status, 2);
});

test("--ics and --messages export the week for calendars and chat", () => {
  const staff = "name, wage, max hours, min hours, availability\nAna, 15, 40, 0, any";
  const shifts = "day, start, end, people needed\nMon, 9, 13, 1";
  const o = parseArgs(["--ics", "Ana", "s.txt", "h.txt"]);
  assert.equal(o.icsPerson, "Ana");
  assert.deepEqual(o.files, ["s.txt", "h.txt"]);
  assert.equal(parseArgs(["--ics", "s.txt", "h.txt"]).icsPerson, undefined);
  assert.deepEqual(parseArgs(["s.txt", "h.txt", "--ics"]).files, ["s.txt", "h.txt"]);

  const ics = run(staff, shifts, { mode: "ics", weekStart: "2026-10-19" });
  assert.equal(ics.code, 0);
  assert.match(ics.out, /DTSTART:20261019T090000/);
  assert.equal(run(staff, shifts, { mode: "ics" }).code, 2);
  assert.equal(run(staff, shifts, { mode: "ics", weekStart: "2026-10-20" }).code, 2);
  assert.equal(run(staff, shifts, { mode: "ics", weekStart: "2026-10-19", icsPerson: "Zed" }).code, 2);

  const msg = run(staff, shifts, { mode: "messages", weekStart: "2026-10-19" });
  assert.match(msg.out, /Hi Ana, your shifts this week:\nMon 19 Oct: 9am-1pm/);
});
