import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { parseArgs, run } from "./cli.mjs";
import { sampleStaff, sampleShifts, buildRoster, parseStaff, parseShifts, rosterCsv, rosterIcs, rosterMessages, openShiftPost } from "./calc.mjs";

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

test("--ics and --messages match the library exports", () => {
  const staff = parseStaff(sampleStaff()).staff;
  const lib = buildRoster(staff, parseShifts(sampleShifts()).slots, {});
  const all = run(sampleStaff(), sampleShifts(), { mode: "ics", weekStart: "2026-10-19" });
  assert.equal(all.code, 0);
  assert.match(all.out, /^BEGIN:VCALENDAR/);
  assert.equal(all.out, rosterIcs(lib, "2026-10-19"));
  const who = lib.people[0].name;
  const one = run(sampleStaff(), sampleShifts(), { mode: "ics", weekStart: "2026-10-19", person: who });
  assert.equal(one.out, rosterIcs(lib, "2026-10-19", who));
  assert.equal(run(sampleStaff(), sampleShifts(), { mode: "ics" }).code, 2);
  assert.equal(run(sampleStaff(), sampleShifts(), { mode: "ics", weekStart: "2026-10-20" }).code, 2);
  assert.equal(run(sampleStaff(), sampleShifts(), { mode: "ics", weekStart: "2026-10-19", person: "Nobody" }).code, 2);
  const msg = run(sampleStaff(), sampleShifts(), { mode: "messages", weekStart: "2026-10-19" });
  assert.equal(msg.out, rosterMessages(lib, "2026-10-19").map((m) => m.text).join("\n\n") + "\n");
  const o = parseArgs(["--ics", "--person", "Sam", "a", "b"]);
  assert.equal(o.mode, "ics");
  assert.equal(o.person, "Sam");
});

test("--open-post matches the library's group message for open shifts", () => {
  assert.equal(parseArgs(["--open-post", "a", "b"]).mode, "open-post");
  const st = parseStaff(sampleStaff()).staff;
  const sl = parseShifts(sampleShifts()).slots;
  const lib = buildRoster(st, sl, {});
  const post = openShiftPost(st, sl, lib, "2026-10-19");
  const r = run(sampleStaff(), sampleShifts(), { mode: "open-post", weekStart: "2026-10-19" });
  assert.equal(r.code, 0);
  assert.equal(r.out, post.count ? post.text + "\n" : "");
  const none = run("name, wage, max hours, min hours, availability\nAna, 18, 40, 0, Mon-Sun 0-24", "Mon, 9am, 5pm, 1, desk", { mode: "open-post" });
  assert.equal(none.out, "");
});

test("--prove adds an exact-search line to the report and optimality to --json", async () => {
  const { run, parseArgs } = await import("./cli.mjs");
  const o = parseArgs(["--prove"]);
  assert.equal(o.options.exact, true);
  const staff = "A,12,40,0,any\nB,14,40,0,any", shifts = "Mon,8,16,1\nTue,8,16,1";
  const text = run(staff, shifts, { ...o, mode: "report" });
  assert.match(text.out, /exact search/);
  const json = JSON.parse(run(staff, shifts, { ...o, mode: "json" }).out);
  assert.ok(["optimal", "improved"].includes(json.optimality.status));
});

import { runPlan } from "./cli.mjs";
import { planWeeks } from "./calc.mjs";

test("--weeks needs a whole number 1-8 and a Monday --week-start", () => {
  assert.equal(parseArgs(["--weeks", "4"]).weeks, 4);
  assert.throws(() => parseArgs(["--weeks", "9"]), /1 to 8/);
  assert.throws(() => parseArgs(["--weeks", "2.5"]), /1 to 8/);
  assert.equal(parseArgs(["--tough-balance", "60"]).options.toughBalance, 60);
  assert.match(runPlan(sampleStaff(), sampleShifts(), { weeks: 2 }).out, /needs --week-start/);
  assert.match(runPlan(sampleStaff(), sampleShifts(), { weeks: 2, weekStart: "2026-11-03" }).out, /must be a Monday/);
});

test("--weeks matches planWeeks: totals, per-week CSV rows and fairness", () => {
  const opts = { weeks: 3, weekStart: "2026-11-02", mode: "report", options: { exact: false } };
  const plan = planWeeks(sampleStaff(), sampleShifts(), { weeks: 3, weekStart: "2026-11-02", exact: false });
  const rep = runPlan(sampleStaff(), sampleShifts(), opts);
  assert.equal(rep.code, 0);
  assert.match(rep.out, /=== Week 3, starting 2026-11-16 ===/);
  assert.match(rep.out, /Tough shifts \(weekend, closing, opening\) per person/);
  assert.equal(runPlan(sampleStaff(), sampleShifts(), { ...opts, check: true }).code, plan.totalOpenHours > 0 ? 1 : 0);
  const json = JSON.parse(runPlan(sampleStaff(), sampleShifts(), { ...opts, mode: "json" }).out);
  assert.equal(json.weeks.length, 3);
  assert.equal(json.totalPayroll, plan.totalCost);
  const csv = runPlan(sampleStaff(), sampleShifts(), { ...opts, mode: "csv" }).out.trim().split("\n");
  assert.match(csv[0], /^week,day,/);
  const rows = plan.weeks.reduce((t, w) => t + w.csv.trim().split("\n").length - 1, 0);
  assert.equal(csv.length - 1, rows);
  assert.ok(csv.slice(1).every((l) => /^2026-11-(02|09|16),/.test(l)));
});

