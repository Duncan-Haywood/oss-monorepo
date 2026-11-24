import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { parseMspdi } from "./mspdi.mjs";
import { schedule } from "./cpm.mjs";
import { mspdiText } from "./msproject.mjs";
import { p6XerText } from "./p6xer.mjs";

// P6's "Make open-ended activities critical" (SCHEDOPTIONS
// sched_open_critical_flag) and Project's "Calculate multiple critical paths"
// (<MultipleCriticalPaths>): an activity with no successor gets its early
// finish as its late finish, so its float is zero and so is the float of the
// chain that drives it.

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
  task_id: id, proj_id: "1", wbs_id: "10", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart",
  task_code: code, task_name: `Activity ${code}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const link = (id, succ, pred) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: "PR_FS", lag_hr_cnt: 0 });

// A (16 h) -> B (40 h) -> FIN (finish milestone); A -> C (8 h) -> D (8 h),
// D open-ended: D finishes at 32 h, 24 h before B and the project finish.
const text = (flag) => xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "T", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N", ...(flag ? { sched_open_critical_flag: flag } : {}) }],
  TASK: [task("1", "A", 16), task("2", "B", 40), task("3", "FIN", 0, { task_type: "TT_FinMile" }), task("4", "C", 8), task("5", "D", 8)],
  TASKPRED: [link("11", "2", "1"), link("12", "3", "2"), link("13", "4", "1"), link("14", "5", "4")],
});
const run = (flag) => {
  const x = parseXer(text(flag));
  const out = schedule(x);
  return Object.fromEntries(x.tables.TASK.map((t) => [t.task_code, out.tasks.get(t.task_id)]));
};

test("off (the default): an open end's float runs to the project finish", () => {
  for (const r of [run(), run("N")]) {
    assert.equal(r.D.tf, 24, "D can slip until the project finish");
    assert.equal(r.C.tf, 24);
    assert.equal(r.A.tf, 0);
  }
});

test("on: every open end and the chain behind it goes to zero; no early date moves", () => {
  const off = run("N"), on = run("Y");
  assert.equal(on.D.tf, 0);
  assert.equal(on.C.tf, 0, "the chain driving an open end is critical too");
  assert.equal(on.D.lf, on.D.ef);
  assert.equal(on.FIN.tf, 0, "the finish milestone has no successor either");
  for (const k of Object.keys(off)) {
    assert.equal(on[k].ef, off[k].ef, `${k}: early finish unchanged`);
    assert.equal(on[k].remES, off[k].remES, `${k}: early start unchanged`);
    assert.ok(on[k].tf <= off[k].tf, `${k}: float never grows`);
  }
  assert.equal(on.B.tf, off.B.tf, "B has a successor: untouched");
});

test("an open end already late keeps its negative float", () => {
  const x = parseXer(text("Y"));
  // a finish-on-or-before before D's early finish makes its float negative
  x.tables.TASK.find((t) => t.task_code === "D").cstr_type = "CS_MEOB";
  x.tables.TASK.find((t) => t.task_code === "D").cstr_date = "2025-12-02 17:00";
  const out = schedule(x);
  const d = out.tasks.get("5");
  assert.equal(d.tf, -16, "two days late, as with the option off");
  assert.equal(out.tasks.get("4").tf, -16);
});

test("Project XML: MultipleCriticalPaths read as the P6 option, and written from it", () => {
  const xml = mspdiText(parseXer(text("Y"))).xml;
  assert.match(xml, /<MultipleCriticalPaths>1<\/MultipleCriticalPaths>/);
  assert.match(mspdiText(parseXer(text("N"))).xml, /<MultipleCriticalPaths>0<\/MultipleCriticalPaths>/);
  const back = parseMspdi(xml);
  assert.equal(back.tables.SCHEDOPTIONS[0].sched_open_critical_flag, "Y");
  const flipped = parseMspdi(xml.replace("<MultipleCriticalPaths>1<", "<MultipleCriticalPaths>0<"));
  assert.equal(flipped.tables.SCHEDOPTIONS[0].sched_open_critical_flag, "N");
  // and on to an XER for P6 import
  assert.equal(parseXer(p6XerText(xml).text).tables.SCHEDOPTIONS[0].sched_open_critical_flag, "Y");
});
