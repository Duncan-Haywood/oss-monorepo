import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { earnedValue, earnedValueText, earnedValueCsv, sCurveCsv, sCurveSvg, percentComplete } from "./evm.mjs";

// Mon-Fri 08:00-12:00, 13:00-17:00 (8 h a day); 2025-12-01 is a Monday
const D = "((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)()))";
const WEEK = `(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()${D})(0||3()${D})(0||4()${D})(0||5()${D})(0||6()${D})(0||7()())))(0||Exceptions()())))`;
function xerText(tables, currency = "EUR") {
  const lines = [`ERMHDR\t20.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\t${currency}`];
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
const base = (tasks, assigns, extra = {}) => parseXer(xerText({
  PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-08 08:00", plan_start_date: "2025-12-01 08:00", plan_end_date: "" }],
  CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: WEEK }],
  PROJWBS: [{ wbs_id: "9", proj_id: "1", proj_node_flag: "Y", wbs_short_name: "TEST", wbs_name: "Test", parent_wbs_id: "" }, { wbs_id: "10", proj_id: "1", proj_node_flag: "N", wbs_short_name: "S", wbs_name: "Structure", parent_wbs_id: "9" }],
  TASK: tasks,
  TASKRSRC: assigns,
  RSRC: [{ rsrc_id: "1", rsrc_short_name: "L", rsrc_name: "Labour", rsrc_type: "RT_Labor" }],
  ...extra,
}));
const asg = (id, taskId, cost, extra = {}) => ({ taskrsrc_id: id, task_id: taskId, proj_id: "1", rsrc_id: "1", ...cost, ...extra });

test("percent complete follows the activity's percent complete type, as P6 earns it", () => {
  assert.equal(percentComplete({ status_code: "TK_Complete", complete_pct_type: "CP_Phys", phys_complete_pct: "10" }), 1);
  assert.equal(percentComplete({ status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: "35" }), 0.35);
  assert.equal(percentComplete({ status_code: "TK_Active", complete_pct_type: "CP_Drtn", target_drtn_hr_cnt: "80", remain_drtn_hr_cnt: "20" }), 0.75);
  assert.equal(percentComplete({ status_code: "TK_NotStart", complete_pct_type: "CP_Drtn", target_drtn_hr_cnt: "80", remain_drtn_hr_cnt: "80" }), 0);
  assert.equal(percentComplete({ status_code: "TK_Active", complete_pct_type: "CP_Units", act_work_qty: "30", remain_work_qty: "60", act_equip_qty: "10", remain_equip_qty: "0" }), 0.4);
  // remaining longer than original: none earned, never negative
  assert.equal(percentComplete({ status_code: "TK_Active", complete_pct_type: "CP_Drtn", target_drtn_hr_cnt: "40", remain_drtn_hr_cnt: "60" }), 0);
  // the project's earned value technique wins when it is set
  assert.equal(percentComplete({ status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: "90" }, "EC_0_100"), 0);
  assert.equal(percentComplete({ status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: "90" }, "EC_50_50"), 0.5);
  assert.equal(percentComplete({ status_code: "TK_Active" }, "EC_PCT_CUSTOM", "20"), 0.2);
});

test("one activity, ten working days, a quarter done after five: PV half, SPI 0.5, SPI(t) 2.5 of 7 days", () => {
  // planned 2025-12-01 08:00 to 2025-12-12 17:00 (80 working hours); data date
  // Monday 2025-12-08 08:00, five working days in; 25% done, 300 spent of 1000
  const x = base(
    [task("1", "A", 80, { status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: "25", remain_drtn_hr_cnt: 60, act_start_date: "2025-12-01 08:00", target_start_date: "2025-12-01 08:00", target_end_date: "2025-12-12 17:00" })],
    [asg("1", "1", { target_cost: 1000, act_reg_cost: 300, act_ot_cost: 0, remain_cost: 750 })],
  );
  const r = earnedValue(x, { projId: "1" });
  assert.equal(r.measure, "cost");
  assert.equal(r.currency, "EUR");
  assert.equal(r.totals.bac, 1000);
  assert.equal(r.totals.pv, 500);
  assert.equal(r.totals.ev, 250);
  assert.equal(r.totals.ac, 300);
  assert.equal(r.totals.spi, 0.5);
  assert.equal(r.totals.cpi, 0.833);
  assert.equal(r.totals.eac, 1050);
  assert.equal(r.totals.vac, -50);
  // EAC at CPI = AC + (BAC - EV) / CPI = 300 + 750 / (250/300) = 1200
  assert.equal(r.totals.eacCpi, 1200);
  // TCPI = (1000 - 250) / (1000 - 300)
  assert.equal(r.totals.tcpi, 1.071);
  // ES: the planned curve (100 a working day) reached 250 halfway through
  // Wednesday: 2.5 calendar days in, 7 elapsed (Monday to Monday)
  assert.equal(r.earnedSchedule.es, 2.5);
  assert.equal(r.earnedSchedule.at, 7);
  assert.equal(r.earnedSchedule.spit, 0.357);
  assert.equal(r.wbs[0].wbs, "Structure");
  // the curve: planned ends at the budget; the forecast ends at AC + ETC
  assert.equal(r.curve.at(-1).pv, 1000);
  assert.equal(r.curve.at(-1).forecast, 1050);
  const dd = r.curve.find((p) => p.dataDate);
  assert.equal(dd.date, "2025-12-07");
  assert.equal(dd.pv, 500);
  assert.equal(dd.ac, 300);
});