test("--weeks carries --last-week into the first week", () => {
  const staff = "name, wage, max hours, min hours, availability\nAna, 15, 40, 0, any";
  const shifts = "day, start, end, people needed\nMon, 6, 14, 1";
  const last = "day,start,end,hours,label,assigned_to,role\nSun,2pm,11pm,9.00,,Ana,\n";
  const base = { weeks: 2, weekStart: "2026-11-02", mode: "report", options: { exact: false } };
  assert.match(runPlan(staff, shifts, base).out, /2 weeks: payroll/);
  assert.match(runPlan(staff, shifts, { ...base, lastWeekCsv: last }).out, /Week 1[\s\S]*Shifts left open/);
});

test("an empty staff file is a usage error (exit 2) with the message, in one week and in a plan", () => {
  const r = run("", sampleShifts(), {});
  assert.equal(r.code, 2);
  assert.equal(r.out, "Add at least one person.\n");
  const p = runPlan("", sampleShifts(), { weeks: 2, weekStart: "2026-10-19" });
  assert.equal(p.code, 2);
  assert.equal(p.out, "Add at least one person.\n");
});

test("--open-shift-hours turns on the repair: 100 leaves fewer shifts open than 0 on the sample week", () => {
  const o0 = parseArgs(["--open-shift-hours", "0"]), o100 = parseArgs(["--open-shift-hours", "100", "--json"]);
  assert.equal(o0.options.openShiftWeight, 0);
  assert.equal(parseArgs(["--open-shift-hours", "5000"]).options.openShiftWeight, 1000);
  assert.throws(() => parseArgs(["--open-shift-hours", "x"]), /needs a number/);
  const open = (opts) => JSON.parse(run(sampleStaff(), sampleShifts(), { ...opts, mode: "json" }).out).unfilled.length;
  assert.equal(open(o100), 3);
  assert.equal(open(o0), 5);
});

test("--changes prices what moved since the posted roster, on the operator's numbers", () => {
  const posted = rosterCsv(buildRoster(parseStaff(sampleStaff()).staff, parseShifts(sampleShifts()).slots, {}));
  const lines = posted.trim().split("\n");
  const row = lines.findIndex((l, i) => i > 0 && !/UNFILLED/.test(l));
  const [day, , , , , who] = lines[row].split(",");
  const cut = lines.filter((_, i) => i !== row).join("\n") + "\n";
  const r = run(sampleStaff(), sampleShifts(), { postedCsv: cut, weekStart: "2026-11-02", changedAt: "2026-11-01 12:00", noticeHours: 336, premiumHours: 1 });
  assert.equal(r.code, 0);
  assert.match(r.out, /1 change\(s\), 1 on short notice/);
  assert.match(r.out, new RegExp(`${who}\\s+${day} added`));
  assert.match(r.out, /premium \$\d/);
  const ex = run(sampleStaff(), sampleShifts(), { postedCsv: cut, weekStart: "2026-11-02", changedAt: "2026-11-01 12:00", exempt: who });
  assert.match(ex.out, /requested, no premium/);
  assert.match(run(sampleStaff(), sampleShifts(), { postedCsv: cut }).out, /Give --week-start and --changed-at/);
  assert.equal(parseArgs(["--changes", "p.csv", "--changed-at", "2026-11-01 12:00", "--notice-hours", "24"]).noticeHours, 24);
  assert.throws(() => parseArgs(["--changed-at", "tuesday"]), /date and time/);
});

test("--cover lists direct takers, else a hand-over chain, and says when the shift is not found", () => {
  const staff = "Ana, 10, 40, 0, Mon 8-16\nBen, 12, 40, 0, Mon 8-16\nCy, 11, 4, 0, Mon 8-16\n";
  const shifts = "Mon, 8, 16, 1, long\nMon, 8, 12, 1, short\n";
  assert.deepEqual(parseArgs(["--cover", "Mon 08:00", "--max-moves", "2", "a", "b"]).maxMoves, 2);
  assert.throws(() => parseArgs(["--max-moves", "9"]), /1 to 5/);
  const chain = run(staff, shifts, { cover: "Mon 08:00-16:00" });
  assert.equal(chain.code, 0);
  assert.match(chain.out, /Nobody can take it without giving something up/);
  assert.match(chain.out, /2 shifts move/);
  assert.match(chain.out, /Ben takes Mon 8am-4pm from Ana; then Cy takes Mon 8am-12pm from Ben/);
  assert.match(run(staff, shifts, { cover: "Mon 08:00-16:00", maxMoves: 1 }).out, /No chain of up to 1 hand-overs/);
  assert.match(run(staff, shifts, { cover: "Mon 08:00" }).out, /2 shifts start Mon 8am; add the end/);
  assert.match(run(staff, shifts, { cover: "Tue 09:00" }).out, /No shift starts Tue/);
  assert.match(run(staff, shifts, { cover: "later" }).out, /needs a shift like/);
  const direct = run("Ana, 10, 40, 0, Mon 8-16\nBen, 20, 40, 0, Mon 8-16\nCy, 15, 40, 0, Mon 8-16\n", "Mon, 8, 16, 1, open\n", { cover: "Mon 8:00" });
  assert.match(direct.out, /Can take it outright/);
});
