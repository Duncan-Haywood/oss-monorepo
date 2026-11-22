import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate } from "./xer.mjs";
import { Calendar } from "./calendar.mjs";
import { readCurves, spreadCurve, curvePartBefore, isEven, SLICES } from "./curves.mjs";
import { earnedValue } from "./evm.mjs";

const cal = Calendar.weekdays(8);
const LINEAR = Array(SLICES).fill(1 / SLICES);
// P6's shipped "Back Loaded": 0, then ten slices of 3.5 and ten of 6.5
const BACK = [...Array(10).fill(0.035), ...Array(10).fill(0.065)];

function daily(cal, s, e, amount, slices) {
  const m = new Map();
  const before = spreadCurve(cal, s, e, amount, slices, (d, v) => m.set(d, (m.get(d) || 0) + v), parseDate("2025-12-08 08:00"));
  return { m, before, sum: [...m.values()].reduce((a, b) => a + b, 0) };
}

test("RSRCCURVDATA: twenty slices after the start point, scaled to 100, the start point kept", () => {
  const f = ["curv_id", "curv_name", "default_flag", ...Array.from({ length: 21 }, (_, k) => `pct_usage_${k}`)];
  const row = (id, name, vals) => `%R\t${[id, name, "Y", ...vals].join("\t")}`;
  const x = parseXer(["ERMHDR\t20.12", "%T\tRSRCCURVDATA", `%F\t${f.join("\t")}`,
    row("13", "Linear", [0, ...Array(20).fill(5)]),
    row("10", "Back Loaded", [0, ...Array(10).fill(3.5), ...Array(10).fill(6.5)]),
    row("7", "Half scale", [0, ...Array(20).fill(2.5)]),
    row("8", "Start point", [10, ...Array(20).fill(4.5)]),
    row("9", "Empty", Array(21).fill(0)), "%E"].join("\r\n"));
  const c = readCurves(x);
  assert.equal(c.size, 4, "a curve with no values is left out");
  assert.ok(isEven(c.get("13").slices));
  assert.ok(isEven(c.get("7").slices), "a curve summing to 50 is scaled to 100");
  assert.ok(Math.abs(c.get("10").slices[0] - 0.035) < 1e-12 && Math.abs(c.get("10").slices[19] - 0.065) < 1e-12);
  assert.ok(Math.abs(c.get("8").slices[0] - 14.5 / 100) < 1e-12, "pct_usage_0 goes into the first slice");
  assert.ok(Math.abs(c.get("8").slices.reduce((a, b) => a + b, 0) - 1) < 1e-12);
});

