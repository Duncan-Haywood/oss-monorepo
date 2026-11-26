import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { milestoneCalendars, milestoneCalendarsText, milestoneCalendarsCsv } from "./milestones.mjs";

// C1: Mon-Fri 08:00-12:00, 13:00-17:00; C4: the same hours Mon-Thu (Friday off)
const D = "((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)()))";
const cal = (days) => `(0||CalendarData()((0||DaysOfWeek()(${[1, 2, 3, 4, 5, 6, 7].map((d) => `(0||${d}()${days.includes(d) ? D : "()"})`).join("")}))(0||Exceptions()())))`;
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
const link = (id, succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
// A (32 h, Mon-Thu calendar) finishes Thursday 4 December 17:00. M, a start
// milestone on the same Friday-off calendar, then sits at Monday 08:00, and B
// (Mon-Fri) waits for it: Friday is lost. X (80 h) drives END, so the finish
// does not move either way. msCal: the milestone's calendar.
const NET = (msCal = "C4", cstr = {}) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [
    { clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: cal([2, 3, 4, 5, 6]) },
    { clndr_id: "C4", default_flag: "N", clndr_name: "Mon-Thu", day_hr_cnt: 8, clndr_data: cal([2, 3, 4, 5]) },
  ],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  TASK: [task("1", "A", 32, { clndr_id: "C4" }), task("2", "M", 0, { task_type: "TT_Mile", clndr_id: msCal, ...cstr }), task("3", "B", 8), task("4", "X", 80), task("5", "END", 0, { task_type: "TT_FinMile" })],
  TASKPRED: [link("1", "2", "1"), link("2", "3", "2"), link("3", "5", "3"), link("4", "5", "4")],
}));
const by = (res, code) => res.tasks.get([...res.model.tasks.values()].find((t) => t.code === code).id);
const D_ = (s) => Date.parse(s + ":00Z") / 60000;

test("P6's reading: the Friday-off milestone holds B to Monday; on 24 h it starts Friday", () => {
  const xer = NET();
  const base = schedule(xer), alt = schedule(xer, { milestones24h: true });
  assert.equal(by(base, "A").ef, D_("2025-12-04T17:00"));
  assert.equal(by(base, "M").es, D_("2025-12-08T08:00"));
  assert.equal(by(base, "B").es, D_("2025-12-08T08:00"));
  assert.equal(by(alt, "M").es, D_("2025-12-04T17:00"));
  assert.equal(by(alt, "B").es, D_("2025-12-05T08:00"));
  // B gains the Friday as float; the finish (X) does not move
  assert.equal(by(alt, "B").tf - by(base, "B").tf, 8);
  assert.equal(alt.projects.get("1").finish, base.projects.get("1").finish);
});

test("the report names the milestone, the successor and the hours lost", () => {
  const r = milestoneCalendars(NET());
  assert.equal(r.milestones.length, 1);
  const m = r.milestones[0];
  assert.equal(m.code, "M"); assert.equal(m.type, "start"); assert.equal(m.calendar, "Mon-Thu");
  assert.deepEqual(m.successors.map((s) => [s.code, s.hours]), [["B", 8]]);
  assert.ok(r.activities.some((a) => a.code === "B" && a.hours === 8));
  assert.equal(r.finishes[0].moved, false);
  assert.match(milestoneCalendarsText(r), /M \(start milestone, "Mon-Thu"\) sits at 2025-12-08 08:00/);
  const csv = milestoneCalendarsCsv(r).trim().split("\n");
  assert.equal(csv.length, 2);
  assert.match(csv[1], /^M,Activity M,start,Mon-Thu,/);
});

test("a milestone on its successors' calendar holds nothing back", () => {
  const r = milestoneCalendars(NET("C1"));
  assert.equal(r.milestones.length, 0);
  assert.equal(r.gainFloat, 0);
  assert.match(milestoneCalendarsText(r), /^Milestone calendars: none\./);
});

test("the option leaves the default dates alone and never makes anything later", () => {
  const xer = NET();
  const base = schedule(xer), alt = schedule(xer, { milestones24h: true });
  for (const t of base.model.tasks.values()) {
    const b = base.tasks.get(t.id), a = alt.tasks.get(t.id);
    assert.ok(a.es <= b.es, t.code);
    assert.ok(a.tf >= b.tf - 1e-9, t.code);
  }
});

test("a mandatory start keeps its date", () => {
  const xer = NET("C4", { cstr_type: "CS_MANDSTART", cstr_date: "2025-12-08 08:00" });
  const alt = schedule(xer, { milestones24h: true });
  assert.equal(by(alt, "M").es, D_("2025-12-08T08:00"));
});

// Red-team guards, 2026-11-26. C5: Mon-Fri from 08:30, so a milestone on it
// after Thursday 17:00 sits at Friday 08:30 and B (Mon-Fri from 08:00) loses
// half an hour. FF from X holds B's finish, so only its start moves.
const D5 = "((0||0(s|08:30|f|12:00)())(0||1(s|13:00|f|17:00)()))";
const cal5 = `(0||CalendarData()((0||DaysOfWeek()(${[1, 2, 3, 4, 5, 6, 7].map((d) => `(0||${d}()${[2, 3, 4, 5, 6].includes(d) ? D5 : "()"})`).join("")}))(0||Exceptions()())))`;
const NET_HALF = (bLinks = [link("2", "3", "2")], extraTasks = []) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [
    { clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: cal([2, 3, 4, 5, 6]) },
    { clndr_id: "C5", default_flag: "N", clndr_name: "Mon-Fri 08:30", day_hr_cnt: 7.5, clndr_data: cal5 },
  ],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  TASK: [task("1", "A", 32), task("2", "M", 0, { task_type: "TT_Mile", clndr_id: "C5" }), task("3", "B", 8), task("4", "X", 80), task("5", "END", 0, { task_type: "TT_FinMile" }), ...extraTasks],
  TASKPRED: [link("1", "2", "1"), ...bLinks, link("3", "5", "3"), link("4", "5", "4")],
}));

test("a half hour lost to a milestone's later working start is reported as half an hour", () => {
  const r = milestoneCalendars(NET_HALF());
  assert.deepEqual(r.activities.filter((a) => a.code === "B").map((a) => a.hours), [0.5]);
  assert.deepEqual(r.milestones.map((m) => [m.code, m.hours, m.successors.map((x) => x.hours)]), [["M", 0.5, [0.5]]]);
});

test("an activity already under way is listed by how much earlier it could finish", () => {
  // B started on the data date; retained logic holds its remaining 8 h for M,
  // so on a 24-hour milestone it finishes Friday rather than Monday
  const xer = NET();
  xer.tables.TASK = xer.tables.TASK.map((t) => (t.task_code === "B" ? { ...t, status_code: "TK_Active", act_start_date: "2025-12-01 08:00" } : t));
  const r = milestoneCalendars(xer);
  // its start is fixed, so the hours are the finish's: Friday 8 h
  assert.deepEqual(r.activities.map((a) => [a.code, a.start, a.couldStart, a.hours, a.tf, a.tf24]), [["B", "2025-12-01 08:00", "2025-12-01 08:00", 8, 32, 40]]);
  // the milestone that holds it is named too, by B's remaining start (Monday,
  // not Friday): retained logic holds the remaining work for an FS link
  assert.deepEqual(r.milestones.map((m) => [m.code, m.hours, m.successors.map((x) => [x.code, x.start, x.couldStart, x.hours, x.remaining])]),
    [["M", 8, [["B", "2025-12-08 08:00", "2025-12-05 08:00", 8, true]]]]);
});
