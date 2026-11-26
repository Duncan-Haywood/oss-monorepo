import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { calendarSlack, calendarSlackText, calendarSlackCsv } from "./calslack.mjs";

// C1: Mon-Fri 08:00-12:00, 13:00-17:00; C7: the same hours every day (a curing calendar)
const D = "((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)()))";
const WEEK = `(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()${D})(0||3()${D})(0||4()${D})(0||5()${D})(0||6()${D})(0||7()())))(0||Exceptions()())))`;
const ALL = `(0||CalendarData()((0||DaysOfWeek()((0||1()${D})(0||2()${D})(0||3()${D})(0||4()${D})(0||5()${D})(0||6()${D})(0||7()${D})))(0||Exceptions()())))`;
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
// X (48 h) drives END. B -> C -> END has a day of float: B may finish Friday
// 17:00, and since C cannot start before Monday 08:00, B may equally finish
// then. A runs on the 7-day calendar and is tied to B's finish (FF 8 h, lag
// on A's calendar), so A can use Saturday and Sunday too: 16 h more float
// than P6's backward pass gives.
const NET = (lagCal = "rcal_Predecessor", lag = 8) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [
    { clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: WEEK },
    { clndr_id: "C7", default_flag: "N", clndr_name: "Curing 7-day", day_hr_cnt: 8, clndr_data: ALL },
  ],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: lagCal, sched_retained_logic: "Y", sched_progress_override: "N" }],
  TASK: [task("1", "X", 48), task("2", "B", 8), task("3", "C", 8), task("4", "A", 8, { clndr_id: "C7" }), task("5", "END", 0, { task_type: "TT_FinMile" })],
  TASKPRED: [link("1", "5", "1"), link("2", "3", "2"), link("3", "5", "3"), link("4", "2", "4", "PR_FF", lag)],
}));
const byCode = (res, code) => res.tasks.get([...res.model.tasks.values()].find((t) => t.code === code).id);

test("default late dates are P6's; the option adds the weekend the curing calendar works", () => {
  const xer = NET();
  const base = schedule(xer), cs = schedule(xer, { calendarSlack: true });
  assert.equal(byCode(base, "A").tf, 24);
  assert.equal(byCode(cs, "A").tf, 40);
  // only A gains; early dates are untouched
  for (const t of base.model.tasks.values()) {
    const b = base.tasks.get(t.id), c = cs.tasks.get(t.id);
    assert.equal(c.es, b.es); assert.equal(c.ef, b.ef);
    if (t.code !== "A") assert.equal(c.tf, b.tf, t.code);
  }
});

test("the added float is real: delayed by it the finish holds, one hour more and it moves", () => {
  const xer = NET();
  const base = schedule(xer);
  const a = [...base.model.tasks.values()].find((t) => t.code === "A");
  const fin = (hours) => schedule(xer, { model: base.model, forwardOnly: true, levelStart: new Map([[a.id, a.cal.nextStart(a.cal.addWork(base.tasks.get(a.id).es, hours * 60))]]) }).projects.get("1").finish;
  const f0 = base.projects.get("1").finish;
  assert.equal(fin(40), f0);
  assert.ok(fin(41) > f0);
});

test("with the lag on the successor's calendar there is nothing to add", () => {
  const r = calendarSlack(NET("rcal_Successor"));
  assert.equal(r.activities.length, 0);
  assert.match(calendarSlackText(r), /no float is added/);
});

test("with no lag the predecessor's own 7-day calendar takes the weekend", () => {
  const r = calendarSlack(NET("rcal_Successor", 0));
  assert.deepEqual(r.activities.map((a) => [a.code, a.tfP6, a.tf]), [["A", 32, 48]]);
  assert.deepEqual(r.links.map((l) => [l.pred, l.succ, l.gap]), [["A", "B", 16]]);
});

test("report: the link where it enters and the activity", () => {
  const r = calendarSlack(NET());
  assert.equal(r.activities.length, 1);
  assert.deepEqual([r.activities[0].code, r.activities[0].tfP6, r.activities[0].tf, r.activities[0].gain], ["A", 24, 40, 16]);
  assert.equal(r.links.length, 1);
  assert.deepEqual([r.links[0].pred, r.links[0].succ, r.links[0].type, r.links[0].gap], ["A", "B", "FF", 16]);
  assert.match(calendarSlackText(r), /A \("Curing 7-day"\) -FF 8 h on "Curing 7-day"-> B \("Mon-Fri"\)/);
  assert.match(calendarSlackCsv(r), /^Activity ID,.*\nA,Activity A,Curing 7-day,24,40,16,/);
});

