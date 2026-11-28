// The DCMA thresholds themselves, each on both sides of its line.
//
// The 2026-11-19 quality audit (portfolio/quality/audits/2026-11-19-xer-schedule-check.json)
// seeded threshold bugs in points 6, 7, 13 and 14 and no test failed; the
// 2026-11-28 re-audit found the same mutants still surviving. Each test here
// pins one published threshold (DCMA 14-point assessment: 44 working days of
// high float, no negative float, CPLI 0.95, BEI = all activities finished to
// date over those the baseline had due by the data date).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { assess } from "./dcma.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h a day), no holidays
const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||5()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||6()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||7()())))))";

function xer(tasks, preds = [], projExtra = {}) {
  const tables = {
    PROJECT: [{ proj_id: "1", proj_short_name: "T", clndr_id: "C1", last_recalc_date: "2025-12-01 00:00", plan_start_date: "2025-12-01 00:00", plan_end_date: "", ...projExtra }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    TASK: tasks,
    TASKPRED: preds,
  };
  const lines = ["ERMHDR\t20.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return parseXer(lines.join("\r\n"));
}
const task = (id, hours, extra = {}) => ({
  task_id: id, proj_id: "1", wbs_id: "10", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart",
  task_code: `A${id}`, task_name: `Activity ${id}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const link = (id, succ, pred) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: "PR_FS", lag_hr_cnt: 0 });
const point = (x, id) => assess(x).checks.find((c) => c.id === id);

test("DCMA 6: 44 working days of total float is not high float; 45 is", () => {
  const x = xer([task("1", 8, { total_float_hr_cnt: 44 * 8 }), task("2", 8, { total_float_hr_cnt: 45 * 8 }), task("3", 8, { total_float_hr_cnt: 0 })]);
  const c = point(x, 6);
  assert.deepEqual(c.items.map((i) => i.code), ["A2"]);
  assert.equal(c.count, 1);
  assert.equal(c.total, 3);
  assert.equal(c.pass, false);
});

test("DCMA 7: half a day of negative float counts; zero does not", () => {
  const x = xer([task("1", 8, { total_float_hr_cnt: -4 }), task("2", 8, { total_float_hr_cnt: 0 })]);
  const c = point(x, 7);
  assert.deepEqual(c.items.map((i) => i.code), ["A1"]);
  assert.equal(c.pass, false);
  assert.equal(point(xer([task("1", 8, { total_float_hr_cnt: 0 })]), 7).pass, true);
});

test("DCMA 13: a forecast finish well past the must-finish-by date gives CPLI under 0.95 and fails", () => {
  // two 10-day activities in a row from Mon 1 Dec: finish Fri 26 Dec 17:00,
  // 20 working days of critical path; must finish by Fri 19 Dec 17:00, five
  // working days earlier: CPLI = (20 - 5) / 20 = 0.75
  const tasks = [task("1", 80), task("2", 80)];
  const late = xer(tasks, [link("1", "2", "1")], { plan_end_date: "2025-12-19 17:00" });
  const c = point(late, 13);
  assert.ok(Math.abs(c.value - 0.75) < 0.01, `CPLI ${c.value}`);
  assert.equal(c.pass, false);
  // on time: the must-finish-by date is the forecast finish, CPLI 1
  const onTime = point(xer(tasks, [link("1", "2", "1")], { plan_end_date: "2025-12-26 17:00" }), 13);
  assert.equal(onTime.value, 1);
  assert.equal(onTime.pass, true);
});

test("DCMA 14: BEI counts every activity finished to date, early finishes included, over those due", () => {
  // data date Wed 10 Dec. A1 due 5 Dec and finished; A2 due 8 Dec and not
  // started; A3 due 20 Dec but already finished. BEI = 2 finished / 2 due = 1.0
  const done = (end) => ({ status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: end, remain_drtn_hr_cnt: 0 });
  const x = xer([
    task("1", 8, { ...done("2025-12-05 17:00"), target_end_date: "2025-12-05 17:00" }),
    task("2", 8, { target_end_date: "2025-12-08 17:00" }),
    task("3", 8, { ...done("2025-12-04 17:00"), target_end_date: "2025-12-20 17:00" }),
    task("4", 8, { target_end_date: "2025-12-22 17:00" }),
  ], [], { last_recalc_date: "2025-12-10 08:00" });
  const bei = point(x, 14);
  assert.equal(bei.value, 1);
  assert.equal(bei.count, 2);
  assert.equal(bei.total, 2);
  const missed = point(x, 11);
  assert.deepEqual(missed.items.map((i) => i.code), ["A2"]);
  assert.equal(missed.value, 50);
});
