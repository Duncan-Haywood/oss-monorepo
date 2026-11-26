import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { progressReview, progressText, progressCsv, progressTableHtml, claimedPercent } from "./progress.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h/day), no holidays.
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
// data date Monday 2025-12-15 08:00; 2025-12-01 is a Monday, so an activity
// started 2025-12-01 08:00 has spent exactly 10 working days
const DD = "2025-12-15 08:00";
const task = (id, extra = {}) => ({ task_id: id, proj_id: "1", wbs_id: "11", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: id, task_name: `Activity ${id}`, complete_pct_type: "CP_Phys", phys_complete_pct: 0, remain_drtn_hr_cnt: 80, target_drtn_hr_cnt: 80, ...extra });
const active = (id, pct, remainD, origD, extra = {}) => task(id, { status_code: "TK_Active", act_start_date: "2025-12-01 08:00", phys_complete_pct: pct, remain_drtn_hr_cnt: remainD * 8, target_drtn_hr_cnt: origD * 8, ...extra });
function review(tasks, opts) {
  return progressReview(parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: DD, plan_start_date: "2025-12-01 08:00" }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    PROJWBS: [{ wbs_id: "10", proj_id: "1", proj_node_flag: "Y", wbs_short_name: "TEST" }, { wbs_id: "11", proj_id: "1", proj_node_flag: "N", parent_wbs_id: "10", wbs_short_name: "WORK" }],
    TASK: tasks, TASKPRED: [],
  })), { opts });
}
const kinds = (r, code) => r.items.filter((x) => x.code === code).map((x) => x.kind).sort();

test("a consistent activity is not flagged: 50% after 10 d with 10 d left of 20", () => {
  const r = review([active("A", 50, 10, 20)]);
  assert.equal(r.items.length, 0);
  assert.equal(r.active, 1);
});

test("overclaimed: 80% physical after 10 d with 30 d left (25% through its time)", () => {
  const r = review([active("A", 80, 30, 40)]);
  assert.deepEqual(kinds(r, "A"), ["overclaimed"]);
  const x = r.items[0];
  assert.equal(x.spent, 10); assert.equal(x.left, 30); assert.equal(x.time, 25);
  assert.match(x.why, /2\.5 d would be left/);
});

test("optimistic: 20% in 10 d needs 40 d more, schedule says 5 d", () => {
  const r = review([active("A", 20, 5, 15)]);
  assert.deepEqual(kinds(r, "A"), ["optimistic"]);
  assert.equal(r.items[0].atRate, 40);
  assert.match(r.items[0].why, /35 working days early/);
});

test("optimistic needs both the factor and the day gap", () => {
  // 40% in 10 d -> 15 d left at pace, 8 d scheduled: 1.9x but 7 d gap, flagged
  assert.deepEqual(kinds(review([active("A", 40, 8, 18)]), "A"), ["optimistic"]);
  // 40% -> 15 d at pace vs 11 d: 1.36x, not flagged
  assert.deepEqual(kinds(review([active("A", 40, 11, 21)]), "A"), []);
  // 90% in 10 d -> 1.1 d at pace vs 0.5 d: 2.2x but a 0.6 d gap, not flagged
  assert.deepEqual(kinds(review([active("A", 90, 0.5, 11)]), "A"), []);
});

test("stalled and overrun: 0% after 10 d with 30 d left of a 20 d activity", () => {
  assert.deepEqual(kinds(review([active("A", 0, 30, 20)]), "A"), ["overrun", "stalled"]);
  // 4 working days in is not yet stalled
  const r = review([active("A", 0, 16, 20, { act_start_date: "2025-12-09 08:00" })]);
  assert.deepEqual(kinds(r, "A"), []);
});

test("duration percent: no stalled or pace flags (the percent is the durations), overrun still read", () => {
  const r = review([active("A", 0, 25, 20, { complete_pct_type: "CP_Drtn" })]);
  assert.deepEqual(kinds(r, "A"), ["overrun"]);
  assert.equal(claimedPercent({ complete_pct_type: "CP_Drtn", status_code: "TK_Active", target_drtn_hr_cnt: 80, remain_drtn_hr_cnt: 20 }), 75);
});

