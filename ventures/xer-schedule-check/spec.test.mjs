import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { specCheck, specText, specCsv, specTableHtml, parseRules, rulesJson, readNumber, RULES } from "./spec.mjs";
import { EXAMPLE_XER } from "./example.mjs";

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
const task = (id, extra = {}) => ({ task_id: id, proj_id: "1", wbs_id: "11", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: id, task_name: `Activity ${id} work`, target_drtn_hr_cnt: 80, remain_drtn_hr_cnt: 80, total_float_hr_cnt: 0, ...extra });
const link = (id, pred, succ, type = "PR_FS", lagD = 0) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, pred_type: type, lag_hr_cnt: lagD * 8 });
function build({ tasks, preds = [], extra = {}, sched = {} }) {
  return parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-15 08:00", plan_start_date: "2025-12-01 08:00" }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    SCHEDOPTIONS: [{ proj_id: "1", sched_retained_logic: "Y", sched_progress_override: "N", ...sched }],
    PROJWBS: [{ wbs_id: "10", proj_id: "1", proj_node_flag: "Y", wbs_short_name: "TEST" }, { wbs_id: "11", proj_id: "1", proj_node_flag: "N", parent_wbs_id: "10", wbs_short_name: "WORK" }],
    TASK: tasks, TASKPRED: preds, ...extra,
  }));
}
// NTP -> A -> B -> C -> SC, a clean little network
const BASE = () => ({
  tasks: [task("NTP", { task_type: "TT_Mile", task_name: "Notice to Proceed", target_drtn_hr_cnt: 0, remain_drtn_hr_cnt: 0 }), task("A"), task("B"), task("C"),
    task("SC", { task_type: "TT_FinMile", task_name: "Substantial Completion", target_drtn_hr_cnt: 0, remain_drtn_hr_cnt: 0 })],
  preds: [link("1", "NTP", "A"), link("2", "A", "B"), link("3", "B", "C"), link("4", "C", "SC")],
});
const res = (r, key) => r.results.find((x) => x.key === key);

test("no rules: nothing checked, and the reader is told to type them", () => {
  const r = specCheck(build(BASE()), {});
  assert.equal(r.checked, 0);
  assert.match(r.warnings.join(" "), /no rule is set/);
});

test("a clean network meets the structural rules", () => {
  const r = specCheck(build(BASE()), { maxDuration: 10, maxLag: 5, noLeads: true, noStartToFinish: true, singleStartFinish: true, allowedConstraints: [], retainedLogic: true, milestones: "Notice to proceed\nsubstantial  completion", minNameLength: 5, uniqueNames: true });
  assert.equal(r.failed, 0, specText(r));
  assert.equal(r.passed, 10);
  assert.match(res(r, "milestones").text, /Notice to proceed = NTP; substantial {2}completion = SC/);
});

test("maxDuration: working days on the activity's own calendar, exempt words and finished work skipped", () => {
  const b = BASE();
  b.tasks[1].target_drtn_hr_cnt = 88; // 11 d
  b.tasks[2].target_drtn_hr_cnt = 200; b.tasks[2].task_name = "Fabricate steel"; // exempt
  b.tasks[3].target_drtn_hr_cnt = 200; b.tasks[3].status_code = "TK_Complete"; // finished
  const r = specCheck(build(b), { maxDuration: 10, durationExempt: "fabricat" });
  const x = res(r, "maxDuration");
  assert.equal(x.status, "fail");
  assert.deepEqual(x.items.map((i) => i.code), ["A"]);
  assert.match(x.items[0].why, /^11 working days/);
  assert.match(x.text, /1 of 1 open activities.*1 exempt by name/);
  assert.equal(specCheck(build(b), { maxDuration: 11 }).failed, 1, "B (25 d, not exempt without the word) fails at 11");
});