test("a linear curve spreads exactly as evenly; any curve's parts sum to the amount", () => {
  // two working weeks, 2025-12-01 Mon 08:00 to 2025-12-12 Fri 17:00
  const s = parseDate("2025-12-01 08:00"), e = parseDate("2025-12-12 17:00");
  const lin = daily(cal, s, e, 1000, LINEAR);
  assert.equal(lin.m.size, 10);
  for (const v of lin.m.values()) assert.ok(Math.abs(v - 100) < 1e-9);
  assert.ok(Math.abs(lin.before - 500) < 1e-9);
  const back = daily(cal, s, e, 1000, BACK);
  assert.ok(Math.abs(back.sum - 1000) < 1e-9);
  // the first week is the first ten slices: 35%
  assert.ok(Math.abs(back.before - 350) < 1e-9);
  // each day is two slices: 70 a day, then 130
  const days = [...back.m.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  assert.deepEqual(days.map((v) => Math.round(v * 1000) / 1000), [70, 70, 70, 70, 70, 130, 130, 130, 130, 130]);
});

test("slices follow working time, not calendar time: a weekend inside takes none", () => {
  // Friday to Monday, 16 working hours: Friday is slices 1-10
  const s = parseDate("2025-12-05 08:00"), e = parseDate("2025-12-08 17:00");
  const back = daily(cal, s, e, 100, BACK);
  assert.equal(back.m.size, 2);
  assert.ok(Math.abs(back.before - 35) < 1e-9);
  // a cut inside a day: Monday 10:00, two of Monday's eight hours = slices 11-12.5
  const cut = parseDate("2025-12-08 10:00");
  assert.ok(Math.abs(curvePartBefore(cal, s, e, 100, BACK, cut) - (35 + 2.5 * 6.5)) < 1e-9);
  assert.equal(curvePartBefore(cal, s, e, 100, BACK, s), 0);
  assert.equal(curvePartBefore(cal, s, e, 100, BACK, e), 100);
});

test("earned value: a back-loaded assignment plans 35% at mid-point, not 50%; the note names the curve", () => {
  const f = ["curv_id", "curv_name", "default_flag", ...Array.from({ length: 21 }, (_, k) => `pct_usage_${k}`)];
  const D = "((0||0(s|08:00|f|12:00)())(0||1(s|13:00|f|17:00)()))";
  const WEEK = `(0||CalendarData()((0||DaysOfWeek()((0||1()())(0||2()${D})(0||3()${D})(0||4()${D})(0||5()${D})(0||6()${D})(0||7()())))(0||Exceptions()())))`;
  const tbl = (name, rows) => {
    const fields = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    return [`%T\t${name}`, `%F\t${fields.join("\t")}`, ...rows.map((r) => `%R\t${fields.map((k) => r[k] ?? "").join("\t")}`)];
  };
  const make = (curv) => parseXer(["ERMHDR\t20.12\t2025-12-01\tProject\tadmin\tAdmin\tdb\tProject Management\tEUR",
    ...tbl("PROJECT", [{ proj_id: "1", proj_short_name: "T", clndr_id: "C1", last_recalc_date: "2025-12-08 08:00", plan_start_date: "2025-12-01 08:00" }]),
    ...tbl("CALENDAR", [{ clndr_id: "C1", default_flag: "Y", clndr_name: "Mon-Fri", day_hr_cnt: 8, clndr_data: WEEK }]),
    ...tbl("PROJWBS", [{ wbs_id: "9", proj_id: "1", proj_node_flag: "Y", wbs_short_name: "T", wbs_name: "T", parent_wbs_id: "" }]),
    ...tbl("TASK", [{ task_id: "1", proj_id: "1", wbs_id: "9", clndr_id: "C1", task_type: "TT_Task", status_code: "TK_NotStart", task_code: "A", task_name: "A", remain_drtn_hr_cnt: 80, target_drtn_hr_cnt: 80, target_start_date: "2025-12-01 08:00", target_end_date: "2025-12-12 17:00" }]),
    ...tbl("RSRC", [{ rsrc_id: "1", rsrc_short_name: "L", rsrc_name: "L", rsrc_type: "RT_Labor" }]),
    ...tbl("TASKRSRC", [{ taskrsrc_id: "1", task_id: "1", proj_id: "1", rsrc_id: "1", target_cost: 1000, remain_cost: 1000, curv_id: curv }]),
    `%T\tRSRCCURVDATA`, `%F\t${f.join("\t")}`, `%R\t${["10", "Back Loaded", "Y", 0, ...Array(10).fill(3.5), ...Array(10).fill(6.5)].join("\t")}`,
    `%R\t${["13", "Linear", "Y", 0, ...Array(20).fill(5)].join("\t")}`, "%E"].join("\r\n"));
  const back = earnedValue(make("10"), { projId: "1" });
  assert.equal(back.totals.pv, 350);
  assert.equal(back.totals.bac, 1000);
  assert.ok(back.notes.some((n) => /1 assignment follows a P6 resource curve \(Back Loaded 1\)/.test(n)));
  assert.equal(earnedValue(make("13"), { projId: "1" }).totals.pv, 500, "Linear is the even spread");
  assert.equal(earnedValue(make(""), { projId: "1" }).totals.pv, 500);
  const missing = earnedValue(make("99"), { projId: "1" });
  assert.equal(missing.totals.pv, 500);
  assert.ok(missing.notes.some((n) => /names a resource curve the file does not carry/.test(n)));
  // the baseline cut a series of updates uses follows the curve too
  const cut = earnedValue(make("10"), { projId: "1", pvCuts: [parseDate("2025-12-08 08:00"), parseDate("2025-12-13 00:00")] });
  assert.deepEqual(cut.pvAt, [350, 1000]);
  // the forecast of the unstarted remaining follows the curve: the curve's month ends close on BAC
  assert.equal(back.curve.at(-1).forecast, 1000);
});

test("curveRows: rows at midnights and slice ends, summing to the amount, day by day as spreadCurve", async () => {
  const { curveRows, matchContour } = await import("./curves.mjs");
  const { contourSlices } = await import("./contours.mjs");
  const s = parseDate("2025-12-01 08:00"), e = parseDate("2025-12-12 17:00");
  const rows = curveRows(cal, s, e, 80, BACK);
  assert.equal(rows[0].start, s);
  assert.equal(rows[rows.length - 1].finish, e);
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].start, rows[i - 1].finish, "consecutive");
  assert.ok(Math.abs(rows.reduce((a, r) => a + r.work, 0) - 80) < 1e-9);
  assert.ok(rows.filter((r) => r.work === 0).length >= 2, "the weekend has rows with no work");
  const want = daily(cal, s, e, 80, BACK).m;
  const got = new Map();
  for (const r of rows) if (r.work) { const d = Math.floor(r.start / 1440); got.set(d, (got.get(d) || 0) + r.work); }
  for (const [d, v] of want) assert.ok(Math.abs(got.get(d) - v) < 1e-9, `day ${d}`);
  assert.equal(matchContour(contourSlices(3), contourSlices), 3);
  assert.equal(matchContour(BACK, contourSlices), 0, "P6's Back Loaded is not Project's");
});

