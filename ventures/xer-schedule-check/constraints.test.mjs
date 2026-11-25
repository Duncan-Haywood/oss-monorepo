import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { lookahead, lookaheadText, lookaheadCsv, lookaheadHtml } from "./lookahead.mjs";
import { parseConstraintLog, parseLogDate, constraintLogCsv, pastLabel } from "./constraints.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h/day); 2025-12-01 is a Monday
const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||5()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||6()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||7()())))(0||Exceptions()())))";
function xerText(tables) {
  const lines = ["ERMHDR\t20.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return lines.join("\r\n");
}
const task = (id, code, hours, extra = {}) => ({
  task_id: id, proj_id: "1", wbs_id: "11", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart",
  task_code: code, task_name: `Activity ${code}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const link = (id, succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
const project = (tasks, preds, extra = {}) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", proj_name: "Test job", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  PROJWBS: [{ wbs_id: "10", proj_id: "1", parent_wbs_id: "", proj_node_flag: "Y", wbs_name: "Test job" }, { wbs_id: "11", proj_id: "1", parent_wbs_id: "10", proj_node_flag: "N", wbs_name: "Level 1" }, { wbs_id: "12", proj_id: "1", parent_wbs_id: "11", proj_node_flag: "N", wbs_name: "Drywall" }],
  TASK: tasks,
  TASKPRED: preds,
  ...extra,
}));
const by = (la) => Object.fromEntries(la.activities.map((a) => [a.code, a]));


// DONE finished; A started (16 h left) -> FS B (8 h) -> FS D (8 h) -> FS END (8 h);
// C (24 h) after DONE, free float to END; OPEN (8 h) has no predecessor
const job = () => project([
  task("1", "DONE", 0, { status_code: "TK_Complete", act_start_date: "2025-11-24 08:00", act_end_date: "2025-11-28 17:00" }),
  task("2", "A", 16, { status_code: "TK_Active", act_start_date: "2025-11-26 08:00" }),
  task("3", "B", 8), task("4", "C", 24), task("5", "D", 8), task("6", "END", 8), task("7", "OPEN", 8),
], [link("1", "3", "2"), link("2", "4", "1"), link("3", "5", "3"), link("4", "6", "5"), link("5", "6", "4")]);

test("dates read the way site teams type them", () => {
  const iso = (v) => { const m = parseLogDate(v); return m === null ? null : new Date(m * 60000).toISOString().slice(0, 16); };
  assert.equal(iso("2025-12-03"), "2025-12-03T00:00");
  assert.equal(iso("12/3/2025"), "2025-12-03T00:00");
  assert.equal(iso("25/12/2025"), "2025-12-25T00:00");
  assert.equal(iso("3-Dec-25"), "2025-12-03T00:00");
  assert.equal(iso("3 December 2025"), "2025-12-03T00:00");
  assert.equal(iso("Dec 3, 2025"), "2025-12-03T00:00");
  assert.equal(iso("45994"), "2025-12-03T00:00"); // an Excel day number
  assert.equal(iso("31/02/2025"), null);
  // every month name lands on its own month (red team 2026-11-24: Apr read as May escaped)
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  months.forEach((mon, i) => assert.equal(iso(`3-${mon}-26`), `2026-${String(i + 1).padStart(2, "0")}-03T00:00`, mon));
  assert.equal(iso("Sept 3, 2026"), "2026-09-03T00:00");
  // a three-digit month is a typo, not December: it warns instead of reading
  assert.equal(iso("2025-012-03"), null);
  assert.equal(iso("2025-12-03 08:30"), "2025-12-03T08:30");
  assert.equal(iso("next week"), null);
});

test("one date order for the whole log: a day-first file reads 03/12 as 3 December", () => {
  // red team 2026-11-24: 25/12/2025 read as 25 Dec but 03/12/2025 in the same
  // file as 12 March, so a UK log's December delivery showed as overdue
  const day = (m) => new Date(m * 60000).toISOString().slice(0, 10);
  const uk = parseConstraintLog("Activity,Constraint,Expected,Cleared\nA1,Steel,25/12/2025,\nA2,Glass,03/12/2025,04/11/2025\n");
  assert.deepEqual(uk.items.map((i) => day(i.expected)), ["2025-12-25", "2025-12-03"]);
  assert.equal(day(uk.items[1].clearedOn), "2025-11-04");
  assert.deepEqual(uk.warnings, []);
  const us = parseConstraintLog("Activity,Expected\nA1,12/25/2025\nA2,03/12/2025\n");
  assert.deepEqual(us.items.map((i) => day(i.expected)), ["2025-12-25", "2025-03-12"]);
  const mixed = parseConstraintLog("Activity,Expected\nA1,25/12/2025\nA2,12/26/2025\nA3,03/12/2025\n");
  assert.deepEqual(mixed.items.map((i) => day(i.expected)), ["2025-12-25", "2025-12-26", "2025-03-12"]);
  assert.ok(mixed.warnings.some((w) => /day first .* month first/.test(w)));
  const iso = (v, o) => day(parseLogDate(v, o));
  assert.equal(iso("03/12/2025", "dmy"), "2025-12-03");
  assert.equal(iso("03/12/2025", "mdy"), "2025-03-12");
  assert.equal(iso("12/25/2025", "dmy"), "2025-12-25"); // the only reading it has
});

test("header names, several activities in a row, cleared values", () => {
  const log = parseConstraintLog('Activity ID,Constraint,Type,Ball in court,ETA,Status,Notes\r\n"B; C",Rebar delivery,Material,Supplier,2025-12-02,Open,"call Fri, 9am"\nOPEN,Permit,Permit,City,,closed,\nD,RFI 12,Info,Architect,12/9/2025,maybe,\n,orphan,,,,,\n');
  assert.deepEqual(log.items.map((i) => i.raw), ["B; C", "OPEN", "D"]);
  assert.equal(log.items[0].what, "Rebar delivery");
  assert.equal(log.items[0].owner, "Supplier");
  assert.equal(log.items[0].note, "call Fri, 9am");
  assert.equal(log.items[1].cleared, true);
  assert.equal(log.items[2].cleared, false);
  assert.ok(log.warnings.some((w) => /row 4: cleared "maybe" read as open/.test(w)));
  assert.ok(log.warnings.some((w) => /row 5: no activity/.test(w)));
  // tab-separated, pasted from a spreadsheet
  const tab = parseConstraintLog("Task Code\tDescription\tForecast\nB\tCrane\t2025-12-01\n");
  assert.equal(tab.items[0].what, "Crane");
  assert.notEqual(tab.items[0].expected, null);
});

test("make-ready with the log: constrained, late, overdue, the finish what-if", () => {
  const x = job();
  const base = lookahead(x, { weeks: 2 });
  const b0 = by(base);
  assert.equal(b0.C.ready, "ready");
  assert.equal(b0.OPEN.ready, "no predecessor");
  // data date Mon 2025-12-01 08:00. C starts at the data date, B on Wed 12-03
  const log = [
    "activity,constraint,owner,expected,cleared",
    "C,Drywall delivery,Supplier,2025-12-01,", // on track: clears the day C starts
    "B,Inspection,City,2025-12-08,", // late: B starts 12-03; B is on the critical path
    "OPEN,Lift on site,Rental,2025-11-25,", // overdue
    "C,Shop drawings,Architect,,", // no date
    "D,Old RFI,Architect,2025-12-20,2025-11-30", // cleared before the data date
    "ZZZ,Unknown,,2025-12-02,", // not in the file
    "A,Scaffold tag,Scaffolder,2025-12-20,", // late against started work: no late start to pass
  ].join("\n");
  const la = lookahead(x, { weeks: 2, constraints: log });
  const a = by(la);
  assert.equal(a.C.ready, "constrained"); // ready by logic, two open rows
  assert.equal(a.C.openConstraints.length, 2);
  assert.equal(a.OPEN.ready, "no predecessor"); // logic state stays; the row is listed
  assert.equal(a.OPEN.openConstraints[0].status, "overdue");
  assert.equal(a.B.ready, "waits");
  assert.equal(a.D.openConstraints.length, 0);
  const cl = la.constraintLog;
  const st = Object.fromEntries(cl.items.map((i) => [i.what, i.status]));
  assert.deepEqual(st, { "Drywall delivery": "on track", Inspection: "late", "Lift on site": "overdue", "Shop drawings": "no date", "Old RFI": "cleared", Unknown: "not in file", "Scaffold tag": "late" });
  // "past late start" needs a late start and an open row
  const byWhat = Object.fromEntries(cl.items.map((i) => [i.what, i]));
  assert.equal(byWhat["Old RFI"].links[0].past, false); // cleared
  assert.equal(byWhat["Scaffold tag"].links[0].past, false); // started: no late start
  assert.equal(byWhat["Shop drawings"].links[0].past, false); // no date
  assert.equal(cl.summary.open, 5);
  assert.equal(la.summary.constrained, 1);
  // the inspection on 12-08 holds B from 12-03 to 12-08: three working days on the finish
  assert.equal(cl.finish.base, "2025-12-05 17:00");
  assert.equal(cl.finish.withLog, "2025-12-10 17:00");
  assert.equal(cl.finish.slipDays, 3);
  const insp = cl.items.find((i) => i.what === "Inspection");
  assert.equal(insp.finishSlipDays, 3);
  assert.equal(insp.links[0].past, true);
  assert.equal(insp.links[0].moves, true); // on the critical path: past late start moves the finish
  assert.equal(insp.links[0].slackOnly, false);
  assert.equal(insp.links[0].slackDays, -3);
  assert.equal(cl.items[0].status, "overdue"); // worst first
  assert.equal(a.B.startWithLog, "2025-12-08 08:00");
  assert.ok(la.warnings.some((w) => /ZZZ is not in project/.test(w)));
  // outputs
  const txt = lookaheadText(la);
  assert.match(txt, /logic and constraints log/);
  assert.match(txt, /project finish 2025-12-05 17:00 -> 2025-12-10 17:00 \(3 working days later\)/);
  assert.match(txt, /\[late\] row 3: Inspection \(City\)/);
  const csv = lookaheadCsv(la).split("\n");
  assert.equal(csv[0].split(",").length, 18 + 14);
  const html = lookaheadHtml(la);
  assert.match(html, /Constraints log/);
  assert.match(html, /2025-12-10 17:00/);
  const back = constraintLogCsv(cl).trim().split("\n");
  assert.equal(back.length, 8); // header + seven rows
  assert.match(back[2], /^3,B,Inspection,,City,,2025-12-08,,,late,2025-12-03,2025-12-03,-3,3,Activity B$/);
});

test("a log with nothing late moves nothing; formula text is defused", () => {
  const x = job();
  const la = lookahead(x, { weeks: 2, constraints: "activity,constraint,expected\nC,=HYPERLINK(\"x\"),2025-12-01\n" });
  assert.equal(la.constraintLog.finish.withLog, null);
  assert.ok(constraintLogCsv(la.constraintLog).includes(`"'=HYPERLINK(""x"")"`));
  assert.ok(!lookaheadHtml(la).includes('<td>=HYPERLINK("x")'));
});

test("the example log is the sample file and runs on the example schedule", async () => {
  const { readFileSync } = await import("node:fs");
  const { EXAMPLE_LOG } = await import("./constraints.mjs");
  assert.equal(EXAMPLE_LOG, readFileSync(new URL("./samples/constraints-log.csv", import.meta.url), "utf8"));
  const la = lookahead(parseXer(EXAMPLE_XER), { constraints: EXAMPLE_LOG });
  const cl = la.constraintLog;
  assert.equal(cl.summary.rows, 6);
  assert.equal(cl.summary.cleared, 1);
  assert.equal(cl.items[0].what, "Mechanical crew of 4"); // late, and the only row that moves the finish
  assert.equal(cl.items[0].finishSlipDays, 2);
  assert.equal(cl.finish.slipDays, 2);
  assert.equal(la.warnings.length, 0);
});

test("past late start on negative float: already behind unless it passes the longer path's miss", () => {
  // A (40 h) -> FS END; B (8 h) -> FS END; END must finish on or before Tue
  // 12-02 17:00, but A alone takes it to Fri 12-05 17:00 (-3 d). B's late
  // start is Tue 08:00 (from the deadline) but B can start as late as Fri
  // 12-05 08:00 before END moves.
  const x = project([
    task("1", "A", 40), task("2", "B", 8),
    task("3", "END", 0, { task_type: "TT_FinMile", cstr_type: "CS_MEOB", cstr_date: "2025-12-02 17:00" }),
  ], [link("1", "3", "1"), link("2", "3", "2")]);
  const log = ["activity,constraint,expected", "B,Crane,2025-12-03", "B,Permit,2025-12-08"].join("\n");
  const la = lookahead(x, { weeks: 2, constraints: log });
  const cl = la.constraintLog;
  const crane = cl.items.find((i) => i.what === "Crane"), permit = cl.items.find((i) => i.what === "Permit");
  assert.equal(crane.links[0].past, true);
  assert.equal(crane.links[0].alreadyBehind, true);
  assert.equal(crane.links[0].moves, false);
  assert.equal(crane.pastAlreadyBehind, true);
  assert.equal(crane.links[0].latestRelaxed, "2025-12-05 08:00");
  assert.match(pastLabel(crane.links[0]), /already missed by more/);
  assert.equal(permit.links[0].moves, true);
  assert.equal(cl.summary.pastAlreadyBehind, 1);
});