test("lags, leads and start-to-finish links", () => {
  const b = BASE();
  b.preds[1].lag_hr_cnt = 12 * 8;
  b.preds[2].lag_hr_cnt = -2 * 8;
  b.preds[3].pred_type = "PR_SF";
  const r = specCheck(build(b), { maxLag: 10, noLeads: true, noStartToFinish: true });
  assert.deepEqual(res(r, "maxLag").items.map((i) => i.code), ["A → B"]);
  assert.match(res(r, "maxLag").items[0].why, /FS lag of 12 working days/);
  assert.deepEqual(res(r, "noLeads").items.map((i) => i.code), ["B → C"]);
  assert.deepEqual(res(r, "noStartToFinish").items.map((i) => i.code), ["C → SC"]);
  assert.equal(r.failed, 3);
});

test("constraints: types not allowed, and the share constrained", () => {
  const b = BASE();
  b.tasks[1].cstr_type = "CS_MSOA"; b.tasks[1].cstr_date = "2025-12-20 08:00";
  b.tasks[2].cstr_type = "CS_MANDFIN"; b.tasks[2].cstr_date = "2026-01-20 17:00";
  const r = specCheck(build(b), { allowedConstraints: ["CS_MSOA", "CS_MEOB"], maxConstrainedPct: 30 });
  assert.deepEqual(res(r, "allowedConstraints").items.map((i) => i.code), ["B"]);
  assert.match(res(r, "allowedConstraints").items[0].why, /Mandatory finish 2026-01-20/);
  assert.equal(res(r, "maxConstrainedPct").status, "fail"); // 2 of 5 = 40%
  assert.equal(specCheck(build(b), { maxConstrainedPct: 40 }).failed, 0);
  assert.equal(specCheck(build(b), { allowedConstraints: [] }).results[0].items.length, 2, "none allowed");
});

test("open ends: a second start and a dangling finish", () => {
  const b = BASE();
  b.tasks.push(task("D"));
  const r = specCheck(build(b), { singleStartFinish: true });
  const x = res(r, "singleStartFinish");
  assert.equal(x.status, "fail");
  assert.deepEqual(x.items.map((i) => i.code).sort(), ["D", "D", "NTP", "SC"]);
  assert.match(x.text, /2 activities have no predecessor and 2 no successor/);
});

test("total float: stored float over the limit, in working days", () => {
  const b = BASE();
  b.tasks[2].total_float_hr_cnt = 50 * 8;
  const r = specCheck(build(b), { maxTotalFloat: 44 });
  assert.deepEqual(res(r, "maxTotalFloat").items.map((i) => i.code), ["B"]);
  const none = BASE(); for (const t of none.tasks) delete t.total_float_hr_cnt;
  assert.equal(res(specCheck(build(none), { maxTotalFloat: 44 }), "maxTotalFloat").status, "note");
});

test("required activity codes, by code type name (case and spacing ignored)", () => {
  const b = BASE();
  b.extra = {
    ACTVTYPE: [{ actv_code_type_id: "T1", actv_code_type: "Responsibility" }, { actv_code_type_id: "T2", actv_code_type: "Area" }],
    ACTVCODE: [{ actv_code_id: "V1", actv_code_type_id: "T1", short_name: "GC" }, { actv_code_id: "V2", actv_code_type_id: "T2", short_name: "L1" }],
    TASKACTV: ["NTP", "A", "B", "C", "SC"].flatMap((id) => [{ task_id: id, actv_code_type_id: "T1", actv_code_id: "V1" }, ...(id === "B" ? [] : [{ task_id: id, actv_code_type_id: "T2", actv_code_id: "V2" }])]),
  };
  const r = specCheck(build(b), { requiredCodes: "responsibility, AREA, Phase" });
  const x = res(r, "requiredCodes");
  assert.equal(x.items.length, 5);
  assert.equal(x.items.find((i) => i.code === "B").why, "no AREA, Phase code");
  assert.match(x.text, /defines no code type named Phase \(it has Responsibility, Area\)/);
  assert.equal(specCheck(build(b), { requiredCodes: "Responsibility" }).failed, 0);
});

