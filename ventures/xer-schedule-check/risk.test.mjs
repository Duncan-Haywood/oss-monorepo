import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { schedule } from "./cpm.mjs";
import { riskAnalysis, riskAnalysisAsync, riskCsv, parseRanges, triangular, rng, phi } from "./risk.mjs";

// Mon-Fri, 08:00-12:00 and 13:00-17:00
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
const link = (id, succ, pred) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: "PR_FS", lag_hr_cnt: 0 });
const project = (tasks, preds, extra = {}) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 00:00", plan_start_date: "2025-12-01 00:00", plan_end_date: "", ...extra }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
  SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
  TASK: tasks,
  TASKPRED: preds,
}));

// Start milestone S, two equal parallel paths A (5 days) and B (5 days), then C (1 day)
const merge = () => project(
  [task("1", "S", 0, { task_type: "TT_Mile" }), task("2", "A", 40), task("3", "B", 40), task("4", "C", 8)],
  [link("1", "2", "1"), link("2", "3", "1"), link("3", "4", "2"), link("4", "4", "3")],
);
const byCode = (r, code) => r.activities.find((a) => a.code === code);

test("triangular inverse CDF: ends, mode and mean", () => {
  assert.equal(triangular(0, 2, 3, 6), 2);
  assert.ok(Math.abs(triangular(0.999999, 2, 3, 6) - 6) < 0.01);
  assert.equal(triangular(0.25, 2, 3, 6), 3); // F(mode) = (c - a) / (b - a)
  assert.equal(triangular(0.5, 5, 5, 5), 5);
  const rand = rng(7);
  let sum = 0;
  for (let i = 0; i < 20000; i++) sum += triangular(rand(), 2, 3, 6);
  assert.ok(Math.abs(sum / 20000 - 11 / 3) < 0.03);
  assert.ok(Math.abs(phi(0) - 0.5) < 1e-7 && Math.abs(phi(1.959964) - 0.975) < 1e-6);
});

test("a zero-width range reproduces the CPM finish in every run", () => {
  const r = riskAnalysis(merge(), { iterations: 20, range: { min: 1, likely: 1, max: 1 } });
  for (const q of r.percentiles) { assert.equal(q.date, r.project.finish); assert.equal(q.overDeterministic, 0); }
  assert.equal(r.pDeterministic, 1);
  assert.equal(r.project.finishDays, 6);
  assert.equal(byCode(r, "C").criticality, 1);
  assert.equal(byCode(r, "C").deterministicCritical, true);
});

test("merge bias: two equal parallel paths finish later than the CPM date more often than not", () => {
  const r = riskAnalysis(merge(), { iterations: 2000, range: { min: 0.8, likely: 1, max: 1.2 }, seed: 3 });
  // symmetric ranges: each path alone meets its date half the time; both together a quarter
  assert.ok(r.pDeterministic > 0.18 && r.pDeterministic < 0.32, String(r.pDeterministic));
  assert.ok(r.percentiles.find((q) => q.p === 50).overDeterministic > 0);
  const a = byCode(r, "A").criticality, b = byCode(r, "B").criticality;
  assert.ok(a > 0.4 && a < 0.6 && b > 0.4 && b < 0.6, `${a} ${b}`);
  assert.ok(Math.abs(a + b - 1) < 0.02);
  assert.ok(byCode(r, "A").sensitivity > 0.3);
  assert.equal(r.histogram.reduce((s, h) => s + h.count, 0), 2000);
});

test("per-activity ranges in working days override the default", () => {
  const { ranges, bad } = parseRanges("activity,min,likely,max\nA, 8, 8, 8\nB;1;1;1\nZ,1,2\nQ,3,2,1\n\nNOPE,1,1,1");
  assert.deepEqual([...ranges.keys()], ["A", "B", "NOPE"]);
  assert.deepEqual(bad, [4, 5]);
  const r = riskAnalysis(merge(), { iterations: 50, ranges });
  assert.equal(r.overrides, 2);
  assert.equal(byCode(r, "A").criticality, 1);
  assert.equal(byCode(r, "B"), undefined); // never on the path, fixed duration: no signal
  for (const q of r.percentiles.filter((x) => x.p >= 50)) assert.ok(q.days >= 9 && q.days <= 9.25, String(q.days));
  assert.match(r.warnings.join(" "), /1 range line\(s\) name no open activity: NOPE/);
});

test("same seed, same result; correlation widens the spread on a chain", () => {
  const chain = project(
    Array.from({ length: 12 }, (_, i) => task(String(i + 1), `K${i + 1}`, 16)),
    Array.from({ length: 11 }, (_, i) => link(String(i + 1), String(i + 2), String(i + 1))),
  );
  const a = riskAnalysis(chain, { iterations: 300, seed: 9 }), b = riskAnalysis(chain, { iterations: 300, seed: 9 });
  assert.deepEqual(a.percentiles, b.percentiles);
  const spread = (r) => r.percentiles.find((q) => q.p === 90).days - r.percentiles.find((q) => q.p === 10).days;
  const c = riskAnalysis(chain, { iterations: 300, seed: 9, correlation: 0.9 });
  assert.ok(spread(c) > 1.5 * spread(a), `${spread(a)} ${spread(c)}`);
  assert.throws(() => riskAnalysis(chain, { range: { min: 1.2, likely: 1, max: 1.3 } }), /min <= likely/);
});

test("the must-finish date's chance, the forward-only engine and the CSV", async () => {
  const x = project(
    [task("1", "S", 0, { task_type: "TT_Mile" }), task("2", "A", 40), task("3", "B", 40), task("4", "C", 8)],
    [link("1", "2", "1"), link("2", "3", "1"), link("3", "4", "2"), link("4", "4", "3")],
    { plan_end_date: "2025-12-09 17:00" },
  );
  const full = schedule(x), fwd = schedule(x, { forwardOnly: true });
  assert.equal(fwd.projects.get("1").finish, full.projects.get("1").finish);
  const r = riskAnalysis(x, { iterations: 400 });
  assert.ok(r.pMustFinish > r.pDeterministic && r.pMustFinish <= 1);
  const r2 = await riskAnalysisAsync(x, { iterations: 400 });
  assert.deepEqual(r2.percentiles, r.percentiles);
  const csv = riskCsv({ activities: [{ code: "=A", name: "x, y", criticality: 0.5, sensitivity: -0.2, deterministicCritical: true }] });
  assert.equal(csv.split("\n")[1], `'=A,"x, y",0.5,-0.2,yes`);
});
