// P6 resource curves as Microsoft Project timephased work (msproject.mjs),
// checked two ways.
//
// A. Project -> XER -> Project, on Project's own files. For every
//    assignment with a built-in contour (WorkContour 1-7) and remaining-work
//    rows in the MSPDI files given (Project-saved): p6xer.mjs writes the XER
//    (a resource curve of Project's shape), msproject.mjs writes it back as
//    Project XML. The written assignment (matched by task and resource name)
//    must carry the same WorkContour, and its rows' cumulative work, read at
//    every one of Project's own row ends, must match Project's. Before this
//    change the trip came back flat.
// B. P6 curves -> Project, planted. P6's twelve shipped curve shapes (the
//    MPXJ WorkContour constants that hold them, plus Linear) put on the
//    unstarted assignments of the six-activity example: the written rows'
//    work per day must equal evm.mjs's spread by the curve (curves.mjs's
//    spreadCurve) and sum to the remaining work.
//
// C. A real P6 file's own curves (--xer, e.g. the public CCA hospital file,
//    whose unstarted assignments use its custom curves): every curved
//    assignment written must sum to its remaining units and give evm.mjs's
//    day-by-day spread on its task's calendar.
//
//   node eval/curves-to-project.mjs <mspdi files...> [--xer file.xer] [--json out.json] [--out dir]
//
// --out writes each round-tripped and planted Project XML, for
// eval/curves-to-project-mpxj.py (MPXJ reads the timephased work back).
// eval/curves-to-project-2026-11-22.md
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parseMspdi, parseXml, durationHours } from "../mspdi.mjs";
import { Calendar } from "../calendar.mjs";
import { parseDate, parseXer } from "../xer.mjs";
import { spreadCurve, readCurves, SLICES } from "../curves.mjs";
import { PROJECT_CONTOURS } from "../contours.mjs";
import { p6XerText } from "../p6xer.mjs";
import { mspdiText } from "../msproject.mjs";
import { EXAMPLE_XER } from "../example.mjs";

const args = process.argv.slice(2);
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const jsonOut = opt("--json"), outDir = opt("--out"), xerFile = opt("--xer");
const files = args.filter((a, i) => !a.startsWith("--") && !["--json", "--out", "--xer"].includes(args[i - 1]));
if (outDir) mkdirSync(outDir, { recursive: true });

const kids = (n, t) => (n?.children || []).filter((c) => c.name === t);
const kid = (n, t) => kids(n, t)[0];
const val = (n, t) => { const k = kid(n, t); return k ? (k.text ?? "") : ""; };
const at = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(s || ""); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) / 60000 : parseDate(s); };

// assignments of an MSPDI text keyed "task name|resource name"
function assignments(text) {
  const proj = kid(parseXml(text), "Project");
  const tName = new Map(kids(kid(proj, "Tasks"), "Task").map((t) => [val(t, "UID"), val(t, "Name")]));
  const rName = new Map(kids(kid(proj, "Resources"), "Resource").map((r) => [val(r, "UID"), val(r, "Name")]));
  const out = new Map();
  for (const a of kids(kid(proj, "Assignments"), "Assignment")) {
    const rows = kids(a, "TimephasedData").filter((r) => val(r, "Type") === "1")
      .map((r) => ({ s: at(val(r, "Start")), f: at(val(r, "Finish")), h: val(r, "Value") === "" ? 0 : durationHours(val(r, "Value")) }))
      .sort((p, q) => p.s - q.s);
    out.set(`${tName.get(val(a, "TaskUID"))}|${rName.get(val(a, "ResourceUID"))}`, { wc: val(a, "WorkContour") || "0", work: durationHours(val(a, "Work")), actual: durationHours(val(a, "ActualWork")) || 0, start: at(val(a, "Start")), finish: at(val(a, "Finish")), task: val(a, "TaskUID"), rows });
  }
  return out;
}
// cumulative work of rows at time t, a row's work spread over its working time
function cumAt(rows, cal, t) {
  let c = 0;
  for (const r of rows) {
    if (r.f <= t) { c += r.h; continue; }
    if (r.s >= t) break;
    const w = cal.workBetween(r.s, r.f);
    c += w > 0 ? (r.h * cal.workBetween(r.s, t)) / w : 0;
  }
  return c;
}

