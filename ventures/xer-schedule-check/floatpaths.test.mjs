import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { assess } from "./dcma.mjs";
import { longestPath, floatPaths, floatPathsCsv, finishActivity, drivingInto, targetBound, floatAgainst, relationshipFloat } from "./floatpaths.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h/day)
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
const link = (id, succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
const project = (tasks, preds, projExtra = {}) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "", ...projExtra }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  TASK: tasks,
  TASKPRED: preds,
}));
const codes = (res, ids) => [...ids].map((id) => res.model.tasks.get(id).code).sort();

// A (16 h) -> C (8 h) -> END ; B (8 h) -> C ; D (8 h) -> E (8 h) -> END ; F (4 h) -> END
// A drives C; B has 8 h before C; D-E is 8 h short of A-C; F 20 h short.
const NET = () => project([
  task("1", "A", 16), task("2", "B", 8), task("3", "C", 8), task("4", "D", 8), task("5", "E", 8), task("6", "F", 4),
  task("7", "END", 0, { task_type: "TT_FinMile" }),
], [
  link("1", "3", "1"), link("2", "3", "2"), link("3", "7", "3"), link("4", "5", "4"), link("5", "7", "5"), link("6", "7", "6"),
]);

test("longest path: every driving branch into the finish, nothing else", () => {
  const res = schedule(NET());
  // the fixture's calendar must parse: a malformed WEEK falls back to 24 hours
  // with only a warning, and every test here would pass without exercising it
  assert.deepEqual(res.warnings, []);
  assert.deepEqual(codes(res, longestPath(res, "1")), ["A", "C", "END"]);
  // two parallel chains that both drive the finish are both on it
  const two = project([task("1", "A", 16), task("2", "B", 16), task("3", "END", 0, { task_type: "TT_FinMile" })], [link("1", "3", "1"), link("2", "3", "2")]);
  const r2 = schedule(two);
  assert.deepEqual(codes(r2, longestPath(r2, "1")), ["A", "B", "END"]);
});

