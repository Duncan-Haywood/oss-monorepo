// Microsoft Project work contours against Project's own timephased work.
//
// For every assignment with a built-in contour (WorkContour 1-7) and stored
// remaining-work rows (TimephasedData Type 1) in the MSPDI files given:
//
//   1. the shape: each row's work per working hour over the assignment's
//      peak units, averaged over each tenth of the assignment's working
//      span, against contours.mjs's table (largest gap in percentage points);
//   2. the span: work / units x contourSpanFactor against the working time
//      from the assignment's Start to Finish on the task's calendar;
//   3. the spread: Project's cumulative work at every row boundary against
//      the work before that moment when spread on the task's calendar over
//      the assignment's dates (curves.mjs's spreadCurve) by
//      (a) contours.mjs's slices, (b) the P6 curve of the same name, as
//      MPXJ's WorkContour constants hold it, (c) evenly;
//   4. the conversion: p6xer.mjs's XER for the file carries one curved
//      TASKRSRC per such assignment, and its curve reads back
//      (curves.mjs) as the contour's slices to 1e-5 of the work (the curve
//      values are written to 4 decimals of a percent, as P6 shows them).
//
//   node eval/work-contours.mjs <dir-or-files...> [--json out.json]
//
// eval/work-contours-2026-11-21.md
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseMspdi, parseXml, durationHours } from "../mspdi.mjs";
import { Calendar } from "../calendar.mjs";
import { parseDate, parseXer } from "../xer.mjs";
import { curvePartBefore, readCurves, SLICES } from "../curves.mjs";
import { PROJECT_CONTOURS, contourSlices, contourSpanFactor } from "../contours.mjs";
import { p6XerText } from "../p6xer.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--json")) {
  if (statSync(a).isDirectory()) { for (const f of readdirSync(a)) if (/\.xml$/i.test(f)) files.push(join(a, f)); } else files.push(a);
}

// MPXJ 16's WorkContour constants (the 21 values getCurveValues() returns,
// printed 2026-11-21 from pip mpxj): P6's shipped curves, which MPXJ also
// uses for Project's contours of the same name
const MPXJ = {
  1: [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5],
  2: [6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5],
  3: [1.3, 2.5, 3.8, 5.1, 7.6, 10.1, 7.6, 5.1, 3.8, 2.5, 2.5, 2.5, 3.8, 5.1, 7.6, 10.1, 7.6, 5.1, 3.8, 2.5],
  4: [1.2, 2.5, 3.8, 5.0, 7.5, 10.1, 10.1, 10.1, 8.8, 7.5, 6.3, 5.0, 5.0, 5.0, 3.8, 2.5, 2.0, 1.5, 1.3, 1.0],
  5: [1.0, 1.3, 1.5, 2.0, 2.5, 3.8, 5.0, 5.0, 5.0, 6.3, 7.5, 8.8, 10.1, 10.1, 10.1, 7.5, 5.0, 3.8, 2.5, 1.2],
  6: [0.5, 0.5, 1.5, 1.5, 4.0, 4.0, 7.5, 7.5, 11.5, 11.5, 11.5, 11.5, 7.5, 7.5, 4.0, 4.0, 1.5, 1.5, 0.5, 0.5],
  7: [1.0, 1.0, 3.5, 3.5, 5.5, 5.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 5.5, 5.5, 3.5, 3.5, 1.0, 1.0],
};
const norm = (v) => { const s = v.reduce((a, b) => a + b, 0); return v.map((x) => x / s); };
const EVEN = Array(SLICES).fill(1 / SLICES);

const kids = (n, t) => (n?.children || []).filter((c) => c.name === t);
const kid = (n, t) => kids(n, t)[0];
const val = (n, t) => { const k = kid(n, t); return k ? (k.text ?? "") : ""; };
// seconds kept (Project writes a stretched finish as 10:17:06)
const at = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 60000 : parseDate(s); };