test("cost and resource loading, contract value and the per-activity cap", () => {
  const b = BASE();
  b.extra = {
    RSRC: [{ rsrc_id: "R1", rsrc_type: "RT_Labor" }],
    TASKRSRC: [{ taskrsrc_id: "1", task_id: "A", rsrc_id: "R1", target_cost: 600 }, { taskrsrc_id: "2", task_id: "B", rsrc_id: "R1", target_cost: 300 }],
    PROJCOST: [{ cost_item_id: "1", task_id: "C", target_cost: 100 }],
  };
  const r = specCheck(build(b), { resourceLoaded: true, costLoaded: true, contractValue: 1000, maxActivityValuePct: 50 });
  assert.deepEqual(res(r, "resourceLoaded").items.map((i) => i.code), ["C"]);
  assert.equal(res(r, "costLoaded").status, "pass", "an expense counts as budgeted cost");
  assert.equal(res(r, "contractValue").status, "pass");
  assert.deepEqual(res(r, "maxActivityValuePct").items.map((i) => i.code), ["A"]);
  assert.match(res(r, "maxActivityValuePct").items[0].why, /600 budgeted, 60% of the 1,000 total/);
  const off = specCheck(build(b), { contractValue: 1010, valueTolerancePct: 0.5 });
  assert.equal(off.failed, 1);
  assert.match(off.results[0].text, /-10 \(-1%; tolerance 0.5%\)/);
  assert.equal(specCheck(build(b), { contractValue: 1010, valueTolerancePct: 1 }).failed, 0);
});

test("milestones: a missing one, and a name that matches an ordinary activity", () => {
  const b = BASE();
  b.tasks[3].task_name = "Building dry-in";
  const r = specCheck(build(b), { milestones: ["Notice to proceed", "Building dry in", "Final completion"] });
  const x = res(r, "milestones");
  assert.equal(x.items.length, 2);
  assert.match(x.items[0].why, /C "Building dry-in" matches but is not a milestone/);
  assert.equal(x.items[1].why, "no milestone by this name or ID");
});

test("retained logic, activity count and data date", () => {
  const r = specCheck(build({ ...BASE(), sched: { sched_progress_override: "Y" } }), { retainedLogic: true, minActivities: 6, maxActivities: 100, dataDate: "2025-12-15" });
  assert.equal(res(r, "retainedLogic").items[0].why, "scheduled with progress override");
  assert.match(res(r, "minActivities").text, /5 activities \(allowed 6 to 100\)/);
  assert.equal(res(r, "dataDate").status, "pass");
  assert.equal(res(specCheck(build(BASE()), { dataDate: "2025-12-22" }), "dataDate").status, "fail");
});

test("names: too short, and repeated within a WBS", () => {
  const b = BASE();
  b.tasks[1].task_name = "Pour"; b.tasks[2].task_name = "pour "; 
  const r = specCheck(build(b), { minNameLength: 5, uniqueNames: true });
  assert.deepEqual(res(r, "minNameLength").items.map((i) => i.code), ["A", "B"]);
  assert.deepEqual(res(r, "uniqueNames").items.map((i) => i.code).sort(), ["A", "B"]);
});

test("parseRules: strings from a form, a saved file round trip, and bad values named", () => {
  const p = parseRules({ maxDuration: "20", noLeads: "true", contractValue: "1,250,000", milestones: "NTP\nSC", allowedConstraints: ["CS_MSOA", "CS_BOGUS"], wat: 1, dataDate: "2025-13-01", maxLag: "-3" });
  assert.equal(p.rules.maxDuration, 20);
  assert.equal(p.rules.noLeads, true);
  assert.equal(p.rules.contractValue, 1250000);
  assert.deepEqual(p.rules.milestones, ["NTP", "SC"]);
  assert.deepEqual(p.rules.allowedConstraints, ["CS_MSOA"]);
  assert.equal(p.problems.length, 4, p.problems.join("\n"));
  const again = parseRules(rulesJson(p.rules, "Job 12"));
  assert.deepEqual(again.rules, p.rules);
  assert.deepEqual(again.problems, []);
  assert.match(parseRules("{nope").problems[0], /not JSON/);
  assert.deepEqual(parseRules({ rules: { maxLag: 5 } }).rules, { maxLag: 5 });
  assert.ok(RULES.every((r) => r.key && r.label && r.type));
});

