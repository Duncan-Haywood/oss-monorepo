import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer } from "./xer.mjs";
import { riskAnalysis, parseRanges } from "./risk.mjs";
import { udfFields, guessRangeFields, rangesFromUdf, roleOf, unitOf, udfSpec, udfRangeNote } from "./udf-ranges.mjs";

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
const task = (id, code, hours, extra = {}) => ({ task_id: id, proj_id: "1", wbs_id: "10", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: code, task_name: `Activity ${code}`, remain_drtn_hr_cnt: hours, target_drtn_hr_cnt: hours, ...extra });
const link = (id, succ, pred) => ({ task_pred_id: id, task_id: succ, pred_task_id: pred, proj_id: "1", pred_proj_id: "1", pred_type: "PR_FS", lag_hr_cnt: 0 });
const udfType = (id, label, type = "FT_FLOAT_2_DECIMALS", table = "TASK") => ({ udf_type_id: id, table_name: table, udf_type_name: `user_field_${id}`, udf_type_label: label, logical_data_type: type, super_flag: "N" });
const udfVal = (type, task, n) => ({ udf_type_id: type, fk_id: task, proj_id: "1", udf_date: "", udf_number: n, udf_text: "", udf_code_id: "" });

// S -> A (5 d), B (5 d) -> C (1 d), plus a finished D
function build(types, values) {
  return parseXer(xerText({
    PROJECT: [{ proj_id: "1", proj_short_name: "TEST", clndr_id: "C1", last_recalc_date: "2025-12-01 00:00", plan_start_date: "2025-12-01 00:00", plan_end_date: "" }],
    CALENDAR: [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Standard", day_hr_cnt: 8, clndr_data: WEEK }],
    SCHEDOPTIONS: [{ schedoptions_id: "1", proj_id: "1", sched_float_type: "FT_FF", sched_calendar_on_relationship_lag: "rcal_Predecessor", sched_retained_logic: "Y", sched_progress_override: "N" }],
    TASK: [task("1", "S", 0, { task_type: "TT_Mile" }), task("2", "A", 40), task("3", "B", 40), task("4", "C", 8), task("5", "D", 0, { status_code: "TK_Complete", act_start_date: "2025-11-01 08:00", act_end_date: "2025-11-03 17:00" })],
    TASKPRED: [link("1", "2", "1"), link("2", "3", "1"), link("3", "4", "2"), link("4", "4", "3")],
    ...(types.length ? { UDFTYPE: types } : {}),
    ...(values.length ? { UDFVALUE: values } : {}),
  }));
}

test("roleOf: names that hold one range point, not quantities or two points", () => {
  for (const [l, r] of [["Optimistic Duration", "min"], ["Most Likely Dur", "likely"], ["Pessimistic Duration", "max"], ["Min Dur", "min"], ["Max Duration (hrs)", "max"], ["BC %", "min"], ["WC Days", "max"], ["Best Case", "min"], ["Worst Case", "max"]]) assert.equal(roleOf(l), r, l);
  for (const l of ["Max Qty", "Max Units", "Min/Max Dur", "Low", "user_number8", "Duration|Differe", "No.of Wor Days", "WC fixtures"]) assert.equal(roleOf(l), null, l);
  assert.equal(unitOf("Optimistic Duration"), "days");
  assert.equal(unitOf("Pess Dur (hrs)"), "hours");
  assert.equal(unitOf("BC %"), "pct");
});

test("udfFields lists numeric activity fields with their value counts", () => {
  const x = build([udfType("10", "Optimistic Dur"), udfType("11", "Note", "FT_TEXT"), udfType("12", "Pessimistic Dur", "FT_INT", "PROJWBS")], [udfVal("10", "2", 4)]);
  assert.deepEqual(udfFields(x), [{ id: "10", label: "Optimistic Dur", type: "FT_FLOAT_2_DECIMALS", values: 1 }]);
});

test("guessRangeFields needs an optimistic and a pessimistic field with values", () => {
  assert.equal(guessRangeFields([{ id: "1", label: "Optimistic Dur", values: 3 }]), null);
  assert.deepEqual(guessRangeFields([{ id: "1", label: "Optimistic Dur", values: 3 }, { id: "2", label: "Pessimistic Dur", values: 3 }]), { min: "1", likely: null, max: "2" });
  assert.equal(guessRangeFields([{ id: "1", label: "Optimistic Dur", values: 3 }, { id: "2", label: "Pessimistic Dur", values: 0 }]), null);
});

const three = [udfType("10", "Optimistic Duration"), udfType("11", "Most Likely Duration"), udfType("12", "Pessimistic Duration")];
const vals = [udfVal("10", "2", 4), udfVal("11", "2", 5), udfVal("12", "2", 9), udfVal("10", "3", 5), udfVal("11", "3", 5), udfVal("12", "3", 6), udfVal("10", "4", 1), udfVal("10", "5", 1), udfVal("11", "5", 1), udfVal("12", "5", 2), udfVal("10", "1", 0), udfVal("11", "1", 0), udfVal("12", "1", 0)];

test("rangesFromUdf reads open activities, names partial ones, skips finished work and milestones", () => {
  const u = rangesFromUdf(build(three, vals));
  assert.deepEqual([...u.ranges], [["A", { min: 4, likely: 5, max: 9, unit: "days" }], ["B", { min: 5, likely: 5, max: 6, unit: "days" }]]);
  assert.deepEqual(u.partial, ["C"]);
  assert.equal(u.fields.min.label, "Optimistic Duration");
  assert.match(udfRangeNote(u), /"Optimistic Duration" \/ "Most Likely Duration" \/ "Pessimistic Duration" \(working days\) on 2 open activities; 1 with only some/);
});

test("UDF ranges give the same risk run as the same ranges pasted as CSV", () => {
  const x = build(three, vals);
  const u = rangesFromUdf(x);
  const a = riskAnalysis(x, { iterations: 300, seed: 7, ranges: u.ranges, rangeSource: udfRangeNote(u) });
  const b = riskAnalysis(x, { iterations: 300, seed: 7, ranges: parseRanges("A,4,5,9\nB,5,5,6").ranges });
  assert.deepEqual(a.percentiles, b.percentiles);
  assert.deepEqual(a.activities, b.activities);
  assert.equal(a.overrides, 2);
  assert.ok(a.warnings.some((w) => w.startsWith("ranges from the file's own UDFs")));
});

test("hours, percent and a missing most likely convert to the same minutes", () => {
  const ref = riskAnalysis(build(three, vals), { iterations: 200, seed: 3, ranges: parseRanges("A,4,5,9\nB,5,5,6").ranges });
  const hrs = build([udfType("10", "Opt Dur hrs"), udfType("11", "ML Dur hrs"), udfType("12", "Pess Dur hrs")], [udfVal("10", "2", 32), udfVal("11", "2", 40), udfVal("12", "2", 72), udfVal("10", "3", 40), udfVal("11", "3", 40), udfVal("12", "3", 48)]);
  assert.deepEqual(riskAnalysis(hrs, { iterations: 200, seed: 3, ranges: rangesFromUdf(hrs).ranges }).percentiles, ref.percentiles);
  const pct = build([udfType("10", "BC %"), udfType("12", "WC %")], [udfVal("10", "2", 80), udfVal("12", "2", 180), udfVal("10", "3", 100), udfVal("12", "3", 120)]);
  const up = rangesFromUdf(pct);
  assert.equal(up.fields.likely, null);
  assert.deepEqual(riskAnalysis(pct, { iterations: 200, seed: 3, ranges: up.ranges }).percentiles, ref.percentiles);
});

test("a range out of order against the remaining duration falls back to the default and is named", () => {
  const x = build([udfType("10", "Min Dur"), udfType("12", "Max Dur")], [udfVal("10", "2", 6), udfVal("12", "2", 9), udfVal("10", "3", 4), udfVal("12", "3", 7)]);
  const r = riskAnalysis(x, { iterations: 100, seed: 1, ranges: rangesFromUdf(x).ranges });
  assert.equal(r.overrides, 1);
  assert.equal(r.inconsistentRanges, 1);
  assert.ok(r.warnings.some((w) => /1 activity range\(s\) left on the default range.*remaining duration.*: A$/.test(w)));
});

test("udfSpec names fields by id or label; a file with no recognisable names reads nothing", () => {
  const x = build([udfType("20", "Short"), udfType("21", "Long")], [udfVal("20", "2", 4), udfVal("21", "2", 6)]);
  assert.equal(rangesFromUdf(x).fields, null);
  const spec = udfSpec(x, "short, -, 21");
  assert.deepEqual(spec, { min: "20", likely: null, max: "21" });
  assert.deepEqual([...rangesFromUdf(x, spec).ranges], [["A", { min: 4, likely: null, max: 6, unit: "days" }]]);
  assert.throws(() => udfSpec(x, "nope,-,21"), /no numeric activity UDF "nope"/);
  assert.throws(() => rangesFromUdf(build([udfType("10", "Opt Dur hrs"), udfType("12", "Pess Dur")], [udfVal("10", "2", 1), udfVal("12", "2", 2)])), /different units/);
});

test("udfFields counts only filled-in numbers; a field with blank values is not guessed", () => {
  const x = build([udfType("10", "Optimistic Dur"), udfType("12", "Pessimistic Dur")], [udfVal("10", "2", 4), udfVal("12", "2", ""), udfVal("12", "3", "")]);
  assert.deepEqual(udfFields(x).map((f) => f.values), [1, 0]);
  assert.equal(rangesFromUdf(x).fields, null);
});

test("a most-likely field named by the user is read, not dropped", () => {
  const x = build(three, vals);
  const spec = udfSpec(x, "10,Most Likely Duration,12");
  assert.deepEqual(spec, { min: "10", likely: "11", max: "12" });
  const u = rangesFromUdf(x, spec);
  assert.equal(u.ranges.get("A").likely, 5);
  assert.equal(u.fields.likely.label, "Most Likely Duration");
});

test("negative UDF durations are not drawn: left on the default range with a warning", () => {
  const x = build(three, [udfVal("10", "2", -20), udfVal("11", "2", -10), udfVal("12", "2", -5), udfVal("10", "3", 5), udfVal("11", "3", 5), udfVal("12", "3", 5)]);
  const zero = { min: 1, likely: 1, max: 1 };
  const r = riskAnalysis(x, { iterations: 200, seed: 1, range: zero, ranges: rangesFromUdf(x).ranges });
  assert.equal(r.inconsistentRanges, 1);
  assert.equal(r.overrides, 1);
  // A keeps its 5 days, so no run finishes before the CPM date
  assert.ok(r.percentiles.every((q) => q.overDeterministic >= 0), JSON.stringify(r.percentiles));
  assert.ok(r.warnings.some((w) => /negative/.test(w) && /: A$/.test(w)), r.warnings.join(" | "));
});

test("udfSpec: no spec, true or auto means guess the fields", () => {
  // red team 2026-11-25: the CLI passes true for a bare --udf-ranges flag
  const x = build(three, vals);
  for (const s of [undefined, null, "", true, "auto"]) assert.deepEqual(udfSpec(x, s), {}, String(s));
});

test("level-of-effort, WBS and both milestone kinds take no range from their UDFs", () => {
  const x = build(three, vals);
  for (const t of x.tables.TASK) if (t.task_code === "A") t.task_type = "TT_LOE";
  for (const t of x.tables.TASK) if (t.task_code === "B") t.task_type = "TT_FinMile";
  assert.deepEqual([...rangesFromUdf(x).ranges.keys()], []);
  for (const t of x.tables.TASK) if (t.task_code === "A") t.task_type = "TT_WBS";
  assert.deepEqual([...rangesFromUdf(x).ranges.keys()], []);
});