const rows = [];
const conversions = [];
for (const f of files.sort()) {
  const text = readFileSync(f, "utf8");
  if (!/<WorkContour>[1-7]</.test(text)) continue;
  let x;
  try { x = parseMspdi(text); } catch { continue; }
  const cals = new Map(x.tables.CALENDAR.map((r) => [r.clndr_id, Calendar.fromXer(r)]));
  const task = new Map(x.tables.TASK.map((t) => [t.task_id, t]));
  const proj = kid(parseXml(text), "Project");
  let found = 0;
  for (const a of kids(kid(proj, "Assignments"), "Assignment")) {
    const wc = val(a, "WorkContour");
    if (!PROJECT_CONTOURS[wc]) continue;
    found++;
    const t = task.get(val(a, "TaskUID"));
    const cal = t && cals.get(t.clndr_id);
    const td = kids(a, "TimephasedData").filter((r) => val(r, "Type") === "1" && val(r, "Value") !== "");
    const actual = durationHours(val(a, "ActualWork")) || 0;
    const row = { file: f.split("/").pop(), uid: val(a, "UID"), task: t?.task_name ?? null, contour: PROJECT_CONTOURS[wc].name, wc: Number(wc), units: Number(val(a, "Units")) || 1, work: durationHours(val(a, "Work")), actual, timephasedRows: td.length };
    rows.push(row);
    if (!cal || !td.length || actual > 0) { row.skipped = !cal ? "no calendar" : actual > 0 ? "has actual work" : "no timephased rows"; continue; }
    const s = at(val(a, "Start")), e = at(val(a, "Finish"));
    const total = cal.workBetween(s, e);
    // 1. shape
    const segWork = Array(10).fill(0), segTime = Array(10).fill(0);
    // 3. spread: cumulative at each row's finish
    const series = [];
    let cum = 0;
    for (const r of td.sort((p, q) => at(val(p, "Start")) - at(val(q, "Start")))) {
      const rs = at(val(r, "Start")), rf = Math.min(at(val(r, "Finish")), e), h = durationHours(val(r, "Value"));
      const w0 = cal.workBetween(s, rs), w1 = cal.workBetween(s, rf);
      if (w1 > w0 && h > 0) {
        const k = Math.min(9, Math.floor(((w0 + w1) / 2 / total) * 10));
        segWork[k] += h * 60; segTime[k] += w1 - w0;
      }
      cum += h;
      series.push([rf, cum]);
    }
    const pct = segWork.map((w, k) => (segTime[k] ? (100 * w) / segTime[k] / row.units : null));
    const want = PROJECT_CONTOURS[wc].pct;
    row.shape = pct.map((p) => (p === null ? null : Math.round(p * 10) / 10));
    row.shapeGap = Math.round(Math.max(...pct.map((p, k) => (p === null ? 0 : Math.abs(p - want[k])))) * 100) / 100;
    row.segmentsSeen = pct.filter((p) => p !== null).length;
    // 2. span
    row.spanHours = Math.round((total / 60) * 100) / 100;
    row.predictedSpanHours = Math.round(((row.work / row.units) * contourSpanFactor(wc)) * 100) / 100;
    row.spanGapMinutes = Math.round(Math.abs(total - (row.work * 60 / row.units) * contourSpanFactor(wc)) * 10) / 10;
    const gap = (slices) => Math.max(...series.map(([tm, c]) => Math.abs(curvePartBefore(cal, s, e, row.work, slices, tm) - c)));
    row.gapContour = Math.round(gap(contourSlices(wc)) * 1e4) / 1e4;
    row.gapMpxj = Math.round(gap(norm(MPXJ[wc])) * 1e4) / 1e4;
    row.gapEven = Math.round(gap(EVEN) * 1e4) / 1e4;
  }
  // 4. the conversion
  const r = p6XerText(text);
  const back = parseXer(r.text);
  const curves = readCurves(back);
  const curved = (back.tables.TASKRSRC || []).filter((a) => a.curv_id);
  const shapeOk = curved.every((a) => {
    const c = curves.get(a.curv_id);
    const wc = Object.keys(PROJECT_CONTOURS).find((n) => c && c.name === `MS Project ${PROJECT_CONTOURS[n].name}`);
    return wc && contourSlices(wc).every((v, k) => Math.abs(v - c.slices[k]) < 1e-5);
  });
  conversions.push({ file: f.split("/").pop(), contouredAssignments: found, curvedTaskrsrc: curved.length, curves: curves.size, shapesReadBack: shapeOk });
}

const done = rows.filter((r) => !r.skipped);
const max = (k) => Math.max(...done.map((r) => r[k]));
const sum = {
  assignments: rows.length, measured: done.length, skipped: rows.length - done.length,
  contours: [...new Set(done.map((r) => r.contour))].length,
  largestShapeGapPts: max("shapeGap"), largestSpanGapMinutes: max("spanGapMinutes"),
  largestGapHours: { contour: max("gapContour"), mpxjP6Curve: max("gapMpxj"), even: max("gapEven") },
  within0_05h: { contour: done.filter((r) => r.gapContour <= 0.05).length, mpxjP6Curve: done.filter((r) => r.gapMpxj <= 0.05).length, even: done.filter((r) => r.gapEven <= 0.05).length },
};
console.log("file\tuid\tcontour\tunits\twork\tspan h (pred)\tshape gap pts\tgap h: contour / P6 curve / even");
for (const r of rows) {
  if (r.skipped) { console.log(`${r.file}\t${r.uid}\t${r.contour}\tskipped: ${r.skipped}`); continue; }
  console.log(`${r.file}\t${r.uid}\t${r.contour}\t${r.units}\t${r.work}\t${r.spanHours} (${r.predictedSpanHours})\t${r.shapeGap} (${r.segmentsSeen}/10)\t${r.gapContour} / ${r.gapMpxj} / ${r.gapEven}`);
}
console.log("\nconversion:", JSON.stringify(conversions));
console.log("summary:", JSON.stringify(sum));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ summary: sum, conversions, assignments: rows }, null, 2) + "\n");
