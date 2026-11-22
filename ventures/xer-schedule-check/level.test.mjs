import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { level, levelAsync, levelCsv, _internal } from "./level.mjs";
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
    // a limit is a number, or [[start_date, max], ...] for one that changes over time
    RSRCRATE: Object.entries(limits).flatMap(([k, v]) => (Array.isArray(v) ? v : [["2025-01-01 00:00", v]]).map(([from, max]) => ({ rsrc_id: k, max_qty_per_hr: max, start_date: from }))).map((r, i) => ({ rsrc_rate_id: String(i + 1), ...r })),
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
  // A2's 3 days beside A1: 24 working hours over, not the 72 elapsed
  assert.equal(r.resources[0].before.overHours, 24);
  assert.equal(r.resources[0].after.overHours, 0);
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
  // left over the limit on purpose, so the self-check (must be 0) and the
  // bound leave it out; the table still shows the overload, in working hours
  assert.equal(r.resources[0].selfCheckHours, 0);
  assert.equal(r.resources[0].left, 1);
  assert.equal(r.lowerBound, null);
  assert.equal(r.resources[0].after.overHours, 40);
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

test("started work that alone passes the limit is seen before anything placed at the same instant", () => {
  // A1 started, 1 day left at the data date, using 3 per hour against a limit of 1
  const x = xer({
    tasks: [task("2", 2, { task_code: "A0" }), task("1", 1, { status_code: "TK_Active", act_start_date: "2025-11-28 08:00", task_code: "Z1" })],
    assigns: [use("1", "1", "R1", 3), use("2", "2", "R1")],
  });
  const r = level(x);
  assert.equal(r.activities.find((a) => a.code === "A0").levelledStart, "2025-12-02 08:00");
  assert.equal(r.resources[0].selfCheckHours, 0);
});

test("the lower bound holds when the limit changes over time: a crew of two that drops to one later", () => {
  // two 5-day activities fit side by side in week one while the crew is two;
  // pricing all 10 crew-days at the later limit of 1 would claim no levelling
  // can finish before 12-12, but this schedule finishes 12-05
  const x = xer({ tasks: [task("1", 5), task("2", 5)], assigns: [use("1", "1", "R1"), use("2", "2", "R1")], limits: { R1: [["2025-01-01 00:00", 2], ["2025-12-08 08:00", 1]] } });
  const r = level(x);
  assert.equal(r.levelledFinish, "2025-12-05 17:00");
  assert.equal(r.activities.length, 0);
  assert.ok(r.lowerBound.date <= r.levelledFinish, `bound ${r.lowerBound.date} after a finish levelling reached`);
  assert.equal(r.lowerBound.date, "2025-12-05 17:00");
  // a limit that rises later: one crew for week one, then two
  const up = level(xer({ tasks: [task("1", 5), task("2", 5)], assigns: [use("1", "1", "R1"), use("2", "2", "R1")], limits: { R1: [["2025-01-01 00:00", 1], ["2025-12-08 08:00", 2]] } }));
  // 5 crew-days in week one, the other 5 at two per hour: 2.5 days into week two
  assert.equal(up.lowerBound.date, "2025-12-10 12:00");
  assert.ok(up.lowerBound.date <= up.levelledFinish);
});

test("a period with no limit given (a zero row) gives no bound: the work could all fit in it", () => {
  const x = xer({ tasks: [task("1", 5), task("2", 5)], assigns: [use("1", "1", "R1"), use("2", "2", "R1")], limits: { R1: [["2025-01-01 00:00", 0], ["2025-12-08 08:00", 1]] } });
  assert.equal(level(x).lowerBound, null);
});

test("delay is reported in working days of the activity's calendar", () => {
  const x = xer({ tasks: [task("1", 5), task("2", 3)], assigns: [use("1", "1", "R1"), use("2", "2", "R1")] });
  const r = level(x);
  assert.equal(r.activities.length, 1);
  assert.equal(r.activities[0].delayDays, r.activities[0].code === "A2" ? 5 : 3);
});

test("settings: no float threshold in the file means keep 0 hours; a project with no options row of its own uses the first one", () => {
  const spec = { tasks: [task("1", 5), task("2", 5)], assigns: [use("1", "1", "R1"), use("2", "2", "R1")] };
  assert.equal(level(xer(spec)).settings.keepFloatHours, 0);
  const other = level(xer({ ...spec, opts: { proj_id: "99", level_within_float_flag: "Y" } }));
  assert.equal(other.settings.withinFloat, true);
});

