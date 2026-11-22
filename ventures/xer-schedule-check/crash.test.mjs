import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { crashAnalysis, crashText, crashCsv, crashTableHtml, parseCrashData, minCut } from "./crash.mjs";
import { dragAnalysis } from "./drag.mjs";
import { oracleRun, oracleCase } from "./eval/crash-oracle.mjs";
import { bridgeRun } from "./eval/crash-bridge.mjs";

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

test("two equal parallel chains: no drag, but shortening both together wins", () => {
  // S -> A(10d) -> E; S -> B(10d) -> E. Drag of A and B is 0 (each is held by the other).
  const x = project([task("S", 8), task("A", 80), task("B", 80), task("E", 0)], [link("A", "S"), link("B", "S"), link("E", "A"), link("E", "B")]);
  const d = dragAnalysis(x, { lags: false });
  assert.equal(d.activities.find((a) => a.code === "A").drag.days, 0);
  const data = parseCrashData("activity_id,max_shorten_days,cost_per_day\nS,0,\nA,3,100\nB,2,250\n");
  const r = crashAnalysis(x, { data });
  assert.equal(r.gainedDays, 2); // B has 2 days of room
  assert.equal(r.totalCost, 2 * 350);
  assert.equal(r.steps[0].activities.map((a) => a.code).sort().join(), "A,B");
  assert.match(r.stoppedBecause, /no finite cut/);
  // with S shortenable at 300/day, the cheaper cut S (300 < 350) goes first
  const r2 = crashAnalysis(x, { data: parseCrashData("activity_id,max_shorten_days,cost_per_day\nS,1,300\nA,3,100\nB,2,250\n") });
  assert.equal(r2.steps[0].activities.map((a) => a.code).join(), "S");
  assert.equal(r2.gainedDays, 3);
  assert.equal(r2.totalCost, 300 + 700);
});

test("target and value of a finish day stop the run", () => {
  const x = project([task("A", 80), task("B", 80), task("E", 0)], [link("B", "A"), link("E", "B")]);
  const data = parseCrashData("code,room,cost\nA,4,500\nB,4,2000\n");
  const r = crashAnalysis(x, { data, targetDays: 3 });
  assert.equal(r.gainedDays, 3);
  assert.equal(r.stoppedBecause, "target met");
  assert.equal(r.totalCost, 1500);
  // a finish day worth $1,000 per calendar day: A's days (one working day = 1 or 3 calendar days) pay, B's do not
  const v = crashAnalysis(x, { data, costPerDay: 1000 });
  assert.ok(v.steps.every((s) => s.activities.every((a) => a.code === "A")));
  assert.match(v.stoppedBecause, /more than/);
  assert.match(crashText(v), /joint acceleration/);
  assert.match(crashCsv(v), /^step,activities/);
  assert.match(crashTableHtml(v), /<table>/);
});

test("defaults: 25% of each task's remaining duration at 1 per day; milestones and mandatory constraints fixed", () => {
  const m = { ...task("A", 80), cstr_type: "CS_MANDFIN", cstr_date: "2025-12-12 17:00" };
  const x = project([m, task("B", 80), task("E", 0)], [link("B", "A"), link("E", "B")]);
  const r = crashAnalysis(x);
  assert.equal(r.gainedDays, 2.5); // B: 25% of 10 d; A held
  assert.deepEqual(r.activities.map((a) => a.code), ["B"]);
});

test("minCut: finite and infinite cuts", () => {
  assert.equal(minCut(4, [[0, 1, 3], [0, 2, 2], [1, 3, Infinity], [2, 3, 5]], 0, 3).flow, 5);
  assert.equal(minCut(3, [[0, 1, Infinity], [1, 2, Infinity]], 0, 2).flow, Infinity);
});

test("greedy cut against a brute-force oracle on 300 random FS networks", () => {
  const o = oracleRun({ seeds: 300 });
  // measured 2026-11-22: every step at the least cost of its gain, every run to the oracle's most
  assert.deepEqual(o, { givenBack: 0, points: 1078, optimal: 1078, worst: 0, reach: 300, reachOk: 300, misses: [] });
});

test("bridge networks: giving back time already bought keeps every step at the optimum", () => {
  // A -> C, A -> E -> D, B -> D. After E is bought, the cheapest next cut is
  // A + D with E given back (cost 3 + 5 - 1 = 7, not 8 for D + A alone).
  const ex = { d: [4, 4, 3, 7, 9], room: [3, 0, 3, 1, 3], cost: [3, 8, 1, 9, 5], preds: [[], [], [0], [0], [1, 2]] };
  const w = oracleCase(ex), wo = oracleCase({ ...ex, giveBack: false });
  assert.equal(w.steps.at(-1), "T4+T0 (give back T2) 8 h: 6 d for 20");
  assert.equal(wo.steps.at(-1), "T4+T0 8 h: 6 d for 21");
  assert.equal(w.optimal, w.points);
  const b = bridgeRun(600);
  assert.equal(b.withGiveBack.optimalPoints, b.withGiveBack.points);
  assert.equal(b.withGiveBack.reachOk, 600);
  assert.ok(b.withGiveBack.stepsGivingBack > 0 && b.without.optimalPoints < b.without.points);
});

test("acceleration data: thousands commas and decimal commas read by shape; BOM header", () => {
  const m = parseCrashData("\uFEFFactivity_id;max_shorten_days;cost_per_day\nA;2,5;1,800\nB;1;$12,500.50\n");
  assert.deepEqual(m.get("A"), { roomDays: 2.5, costPerDay: 1800 });
  assert.deepEqual(m.get("B"), { roomDays: 1, costPerDay: 12500.5 });
});