test("float paths: path 1 drives, later paths in order of float relative to the target", () => {
  const res = schedule(NET());
  const end = finishActivity(res, "1");
  assert.equal(res.model.tasks.get(end.id).code, "END");
  const fp = floatPaths(res, end.id);
  const ps = fp.paths.map((p) => [p.float, p.activities.map((a) => a.code)]);
  // ties on float go to the chain that finishes later (E before B)
  assert.deepEqual(ps, [[0, ["A", "C", "END"]], [8, ["D", "E"]], [8, ["B"]], [20, ["F"]]]);
  assert.equal(fp.unreached, 0);
  // the link a path member hands its time to
  assert.deepEqual(fp.paths[1].activities[0].link, { to: "E", type: "FS", lag: 0, float: 0 });
  assert.equal(fp.paths[1].activities[1].link.float, 8);
  // count caps the paths; the rest are reported as unreached
  const one = floatPaths(res, end.id, { count: 1 });
  assert.equal(one.paths.length, 1);
  assert.equal(one.unreached, 4);
  const csv = floatPathsCsv(fp).trim().split("\n");
  assert.equal(csv.length, 1 + 7);
  assert.match(csv[4], /^2,8\.00,D,Activity D,/);
  // a crafted name cannot run as a formula; a negative number stays a number
  const x = NET();
  x.tables.TASK.find((r) => r.task_code === "F").task_name = "=HYPERLINK(1)";
  const r2 = schedule(x);
  const line = floatPathsCsv(floatPaths(r2, finishActivity(r2, "1").id)).split("\n").find((l) => l.startsWith("4,"));
  assert.match(line, /,'=HYPERLINK\(1\),/);
});

test("relative float to an interim milestone that total float cannot see", () => {
  // MS is an interim milestone with a successor chain long enough that its own
  // total float is 0 through the finish; X feeds MS with 8 h to spare and also
  // feeds the long tail, so its total float says 0 while to MS it has 8 h.
  const x = project([
    task("1", "A", 16), task("2", "X", 8), task("3", "MS", 0, { task_type: "TT_FinMile" }), task("4", "TAIL", 40), task("5", "END", 0, { task_type: "TT_FinMile" }),
  ], [link("1", "3", "1"), link("2", "3", "2"), link("3", "4", "2"), link("4", "5", "3"), link("5", "5", "4")]);
  const res = schedule(x);
  const ms = res.model.tasks.get("3");
  const fp = floatPaths(res, ms.id);
  const byCode = Object.fromEntries(fp.paths.flatMap((p) => p.activities).map((a) => [a.code, a]));
  assert.equal(byCode.A.rf, 0);
  assert.equal(byCode.X.rf, 8);
  assert.equal(res.tasks.get("2").tf, 0); // on the TAIL chain, total float cannot tell
});

test("target bound seeded at the late finish never gives less float than the CPM", () => {
  const res = schedule(NET());
  const end = finishActivity(res, "1");
  const late = targetBound(res, end.id, res.tasks.get(end.id).lf);
  for (const [id, b] of late) assert.ok(res.tasks.get(id).tf <= floatAgainst(res, id, b) + 1e-9, res.model.tasks.get(id).code);
  assert.deepEqual(codes(res, drivingInto(res, [end.id])), ["A", "C", "END"]);
});

test("a started predecessor's SS lag is spent", () => {
  // A started, 16 h left, SS 8 h -> B (8 h) -> END; A also FS -> END.
  const x = project([
    task("1", "A", 16, { status_code: "TK_Active", act_start_date: "2025-11-27 08:00", remain_drtn_hr_cnt: 16 }),
    task("2", "B", 8), task("3", "END", 0, { task_type: "TT_FinMile" }),
  ], [link("1", "2", "1", "PR_SS", 8), link("2", "3", "2"), link("3", "3", "1")]);
  const res = schedule(x);
  const late = targetBound(res, "3", res.tasks.get("3").lf);
  for (const [id, b] of late) assert.ok(res.tasks.get(id).tf <= floatAgainst(res, id, b) + 1e-9);
});

test("assess reports the longest path against P6's own flag", () => {
  const x = NET();
  for (const r of x.tables.TASK) r.driving_path_flag = ["A", "C", "END", "F"].includes(r.task_code) ? "Y" : "N";
  const lp = assess(x).longestPath;
  assert.equal(lp.count, 3);
  assert.equal(lp.p6Flagged, 4);
  assert.equal(lp.agree, 3);
  assert.deepEqual(lp.onlyP6, ["F"]);
  assert.deepEqual(lp.onlyHere, []);
});

test("finished, summary and unscheduled targets give no paths", () => {
  const x = NET();
  x.tables.TASK.push(task("9", "LOE", 8, { task_type: "TT_LOE" }));
  const res = schedule(x);
  assert.equal(floatPaths(res, "9").target, null);
  assert.equal(floatPaths(res, "nope").paths.length, 0);
});

test("a path follows only the link that sets each predecessor's date", () => {
  // B (24 h) -> C (8 h) -> H (24 h) -FF+8-> END ; C -> E (8 h) -FS+8-> END ;
  // A (8 h) -> D (8 h) -> E ; D -> H. D's target-bound date is set by D -> H,
  // not D -> E, so the path through E stops at E and A-D is a path of its own.
  const p = project([
    task("1", "A", 8), task("2", "B", 24), task("3", "C", 8), task("4", "D", 8), task("5", "E", 8), task("8", "H", 24),
    task("9", "END", 0, { task_type: "TT_FinMile" }),
  ], [
    link("1", "3", "2"), link("2", "4", "1"), link("3", "5", "3"), link("4", "5", "4"), link("5", "8", "3"), link("6", "8", "4"),
    link("7", "9", "5", "PR_FS", 8), link("8", "9", "8", "PR_FF", 8),
  ]);
  const res = schedule(p);
  const fp = floatPaths(res, "9");
  assert.deepEqual(fp.paths.map((x) => [x.float, x.activities.map((a) => a.code)]), [[0, ["B", "C", "H", "END"]], [16, ["E"]], [16, ["A", "D"]]]);
  // the link's lag is reported in hours
  assert.deepEqual(fp.paths[1].activities[0].link, { to: "END", type: "FS", lag: 8, float: 16 });
});

test("float path ties on relative float go to the predecessor that finishes later", () => {
  const p = project([
    task("1", "A", 8), task("3", "C", 8), task("4", "D", 8), task("5", "E", 16), task("6", "END", 0, { task_type: "TT_FinMile" }),
  ], [
    link("1", "3", "1", "PR_SS"), link("2", "4", "1"), link("3", "4", "3", "PR_SS"), link("4", "5", "3"),
    link("5", "5", "4", "PR_SS"), link("6", "6", "1", "PR_SS"), link("7", "6", "4"), link("8", "6", "5"),
  ]);
  const res = schedule(p);
  const fp = floatPaths(res, "6");
  assert.deepEqual(fp.paths.map((x) => [x.float, x.activities.map((a) => a.code)]), [[0, ["A", "D", "E", "END"]], [0, ["C"]]]);
});

test("relationship float is null when either end has no dates", () => {
  const res = schedule(NET());
  const rel = res.model.tasks.get("3").preds.find((r) => r.predId === "1");
  assert.equal(relationshipFloat(res, rel), 0);
  const noPred = { ...res, tasks: new Map([...res.tasks].filter(([id]) => id !== "1")) };
  assert.equal(relationshipFloat(noPred, rel), null);
  const noSucc = { ...res, tasks: new Map([...res.tasks].filter(([id]) => id !== "3")) };
  assert.equal(relationshipFloat(noSucc, rel), null);
});
