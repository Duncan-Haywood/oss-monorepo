import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { level, levelledDrivingPath } from "./level.mjs";
import { riskAnalysis } from "./risk.mjs";

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

// two parallel activities on a crew of one, into a finish milestone
const pair = (a = 5, b = 3) => xer({ tasks: [task("1", a), task("2", b), task("3", 0, { task_type: "TT_FinMile" })], preds: [fs("1", "1", "3"), fs("2", "2", "3")], assigns: [use("1", "1", "R1"), use("2", "2", "R1")] });

test("level with drawn durations: the assignment stretches with its activity", () => {
  const x = pair();
  const r = level(x, { durations: new Map([["1", 10 * 8 * 60]]) });
  // A1 runs 10 days, then A2's 3: Mon 1 Dec + 13 working days
  assert.equal(r.levelledFinish, "2025-12-17 17:00");
  assert.equal(r.resources[0].selfCheckHours, 0);
});

test("level with a drawn duration of 0 (a branch not taken): it uses no crew", () => {
  const r = level(pair(), { durations: new Map([["1", 0]]) });
  assert.equal(r.levelledFinish, "2025-12-03 17:00");
  assert.equal(r.activities.length, 0);
});

test("levelledDrivingPath crosses the resource wait to the activity the crew was on", () => {
  const x = pair();
  const r = level(x);
  const p = levelledDrivingPath(r, "1");
  const codes = p.path.map((k) => r.result.model.tasks.get(k).code);
  assert.deepEqual(codes, ["A1", "A2", "A3"]);
  assert.equal(p.resourceLinks, 1);
  assert.equal(p.cut, false);
});

test("risk run levelled with limits x1e6 equals the plain run on the same seed", () => {
  const x = pair();
  const plain = riskAnalysis(x, { iterations: 60, seed: 3 });
  const big = riskAnalysis(x, { iterations: 60, seed: 3, level: { limitScale: { "*": 1e6 } } });
  assert.deepEqual(big.percentiles, plain.percentiles);
  assert.deepEqual(big.activities.map((a) => [a.code, a.criticality]), plain.activities.map((a) => [a.code, a.criticality]));
  assert.equal(big.levelling.resourceDelay.p80, 0);
  assert.equal(plain.levelling, null);
});

test("risk run levelled at the file's limit: the crew adds the shorter activity, on the same draws", () => {
  const x = pair();
  const r = riskAnalysis(x, { iterations: 80, seed: 5, level: true });
  const L = r.levelling;
  // levelled = A1 + A2, unlevelled = max(A1, A2): the delay is min(A1, A2) >= 2.7 days
  assert.ok(L.resourceDelay.min >= 2.7, `min delay ${L.resourceDelay.min}`);
  assert.equal(L.resourceDelay.noDelay, 0);
  assert.ok(r.percentiles.find((p) => p.p === 80).days > L.unlevelled.percentiles.find((p) => p.p === 80).days + 2.7);
  assert.equal(L.finishDays, 8);
  assert.equal(L.resources, 1);
  assert.equal(L.selfCheckMax, 0);
  assert.equal(L.pathCut, 0);
  // the wait puts both activities on every run's driving path
  assert.equal(L.resourceDriven, 1);
  const crit = new Map(r.activities.map((a) => [a.code, a.criticality]));
  assert.equal(crit.get("A1"), 1);
  assert.equal(crit.get("A2"), 1);
});

test("risk run levelled on a file with no limits warns and equals the plain run", () => {
  const x = xer({ tasks: [task("1", 5), task("2", 3)], limits: {} });
  const r = riskAnalysis(x, { iterations: 30, level: true });
  assert.ok(r.warnings.some((w) => /no resource in the file has a limit/.test(w)));
  assert.deepEqual(r.levelling.unlevelled.percentiles, r.percentiles);
});

test("the written review's risk section states the levelling and what the limits add", async () => {
  const { reviewHtml } = await import("./report.mjs");
  const { assess } = await import("./dcma.mjs");
  const x = pair();
  const r = riskAnalysis(x, { iterations: 40, level: true });
  const html = reviewHtml(assess(x), null, { risk: r });
  assert.match(html, /Every run was levelled against the file's resource limits \(1 resource\)/);
  assert.match(html, /serial levelling pass/);
  const plain = reviewHtml(assess(x), null, { risk: riskAnalysis(x, { iterations: 40 }) });
  assert.match(plain, /Resource limits are not modelled/);
});
