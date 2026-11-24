// Resource-dependent activities (TT_Rsrc) on their resources' calendars, the
// way P6 23.12 schedules them (cpp-cpm-engine probes; eval/p6-probes-rd-2026-11-24.md).
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, formatDate } from "./xer.mjs";
import { schedule } from "./cpm.mjs";

const day = (n, periods) => `(0||${n}()(${periods.map(([s, f], i) => `(0||${i}(s|${s}|f|${f})())`).join("")}))`;
const weekData = (byDay) => `(0||CalendarData()((0||DaysOfWeek()(${[1, 2, 3, 4, 5, 6, 7].map((d) => day(d, byDay(d))).join("")}))(0||Exceptions()())))`;
// activity calendar: Mon-Fri 08:00-12:00, 13:00-17:00; crew: every day 06:00-18:00
const OFFICE = weekData((d) => (d >= 2 && d <= 6 ? [["08:00", "12:00"], ["13:00", "17:00"]] : []));
const CREW = weekData(() => [["06:00", "18:00"]]);

function xerText(tables) {
  const lines = ["ERMHDR\t23.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return lines.join("\r\n");
}
const task = (id, code, hours, extra = {}) => ({
  task_id: id, proj_id: "1", wbs_id: "10", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart",
  task_code: code, task_name: code, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const fs = (id, succ, pred) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: "PR_FS", lag_hr_cnt: 0 });
const xer = (tasks, preds, asg) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "RD", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [
    { clndr_id: "C1", default_flag: "Y", clndr_name: "Office", day_hr_cnt: 8, clndr_data: OFFICE },
    { clndr_id: "C2", default_flag: "N", clndr_name: "Crew", day_hr_cnt: 12, clndr_data: CREW },
  ],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  RSRC: [{ rsrc_id: "9", rsrc_short_name: "CREW", clndr_id: "C2", rsrc_type: "RT_Labor" }],
  TASK: tasks,
  TASKPRED: preds,
  TASKRSRC: asg,
}));
const at = (out, x, code) => {
  const r = out.tasks.get(x.tables.TASK.find((t) => t.task_code === code).task_id);
  return { es: formatDate(r.remES), ef: formatDate(r.ef) };
};

test("CPM: a resource-dependent activity runs on its crew's calendar", () => {
  const x = xer(
    [task("1", "R", 24, { task_type: "TT_Rsrc" }), task("2", "S", 8)],
    [fs("1", "2", "1")],
    [{ taskrsrc_id: "1", task_id: "1", proj_id: "1", rsrc_id: "9", rsrc_type: "RT_Labor", remain_qty: 24, remain_qty_per_hr: 1, target_lag_drtn_hr_cnt: 0, relag_drtn_hr_cnt: 0 }],
  );
  // 24 crew hours from Mon 08:00 on a 12-hour day: 10 Mon, 12 Tue, 2 Wed
  assert.deepEqual(at(schedule(x), x, "R"), { es: "2025-12-01 08:00", ef: "2025-12-03 08:00" });
  assert.deepEqual(at(schedule(x), x, "S"), { es: "2025-12-03 08:00", ef: "2025-12-03 17:00" });
  // the old reading: 24 hours on the activity's own calendar
  assert.equal(at(schedule(x, { variant: { rsrcDep: false } }), x, "R").ef, "2025-12-03 17:00");
});

test("CPM: a crew start off the activity calendar moves to its next opening and runs again from there (probe rd-underway)", () => {
  const x = xer(
    [task("1", "A", 8), task("2", "R", 24, { task_type: "TT_Rsrc" })],
    [fs("1", "2", "1")],
    [{ taskrsrc_id: "1", task_id: "2", proj_id: "1", rsrc_id: "9", rsrc_type: "RT_Labor", remain_qty: 24, remain_qty_per_hr: 1, target_lag_drtn_hr_cnt: 0, relag_drtn_hr_cnt: 0 }],
  );
  // A ends Mon 17:00; the crew could start then, but the activity calendar is
  // closed: the work starts Tue 08:00 and runs 10 + 12 + 2 crew hours
  assert.deepEqual(at(schedule(x), x, "R"), { es: "2025-12-02 08:00", ef: "2025-12-04 08:00" });
  // a material assignment does not drive the dates
  const m = xer(x.tables.TASK, x.tables.TASKPRED, [{ ...x.tables.TASKRSRC[0], rsrc_type: "RT_Mat" }]);
  assert.equal(at(schedule(m), m, "R").ef, "2025-12-04 17:00");
});