// A. the round trip
const tripRows = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const x = parseMspdi(text);
  const cals = new Map(x.tables.CALENDAR.map((r) => [r.clndr_id, Calendar.fromXer(r)]));
  const taskCal = new Map(x.tables.TASK.map((t) => [t.task_id, cals.get(t.clndr_id)]));
  const before = assignments(text);
  const xer = p6XerText(text);
  const back = mspdiText(parseXer(xer.text));
  const stem = f.split("/").pop().replace(/\.xml$/i, "");
  if (outDir) writeFileSync(join(outDir, `${stem}.roundtrip.xml`), back.xml);
  const after = assignments(back.xml);
  for (const [key, a] of before) {
    if (!PROJECT_CONTOURS[a.wc]) continue;
    const row = { file: stem, assignment: key, contour: PROJECT_CONTOURS[a.wc].name, work: a.work };
    tripRows.push(row);
    const b = after.get(key);
    const cal = taskCal.get(a.task);
    const pRows = a.rows.filter((r) => r.h > 0);
    if (!b || !cal || !pRows.length || a.actual > 0) { row.skipped = !b ? "not written back" : a.actual > 0 ? "has actual work" : !cal ? "no calendar" : "no timephased rows"; continue; }
    row.contourBack = b.wc === a.wc;
    row.rowsWritten = b.rows.length;
    row.writtenSum = Math.round(b.rows.reduce((s, r) => s + r.h, 0) * 1e4) / 1e4;
    // at every Project row end inside the assignment
    let gap = 0, gapFlat = 0;
    for (const r of a.rows) {
      const t = Math.min(r.f, a.finish);
      const want = cumAt(a.rows, cal, t);
      gap = Math.max(gap, Math.abs(cumAt(b.rows, cal, t) - want));
      const wt = cal.workBetween(a.start, a.finish);
      gapFlat = Math.max(gapFlat, Math.abs((a.work * cal.workBetween(a.start, t)) / wt - want));
    }
    row.gapHours = Math.round(gap * 1e4) / 1e4;
    row.gapFlatHours = Math.round(gapFlat * 1e4) / 1e4;
  }
}

// B. planted P6 curves on the example's unstarted assignments
const MPXJ = {
  "Back Loaded": [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5],
  "Front Loaded": [6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5],
  "Double Peak": [1.3, 2.5, 3.8, 5.1, 7.6, 10.1, 7.6, 5.1, 3.8, 2.5, 2.5, 2.5, 3.8, 5.1, 7.6, 10.1, 7.6, 5.1, 3.8, 2.5],
  "Early Peak": [1.2, 2.5, 3.8, 5.0, 7.5, 10.1, 10.1, 10.1, 8.8, 7.5, 6.3, 5.0, 5.0, 5.0, 3.8, 2.5, 2.0, 1.5, 1.3, 1.0],
  "Late Peak": [1.0, 1.3, 1.5, 2.0, 2.5, 3.8, 5.0, 5.0, 5.0, 6.3, 7.5, 8.8, 10.1, 10.1, 10.1, 7.5, 5.0, 3.8, 2.5, 1.2],
  "Bell": [0.5, 0.5, 1.5, 1.5, 4.0, 4.0, 7.5, 7.5, 11.5, 11.5, 11.5, 11.5, 7.5, 7.5, 4.0, 4.0, 1.5, 1.5, 0.5, 0.5],
  "Turtle": [1.0, 1.0, 3.5, 3.5, 5.5, 5.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 7.5, 5.5, 5.5, 3.5, 3.5, 1.0, 1.0],
  "Linear": Array(20).fill(5),
};
const curveTable = ["%T\tRSRCCURVDATA", `%F\t${["curv_id", "curv_name", "default_flag", ...Array.from({ length: 21 }, (_, k) => `pct_usage_${k}`)].join("\t")}`,
  ...Object.entries(MPXJ).map(([n, v], i) => `%R\t${[90 + i, n, "N", 0, ...v].join("\t")}`)];
