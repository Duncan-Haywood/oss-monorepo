import { test } from "node:test";
import assert from "node:assert/strict";
import { parseXer, parseDate, xerText } from "./xer.mjs";
import { EXAMPLE_XER } from "./example.mjs";
import { exampleSeries } from "./example-series.mjs";
import { statusAsPlanned } from "./status.mjs";
import { earnedValue } from "./evm.mjs";
import { earnedValueSeries, earnedValueSeriesText, earnedValueSeriesCsv } from "./evmseries.mjs";

const apr = () => parseXer(EXAMPLE_XER);
const MAY = parseDate("2026-05-04 07:00"), JUN = parseDate("2026-06-01 07:00");

test("statusing as planned posts cost at the planned rate; costs: false leaves it", () => {
  const x = apr();
  const before = earnedValue(x, { projId: "77" }).totals;
  const may = statusAsPlanned(x, "77", MAY);
  const after = earnedValue(may, { projId: "77" }).totals;
  assert.ok(after.ac > before.ac);
  assert.equal(after.bac, before.bac);
  // nothing spent beyond the budget's estimate: actual + remaining is unchanged
  assert.ok(Math.abs(after.eac - before.eac) < 0.01);
  const frozen = earnedValue(statusAsPlanned(x, "77", MAY, { costs: false }), { projId: "77" }).totals;
  assert.equal(frozen.ac, before.ac);
});

test("a window worked exactly as the last update forecast earns what it promised", () => {
  const x = apr();
  const may = statusAsPlanned(x, "77", MAY);
  const r = earnedValueSeries([{ xer: x, label: "Apr" }, { xer: may, label: "May" }]);
  const w = r.windows[0];
  assert.equal(w.performance, 1);
  assert.ok(w.earned > 0);
  assert.equal(w.behind.length, 0);
  assert.equal(w.ahead.length, 0);
  // the windows add up to the change across the series
  assert.ok(Math.abs(w.earned - (r.updates[1].ev - r.updates[0].ev)) < 0.05);
  assert.ok(Math.abs(w.spent - (r.updates[1].ac - r.updates[0].ac)) < 0.05);
});

test("a planted slip is named behind its promise; a planted overrun spends past what it earned", () => {
  const x = apr();
  const may = statusAsPlanned(x, "77", MAY);
  const jun = statusAsPlanned(may, "77", JUN, { slips: [{ code: "A1120", hours: 32 }], overruns: [{ code: "A1130", factor: 1.5 }] });
  const r = earnedValueSeries([{ xer: may, label: "May" }, { xer: jun, label: "Jun" }]);
  const w = r.windows[0];
  assert.deepEqual(w.behind.map((b) => b.code), ["A1120"]);
  assert.ok(w.performance < 1);
  assert.ok(w.costlier.some((c) => c.code === "A1130"));
  assert.ok(w.cpi < 1);
  assert.equal(w.ahead.length, 0);
});

test("the baseline is the first update's planned curve, held at every data date", () => {
  const r = earnedValueSeries(exampleSeries());
  assert.equal(r.baseline, "March update");
  assert.equal(r.updates[0].pvBaseline, r.updates[0].pv);
  // the April file's own planned dates drifted from March's
  assert.notEqual(r.updates[1].pvBaseline, r.updates[1].pv);
  assert.equal(r.windows.length, 3);
  // March to April: the paint budget change and the removed final clean are revisions
  const w1 = r.windows[0];
  assert.ok(w1.budgetChanged.some((b) => b.code === "A1150"));
  assert.ok(w1.removed.some((b) => b.code === "A1205"));
  assert.equal(w1.budgetChange, -3800);
  // the series' sum of windows equals first to last
  const sum = r.windows.reduce((s, w) => s + w.earned, 0);
  assert.ok(Math.abs(sum - (r.updates[3].ev - r.updates[0].ev)) < 0.05);
  assert.equal(r.windows[1].performance, 1); // May: statused as planned
  assert.deepEqual(r.windows[2].behind.map((b) => b.code), ["A1120"]); // June: board and tape ran long
});

test("percent taken back and actuals reversed are named", () => {
  const may = statusAsPlanned(apr(), "77", MAY);
  const back = parseXer(xerText(may));
  for (const a of back.tables.TASKRSRC) if (a.task_id === "5004") { a.act_reg_cost = "1000"; }
  for (const t of back.tables.TASK) if (t.task_code === "A1050") { t.status_code = "TK_Active"; t.act_end_date = ""; t.remain_drtn_hr_cnt = "20"; }
  for (const p of back.tables.PROJECT) p.last_recalc_date = "2026-05-11 07:00";
  const r = earnedValueSeries([{ xer: may, label: "May" }, { xer: back, label: "May 11" }]);
  const w = r.windows[0];
  assert.ok(w.earnedTakenBack.some((x) => x.code === "A1050"));
  assert.ok(w.actualReversed.some((x) => x.code === "A1030"));
});

