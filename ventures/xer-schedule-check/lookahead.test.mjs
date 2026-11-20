import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { lookahead, lookaheadText, lookaheadCsv, lookaheadHtml } from "./lookahead.mjs";
import { EXAMPLE_XER } from "./example.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h/day); 2025-12-01 is a Monday
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
  task_id: id, proj_id: "1", wbs_id: "11", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart",
  task_code: code, task_name: `Activity ${code}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra,
});
const link = (id, succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
const project = (tasks, preds, extra = {}) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", proj_name: "Test job", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  PROJWBS: [{ wbs_id: "10", proj_id: "1", parent_wbs_id: "", proj_node_flag: "Y", wbs_name: "Test job" }, { wbs_id: "11", proj_id: "1", parent_wbs_id: "10", proj_node_flag: "N", wbs_name: "Level 1" }, { wbs_id: "12", proj_id: "1", parent_wbs_id: "11", proj_node_flag: "N", wbs_name: "Drywall" }],
  TASK: tasks,
  TASKPRED: preds,
  ...extra,
}));
const by = (la) => Object.fromEntries(la.activities.map((a) => [a.code, a]));

test("window, bars and make-ready on a small job", () => {
  // DONE finished; A started (16 h left) -> FS B (8 h); DONE -> FS C (24 h);
  // B -> FS D (8 h); FAR (80 h) after D -> FS LATE (8 h) past the window;
  // OPEN has no predecessor; TIE has only an FF link from A
  const x = project([
    task("1", "DONE", 0, { status_code: "TK_Complete", act_start_date: "2025-11-24 08:00", act_end_date: "2025-11-28 17:00" }),
    task("2", "A", 16, { status_code: "TK_Active", act_start_date: "2025-11-26 08:00" }),
    task("3", "B", 8), task("4", "C", 24, { wbs_id: "12" }), task("5", "D", 8), task("6", "FAR", 80), task("7", "LATE", 8),
    task("8", "OPEN", 8), task("9", "TIE", 8), task("10", "MS", 0, { task_type: "TT_FinMile" }),
  ], [link("1", "3", "2"), link("2", "4", "1"), link("3", "5", "3"), link("4", "6", "5"), link("5", "7", "6"), link("6", "9", "2", "PR_FF"), link("7", "10", "5")]);
  const la = lookahead(x, { weeks: 1 });
  const a = by(la);
  assert.equal(la.days.length, 7);
  assert.equal(la.through, "2025-12-07");
  assert.deepEqual(Object.keys(a).sort(), ["A", "B", "C", "D", "FAR", "MS", "OPEN", "TIE"]);
  assert.equal(a.A.ready, "in progress");
  assert.equal(a.A.bars, "##...  ");
  assert.equal(a.B.bars, "..#..  ");
  assert.equal(a.C.bars, "###..  ");
  assert.equal(a.MS.bars, "...M.  ");
  assert.equal(a.C.ready, "ready");
  assert.equal(a.C.drivenBy, "data date");
  assert.equal(a.B.ready, "waits");
  assert.equal(a.B.drivenBy, "FS from A");
  assert.equal(a.D.ready, "waits");
  assert.equal(a.OPEN.ready, "no predecessor");
  assert.equal(a.TIE.ready, "no predecessor"); // an FF tie does not gate the start
  assert.equal(a.TIE.waitsOn[0].state, "finish tie");
  assert.equal(a.C.wbs, "Level 1 / Drywall");
  assert.equal(a.A.wbs, "Level 1");
  assert.equal(la.summary.activities, 8);
  assert.equal(la.summary.finishing, 7); // FAR runs past the window
  assert.ok(!a.LATE);
  // two weeks reach LATE? FAR ends 2025-12-19, so no; three weeks do
  assert.ok(!by(lookahead(x, { weeks: 2 })).LATE);
  assert.equal(by(lookahead(x, { weeks: 3 })).LATE.ready, "waits");
  // a later window start: only what has work from then on
  const later = by(lookahead(x, { weeks: 1, from: "2025-12-08" }));
  assert.deepEqual(Object.keys(later).sort(), ["FAR"]);
  assert.match(lookahead(x, { weeks: 1, from: "2025-11-01" }).warnings[0], /before the data date/);
});

test("waits outside, a running lag, out of sequence and a constraint", () => {
  const x = project([
    task("1", "P", 8, { status_code: "TK_Complete", act_start_date: "2025-11-27 08:00", act_end_date: "2025-11-28 17:00" }),
    task("2", "CURE", 8), // FS 24 h from P: lag runs to 2025-12-03 17:00
    task("3", "BIG", 200), task("4", "AFTER", 8), // BIG runs far past the window, AFTER would follow it
    task("5", "OOS", 16, { status_code: "TK_Active", act_start_date: "2025-11-28 08:00" }), task("7", "PRE", 16), // OOS started before PRE
    task("6", "HELD", 8, { cstr_type: "CS_MSOA", cstr_date: "2025-12-03 08:00" }),
  ], [link("1", "2", "1", "PR_FS", 24), link("2", "4", "3"), link("3", "5", "7")]);
  const a = by(lookahead(x, { weeks: 1 }));
  assert.equal(a.CURE.waitsOn[0].state, "lag running");
  assert.equal(a.CURE.ready, "waits");
  assert.equal(a.CURE.waitsOn[0].date, "2025-12-03 17:00");
  assert.ok(!a.AFTER);
  assert.match(a.OOS.note, /out of sequence: started before FS from PRE/);
  assert.equal(a.HELD.drivenBy, "constraint: start on or after 2025-12-03 08:00");
  // three weeks: AFTER is still not in (BIG ends in week 6); with BIG cut
  // short it is, and waits on look-ahead work
  const y = project([task("3", "BIG", 8, { remain_drtn_hr_cnt: 8 }), task("4", "AFTER", 8), task("7", "X", 400), task("8", "Y", 8)],
    [link("2", "4", "3"), link("9", "8", "7")]);
  const b = by(lookahead(y, { weeks: 1 }));
  assert.equal(b.AFTER.ready, "waits");
  assert.ok(!b.Y);
});

test("a gate in another project's file is waits outside", () => {
  const x = project([task("1", "A", 8)], [{ task_pred_id: "1", task_id: "1", pred_task_id: "999", proj_id: "1", pred_proj_id: "2", pred_type: "PR_FS", lag_hr_cnt: 0 }]);
  const a = by(lookahead(x, { weeks: 1 }));
  assert.equal(a.A.ready, "waits outside");
});

test("nothing in the window says when work resumes", () => {
  const x = project([task("1", "A", 8, { cstr_type: "CS_MSOA", cstr_date: "2026-01-12 08:00" })], []);
  const la = lookahead(x, { weeks: 2 });
  assert.equal(la.activities.length, 0);
  assert.match(la.warnings[0], /next work starts 2026-01-12 08:00/);
});

test("text, CSV and HTML outputs on the example; CSV and HTML are safe", () => {
  const x = parseXer(EXAMPLE_XER);
  x.tables.TASK.find((r) => r.task_code === "A1060").task_name = '=HYPERLINK("x")<script>';
  const la = lookahead(x);
  assert.equal(la.summary.activities, 8);
  const txt = lookaheadText(la);
  assert.match(txt, /3-week look-ahead: OFFICE-FITOUT, 2026-04-06 07:00 through 2026-04-26/);
  const csv = lookaheadCsv(la).trim().split("\n");
  assert.equal(csv.length, 9);
  assert.equal(csv[0].split(",").length, 18 + 21);
  assert.ok(csv.some((l) => l.includes(`"'=HYPERLINK(""x"")<script>"`)));
  const html = lookaheadHtml(la, { by: "Site team" });
  assert.ok(!html.includes("<script>"));
  assert.match(html, /prepared by Site team/);
  assert.match(html, /Not professional advice/);
});

test("CLI: a long look-ahead reaches a pipe whole (no cut at 64 KB)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { writeFileSync, mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const n = 400;
  const tasks = Array.from({ length: n }, (_, i) => task(String(i + 1), `A${1000 + i}`, 8 * (1 + (i % 5))));
  const preds = Array.from({ length: n - 1 }, (_, i) => link(String(i + 1), String(i + 2), String(i + 1 - (i % 3 === 0 ? 0 : 1) || 1), "PR_SS"));
  const x = project(tasks, preds);
  const dir = mkdtempSync(join(tmpdir(), "la-"));
  const f = join(dir, "big.xer");
  const { xerText: write } = await import("./xer.mjs");
  writeFileSync(f, write(x));
  const out = execFileSync(process.execPath, [new URL("./cli.mjs", import.meta.url).pathname, f, "--lookahead", "6", "--json"], { maxBuffer: 1 << 26 }).toString();
  assert.ok(out.length > 65536, `${out.length} bytes`);
  assert.equal(JSON.parse(out).activities.length > 100, true);
});