test("text, CSV and HTML outputs on the bundled example", () => {
  const r = specCheck(parseXer(EXAMPLE_XER), { maxDuration: 15, maxLag: 5, noLeads: true, singleStartFinish: true, milestones: "Substantial completion" });
  assert.ok(r.activities > 10);
  const t = specText(r);
  assert.match(t, /^Specification check: 5 rules/);
  const csv = specCsv(r);
  assert.ok(csv.startsWith("rule,limit,result,summary,activity_id,name,why\r\n"));
  assert.equal(csv.split("\r\n").length - 2, r.results.reduce((s, x) => s + Math.max(1, x.items.length), 0));
  const h = specTableHtml(r);
  assert.match(h, /<table>/);
  assert.ok(!/<script/i.test(h));
});

test("CSV cells a spreadsheet would run as formulas are defused", () => {
  const b = BASE();
  b.tasks[1].task_name = "=HYPERLINK(\"x\")";
  const csv = specCsv(specCheck(build(b), { minNameLength: 100 }));
  assert.match(csv, /'=HYPERLINK/);
});

test("typed numbers: commas read by shape, not stripped", () => {
  assert.equal(readNumber("1,250,000"), 1250000);
  assert.equal(readNumber("1,250,000.50"), 1250000.5);
  assert.equal(readNumber("29,99"), 29.99);
  assert.equal(readNumber("1.234,56"), 1234.56);
  assert.equal(readNumber("1 250 000"), 1250000);
  assert.ok(Number.isNaN(readNumber("12,3456")));
  assert.equal(parseRules({ contractValue: "12,3456" }).problems.length, 1);
});

test("milestones: a required name matches whole words, so 'Milestone 1' is not met by 'Milestone 12'", () => {
  const b = BASE();
  b.tasks[4].task_name = "Milestone 12 complete";
  b.tasks.push(task("M1X", { task_type: "TT_Task", task_name: "Milestone 1 paperwork" }));
  const r = specCheck(build(b), { milestones: ["Milestone 1", "Milestone 12", "Notice"] });
  const x = res(r, "milestones");
  assert.deepEqual(x.items.map((i) => i.name), ["Milestone 1"]);
  assert.match(x.items[0].why, /M1X "Milestone 1 paperwork" matches but is not a milestone/);
  assert.match(x.text, /1 of 3/);
  // a want that normalises to nothing must not match the first milestone it sees
  assert.equal(res(specCheck(build(BASE()), { milestones: ["---"] }), "milestones").status, "fail");
});

test("maxDuration items are listed longest first", () => {
  const b = BASE();
  b.tasks[1].target_drtn_hr_cnt = 96; b.tasks[2].target_drtn_hr_cnt = 160; b.tasks[3].target_drtn_hr_cnt = 120;
  const x = res(specCheck(build(b), { maxDuration: 10 }), "maxDuration");
  assert.deepEqual(x.items.map((i) => i.code), ["B", "C", "A"]);
});

test("costLoaded: an assignment budgeted at zero is not cost loading", () => {
  const b = BASE();
  b.extra = {
    RSRC: [{ rsrc_id: "R1", rsrc_type: "RT_Labor" }],
    TASKRSRC: [{ taskrsrc_id: "1", task_id: "A", rsrc_id: "R1", target_cost: 0 }, { taskrsrc_id: "2", task_id: "B", rsrc_id: "R1", target_cost: 5 }, { taskrsrc_id: "3", task_id: "C", rsrc_id: "R1", target_cost: 5 }],
  };
  const r = specCheck(build(b), { costLoaded: true, resourceLoaded: true });
  assert.deepEqual(res(r, "costLoaded").items.map((i) => i.code), ["A"]);
  assert.equal(res(r, "resourceLoaded").status, "pass");
});

test("rulesJson leaves out rules switched off and empty lists, keeps an empty constraint list", () => {
  const o = JSON.parse(rulesJson({ noLeads: false, requiredCodes: [], allowedConstraints: [], maxLag: 5 }));
  assert.deepEqual(o, { maxLag: 5, allowedConstraints: [] });
});

test("HTML: a note result shows a note pill, not 'not met'", () => {
  const r = specCheck(build(BASE()), { maxActivityValuePct: 10 });
  assert.equal(res(r, "maxActivityValuePct").status, "note");
  const h = specTableHtml(r);
  assert.match(h, /pill warn">note</);
  assert.ok(!/not met/.test(h));
});
