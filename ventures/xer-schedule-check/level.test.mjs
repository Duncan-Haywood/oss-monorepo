import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { level, levelAsync, levelCsv } from "./level.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00
const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||3()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||4()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||5()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||6()((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)())))(0||7()())))(0||Exceptions()())))";
function xerText(tables) {
  const lines = ["ERMHDR\t20.12\t2025-12-01"];
  for (const [name, rows] of Object.entries(tables)) {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    lines.push(`%T\t${name}`, `%F\t${fields.join("\t")}`);
    for (const r of rows) lines.push(`%R\t${fields.map((f) => r[f] ?? "").join("\t")}`);
  }
  lines.push("%E");
  return lines.join("\r\n");
}
const task = (id, days, extra = {}) => ({ task_id: id, proj_id: "1", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: "A" + id, task_name: "Activity " + id, remain_drtn_hr_cnt: days * 8, target_drtn_hr_cnt: days * 8, priority_type: "PT_Normal", ...extra });
const fs = (id, pred, succ, type = "PR_FS", lag = 0) => ({ task_pred_id: id, pred_task_id: pred, task_id: succ, pred_type: type, lag_hr_cnt: lag * 8 });
const use = (id, taskId, rsrc, rate = 1, days = null) => ({ taskrsrc_id: id, task_id: taskId, rsrc_id: rsrc, remain_qty_per_hr: rate, remain_qty: days === null ? "" : days * 8 * rate });
function xer({ tasks, preds = [], assigns = [], limits = { R1: 1 }, opts = {} }) {
  return parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "LVL", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00" }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_retained_logic: "Y", ...opts }],
    TASK: tasks,
    TASKPRED: preds,
    RSRC: Object.keys(limits).map((k) => ({ rsrc_id: k, rsrc_short_name: k, rsrc_name: "Crew " + k, rsrc_type: "RT_Labor" })),
    RSRCRATE: Object.entries(limits).map(([k, v], i) => ({ rsrc_rate_id: String(i + 1), rsrc_id: k, max_qty_per_hr: v, start_date: "2025-01-01 00:00" })),
    TASKRSRC: assigns,
  }));
}
const dates = (r, code) => r.activities.find((a) => a.code === code);

test("two parallel activities on one crew of one: the second waits for the first, the finish moves", () => {
  const x = xer({ tasks: [task("1", 5), task("2", 3), task("3", 0, { task_type: "TT_FinMile" })], preds: [fs("1", "1", "3"), fs("2", "2", "3")], assigns: [use("1", "1", "R1"), use("2", "2", "R1")] });
  const r = level(x);
  assert.equal(r.finish, "2025-12-05 17:00");
  // same early start: A1's longer total float loses... both float differs; A2 has 2 days float, so A1 (0 float) goes first
  const a2 = dates(r, "A2");
  assert.equal(a2.levelledStart, "2025-12-08 08:00");
  assert.equal(a2.levelledFinish, "2025-12-10 17:00");
  assert.equal(r.levelledFinish, "2025-12-10 17:00");
  assert.equal(r.extensionDays, 3);
  assert.equal(r.activities.filter((a) => a.code === "A1").length, 0, "A1 does not move");
  assert.deepEqual(a2.by, ["R1"]);
  assert.equal(r.resources[0].before.peak, 2);
  assert.equal(r.resources[0].after.peak, 1);
  assert.equal(r.resources[0].selfCheckHours, 0);
  // resource bound: 8 days of work for one crew
  assert.equal(r.lowerBound.date, "2025-12-10 17:00");
});

test("a crew of two lets both run; limitScale doubles a crew of one", () => {
  const spec = { tasks: [task("1", 5), task("2", 3)], assigns: [use("1", "1", "R1"), use("2", "2", "R1")] };
  assert.equal(level(xer({ ...spec, limits: { R1: 2 } })).activities.length, 0);
  assert.equal(level(xer(spec), { limitScale: { R1: 2 } }).activities.length, 0);
  assert.equal(level(xer(spec)).activities.length, 1);
});

test("the levelling priority field orders ties: PT_Top goes first", () => {
  const spec = (p1, p2) => xer({ tasks: [task("1", 4, { priority_type: p1 }), task("2", 4, { priority_type: p2 })], assigns: [use("1", "1", "R1"), use("2", "2", "R1")] });
  assert.equal(level(spec("PT_Normal", "PT_Top")).activities[0].code, "A1");
  assert.equal(level(spec("PT_Top", "PT_Normal")).activities[0].code, "A2");
});

