// P6 resource curves in earned value (curves.mjs, evm.mjs) on public P6 files:
// which curves each file carries and its assignments use, and planned value
// at the data date and on the S-curve with each assignment on its curve
// against the even spread, in cost and in labour hours. Also whether the
// curves still close on the budget and the estimate at completion.
//
//   node eval/resource-curves.mjs <dir-or-files...> [--json out.json]
//
// eval/resource-curves-2026-11-21.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer } from "../xer.mjs";
import { parseSchedule } from "../mspdi.mjs";
import { schedule } from "../cpm.mjs";
import { assess } from "../dcma.mjs";
import { earnedValue } from "../evm.mjs";
import { readCurves } from "../curves.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) { for (const f of readdirSync(a)) if (/\.xer$/i.test(f)) files.push(join(a, f)); } else files.push(a);
}
const out = [];
for (const f of files.sort()) {
  const xer = parseSchedule(decodeXer(readFileSync(f)));
  const T = xer.tables;
  const result = schedule(xer);
  const pid = assess(xer, { result }).project.id;
  const ct = { curves: readCurves(xer) };
  const tasks = new Set((T.TASK || []).filter((t) => t.proj_id === pid).map((t) => t.task_id));
  const use = {};
  for (const a of T.TASKRSRC || []) {
    if (!tasks.has(a.task_id) || !a.curv_id) continue;
    const name = ct.curves.get(a.curv_id)?.name ?? `(curv_id ${a.curv_id}, not in file)`;
    const u = (use[name] ||= { assignments: 0, cost: 0, hours: 0 });
    u.assignments++; u.cost += +a.target_cost || 0; u.hours += +a.target_qty || 0;
  }
  const row = { file: f.split("/").pop(), curves: [...ct.curves.values()].map((c) => c.name), use };
  for (const measure of ["cost", "hours"]) {
    const on = earnedValue(xer, { projId: pid, result, measure });
    if (!on.measure) { row[measure] = null; continue; }
    const off = earnedValue(xer, { projId: pid, result, measure, curves: false });
    const last = on.curve.at(-1) || {};
    // the largest gap between the two planned curves at a month end
    let gap = { date: null, on: 0, off: 0 };
    for (let k = 0; k < on.curve.length; k++) {
      const a = on.curve[k], b = off.curve[k];
      if (!b || a.date !== b.date) continue;
      if (Math.abs(a.pv - b.pv) > Math.abs(gap.on - gap.off)) gap = { date: a.date, on: a.pv, off: b.pv };
    }
    row[measure] = {
      bac: on.totals.bac, pvCurves: on.totals.pv, pvEven: off.totals.pv, spiCurves: on.totals.spi, spiEven: off.totals.spi,
      pvCloses: Math.abs((last.pv ?? 0) - on.totals.bac) <= Math.max(0.05, 1e-9 * on.totals.bac),
      fcCloses: last.forecast === null || last.forecast === undefined ? null : Math.abs(last.forecast - on.totals.eac) <= Math.max(0.05, 1e-9 * on.totals.eac),
      widestMonthGap: gap,
      notes: on.notes.filter((n) => /curve/.test(n) && !/^Planned value follows/.test(n)),
    };
  }
  // planted: every assignment on one of P6's shipped curves in turn (as the
  // hospital file exports them), to see the curves move the S-curve and still
  // close on the budget and the estimate at completion
  if ((T.TASKRSRC || []).length) {
    row.planted = {};
    const SHIPPED = { "Back Loaded": [0, ...Array(10).fill(3.5), ...Array(10).fill(6.5)], "Front Loaded": [0, ...Array(10).fill(6.5), ...Array(10).fill(3.5)], "Bell Shaped": [0, 0.5, 0.5, 1.5, 1.5, 4, 4, 7.5, 7.5, 11.5, 11.5, 11.5, 11.5, 7.5, 7.5, 4, 4, 1.5, 1.5, 0.5, 0.5] };
    const saved = { curves: T.RSRCCURVDATA, ids: (T.TASKRSRC || []).map((a) => a.curv_id) };
    for (const [name, pts] of Object.entries(SHIPPED)) {
      T.RSRCCURVDATA = [{ curv_id: "planted", curv_name: name, ...Object.fromEntries(pts.map((v, k) => [`pct_usage_${k}`, String(v)])) }];
      for (const a of T.TASKRSRC) a.curv_id = "planted";
      const p = {};
      for (const measure of ["cost", "hours"]) {
        const on = earnedValue(xer, { projId: pid, result, measure });
        if (!on.measure) continue;
        const off = earnedValue(xer, { projId: pid, result, measure, curves: false });
        let gap = { date: null, on: 0, off: 0 };
        for (let k = 0; k < on.curve.length; k++) { const a = on.curve[k], b = off.curve[k]; if (b && a.date === b.date && Math.abs(a.pv - b.pv) > Math.abs(gap.on - gap.off)) gap = { date: a.date, on: a.pv, off: b.pv }; }
        const last = on.curve.at(-1) || {};
        p[measure] = { pvAtDataDate: on.totals.pv, pvEven: off.totals.pv, pvCloses: Math.abs((last.pv ?? 0) - on.totals.bac) <= Math.max(0.05, 1e-9 * on.totals.bac), fcCloses: last.forecast == null ? null : Math.abs(last.forecast - on.totals.eac) <= Math.max(0.05, 1e-9 * Math.abs(on.totals.eac)), widestMonthGap: gap };
      }
      row.planted[name] = p;
    }
    T.RSRCCURVDATA = saved.curves;
    T.TASKRSRC.forEach((a, k) => { a.curv_id = saved.ids[k]; });
  }
  out.push(row);
  console.log(JSON.stringify(row));
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 1) + "\n");