test("work placed earlier than work already counted is still seen (spans kept in start order)", () => {
  // A1 is started and goes in first, but its crew only joins on day 3 (lag);
  // A2 then takes day 1; A3, also wanting day 1, has to see A2 and wait
  const x = xer({
    tasks: [task("1", 3, { status_code: "TK_Active", act_start_date: "2025-11-28 08:00" }), task("2", 1, { priority_type: "PT_Top" }), task("3", 1)],
    assigns: [{ ...use("1", "1", "R1", 1, 1), relag_drtn_hr_cnt: 16 }, use("2", "2", "R1"), use("3", "3", "R1")],
  });
  const r = level(x);
  assert.equal(dates(r, "A3")?.levelledStart, "2025-12-02 08:00");
  assert.equal(r.resources[0].after.peak, 1);
  assert.equal(r.resources[0].selfCheckHours, 0);
});

test("the self-check counts hours where placed work passes the limit, and only those", () => {
  const { Profile, movedOver } = _internal;
  const cal = { workBetween: (a, b) => b - a }; // every minute a working minute
  const prof = new Profile([{ from: -Infinity, max: 1 }, { from: 300, max: 2 }]);
  const sp = (s, e, rate = 1, fixed = false) => ({ s, e, rate, fixed });
  // back to back at the limit: nothing over, whatever order the ends and starts sort in
  assert.equal(movedOver([sp(120, 240), sp(0, 120), sp(240, 300), sp(300, 420, 2)], prof, cal), 0);
  // two placed spans overlapping for 60 minutes while the limit is 1: 1 hour
  assert.equal(movedOver([sp(60, 180), sp(0, 120)], prof, cal), 1);
  // after the limit rises to 2 the same overlap is within it
  assert.equal(movedOver([sp(360, 480), sp(300, 420)], prof, cal), 0);
  // fixed (started) work alone over the limit is not the levelling's doing
  assert.equal(movedOver([sp(0, 120, 3, true)], prof, cal), 0);
  // placed work beside it is: 2 hours
  assert.equal(movedOver([sp(0, 120, 3, true), sp(0, 120)], prof, cal), 2);
});

test("property: on random schedules with limits that change over time, the bound never beats the levelled finish and the self-check is 0", () => {
  // seeded, so a failure reproduces; 60 small schedules
  let seed = 20261119;
  const rnd = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  const days = ["2025-01-01 00:00", "2025-12-03 08:00", "2025-12-08 08:00", "2025-12-15 13:00", "2026-01-05 08:00"];
  for (let c = 0; c < 60; c++) {
    const n = 2 + rnd(6);
    const tasks = Array.from({ length: n }, (_, i) => task(String(i + 1), 1 + rnd(5)));
    const preds = [];
    for (let i = 1; i < n; i++) if (rnd(3) === 0) preds.push(fs(String(100 + i), String(1 + rnd(i)), String(i + 1)));
    const assigns = tasks.map((t, i) => use(String(i + 1), t.task_id, "R1", 1 + rnd(2)));
    const periods = 1 + rnd(3);
    const lim = days.slice(0, periods).map((d) => [d, 2 + rnd(3)]);
    const withinFloat = rnd(4) === 0;
    const r = level(xer({ tasks, preds, assigns, limits: { R1: lim }, opts: withinFloat ? { level_within_float_flag: "Y" } : {} }));
    const res = r.resources[0];
    if (!res) continue;
    const label = JSON.stringify({ c, n, lim, withinFloat });
    assert.equal(res.selfCheckHours, 0, label);
    if (r.lowerBound) {
      assert.ok(r.left.length === 0, label);
      assert.ok(r.lowerBound.date <= r.levelledFinish, `${label}: bound ${r.lowerBound.date} after levelled ${r.levelledFinish}`);
    }
  }
});

test("a priority_type named after an Object.prototype key ranks as Normal, not as a tie with everything", () => {
  const cmp = _internal.priorityCmp("priority_type,ASC");
  const r = (p) => ({ row: { priority_type: p } });
  // unknown values rank as PT_Normal (3): after PT_Top, before PT_Low
  for (const odd of ["constructor", "toString", "__proto__", "valueOf"]) {
    assert.ok(cmp(r("PT_Top"), r(odd)) < 0, odd);
    assert.ok(cmp(r(odd), r("PT_Low")) < 0, odd);
    assert.equal(cmp(r(odd), r("PT_Normal")), 0, odd);
  }
});