test("a moved activity takes its successors with it by the same logic and lags", () => {
  const x = xer({
    tasks: [task("1", 5), task("2", 5, { priority_type: "PT_Top" }), task("3", 2)],
    preds: [fs("1", "1", "3", "PR_FS", 1)],
    assigns: [use("1", "1", "R1"), use("2", "2", "R1")],
    opts: { LevelPriorityList: "priority_type,ASC" },
  });
  const r = level(x);
  // A2's priority puts it first although A1 drives the finish
  assert.equal(dates(r, "A1").levelledStart, "2025-12-08 08:00");
  assert.deepEqual(dates(r, "A1").by, ["R1"]);
  assert.equal(dates(r, "A3").levelledStart, "2025-12-16 08:00"); // A1 ends 12-12, one day lag
  assert.deepEqual(dates(r, "A3").by, [], "carried by logic, not by a resource");
  assert.equal(r.activities.length, 2);
});

test("started work keeps its dates and counts against the limit; finished work uses nothing", () => {
  const x = xer({
    tasks: [task("1", 3, { status_code: "TK_Active", act_start_date: "2025-11-28 08:00" }), task("2", 2), task("3", 4, { status_code: "TK_Complete", act_start_date: "2025-11-20 08:00", act_end_date: "2025-11-25 17:00", remain_drtn_hr_cnt: 0 })],
    assigns: [use("1", "1", "R1"), use("2", "2", "R1"), use("3", "3", "R1")],
  });
  const r = level(x);
  assert.equal(r.activities.length, 1);
  assert.equal(dates(r, "A2").levelledStart, "2025-12-04 08:00");
});

test("an activity that alone needs more than the limit is left where it is and listed", () => {
  const x = xer({ tasks: [task("1", 2), task("2", 2)], assigns: [use("1", "1", "R1", 3), use("2", "2", "R1")] });
  const r = level(x);
  assert.equal(r.left.length, 1);
  assert.match(r.left[0].why, /alone needs 3 of R1 per hour, limit 1/);
  assert.equal(r.resources[0].selfCheckHours, 0);
  assert.equal(r.lowerBound, null);
});

test("level within float: a move past the float is refused, the activity stays and is listed", () => {
  const spec = { tasks: [task("1", 5), task("2", 5), task("9", 0, { task_type: "TT_FinMile" })], preds: [fs("1", "1", "9"), fs("2", "2", "9")], assigns: [use("1", "1", "R1"), use("2", "2", "R1")] };
  const r = level(xer({ ...spec, opts: { level_within_float_flag: "Y" } }));
  assert.equal(r.settings.withinFloat, true);
  assert.equal(r.activities.length, 0);
  assert.match(r.left[0].why, /no float/);
  assert.equal(level(xer(spec)).activities.filter((a) => a.by.length).length, 1);
});

test("an assignment lag and its own shorter duration set when the crew is busy", () => {
  // A1 uses R1 only in its last 2 of 6 days; A2 (2 days) fits in the first 4
  const x = xer({ tasks: [task("1", 6), task("2", 2)], assigns: [{ ...use("1", "1", "R1", 1, 2), relag_drtn_hr_cnt: 32 }, use("2", "2", "R1")] });
  assert.equal(level(x).activities.length, 0);
});

test("no limits, no levelling: dates equal the CPM run; a huge limit too", () => {
  const spec = { tasks: [task("1", 5), task("2", 3), task("3", 2)], preds: [fs("1", "1", "3")], assigns: [use("1", "1", "R1"), use("2", "2", "R1"), use("3", "3", "R1")] };
  const x = xer({ ...spec, limits: { R1: 0 } });
  const r = level(x);
  assert.equal(r.resources.length, 0);
  assert.equal(r.settings.skipped.noLimit, 1);
  const big = level(xer(spec), { limitScale: { "*": 1e6 } });
  const cpm = schedule(xer(spec));
  for (const [id, v] of cpm.tasks) assert.equal(big.result.tasks.get(id).ef, v.ef);
});

test("a limit of 1 against far more use is warned as P6's default", () => {
  const tasks = [1, 2, 3, 4].map((i) => task(String(i), 2));
  const r = level(xer({ tasks, assigns: tasks.map((t, i) => use(String(i), t.task_id, "R1")) }));
  assert.match(r.warnings[0], /P6's default/);
  assert.equal(r.levelledFinish, "2025-12-10 17:00");
});

test("the example schedule: the drywall crew does one level after the other", async () => {
  const x = parseXer(EXAMPLE_XER);
  const r = await levelAsync(x);
  assert.equal(r.resources.length, 1);
  assert.equal(r.resources[0].code, "DRY");
  assert.equal(r.activities.length >= 1, true);
  assert.ok(r.extensionDays >= 8);
  assert.equal(r.resources[0].selfCheckHours, 0);
  const csv = levelCsv(r);
  assert.match(csv.split("\r\n")[0], /^activity_id,name,early_start/);
  assert.match(csv, /A11[23]0/);
});
