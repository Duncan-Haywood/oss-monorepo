import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { formatDate } from "./xer.mjs";

// Progress override: an SS or SF link out of work under way is laid from the
// data date itself, not from the predecessor's restart, with the lag not yet
// spent at the data date run on from there (P6 Professional 23.12 probes
// h3s-pe, -pe24, -pa and -pw, eval/po-ss-data-date-2026-11-24.md). Under
// retained logic the successor stays on the restart.

const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||5()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||6()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||7()())))(0||Exceptions()())))";
const DAY24 = "(0||CalendarData()((0||DaysOfWeek()((0||1()((0||0(s|00:00|f|00:00)())))(0||2()((0||0(s|00:00|f|00:00)())))(0||3()((0||0(s|00:00|f|00:00)())))(0||4()((0||0(s|00:00|f|00:00)())))(0||5()((0||0(s|00:00|f|00:00)())))(0||6()((0||0(s|00:00|f|00:00)())))(0||7()((0||0(s|00:00|f|00:00)())))))(0||Exceptions()())))";

function xerText(tables) {
  const lines = ["ERMHDR\t23.12\t2026-03-13\tProject\tadmin\tAdmin\tdb\tProject Management\tUSD"];
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
  task_code: code, task_name: `Activity ${code}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const active = { status_code: "TK_Active", act_start_date: "2026-03-11 08:00" };

// Data date Fri 2026-03-13 17:00, the end of A's working day. A (Mon-Fri)
// started Wed 08:00 with 16 h left, so it restarts Mon 08:00. B (24-hour
// calendar) follows A by an SS link with lag `lag` on A's calendar; END
// (Mon-Fri, 400 h) holds the project open so floats are finite.
const run = (po, lag, type = "PR_SS") => {
  const x = parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "T", clndr_id: "C1", last_recalc_date: "2026-03-13 17:00", plan_start_date: "2026-03-09 08:00", plan_end_date: "" }],
    CALENDAR: [
      { clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: WEEK },
      { clndr_id: "C2", default_flag: "N", clndr_name: "24 hours", day_hr_cnt: 24, clndr_data: DAY24 },
    ],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_lag_early_start_flag: "Y",
      sched_retained_logic: po ? "N" : "Y", sched_progress_override: po ? "Y" : "N" }],
    TASK: [task("1", "A", 16, active), task("2", "B", 8, { clndr_id: "C2" }), task("3", "END", 400, { status_code: "TK_Active", act_start_date: "2026-03-09 08:00" })],
    TASKPRED: [{ task_pred_id: "11", task_id: "2", pred_task_id: "1", proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag }],
  }));
  const out = schedule(x);
  const r = Object.fromEntries(x.tables.TASK.map((t) => [t.task_code, out.tasks.get(t.task_id)]));
  return { aFF: r.A.ff, bES: formatDate(r.B.remES ?? r.B.es), bEF: formatDate(r.B.ef) };
};

test("progress override, no lag: the successor starts at the data date (P6 P1B)", () => {
  assert.deepEqual([run(true, 0).bES, run(true, 0).bEF], ["2026-03-13 17:00", "2026-03-14 01:00"]);
});

test("retained logic, no lag: the successor waits for the restart", () => {
  assert.equal(run(false, 0).bES, "2026-03-16 08:00");
});

test("progress override, an expired lag: still the data date (P6 P3B, 8 h lag)", () => {
  assert.equal(run(true, 8).bES, "2026-03-13 17:00");
});

test("progress override, a lag not yet spent runs on from the data date (P6 P4B, 40 h lag)", () => {
  // 24 h of the 40 were spent Wed-Fri; the other 16 run Mon and Tue
  assert.equal(run(true, 40).bES, "2026-03-17 17:00");
});

test("progress override: the successor no longer limits the started predecessor's free float", () => {
  assert.ok(run(true, 0).aFF > 0, "P6 prints A's free float to the project finish");
  assert.equal(run(false, 0).aFF, 0, "under retained logic B still waits on A's restart");
});

test("progress override, SF: laid from the data date, not the Mon 08:00 restart (P6 P5B)", () => {
  // the SF bound (finish at or after Fri 17:00) and the data date floor
  // agree: B runs Fri 17:00 to Sat 01:00 on its 24-hour calendar
  assert.deepEqual([run(true, 0, "PR_SF").bES, run(true, 0, "PR_SF").bEF], ["2026-03-13 17:00", "2026-03-14 01:00"]);
  // a 40 h SF lag, 16 h unspent: B finishes no earlier than Tue 17:00
  assert.equal(run(true, 40, "PR_SF").bEF, "2026-03-17 17:00");
});
