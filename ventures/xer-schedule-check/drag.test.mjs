import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { dragAnalysis, dragText, dragCsv, dragTableHtml } from "./drag.mjs";

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
const task = (id, hours) => ({ task_id: id, proj_id: "1", wbs_id: "10", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: id, task_name: `Activity ${id}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours });
let linkN = 0;
const link = (succ, pred, type = "PR_FS", lag = 0) => ({ task_pred_id: String(++linkN), task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: type, lag_hr_cnt: lag });
const project = (tasks, preds) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 08:00", plan_start_date: "2025-12-01 08:00" }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  TASK: tasks, TASKPRED: preds,
}));
const dragOf = (r, code) => r.activities.find((a) => a.code === code)?.drag.days ?? 0;

test("Devaux's two-path case: drag is capped by the parallel path's float", () => {
  // A(10d) -> B(20d) -> END; A -> C(5d) -> END. Critical A-B; C has 15 d float.
  const x = project([task("A", 80), task("B", 160), task("C", 40), task("END", 0)], [link("B", "A"), link("C", "A"), link("END", "B"), link("END", "C")]);
  const r = dragAnalysis(x, { costPerDay: 1000 });
  assert.equal(dragOf(r, "A"), 10); // nothing parallel to A
  assert.equal(dragOf(r, "B"), 15); // C's 15 days of float cap it
  assert.equal(dragOf(r, "C"), 0); // not on the longest path: not tested
  const b = r.activities.find((a) => a.code === "B");
  assert.match(b.notes.join(), /limited by the parallel path through C/);
  // 15 working days from a Monday is 21 calendar days: cost is per calendar day
  assert.equal(b.drag.calendarDays, 21);
  assert.equal(b.drag.cost, 21000);
  assert.equal(r.summary.largest.code, "B");
});

test("reverse drag: the path enters at the finish (FF) and leaves at the start (SS)", () => {
  // P(10d) -FF-> X(6d) -SS-> S(10d). X's finish is held by P's finish; S
  // starts with X. Shortening X moves its start, so S, later.
  const x = project([task("P", 80), task("X", 48), task("S", 80)], [link("X", "P", "PR_FF"), link("S", "X", "PR_SS")]);
  const r = dragAnalysis(x);
  const a = r.activities.find((q) => q.code === "X");
  assert.equal(a.drag.days, -6);
  assert.match(a.notes.join(), /reverse drag/);
  assert.equal(r.summary.reverse, 1);
});

test("lag drag: a cure lag on the critical path is ranked with the activities", () => {
  const x = project([task("POUR", 8), task("STRIP", 16), task("SIDE", 24), task("END", 0)], [link("STRIP", "POUR", "PR_FS", 56), link("END", "STRIP"), link("SIDE", "POUR"), link("END", "SIDE")]);
  const r = dragAnalysis(x);
  // POUR 1d, cure 7d, STRIP 2d = 10 d; SIDE path 1+3 = 4 d: the lag holds 6 d
  assert.equal(r.lags.length, 1);
  assert.equal(r.lags[0].drag.days, 6);
  assert.equal(r.lags[0].lagHours, 56);
  assert.equal(dragOf(r, "STRIP"), 2);
  assert.match(dragText(r), /Lags that hold the finish back/);
  assert.match(dragCsv(r), /^kind,activity_id/);
  assert.match(dragCsv(r), /\r\nlag,,,POUR,STRIP,FS,/);
  assert.match(dragTableHtml(r), /<table>/);
});

// An independent oracle: pure FS networks on whole working days, where the
// project length is the longest path and an activity's drag is that length
// minus the longest path with the activity at zero. 200 seeded random
// networks of 6-30 activities; the drag from the P6 engine on a Mon-Fri
// calendar must equal the oracle's on every longest-path activity.
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
test("drag equals an independent longest-path oracle on 200 random FS networks", () => {
  let checked = 0, positive = 0, capped = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const rand = rng(seed);
    const n = 6 + Math.floor(rand() * 25);
    const d = Array.from({ length: n }, () => 1 + Math.floor(rand() * 9));
    const preds = Array.from({ length: n }, () => []);
    for (let j = 1; j < n; j++) for (let i = 0; i < j; i++) if (rand() < 2.2 / j) preds[j].push(i);
    const longest = (dur) => { const ef = []; for (let j = 0; j < n; j++) ef[j] = Math.max(0, ...preds[j].map((i) => ef[i])) + dur[j]; return Math.max(...ef); };
    const L = longest(d);
    const x = project(d.map((h, i) => task(`T${i}`, h * 8)), preds.flatMap((ps, j) => ps.map((i) => link(`T${j}`, `T${i}`))));
    const r = dragAnalysis(x, { lags: false });
    // every activity whose zeroing shortens the oracle's project must be tested
    for (let k = 0; k < n; k++) {
      const z = d.slice(); z[k] = 0;
      const want = L - longest(z);
      assert.equal(dragOf(r, `T${k}`), want, `seed ${seed}, T${k}`);
      checked++;
      if (want > 0) { positive++; assert.equal(r.activities.find((q) => q.code === `T${k}`).shortenForHours, want * 8, `seed ${seed}, T${k} shorten`); }
      if (want > 0 && want < d[k]) capped++;
    }
  }
  assert.ok(checked === 2477 && positive === 1341 && capped === 314, `${checked} ${positive} ${capped}`);
});

test("a finished schedule has no drag to measure", () => {
  const t = { ...task("A", 0), status_code: "TK_Complete", act_start_date: "2025-11-03 08:00", act_end_date: "2025-11-04 17:00" };
  assert.throws(() => dragAnalysis(project([t], [])), /no forecast finish|complete/);
});