test("CSV: a name a spreadsheet would run as a formula is written as text", () => {
  const csv = calendarSlackCsv({ activities: [{ code: "A", name: "=HYPERLINK(1)", calendar: "C", tfP6: -8, tf: 0, gain: 8, lateFinishP6: "", lateFinish: "" }] });
  assert.match(csv, /\nA,'=HYPERLINK\(1\),C,-8,0,8,,\n$/);
});

test("zero-length work gains no calendar slack: a 0 h task finishes where it starts, at the next work start", () => {
  // NET with B made a 0 h task: B has no finish to slide from Friday 17:00 to
  // Monday 08:00, so the FF link from A gains nothing over P6's late dates
  const xer = parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
    CALENDAR: [
      { clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: WEEK },
      { clndr_id: "C7", default_flag: "N", clndr_name: "Curing 7-day", day_hr_cnt: 8, clndr_data: ALL },
    ],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    TASK: [task("1", "X", 48), task("2", "B", 0), task("3", "C", 8), task("4", "A", 8, { clndr_id: "C7" }), task("5", "END", 0, { task_type: "TT_FinMile" })],
    TASKPRED: [link("1", "5", "1"), link("2", "3", "2"), link("3", "5", "3"), link("4", "2", "4", "PR_FF", 8)],
  }));
  const base = schedule(xer), cs = schedule(xer, { calendarSlack: true });
  assert.equal(byCode(base, "A").tf, 24);
  assert.equal(byCode(cs, "A").tf, 24);
  assert.equal(byCode(cs, "B").lfAbs, undefined);
});

test("text: exactly 20 links print with no '... more' line, and the least-float activity comes first", () => {
  const links = Array.from({ length: 20 }, (_, i) => ({ pred: `P${i}`, succ: "S", type: "FF", lag: 0, lagCalendar: "C", predCalendar: "C", succCalendar: "C", succLateFinish: "", succMayFinish: "", gap: 8 }));
  const activities = [{ code: "FIRST", name: "first", tfP6: 0, tf: 8, gain: 8 }, { code: "SECOND", name: "second", tfP6: 8, tf: 16, gain: 8 }];
  const out = calendarSlackText({ open: 30, activities, links, leavesCritical: 1, maxGain: 8 });
  assert.doesNotMatch(out, /more \(--csv\)/);
  assert.match(out, /P19 \("C"\)/);
  assert.match(out, /\n {2}FIRST +TF +0 -> +8 {2}\(\+8\) {2}first\n/);
  const more = calendarSlackText({ open: 30, activities, links: [...links, { ...links[0], pred: "P20" }], leavesCritical: 0, maxGain: 8 });
  assert.match(more, /\.\.\. 1 more \(--csv\)/);
});

test("a gain of one hour is listed (a calendar working one hour on Saturday)", () => {
  // the curing calendar works Saturday 08:00-09:00 only, so A gains 1 h
  const ONE = `(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()${D})(0||3()${D})(0||4()${D})(0||5()${D})(0||6()${D})(0||7()((0||0(s|08:00|f|09:00)())))))(0||Exceptions()())))`;
  const xer = parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
    CALENDAR: [
      { clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: WEEK },
      { clndr_id: "C7", default_flag: "N", clndr_name: "Saturday hour", day_hr_cnt: 8, clndr_data: ONE },
    ],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    TASK: [task("1", "X", 48), task("2", "B", 8), task("3", "C", 8), task("4", "A", 8, { clndr_id: "C7" }), task("5", "END", 0, { task_type: "TT_FinMile" })],
    TASKPRED: [link("1", "5", "1"), link("2", "3", "2"), link("3", "5", "3"), link("4", "2", "4", "PR_FF", 8)],
  }));
  const r = calendarSlack(xer);
  assert.deepEqual(r.activities.map((a) => [a.code, a.gain]), [["A", 1]]);
});