test("text and CSV carry the windows; an unloaded series says so", () => {
  const r = earnedValueSeries(exampleSeries());
  const t = earnedValueSeriesText(r);
  assert.match(t, /Window 3: May update to June update/);
  assert.match(t, /A1120 Board and tape, level 1/);
  const csv = earnedValueSeriesCsv(r);
  assert.match(csv, /^window,from,to,kind/);
  assert.match(csv, /behind,A1120/);
  const bare = parseXer(EXAMPLE_XER.replace(/%T\tTASKRSRC[\s\S]*?(?=%T\tRSRC\r\n)/, ""));
  const later = statusAsPlanned(bare, "77", MAY);
  const u = earnedValueSeries([{ xer: bare }, { xer: later }]);
  assert.equal(u.measure, null);
  assert.equal(u.windows.length, 0);
  assert.throws(() => earnedValueSeries([{ xer: bare }]));
});

test("CSV cells that would read as formulas are written as text", () => {
  const series = exampleSeries();
  for (const u of series) for (const t of u.xer.tables.TASK) if (t.task_code === "A1120") t.task_name = "=HYPERLINK(1)";
  const csv = earnedValueSeriesCsv(earnedValueSeries(series));
  assert.match(csv, /'=HYPERLINK\(1\)/);
  assert.match(csv, /,-?\d/); // plain negative numbers stay numbers
});

// Guards added by the 2026-11-26 red-team run (prompts/runs/2026-11-26-*.json).
test("series totals run first update to last, not second to last", () => {
  const r = earnedValueSeries(exampleSeries());
  const first = r.updates[0], last = r.updates[r.updates.length - 1];
  // the paint budget cut lands in the first window, so first-to-last is -3,800 and second-to-last would be 0
  assert.equal(r.total.budgetChange, -3800);
  assert.equal(r.total.budgetChange, Math.round((last.bac - first.bac) * 100) / 100);
  assert.equal(r.total.eacChange, Math.round((last.eac - first.eac) * 100) / 100);
});

test("the project named is the latest update's", () => {
  const x = apr();
  const may = statusAsPlanned(x, "77", MAY);
  for (const p of may.tables.PROJECT) p.proj_short_name = "OFFICE-FITOUT-R1";
  const r = earnedValueSeries([{ xer: x, label: "Apr" }, { xer: may, label: "May" }]);
  assert.equal(r.project, "OFFICE-FITOUT-R1");
  assert.ok(r.warnings.some((w) => w.startsWith("Apr:")), r.warnings.join("\n"));
});

test("as planned on duration percent: promised matches earned to the cent", () => {
  const x = apr();
  const r = earnedValueSeries([{ xer: x, label: "Apr" }, { xer: statusAsPlanned(x, "77", MAY), label: "May" }]);
  const w = r.windows[0];
  // performance rounds to 3 places; the amounts must agree exactly
  assert.ok(Math.abs(w.promised - w.earnedOnPromised) < 0.05, `${w.promised} vs ${w.earnedOnPromised}`);
});

test("physical percent: the forecast advances physical percent with the work", () => {
  const x = apr();
  const may = statusAsPlanned(x, "77", MAY);
  for (const t of x.tables.TASK) t.complete_pct_type = "CP_Phys";
  for (const t of may.tables.TASK) {
    t.complete_pct_type = "CP_Phys";
    if (t.status_code === "TK_Active") t.phys_complete_pct = String(100 * (1 - Number(t.remain_drtn_hr_cnt) / Number(t.target_drtn_hr_cnt)));
  }
  const w = earnedValueSeries([{ xer: x, label: "Apr" }, { xer: may, label: "May" }]).windows[0];
  assert.equal(w.performance, 1);
  assert.deepEqual(w.ahead.map((a) => a.code), []);
  assert.deepEqual(w.behind.map((a) => a.code), []);
  // judged on each activity's unrounded percent, so earned-on-promised equals the summed earned value
  assert.ok(Math.abs(w.promised - w.earnedOnPromised) < 0.05, `${w.promised} vs ${w.earnedOnPromised}`);
});

test("an activity is named only when its gap is more than the tolerance", () => {
  const x = apr();
  const next = parseXer(xerText(x));
  for (const p of next.tables.PROJECT) p.last_recalc_date = "2026-04-07 07:00";
  // punch list is forecast for July, so nothing was promised for it this week
  const set = (code, pct) => { for (const t of next.tables.TASK) if (t.task_code === code) { t.status_code = "TK_Active"; t.complete_pct_type = "CP_Phys"; t.phys_complete_pct = String(pct); } };
  set("A1200", 100 / 3800); // earns exactly 1.00, the cost tolerance
  set("A1190", 200 / 1520); // earns 2.00
  const w = earnedValueSeries([{ xer: x, label: "Apr 6" }, { xer: next, label: "Apr 7" }]).windows[0];
  const named = w.ahead.map((a) => a.code);
  assert.ok(named.includes("A1190"), JSON.stringify(w.ahead));
  assert.ok(!named.includes("A1200"), JSON.stringify(w.ahead));
});