test("planned value skips the weekend and a holiday-free week spreads evenly", () => {
  // planned Friday to Monday: 16 working hours, half before the weekend
  const x = base(
    [task("1", "A", 16, { target_start_date: "2025-12-05 08:00", target_end_date: "2025-12-08 17:00" })],
    [asg("1", "1", { target_cost: 800, remain_cost: 800 })],
  );
  const r = earnedValue(x, { projId: "1" });
  // data date Monday 08:00: Friday's half is planned
  assert.equal(r.totals.pv, 400);
  assert.equal(r.totals.ev, 0);
});

test("the cost checks name the activities behind each fault", () => {
  const x = base(
    [
      task("1", "DONE", 8, { status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-01 17:00", remain_drtn_hr_cnt: 0 }),
      task("2", "EARLYCOST", 8, {}),
      task("3", "NOCOST", 8, {}),
      task("4", "OVER", 16, { status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: "50", act_start_date: "2025-12-01 08:00", remain_drtn_hr_cnt: 8 }),
      task("5", "AHEAD", 40, { status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: "80", act_start_date: "2025-12-01 08:00", remain_drtn_hr_cnt: 8 }),
      task("6", "FREE", 40, { status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: "40", act_start_date: "2025-12-01 08:00", remain_drtn_hr_cnt: 24 }),
      task("7", "MILE", 0, { task_type: "TT_Mile" }),
      task("8", "CHEAP", 8, {}),
    ],
    [
      asg("1", "1", { target_cost: 100, act_reg_cost: 100, remain_cost: 40 }),
      asg("2", "2", { target_cost: 100, act_reg_cost: 30, remain_cost: 100 }),
      asg("4", "4", { target_cost: 100, act_reg_cost: 140, remain_cost: 50 }),
      asg("5", "5", { target_cost: 1000, act_reg_cost: 200, remain_cost: 200 }),
      asg("6", "6", { target_cost: 500, act_reg_cost: 0, remain_cost: 300 }),
      asg("8", "8", { target_cost: 500, act_reg_cost: 0, remain_cost: 100 }),
    ],
  );
  const r = earnedValue(x, { projId: "1" });
  const codes = (id) => r.findings.find((f) => f.id === id).items.map((a) => a.code).sort();
  assert.deepEqual(codes("unloaded"), ["NOCOST"]); // the milestone is not counted
  assert.deepEqual(codes("actual-not-started"), ["EARLYCOST"]);
  assert.deepEqual(codes("remaining-finished"), ["DONE"]);
  assert.deepEqual(codes("progress-no-cost"), ["FREE"]);
  assert.deepEqual(codes("earned-ahead"), ["AHEAD"]);
  assert.deepEqual(codes("overrun"), ["OVER"]);
  assert.deepEqual(codes("eac-under-actual"), ["CHEAP"]);
  assert.deepEqual(codes("actuals-from-progress"), []);
  const text = earnedValueText(r);
  assert.match(text, /Spent more than the budget: 1/);
  assert.match(text, /OVER/);
});

test("actuals equal to budget x percent on every activity are named as computed, not booked", () => {
  const tasks = [], assigns = [];
  for (let i = 1; i <= 6; i++) {
    tasks.push(task(String(i), `A${i}`, 40, { status_code: "TK_Active", complete_pct_type: "CP_Phys", phys_complete_pct: String(10 * i), act_start_date: "2025-12-01 08:00", remain_drtn_hr_cnt: 20 }));
    assigns.push(asg(String(i), String(i), { target_cost: 1000, act_reg_cost: 100 * i, remain_cost: 1000 - 100 * i }));
  }
  const r = earnedValue(base(tasks, assigns), { projId: "1" });
  assert.equal(r.totals.cpi, 1);
  const f = r.findings.find((x) => x.id === "actuals-from-progress");
  assert.equal(f.count, 6);
  assert.match(f.note, /6 of 6/);
  assert.ok(r.notes.some((n) => /computed from percent complete/.test(n)));
});

test("no cost but labour hours: earned value in hours; nothing loaded: says so", () => {
  const x = base(
    [task("1", "A", 16, { status_code: "TK_Active", complete_pct_type: "CP_Drtn", remain_drtn_hr_cnt: 8, act_start_date: "2025-12-01 08:00", target_start_date: "2025-12-01 08:00", target_end_date: "2025-12-02 17:00" })],
    [asg("1", "1", { target_qty: 32, act_reg_qty: 20, remain_qty: 16 })],
  );
  const r = earnedValue(x, { projId: "1" });
  assert.equal(r.measure, "hours");
  assert.equal(r.currency, "h");
  assert.equal(r.totals.bac, 32);
  assert.equal(r.totals.ev, 16);
  assert.equal(r.totals.ac, 20);
  const none = earnedValue(base([task("1", "A", 8)], []), { projId: "1" });
  assert.equal(none.measure, null);
  assert.equal(none.totals, null);
  assert.match(earnedValueText(none), /not cost or resource loaded/);
});

test("project expenses count with the assignments", () => {
  const x = base(
    [task("1", "A", 8, { target_start_date: "2025-12-01 08:00", target_end_date: "2025-12-01 17:00", status_code: "TK_Complete", act_start_date: "2025-12-01 08:00", act_end_date: "2025-12-01 17:00", remain_drtn_hr_cnt: 0 })],
    [asg("1", "1", { target_cost: 100, act_reg_cost: 100, remain_cost: 0 })],
    { PROJCOST: [{ cost_item_id: "1", task_id: "1", proj_id: "1", target_cost: 900, act_cost: 950, remain_cost: 0 }] },
  );
  const r = earnedValue(x, { projId: "1" });
  assert.equal(r.totals.bac, 1000);
  assert.equal(r.totals.ev, 1000);
  assert.equal(r.totals.ac, 1050);
});

test("the example is cost loaded: overrun on the shop drawings, two unloaded activities, curves close on BAC and EAC", () => {
  const r = earnedValue(parseXer(EXAMPLE_XER), { projId: "77" });
  assert.equal(r.measure, "cost");
  assert.equal(r.currency, "USD");
  assert.deepEqual(r.findings.find((f) => f.id === "overrun").items.map((a) => a.code), ["A1020"]);
  assert.deepEqual(r.findings.find((f) => f.id === "unloaded").items.map((a) => a.code).sort(), ["A1040", "A1180"]);
  assert.ok(Math.abs(r.curve.at(-1).pv - r.totals.bac) < 0.05);
  assert.ok(Math.abs(r.curve.at(-1).forecast - r.totals.eac) < 0.05);
  assert.ok(r.totals.spi < 1 && r.totals.cpi < 1);
  // CSVs and the chart
  const csv = earnedValueCsv(r).split("\n");
  assert.match(csv[0], /^Activity ID,Activity name,WBS/);
  assert.equal(csv.filter(Boolean).length, r.activities.length + 1);
  assert.match(sCurveCsv(r), /^Date,Planned \(cumulative\)/);
  const svg = sCurveSvg(r);
  assert.match(svg, /^<svg/);
  assert.equal((svg.match(/<path /g) || []).length, 3);
});

test("a name a spreadsheet would run as a formula is written as text", () => {
  const x = base([task("1", "A", 8, { task_name: "=HYPERLINK(1)" })], [asg("1", "1", { target_cost: 10, remain_cost: 10 })]);
  const csv = earnedValueCsv(earnedValue(x, { projId: "1" }));
  assert.match(csv, /'=HYPERLINK\(1\)/);
});