test("units percent: actual over actual + remaining units, labour and nonlabour", () => {
  const row = { complete_pct_type: "CP_Units", act_work_qty: 60, remain_work_qty: 20, act_equip_qty: 10, remain_equip_qty: 10 };
  assert.equal(claimedPercent(row), 70);
  const r = review([active("A", 0, 30, 40, { complete_pct_type: "CP_Units", act_work_qty: 90, remain_work_qty: 10 })]);
  assert.deepEqual(kinds(r, "A"), ["overclaimed"]);
  assert.equal(r.items[0].type, "units");
});

test("zero remaining, 100% not finished, progress on unstarted work, finished short", () => {
  const r = review([
    active("Z", 60, 0, 20),
    active("F", 100, 6, 20),
    task("U", { phys_complete_pct: 25 }),
    task("V", { complete_pct_type: "CP_Units", act_work_qty: 12, remain_work_qty: 40 }),
    task("D", { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-05 17:00", phys_complete_pct: 90, remain_drtn_hr_cnt: 0 }),
    task("E", { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-05 17:00", phys_complete_pct: 100, remain_drtn_hr_cnt: 0 }),
  ]);
  assert.deepEqual(kinds(r, "Z"), ["zero-remaining"]);
  assert.deepEqual(kinds(r, "F"), ["full-not-finished"]);
  assert.deepEqual(kinds(r, "U"), ["progress-unstarted"]);
  assert.deepEqual(kinds(r, "V"), ["progress-unstarted"]);
  assert.deepEqual(kinds(r, "D"), ["finished-short"]);
  assert.deepEqual(kinds(r, "E"), []);
  assert.equal(r.flagged, 5);
});

test("milestones, level of effort and WBS summaries are left out", () => {
  const r = review([
    active("M", 0, 0, 0, { task_type: "TT_FinMile" }),
    active("L", 0, 30, 10, { task_type: "TT_LOE" }),
    active("W", 0, 30, 10, { task_type: "TT_WBS" }),
  ]);
  assert.equal(r.items.length, 0);
  assert.equal(r.checked, 1);
});

test("thresholds are options, and outputs list every item", () => {
  const tasks = [active("A", 50, 15, 25), active("B", 80, 30, 40), active("C", 20, 5, 15)];
  assert.deepEqual(kinds(review(tasks), "A"), []);
  assert.deepEqual(kinds(review(tasks, { aheadPoints: 5 }), "A"), ["overclaimed"]);
  const r = review(tasks);
  const csv = progressCsv(r).trim().split("\r\n");
  assert.equal(csv.length, 1 + r.items.length);
  assert.match(csv[0], /^kind,activity_id/);
  assert.match(progressText(r), /Progress claimed ahead of the forecast: 1/);
  assert.match(progressTableHtml(r), /<table>/);
  assert.match(progressTableHtml(review([active("A", 50, 10, 20)])), /No progress inconsistencies/);
});

test("largest gap first within a kind", () => {
  const r = review([active("S", 20, 5, 15), active("T", 10, 5, 15)]);
  assert.deepEqual(r.items.filter((x) => x.kind === "optimistic").map((x) => x.code), ["T", "S"]);
});

test("CSV guards cells a spreadsheet would run as formulas", () => {
  const r = review([active("=cmd", 0, 30, 20, { task_name: "@SUM(A1)" })]);
  const line = progressCsv(r).split("\r\n")[1];
  assert.match(line, /,'=cmd,'@SUM\(A1\),/);
});

test("units %: a missing remaining quantity counts as none left, not as one unit", () => {
  assert.equal(claimedPercent({ complete_pct_type: "CP_Units", act_work_qty: 50 }), 100);
  assert.equal(claimedPercent({ complete_pct_type: "CP_Units", act_work_qty: 1, remain_equip_qty: 1 }), 50);
});

test("an actual start after the data date counts no time spent", () => {
  // started 2025-12-16, the day after the data date, with nothing left: 0 d spent
  const r = review([active("A", 50, 0, 10, { act_start_date: "2025-12-16 08:00" })]);
  assert.deepEqual(kinds(r, "A"), ["zero-remaining"]);
  assert.equal(r.items[0].spent, 0);
});