const base = parseXer(EXAMPLE_XER);
const tr = base.tables.TASKRSRC;
const fields = Object.keys(tr[0]);
if (!fields.includes("curv_id")) fields.push("curv_id");
const plants = [];
for (const [i, name] of Object.keys(MPXJ).entries()) {
  // one curve on every assignment, one file per curve
  const lines = EXAMPLE_XER.split(/\r?\n/);
  const s = lines.findIndex((l) => l === "%T\tTASKRSRC");
  let e = s + 1;
  while (e < lines.length && !lines[e].startsWith("%T") && lines[e] !== "%E") e++;
  const rows = tr.map((r) => `%R\t${fields.map((k) => (k === "curv_id" ? String(90 + i) : r[k] ?? "")).join("\t")}`);
  const text = [...lines.slice(0, s), "%T\tTASKRSRC", `%F\t${fields.join("\t")}`, ...rows, ...curveTable, ...lines.slice(e)].join("\r\n");
  const x = parseXer(text);
  const out = mspdiText(x);
  if (outDir) writeFileSync(join(outDir, `example-${name.replace(/ /g, "-").toLowerCase()}.xml`), out.xml);
  const written = assignments(out.xml);
  const curve = readCurves(x).get(String(90 + i));
  const T = x.tables;
  const cal = Calendar.fromXer(T.CALENDAR[0]);
  for (const a of T.TASKRSRC) {
    const t = T.TASK.find((k) => k.task_id === a.task_id);
    const r = T.RSRC.find((k) => k.rsrc_id === a.rsrc_id);
    const w = written.get(`${t.task_name}|${r.rsrc_name}`);
    const act = (Number(a.act_reg_qty) || 0) + (Number(a.act_ot_qty) || 0);
    const rem = Number(a.remain_qty) || 0;
    const row = { curve: name, assignment: `${t.task_code} ${r.rsrc_short_name || r.rsrc_name}`, remaining: rem };
    plants.push(row);
    if (act > 0 || !(rem > 0) || name === "Linear") { row.skipped = name === "Linear" ? "even: no rows" : act > 0 ? "started: even" : "no remaining work"; row.rowsWritten = w ? w.rows.length : 0; continue; }
    // the day-by-day spread evm.mjs uses, over the written dates
    const want = new Map();
    spreadCurve(cal, w.start, w.finish, rem, curve.slices, (d, v) => want.set(d, (want.get(d) || 0) + v));
    const got = new Map();
    for (const q of w.rows) if (q.h) { const d = Math.floor(q.s / 1440); got.set(d, (got.get(d) || 0) + q.h); }
    let gap = 0;
    for (const d of new Set([...want.keys(), ...got.keys()])) gap = Math.max(gap, Math.abs((want.get(d) || 0) - (got.get(d) || 0)));
    row.contour = w.wc;
    row.rowsWritten = w.rows.length;
    row.dailyGapHours = Math.round(gap * 1e4) / 1e4;
    row.sumGapHours = Math.round(Math.abs(w.rows.reduce((s, q) => s + q.h, 0) - rem) * 1e4) / 1e4;
  }
}

// C. a real P6 file's curves
const real = [];
let realNotes = null;
if (xerFile) {
  const x = parseXer(readFileSync(xerFile, "latin1"));
  const out = mspdiText(x);
  if (outDir) writeFileSync(join(outDir, "real.xml"), out.xml);
  realNotes = { curved: out.counts.curved, warnings: out.warnings.filter((w) => /curve/.test(w)) };
  const written = assignments(out.xml);
  const curves = readCurves(x);
  const T = x.tables;
  const task = new Map(T.TASK.map((t) => [t.task_id, t]));
  const rsrc = new Map(T.RSRC.map((r) => [r.rsrc_id, r]));
  const cal = new Map(T.CALENDAR.map((c) => [c.clndr_id, c]));
  const calObj = new Map();
  for (const a of T.TASKRSRC) {
    if (!a.curv_id || !curves.has(a.curv_id)) continue;
    const t = task.get(a.task_id), r = rsrc.get(a.rsrc_id);
    if (!t || !r || t.proj_id !== out.project.id) continue;
    const w = written.get(`${t.task_name}|${r.rsrc_name || r.rsrc_short_name}`);
    const act = (Number(a.act_reg_qty) || 0) + (Number(a.act_ot_qty) || 0);
    const rem = Number(a.remain_qty) || 0;
    const row = { assignment: `${t.task_code} ${r.rsrc_short_name}`, curve: curves.get(a.curv_id).name, remaining: rem, actual: act };
    real.push(row);
    if (!w || !w.rows.length) { row.skipped = act > 0 ? "started: even" : !(rem > 0) ? "no remaining work" : "no rows"; continue; }
    if (!calObj.has(t.clndr_id)) calObj.set(t.clndr_id, Calendar.fromXer(cal.get(t.clndr_id)));
    const c = calObj.get(t.clndr_id);
    const want = new Map();
    spreadCurve(c, w.start, w.finish, rem, curves.get(a.curv_id).slices, (d, v) => want.set(d, (want.get(d) || 0) + v));
    const got = new Map();
    for (const q of w.rows) if (q.h) { const d = Math.floor(q.s / 1440); got.set(d, (got.get(d) || 0) + q.h); }
    let gap = 0;
    for (const d of new Set([...want.keys(), ...got.keys()])) gap = Math.max(gap, Math.abs((want.get(d) || 0) - (got.get(d) || 0)));
    row.contour = w.wc;
    row.rowsWritten = w.rows.length;
    row.dailyGapHours = Math.round(gap * 1e4) / 1e4;
    row.sumGapHours = Math.round(Math.abs(w.rows.reduce((s2, q) => s2 + q.h, 0) - rem) * 1e4) / 1e4;
  }
}

