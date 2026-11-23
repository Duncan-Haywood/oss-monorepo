import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { EXAMPLE_XER, EXAMPLE_PREV_XER } from "./example.mjs";
import { gao, gaoText, gaoCsv, gaoHtml, gaoTableHtml, scoreOf, rollUp, PRACTICES } from "./gao.mjs";

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
const task = (id, hours, extra = {}) => ({ task_id: id, proj_id: "1", wbs_id: "11", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: id, task_name: `Activity ${id}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, target_end_date: "2026-01-30 17:00", ...extra });
let linkN = 0;
const link = (succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: String(++linkN), task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
// S -> A -> B -> C -> F, every activity in WBS 11 under the project node 10,
// resourced, with a limit: a schedule that passes every file test
function clean(over = {}) {
  const tasks = over.tasks || [
    task("S", 0, { task_type: "TT_Mile" }), task("A", 40), task("B", 40), task("C", 40), task("F", 0, { task_type: "TT_FinMile" }),
  ];
  const preds = over.preds || [link("A", "S"), link("B", "A"), link("C", "B"), link("F", "C")];
  return parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00" }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    PROJWBS: [{ wbs_id: "10", proj_id: "1", proj_node_flag: "Y", wbs_short_name: "TEST" }, { wbs_id: "11", proj_id: "1", proj_node_flag: "N", parent_wbs_id: "10", wbs_short_name: "WORK" }],
    TASK: tasks, TASKPRED: preds,
    RSRC: [{ rsrc_id: "R1", rsrc_short_name: "CREW", rsrc_name: "Crew", rsrc_type: "RT_Labor" }],
    RSRCRATE: [{ rsrc_rate_id: "1", rsrc_id: "R1", max_qty_per_hr: 1 }],
    TASKRSRC: tasks.filter((t) => t.task_type === "TT_Task").map((t, i) => ({ taskrsrc_id: String(i + 1), task_id: t.task_id, proj_id: "1", rsrc_id: "R1", remain_qty: t.remain_drtn_hr_cnt })),
    ...(over.extraTables || {}),
  }));
}
const testOf = (r, id) => r.practices.flatMap((p) => p.tests).find((t) => t.id === id);
const practice = (r, n) => r.practices.find((p) => p.n === n);

test("ratings: share of tests passed to GAO's five levels; characteristics average", () => {
  assert.equal(scoreOf(4, 4), 5);
  assert.equal(scoreOf(3, 4), 4);
  assert.equal(scoreOf(2, 4), 3);
  assert.equal(scoreOf(1, 4), 2);
  assert.equal(scoreOf(0, 4), 1);
  assert.equal(scoreOf(0, 0), null);
  assert.equal(rollUp([5, 4, 3]), 4);
  assert.equal(rollUp([5, 4]), 5); // 4.5 to the nearer level, halves up
  assert.equal(rollUp([5, null]), 5);
  assert.equal(rollUp([null]), null);
});

test("the ten practices sit under GAO's four characteristics", () => {
  const by = (c) => PRACTICES.filter((p) => p.characteristic === c).map((p) => p.n);
  assert.deepEqual(by("Comprehensive"), [1, 3, 4]);
  assert.deepEqual(by("Well-constructed"), [2, 6, 7]);
  assert.deepEqual(by("Credible"), [5, 8]);
  assert.deepEqual(by("Controlled"), [9, 10]);
});

test("a clean schedule meets every practice the file can show; risk analysis is not rated", () => {
  const r = gao(clean());
  for (const p of r.practices) {
    if (p.n === 8) { assert.equal(p.score, null); assert.equal(p.rating, "Not assessed"); continue; }
    for (const t of p.tests) assert.ok(t.pass, `practice ${p.n}: ${t.name} = ${t.value}`);
    assert.equal(p.rating, "Fully met", `practice ${p.n}`);
  }
  assert.equal(r.overall.reliable, true);
  assert.equal(r.characteristics.find((c) => c.name === "Credible").practices.length, 2);
});

test("planted faults each fail their own test, by name", () => {
  // an activity filed on the project node, a repeated name, a zero-duration task
  let r = gao(clean({ tasks: [
    task("S", 0, { task_type: "TT_Mile" }), task("A", 40, { wbs_id: "10" }), task("B", 40, { task_name: "Activity A" }), task("C", 40), task("Z", 0), task("F", 0, { task_type: "TT_FinMile" }),
  ], preds: [link("A", "S"), link("B", "A"), link("C", "B"), link("Z", "C"), link("F", "Z")] }));
  assert.deepEqual(testOf(r, "wbs").items.map((i) => i.code), ["A"]);
  assert.deepEqual(testOf(r, "names").items.map((i) => i.code).sort(), ["A", "B"]);
  assert.deepEqual(testOf(r, "zero-duration").items.map((i) => i.code), ["Z"]);
  assert.equal(practice(r, 1).rating, "Minimally met");

  // a lag and a hard constraint on the driving path
  r = gao(clean({ tasks: [
    task("S", 0, { task_type: "TT_Mile" }), task("A", 40), task("B", 40, { cstr_type: "CS_MSO", cstr_date: "2026-01-05 08:00" }), task("C", 40), task("F", 0, { task_type: "TT_FinMile" }),
  ], preds: [link("A", "S"), link("B", "A"), link("C", "B", "PR_FS", 16), link("F", "C")] }));
  assert.deepEqual(testOf(r, "path-lags").items.map((i) => i.code), ["B -> C"]);
  assert.deepEqual(testOf(r, "path-constraints").items.map((i) => i.code), ["B"]);
  assert.match(testOf(r, "path-constraints").items[0].why, /^Start on 2026-01-05/);
  assert.equal(testOf(r, "path-continuous").pass, false); // the path starts at B's constraint, not at the data date

  // a finish milestone nothing drives
  r = gao(clean({ tasks: [
    task("S", 0, { task_type: "TT_Mile" }), task("A", 40), task("B", 40), task("C", 40), task("M", 0, { task_type: "TT_FinMile", task_name: "Dry-in" }), task("F", 0, { task_type: "TT_FinMile" }),
  ], preds: [link("A", "S"), link("B", "A"), link("C", "B"), link("F", "C")] }));
  assert.deepEqual(testOf(r, "milestones-linked").items.map((i) => i.code), ["M"]);
});

test("resources: work with no assignment, and a resource with no limit", () => {
  const x = clean();
  x.tables.RSRCRATE = [];
  x.tables.TASKRSRC = x.tables.TASKRSRC.filter((a) => a.task_id !== "B");
  const r = gao(x);
  assert.equal(testOf(r, "dcma-10").count, 1);
  assert.deepEqual(testOf(r, "limits").items.map((i) => i.code), ["CREW"]);
  assert.equal(practice(r, 3).rating, "Not met");
});

test("three-point ranges kept in UDFs rate the risk practice on its inputs", () => {
  const udf = {
    UDFTYPE: [{ udf_type_id: "900", table_name: "TASK", udf_type_label: "Optimistic Duration", logical_data_type: "FT_FLOAT_2_DECIMALS" }, { udf_type_id: "901", table_name: "TASK", udf_type_label: "Pessimistic Duration", logical_data_type: "FT_FLOAT_2_DECIMALS" }],
    UDFVALUE: ["A", "B", "C"].flatMap((id) => [{ udf_type_id: "900", fk_id: id, proj_id: "1", udf_number: "4" }, { udf_type_id: "901", fk_id: id, proj_id: "1", udf_number: "8" }]),
  };
  const r = gao(clean({ extraTables: udf }));
  const p = practice(r, 8);
  assert.equal(p.total, 1);
  assert.equal(p.rating, "Fully met");
  assert.match(p.tests[0].value, /^3 of 3/);
});

test("practice 10 against a baseline file: missed tasks and BEI by activity ID", () => {
  const r = gao(parseXer(EXAMPLE_XER), { baseline: parseXer(EXAMPLE_PREV_XER) });
  assert.equal(r.baseline, true);
  const m = testOf(r, "baseline-match");
  assert.match(m.value, /0 added, 1 deleted/); // A1205 Final clean was in the baseline
  assert.deepEqual(m.items.map((i) => i.code), ["A1205"]);
  const missed = testOf(r, "missed-baseline");
  assert.equal(missed.count, 4);
  assert.deepEqual(missed.items.map((i) => i.code).sort(), ["A1010", "A1020", "A1030", "A1050"]);
  assert.equal(testOf(r, "bei-baseline").value, "0.5"); // 2 finished of 4 due
  // without one, the file's planned dates stand in, and the note says so
  const own = gao(parseXer(EXAMPLE_XER));
  assert.ok(testOf(own, "dcma-11"));
  assert.match(practice(own, 10).note, /No baseline file given/);
});

test("text, CSV and HTML carry every test; HTML escapes names", () => {
  const x = clean({ tasks: [
    task("S", 0, { task_type: "TT_Mile" }), task("A", 40, { task_name: "<b>x</b>" }), task("B", 40, { task_name: "<b>x</b>" }), task("C", 40), task("F", 0, { task_type: "TT_FinMile" }),
  ] });
  const r = gao(x);
  const txt = gaoText(r);
  for (const p of r.practices) assert.ok(txt.includes(p.name), p.name);
  const csv = gaoCsv(r);
  assert.equal(csv.split("\r\n")[0], "practice,practice_name,rating,test,value,threshold,pass,activity_id,activity_name,why");
  assert.ok(csv.includes("Activities with a unique name"));
  const html = gaoHtml(r, { by: "Reviewer & Co" });
  assert.ok(!html.includes("<b>x</b>"));
  assert.ok(html.includes("&lt;b&gt;x&lt;/b&gt;"));
  assert.ok(html.includes("Reviewer &amp; Co"));
  assert.ok(gaoTableHtml(r).includes("<details"));
});
