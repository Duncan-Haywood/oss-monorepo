import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { gantt, ganttCsv, ganttText, visibleRows } from "./gantt.mjs";
import { codeTypes, findCodeType, codeLevel } from "./actvcodes.mjs";

// The network of gantt.test.mjs (D1 done -> A -> B -> END, L a level of
// effort, S the WBS summary of Design), with activity codes added:
//   Responsibility (project): GC (seq 2) and ELEC (seq 1); A and B are GC,
//     END is ELEC, D1, L and S hold none.
//   Area (global, nested): Building 1 > Level 2; A is Level 2, B is Building 1.
//   Other project's type: never offered.
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
const task = (id, code, hours, wbs, extra = {}) => ({
  task_id: id, proj_id: "1", wbs_id: wbs, clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart",
  task_code: code, task_name: `Activity ${code}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const link = (id, succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
// WBS: project node 1 > Civil (2, seq 20) and Design (3, seq 10) > Design/Detail (4)
// D1 (16 h, done) -> A (24 h) -> B (40 h) -> END; L is a level of effort with
// A as its SS predecessor and B as its FF successor; S is the WBS summary of
// Design.
const CODES = {
  ACTVTYPE: [
    { actv_code_type_id: "10", actv_short_len: 8, seq_num: 1, actv_code_type: "Responsibility", proj_id: "1", actv_code_type_scope: "AS_Project" },
    { actv_code_type_id: "20", actv_short_len: 8, seq_num: 5, actv_code_type: "Area", proj_id: "", actv_code_type_scope: "AS_Global" },
    { actv_code_type_id: "30", actv_short_len: 8, seq_num: 0, actv_code_type: "Someone else's", proj_id: "99", actv_code_type_scope: "AS_Project" },
  ],
  ACTVCODE: [
    { actv_code_id: "101", parent_actv_code_id: "", actv_code_type_id: "10", actv_code_name: "General contractor", short_name: "GC", seq_num: 2 },
    { actv_code_id: "102", parent_actv_code_id: "", actv_code_type_id: "10", actv_code_name: "Electrical sub", short_name: "ELEC", seq_num: 1 },
    { actv_code_id: "201", parent_actv_code_id: "", actv_code_type_id: "20", actv_code_name: "Building 1", short_name: "B1", seq_num: 1 },
    { actv_code_id: "202", parent_actv_code_id: "201", actv_code_type_id: "20", actv_code_name: "Level 2", short_name: "L2", seq_num: 1 },
  ],
  TASKACTV: [
    { task_id: "2", actv_code_type_id: "10", actv_code_id: "101", proj_id: "1" },
    { task_id: "3", actv_code_type_id: "10", actv_code_id: "101", proj_id: "1" },
    { task_id: "4", actv_code_type_id: "10", actv_code_id: "102", proj_id: "1" },
    { task_id: "2", actv_code_type_id: "20", actv_code_id: "202", proj_id: "1" },
    { task_id: "3", actv_code_type_id: "20", actv_code_id: "201", proj_id: "1" },
  ],
};
const NET = (codes = true) => parseXer(xerText({
  ...(codes ? CODES : {}),
  PROJECT: [{ proj_id: "1", proj_short_name: "GANTT", proj_name: "Gantt test", clndr_id: "C1", last_recalc_date: "2025-12-03 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "", critical_drtn_hr_cnt: 0, critical_path_type: "CT_TotFloat" }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: cal([2, 3, 4, 5, 6]) }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  PROJWBS: [
    { wbs_id: "1", proj_id: "1", parent_wbs_id: "", proj_node_flag: "Y", seq_num: 0, wbs_short_name: "GANTT", wbs_name: "Gantt test" },
    { wbs_id: "2", proj_id: "1", parent_wbs_id: "1", proj_node_flag: "N", seq_num: 20, wbs_short_name: "CIV", wbs_name: "Civil" },
    { wbs_id: "3", proj_id: "1", parent_wbs_id: "1", proj_node_flag: "N", seq_num: 10, wbs_short_name: "DES", wbs_name: "Design" },
    { wbs_id: "4", proj_id: "1", parent_wbs_id: "3", proj_node_flag: "N", seq_num: 1, wbs_short_name: "DET", wbs_name: "Detail" },
    { wbs_id: "5", proj_id: "1", parent_wbs_id: "1", proj_node_flag: "N", seq_num: 30, wbs_short_name: "EMPTY", wbs_name: "Nothing here" },
  ],
  TASK: [
    task("1", "D1", 0, "4", { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-02 17:00", target_drtn_hr_cnt: 16, target_start_date: "2025-12-01 08:00", target_end_date: "2025-12-02 17:00" }),
    task("2", "A", 24, "4"),
    task("3", "B", 40, "2"),
    task("4", "END", 0, "2", { task_type: "TT_FinMile" }),
    task("5", "L", 0, "2", { task_type: "TT_LOE" }),
    task("6", "S", 0, "3", { task_type: "TT_WBS" }),
  ],
  TASKPRED: [link("1", "2", "1"), link("2", "3", "2"), link("3", "4", "3"), link("4", "5", "2", "PR_SS"), link("5", "3", "5", "PR_FF")],
}));

const shape = (g) => g.rows.map((r) => `${"  ".repeat(r.depth)}${r.kind === "wbs" ? `[${r.name}] ${r.count}` : r.code}`);

test("code types: this project's and global ones, global first, then by seq_num", () => {
  const list = codeTypes(NET(), "1");
  assert.deepEqual(list.map((t) => [t.name, t.scope, t.assigned, t.hierarchical]), [["Area", "Global", 2, true], ["Responsibility", "Project", 3, false]]);
  assert.equal(findCodeType(NET(), "1", "  responsibility ").id, "10");
  assert.equal(findCodeType(NET(), "1", "20").name, "Area");
  assert.equal(findCodeType(NET(), "1", "Someone else's"), null);
  assert.deepEqual(codeTypes(NET(false), "1"), []);
});

test("grouped by one code: values in seq_num order, no value last, every activity once", () => {
  const g = gantt(NET(), { groupBy: ["Responsibility"] });
  assert.deepEqual(g.groupBy, ["Responsibility"]);
  assert.deepEqual(shape(g), ["[Electrical sub] 1", "  END", "[General contractor] 2", "  A", "  B", "[no Responsibility] 3", "  D1", "  S", "  L"]);
  const top = g.rows.filter((r) => r.kind === "wbs");
  const gc = top.find((r) => r.code === "GC");
  const a = g.rows.find((r) => r.code === "A"), b = g.rows.find((r) => r.code === "B");
  assert.equal(gc.start, a.start);
  assert.equal(gc.finish, b.finish);
  assert.equal(gc.critical, true);
  assert.equal(a.parent, gc.key);
  assert.equal(g.summary.wbs, 3);
  assert.match(ganttText(g), /in 3 groups \(Responsibility\)/);
  assert.match(ganttCsv(g), /\n0,code: Responsibility,GC,General contractor,/);
});

test("a nested code draws its tree; an activity holding a parent value sits above the child group", () => {
  const g = gantt(NET(), { groupBy: ["Area"] });
  assert.deepEqual(shape(g), ["[Building 1] 2", "  B", "  [Level 2] 1", "    A", "[no Area] 4", "  D1", "  S", "  L", "  END"]);
});

test("a code then the WBS; the WBS alone is the default chart", () => {
  const g = gantt(NET(), { groupBy: ["Responsibility", "wbs"] });
  // Design (seq 10) before Civil (seq 20), as in the WBS view
  assert.deepEqual(shape(g).slice(0, 9), ["[Electrical sub] 1", "  [Civil] 1", "    END", "[General contractor] 2", "  [Design] 1", "    [Detail] 1", "      A", "  [Civil] 1", "    B"]);
  assert.deepEqual(gantt(NET(), { groupBy: ["wbs"] }).rows, gantt(NET()).rows);
  assert.equal(gantt(NET(), { groupBy: ["wbs"] }).groupBy, null);
});

test("folding and filtering work on code groups", () => {
  const g = gantt(NET(), { groupBy: ["Area"] });
  const b1 = g.rows.find((r) => r.code === "B1");
  const none = g.rows.find((r) => r.name === "no Area");
  assert.deepEqual(visibleRows(g, { level: 1 }).map((r) => r.code || r.name), ["B1", "B", "L2", "no Area", "D1", "S", "L", "END"]);
  assert.deepEqual(visibleRows(g, { level: 1, collapsed: new Set([b1.key, none.key]) }).map((r) => r.code || r.name), ["B1", "no Area"]);
  assert.deepEqual(visibleRows(g, { level: 2 }).map((r) => r.code || r.name).slice(0, 4), ["B1", "B", "L2", "A"]);
  assert.deepEqual(visibleRows(g, { search: "Activity A" }).map((r) => r.code), ["B1", "L2", "A"]);
});

test("an unknown type is left out with a warning; a value the file lacks goes to no value", () => {
  const g = gantt(NET(), { groupBy: ["Phase"] });
  assert.equal(g.groupBy.length, 0);
  assert.ok(g.warnings.some((w) => /no activity code type "Phase"/.test(w)));
  assert.equal(g.rows.filter((r) => r.kind === "task").length, 6);
  const x = NET();
  x.tables.TASKACTV.push({ task_id: "1", actv_code_type_id: "10", actv_code_id: "999", proj_id: "1" });
  x.tables.TASKACTV.push({ task_id: "2", actv_code_type_id: "10", actv_code_id: "102", proj_id: "1" });
  const lv = codeLevel(x, "10", "1");
  assert.equal(lv.path("1"), null);
  assert.equal(lv.path("2")[0].code, "GC");
  assert.equal(lv.warnings.length, 2);
});