const done = tripRows.filter((r) => !r.skipped);
const pd = plants.filter((r) => !r.skipped);
const summary = {
  roundTrip: { assignments: tripRows.length, measured: done.length, contourBack: done.filter((r) => r.contourBack).length, largestGapHours: Math.max(...done.map((r) => r.gapHours)), largestGapFlatHours: Math.max(...done.map((r) => r.gapFlatHours)), within0_05h: done.filter((r) => r.gapHours <= 0.05).length },
  planted: { assignments: plants.length, measured: pd.length, contour8: pd.filter((r) => r.contour === "8").length, largestDailyGapHours: Math.max(...pd.map((r) => r.dailyGapHours)), largestSumGapHours: Math.max(...pd.map((r) => r.sumGapHours)), skipped: plants.length - pd.length },
};
console.log("A. Project -> XER -> Project");
console.log("file\tassignment\tcontour\twork\tcontour back\trows\tgap h (flat before)");
for (const r of tripRows) console.log(r.skipped ? `${r.file}\t${r.assignment}\t${r.contour}\tskipped: ${r.skipped}` : `${r.file}\t${r.assignment}\t${r.contour}\t${r.work}\t${r.contourBack}\t${r.rowsWritten}\t${r.gapHours} (${r.gapFlatHours})`);
console.log("\nB. P6 curves -> Project (planted)");
for (const r of plants) console.log(r.skipped ? `${r.curve}\t${r.assignment}\tskipped: ${r.skipped}` : `${r.curve}\t${r.assignment}\t${r.remaining}\tcontour ${r.contour}\t${r.rowsWritten} rows\tdaily gap ${r.dailyGapHours} h\tsum gap ${r.sumGapHours} h`);
const rd = real.filter((r) => !r.skipped);
if (xerFile) {
  summary.realFile = { file: xerFile.split("/").pop(), curvedAssignments: real.length, written: rd.length, skipped: Object.fromEntries([...new Set(real.filter((r) => r.skipped).map((r) => r.skipped))].map((k) => [k, real.filter((r) => r.skipped === k).length])), largestDailyGapHours: rd.length ? Math.max(...rd.map((r) => r.dailyGapHours)) : null, largestSumGapHours: rd.length ? Math.max(...rd.map((r) => r.sumGapHours)) : null, curves: [...new Set(rd.map((r) => r.curve))], notes: realNotes };
  console.log("\nC. real P6 file");
  for (const r of real) console.log(r.skipped ? `${r.curve}\t${r.assignment}\tskipped: ${r.skipped}` : `${r.curve}\t${r.assignment}\t${r.remaining}\tcontour ${r.contour}\t${r.rowsWritten} rows\tdaily gap ${r.dailyGapHours} h\tsum gap ${r.sumGapHours} h`);
}
console.log("\nsummary:", JSON.stringify(summary));
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ summary, roundTrip: tripRows, planted: plants, realFile: real }, null, 2) + "\n");
