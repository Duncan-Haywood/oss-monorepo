import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, formatDate } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { gantt, spanDates, visibleRows, ganttSvg, ganttHtml, ganttCsv, ganttText } from "./gantt.mjs";
import { EXAMPLE_XER } from "./example.mjs";

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
const NET = (dur = { A: 24, B: 40 }) => parseXer(xerText({
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
    task("2", "A", dur.A, "4"),
    task("3", "B", dur.B, "2"),
    task("4", "END", 0, "2", { task_type: "TT_FinMile" }),
    task("5", "L", 0, "2", { task_type: "TT_LOE" }),
    task("6", "S", 0, "3", { task_type: "TT_WBS" }),
  ],
  TASKPRED: [link("1", "2", "1"), link("2", "3", "2"), link("3", "4", "3"), link("4", "5", "2", "PR_SS"), link("5", "3", "5", "PR_FF")],
}));
const F = (m) => formatDate(m);

test("level of effort spans from its SS predecessor's start to its FF successor's finish", () => {
  const xer = NET();
  const r = schedule(xer);
  const s = spanDates(r, xer);
  const l = s.get("5");
  // A starts Wed 3 Dec 08:00 (data date), B ends 24 + 40 = 64 h later: Fri 12 Dec 17:00
  assert.equal(F(l.es), "2025-12-03 08:00");
  assert.equal(F(l.ef), "2025-12-12 17:00");
  assert.equal(l.rule, "loe");
});

test("WBS summary spans its branch, actual dates included, and a longer activity moves it", () => {
  const xer = NET();
  const s = spanDates(schedule(xer), xer).get("6");
  assert.equal(F(s.es), "2025-12-01 08:00"); // D1's actual start, in Design/Detail
  assert.equal(F(s.ef), "2025-12-05 17:00"); // A: 24 h from Wed 08:00
  const longer = NET({ A: 32, B: 40 });
  assert.equal(F(spanDates(schedule(longer), longer).get("6").ef), "2025-12-08 17:00");
});

test("rows follow the WBS tree in seq_num order, roll up, and drop empty nodes", () => {
  const g = gantt(NET());
  const keys = g.rows.map((r) => (r.kind === "wbs" ? `W:${r.code}` : r.code));
  assert.deepEqual(keys, ["W:DES", "S", "W:DET", "D1", "A", "W:CIV", "L", "B", "END"]);
  const des = g.rows.find((r) => r.code === "DES");
  assert.equal(F(des.start), "2025-12-01 08:00");
  assert.equal(F(des.finish), "2025-12-05 17:00");
  assert.equal(des.count, 3);
  assert.equal(g.rows.find((r) => r.code === "D1").status, "complete");
  assert.equal(g.rows.find((r) => r.code === "L").span, "LOE");
  assert.ok(g.rows.find((r) => r.code === "B").critical);
  assert.equal(g.summary.loe, 1);
  assert.equal(g.summary.wbsSummary, 1);
  assert.equal(g.baseline, "planned");
  assert.ok(g.warnings.some((w) => /planned dates/.test(w)));
});

test("a baseline file gives the finish variance in working days", () => {
  const g = gantt(NET(), { baseline: NET({ A: 24, B: 24 }) });
  const b = g.rows.find((r) => r.code === "B");
  assert.equal(b.variance, 2); // 40 h against 24 h: two 8-hour days later
  assert.equal(g.rows.find((r) => r.code === "A").variance, 0);
  assert.equal(g.summary.late, 3); // B, END and the LOE tied to B
  assert.match(ganttText(g), /\+2 d {2}B/);
});

test("folding, levels, critical-only and search pick the rows", () => {
  const g = gantt(NET());
  assert.deepEqual(visibleRows(g, { level: 1 }).map((r) => r.code), ["DES", "S", "DET", "CIV", "L", "B", "END"]);
  assert.deepEqual(visibleRows(g, { level: 0 }).map((r) => r.code), ["DES", "CIV"]);
  assert.deepEqual(visibleRows(g, { collapsed: new Set(["3"]) }).map((r) => r.code), ["DES", "CIV", "L", "B", "END"]);
  assert.deepEqual(visibleRows(g, { level: 0, expanded: new Set(["2"]) }).map((r) => r.code), ["DES", "CIV", "L", "B", "END"]);
  assert.deepEqual(visibleRows(g, { search: "activity a" }).map((r) => r.code), ["DES", "DET", "A"]);
  assert.ok(visibleRows(g, { critical: true }).every((r) => r.kind === "wbs" || r.critical));
});

test("the SVG, printable page and CSV carry every row, escaped", () => {
  const xer = NET();
  xer.tables.TASK[1].task_name = "<script>x</script>";
  const g = gantt(xer);
  const svg = ganttSvg(g, { links: true });
  assert.ok(svg.startsWith("<svg"));
  assert.ok(!svg.includes("<script>"));
  assert.equal((svg.match(/class="row /g) || []).length, g.rows.length);
  assert.match(svg, /data date/);
  const html = ganttHtml(g);
  assert.match(html, /Not professional advice/);
  const csv = ganttCsv(g).trim().split("\n");
  assert.equal(csv.length, g.rows.length + 1);
});

test("the bundled example draws with no WBS table and every activity once", () => {
  const xer = parseXer(EXAMPLE_XER);
  const g = gantt(xer);
  assert.equal(g.rows.filter((r) => r.kind === "task").length, xer.tables.TASK.length);
  assert.equal(g.summary.wbs, 0);
  assert.ok(ganttSvg(g).length > 1000);
});