test("XER -> Project: a P6 curve as contoured timephased work; started, even and missing curves stay flat", async () => {
  const { mspdiText } = await import("./msproject.mjs");
  const { EXAMPLE_XER } = await import("./example.mjs");
  const x = parseXer(EXAMPLE_XER);
  const curveRow = (id, name, v) => ({ curv_id: id, curv_name: name, default_flag: "N", ...Object.fromEntries([0, ...v].map((p, i) => [`pct_usage_${i}`, String(p)])) });
  // a curve with a hole: its zero slices must not read back as a split
  const holed = [...Array(5).fill(10), ...Array(10).fill(0), ...Array(5).fill(10)];
  x.tables.RSRCCURVDATA = [curveRow("90", "Back Loaded", [...Array(10).fill(3.5), ...Array(10).fill(6.5)]), curveRow("91", "Holed", holed), curveRow("92", "Linear", Array(20).fill(5))];
  // the unstarted assignments with work left get the shaped curves, the rest
  // (started or with nothing left) the even and the missing ones and Back Loaded
  let open = 0, other = 0;
  for (const a of x.tables.TASKRSRC) {
    if (!(Number(a.act_reg_qty) > 0) && Number(a.remain_qty) > 0) a.curv_id = ["90", "91"][open++ % 2];
    else a.curv_id = ["92", "99", "90"][other++ % 3];
  }
  const r = mspdiText(x);
  const curvedAsg = x.tables.TASKRSRC.filter((a) => ["90", "91"].includes(a.curv_id) && !(Number(a.act_reg_qty) > 0) && Number(a.remain_qty) > 0);
  assert.equal(r.counts.curved, curvedAsg.length);
  assert.ok(r.counts.curved > 0);
  assert.equal((r.xml.match(/<WorkContour>8<\/WorkContour>/g) || []).length, curvedAsg.length);
  assert.equal((r.xml.match(/<WorkContour>/g) || []).length, curvedAsg.length, "even and missing curves write no contour");
  assert.match(r.warnings.join("\n"), /name a resource curve the file does not carry/);
  assert.doesNotMatch(r.xml, /<TimephasedData>(?:(?!<\/TimephasedData>).)*<Value>PT0H0M0S<\/Value>/, "no zero rows: Project reads those as splits");
  const { parseMspdi } = await import("./mspdi.mjs");
  assert.ok(!parseMspdi(r.xml).warnings.some((w) => /split/.test(w)));
});

test("curveRows: an empty or reversed span gives no rows, with or without a calendar", async () => {
  const { curveRows } = await import("./curves.mjs");
  const s = parseDate("2025-12-01 08:00");
  assert.deepEqual(curveRows(cal, s, s, 8, BACK), []);
  assert.deepEqual(curveRows(cal, s + 600, s, 8, BACK), []);
  assert.deepEqual(curveRows(null, s, s + 600, 8, BACK), []);
});
