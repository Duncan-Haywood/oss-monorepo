import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { assess } from "./dcma.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { ribbon, ribbonOptions, ribbonText, ribbonCsv, ribbonHtml } from "./ribbon.mjs";

const WEEK = "(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()((0||0(s|08:00|f|17:00)())))(0||3()((0||0(s|08:00|f|17:00)())))(0||4()((0||0(s|08:00|f|17:00)())))(0||5()((0||0(s|08:00|f|17:00)())))(0||6()((0||0(s|08:00|f|17:00)())))(0||7()())))(0||Exceptions()())))";
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
const task = (id, wbs, extra = {}) => ({ task_id: id, proj_id: "1", wbs_id: wbs, clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: id, task_name: `Activity ${id}`, remain_drtn_hr_cnt: 40, target_drtn_hr_cnt: 40, ...extra });
let n = 0;
const link = (succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: String(++n), task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });

// WBS: project node 10 > CIVIL 11 (> FDN 13), ELEC 12. Responsibility code:
// A1-A3 by the civil sub, E1-E3 by the electrical sub, F unassigned.
// Electrical work carries a lead (E2 <- E1, -8 h) and a hard constraint (E3).
function fixture() {
  const tasks = [
    task("S", "11", { task_type: "TT_Mile", remain_drtn_hr_cnt: 0, target_drtn_hr_cnt: 0 }),
    task("A1", "13"), task("A2", "13"), task("A3", "11"),
    task("E1", "12"), task("E2", "12"), task("E3", "12", { cstr_type: "CS_MSO", cstr_date: "2025-12-29 08:00" }),
    task("F", "11", { task_type: "TT_FinMile", remain_drtn_hr_cnt: 0, target_drtn_hr_cnt: 0 }),
  ];
  const preds = [link("A1", "S"), link("A2", "A1"), link("A3", "A2"), link("E1", "A1"), link("E2", "E1", "PR_FS", -8), link("E3", "E2"), link("F", "A3"), link("F", "E3")];
  return parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00" }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    PROJWBS: [
      { wbs_id: "10", proj_id: "1", proj_node_flag: "Y", wbs_short_name: "TEST", seq_num: 0 },
      { wbs_id: "11", proj_id: "1", proj_node_flag: "N", parent_wbs_id: "10", wbs_short_name: "CIV", wbs_name: "Civil", seq_num: 1 },
      { wbs_id: "12", proj_id: "1", proj_node_flag: "N", parent_wbs_id: "10", wbs_short_name: "ELE", wbs_name: "Electrical", seq_num: 2 },
      { wbs_id: "13", proj_id: "1", proj_node_flag: "N", parent_wbs_id: "11", wbs_short_name: "FDN", wbs_name: "Foundations", seq_num: 1 },
    ],
    TASK: tasks, TASKPRED: preds,
    ACTVTYPE: [{ actv_code_type_id: "T1", actv_code_type: "Responsibility", actv_code_type_scope: "AS_Global", seq_num: 1 }],
    ACTVCODE: [{ actv_code_id: "V1", actv_code_type_id: "T1", short_name: "CIV", actv_code_name: "Civil sub", seq_num: 1 }, { actv_code_id: "V2", actv_code_type_id: "T1", short_name: "ELEC", actv_code_name: "Electrical sub", seq_num: 2 }],
    TASKACTV: [["A1", "V1"], ["A2", "V1"], ["A3", "V1"], ["E1", "V2"], ["E2", "V2"], ["E3", "V2"]].map(([t, v]) => ({ task_id: t, actv_code_type_id: "T1", actv_code_id: v, proj_id: "1" })),
  }));
}

const sums = (rb, report) => {
  for (const c of rb.columns) {
    const pc = report.checks.find((x) => x.id === c.id);
    assert.equal(rb.groups.reduce((a, g) => a + g.cells[c.id].count, 0), pc.count, `point ${c.id} count`);
  }
};

test("WBS ribbon: each node scored on its own activities, worst first", () => {
  const xer = fixture();
  const r = assess(xer);
  const rb = ribbon(xer, r, { by: "wbs" });
  assert.equal(rb.label, "WBS");
  assert.deepEqual(rb.groups.map((g) => g.code), ["ELE", "CIV"]);
  const ele = rb.groups[0], civ = rb.groups[1];
  assert.equal(ele.population, 3);
  assert.deepEqual([ele.cells[2].count, ele.cells[2].pass], [1, false]); // the lead
  assert.deepEqual([ele.cells[5].count, ele.cells[5].total, ele.cells[5].value, ele.cells[5].pass], [1, 3, 33.3, false]);
  assert.equal(civ.cells[2].count, 0);
  assert.equal(civ.cells[5].pass, true);
  assert.equal(civ.population, 5); // S, A1, A2, A3, F
  sums(rb, r);
});

test("WBS level 2 splits Civil into Foundations and the work filed on Civil itself", () => {
  const xer = fixture();
  const r = assess(xer);
  const rb = ribbon(xer, r, { by: "wbs", level: 2 });
  const codes = rb.groups.map((g) => g.code).sort();
  assert.deepEqual(codes, ["CIV", "CIV.FDN", "ELE"]);
  assert.equal(rb.groups.find((g) => g.code === "CIV.FDN").population, 2);
  sums(rb, r);
});

test("activity-code ribbon: by name or id, unassigned work grouped apart", () => {
  const xer = fixture();
  const r = assess(xer);
  for (const by of ["Responsibility", "responsibility", "T1"]) {
    const rb = ribbon(xer, r, { by });
    assert.equal(rb.label, "Responsibility");
    assert.equal(rb.groups[0].name, "Electrical sub");
    assert.ok(rb.groups.some((g) => g.name === "(no Responsibility)"));
    sums(rb, r);
  }
  assert.throws(() => ribbon(xer, r, { by: "Area" }), /no activity code type "Area".*Responsibility/);
  assert.deepEqual(ribbonOptions(xer, r.project.id), { wbsLevels: 2, codes: [{ id: "T1", name: "Responsibility", hierarchical: false }] });
});

test("project row equals the project-wide checks; relationship points use the successor", () => {
  const xer = fixture();
  const r = assess(xer);
  const rb = ribbon(xer, r, { by: "wbs" });
  for (const c of rb.columns) {
    const pc = r.checks.find((x) => x.id === c.id);
    assert.equal(rb.project[c.id].pass, pc.pass, `point ${c.id}`);
  }
  // the lead E1 -> E2 is counted under E2's group
  assert.equal(rb.groups.find((g) => g.code === "ELE").cells[2].count, 1);
});

test("the example schedule: group counts add up to the project's", () => {
  const xer = parseXer(EXAMPLE_XER);
  const r = assess(xer);
  const o = ribbonOptions(xer, r.project.id);
  for (const by of ["wbs", ...o.codes.map((c) => c.id)]) sums(ribbon(xer, r, { by }), r);
});

test("outputs: text, CSV safe against formulas, HTML escaped; JSON of the report unchanged", () => {
  const xer = fixture();
  const r = assess(xer);
  assert.equal(Object.keys(r).includes("populations"), false);
  const rb = ribbon(xer, r, { by: "wbs" });
  rb.groups[0].name = "=HYPERLINK(\"x\")<b>";
  assert.match(ribbonText(rb), /DCMA 14-point by WBS/);
  assert.match(ribbonCsv(rb), /'=HYPERLINK/);
  const h = ribbonHtml(rb);
  assert.match(h, /&lt;b&gt;/);
  assert.doesNotMatch(h, /<b>/);
});
