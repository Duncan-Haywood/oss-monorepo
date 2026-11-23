// Check pmxml.mjs, the P6 XML reader, against the XER of the same project.
//
// The P6 XML side is written by MPXJ (github.com/joniles/mpxj, an independent
// open-source reader and writer of both formats) from each public XER:
//   pip install mpxj jpype1; python eval/xer-to-pmxml.py OUTDIR <xer files>
// so the two files hold the same schedule written two ways. Per XER, with its
// P6 XML files (one per project, NAME.xml or NAME-0.xml, NAME-1.xml...):
//
//   1. fields: every activity matched by its P6 object id (MPXJ keeps them);
//      type, status, activity ID, planned and remaining duration, actual
//      start and finish, primary and secondary constraint and date, expected
//      finish, the calendar's work pattern and exceptions (clndr_data as the
//      engine reads it: the same week and holidays), WBS path. Every
//      relationship matched by (predecessor, successor, type) with its lag.
//   2. schedule: this tool's critical path run on both; early start, early
//      finish, late finish and total float equal, activity by activity.
//   4. round trip: the P6 XML written back as an XER (pmxmlToXer), read
//      with parseXer and scheduled: equal to the original XER's schedule.
//      With --write DIR the XERs are saved there for an outside reader
//      (eval/pmxml-xer-mpxj.py).
//   3. P6's own dates: the share of open activities whose recomputed early
//      and late finish equal P6's stored ones, read from each file.
//
//   node eval/pmxml-check.mjs XERDIR PMXMLDIR [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, parseDate } from "../xer.mjs";
import { parsePmxml, pmxmlToXer } from "../pmxml.mjs";
import { schedule } from "../cpm.mjs";
import { Calendar } from "../calendar.mjs";

const args = process.argv.slice(2);
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const writeDir = args.includes("--write") ? args[args.indexOf("--write") + 1] : null;
const [xerDir, xmlDir] = args.filter((a, i) => !a.startsWith("--") && !["--json", "--write"].includes(args[i - 1]));
const xmls = readdirSync(xmlDir).filter((f) => /\.xml$/i.test(f)).sort();

// merge several parsed files' tables (one P6 XML per project) into one
function merge(list) {
  const tables = {}, warnings = [];
  for (const x of list) {
    for (const [k, rows] of Object.entries(x.tables)) {
      tables[k] ??= [];
      const seen = new Set(tables[k].map((r) => JSON.stringify(r)));
      for (const r of rows) if (!seen.has(JSON.stringify(r))) tables[k].push(r);
    }
    warnings.push(...x.warnings);
  }
  return { tables, warnings, format: "pmxml" };
}

// a calendar as the engine reads it: week periods and exceptions
function calKey(row) {
  if (!row || !(row.clndr_data || "").trim()) return "none";
  const c = Calendar.fromXer(row);
  return JSON.stringify([c.week, [...c.exceptions].sort((a, b) => a[0] - b[0])]);
}
// the WBS codes from the project down. MPXJ writes the XER's project node as
// a top-level <WBS> (its code is the project ID), so a leading code equal to
// the project's ID is dropped from both sides.
const wbsPath = (x) => {
  const w = new Map((x.tables.PROJWBS || []).map((r) => [r.wbs_id, r]));
  const projCode = new Map((x.tables.PROJECT || []).map((p) => [p.proj_id, p.proj_short_name]));
  return (id) => {
    const p = []; let r = w.get(id); const seen = new Set(); let pid = r && r.proj_id;
    while (r && r.proj_node_flag !== "Y" && !seen.has(r.wbs_id)) { seen.add(r.wbs_id); p.unshift(r.wbs_short_name); r = w.get(r.parent_wbs_id); }
    if (p.length && p[0] === projCode.get(pid)) p.shift();
    return p.join(".");
  };
};
const numEq = (a, b) => (a === "" && b === "") || (a !== "" && b !== "" && Math.abs(+a - +b) < 1e-6);

const FIELDS = [
  ["task_code"], ["task_type"], ["status_code"], ["target_drtn_hr_cnt", "num"], ["remain_drtn_hr_cnt", "num"],
  ["act_start_date"], ["act_end_date"], ["cstr_type"], ["cstr_date"], ["cstr_type2"], ["cstr_date2"], ["expect_end_date"],
];
const out = [];
const T = { acts: 0, fieldsChecked: 0, fieldsSame: 0, calSame: 0, wbsSame: 0, links: 0, linksSame: 0, sched: 0, schedSame: 0, p6Xer: 0, p6Xml: 0, p6N: 0 };
for (const f of readdirSync(xerDir).filter((f) => /\.xer$/i.test(f)).sort()) {
  const stem = basename(f, ".xer");
  const mine = xmls.filter((x) => x === `${stem}.xml` || new RegExp(`^${stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+\\.xml$`).test(x));
  if (!mine.length) continue;
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(join(xerDir, f))));
  const xml = merge(mine.map((m) => parsePmxml(readFileSync(join(xmlDir, m), "utf8"))));
  const readMs = Date.now() - t0;
  const R = { file: f, xml: mine, readMs, acts: 0, missing: 0, fields: {}, calSame: 0, wbsSame: 0, links: 0, linksSame: 0, linksMissing: 0, sched: 0, schedSame: 0, schedDiff: [], p6: {} };
  const xa = new Map(xer.tables.TASK.map((t) => [t.task_id, t]));
  const ma = new Map(xml.tables.TASK.map((t) => [t.task_id, t]));
  const xc = new Map((xer.tables.CALENDAR || []).map((c) => [c.clndr_id, calKey(c)]));
  const mc = new Map((xml.tables.CALENDAR || []).map((c) => [c.clndr_id, calKey(c)]));
  const xw = wbsPath(xer), mw = wbsPath(xml);
  for (const [id, a] of xa) {
    const b = ma.get(id);
    if (!b) { R.missing++; continue; }
    R.acts++;
    for (const [k, kind] of FIELDS) {
      R.fields[k] ??= { same: 0, diff: 0, ex: [] };
      const same = kind === "num" ? numEq(a[k] || "", b[k] || "") : (a[k] || "") === (b[k] || "");
      if (same) R.fields[k].same++; else { R.fields[k].diff++; if (R.fields[k].ex.length < 3) R.fields[k].ex.push([a.task_code, a[k], b[k]]); }
    }
    if ((xc.get(a.clndr_id) ?? "none") === (mc.get(b.clndr_id) ?? "none")) R.calSame++;
    if (xw(a.wbs_id) === mw(b.wbs_id)) R.wbsSame++;
  }
  const lk = (r) => `${r.pred_task_id}>${r.task_id}>${r.pred_type}`;
  const ml = new Map((xml.tables.TASKPRED || []).map((r) => [lk(r), r]));
  for (const r of xer.tables.TASKPRED || []) {
    if (!xa.has(r.task_id) || !xa.has(r.pred_task_id)) continue;
    R.links++;
    const s = ml.get(lk(r));
    if (!s) R.linksMissing++; else if (numEq(r.lag_hr_cnt || "0", s.lag_hr_cnt || "0")) R.linksSame++;
  }
  const sx = schedule(xer), sm = schedule(xml);
  for (const t of sx.model.tasks.values()) {
    if (t.span) continue;
    const a = sx.tasks.get(t.id), b = sm.tasks.get(t.id);
    if (!a) continue;
    R.sched++;
    const same = b && a.es === b.es && a.ef === b.ef && a.lf === b.lf && Math.abs((a.tf ?? 0) - (b.tf ?? 0)) < 1e-6;
    if (same) R.schedSame++; else if (R.schedDiff.length < 5) R.schedDiff.push(t.code);
  }
  // round trip through an XER
  const back = pmxmlToXer(xml);
  if (writeDir) writeFileSync(join(writeDir, `${stem}.xer`), back.bytes);
  const xb = parseXer(decodeXer(back.bytes));
  const sb = schedule(xb);
  R.trip = { n: 0, same: 0, tasks: xb.tables.TASK.length, links: (xb.tables.TASKPRED || []).length };
  for (const t of sx.model.tasks.values()) {
    if (t.span) continue;
    const a = sx.tasks.get(t.id), b = sb.tasks.get(t.id);
    if (!a) continue;
    R.trip.n++;
    if (b && a.es === b.es && a.ef === b.ef && a.lf === b.lf && Math.abs((a.tf ?? 0) - (b.tf ?? 0)) < 1e-6) R.trip.same++;
  }
  T.trip = (T.trip || 0) + R.trip.same; T.tripN = (T.tripN || 0) + R.trip.n;
  // P6's stored dates, read from each file: open activities P6 scheduled
  for (const [name, s, rows] of [["xer", sx, xa], ["xml", sm, ma]]) {
    let n = 0, ok = 0;
    for (const t of s.model.tasks.values()) {
      if (t.span || t.status === "TK_Complete") continue;
      const r = s.tasks.get(t.id), row = rows.get(t.id);
      if (!r || !row || !row.early_end_date || !row.late_end_date) continue;
      n++;
      if (parseDate(row.early_end_date) === r.ef && parseDate(row.late_end_date) === r.lf) ok++;
    }
    R.p6[name] = { n, ok };
  }
  out.push(R);
  T.acts += R.acts; T.calSame += R.calSame; T.wbsSame += R.wbsSame; T.links += R.links; T.linksSame += R.linksSame; T.sched += R.sched; T.schedSame += R.schedSame;
  for (const v of Object.values(R.fields)) { T.fieldsChecked += v.same + v.diff; T.fieldsSame += v.same; }
  T.p6Xer += R.p6.xer.ok; T.p6Xml += R.p6.xml.ok; T.p6N += R.p6.xer.n;
  const fd = Object.entries(R.fields).filter(([, v]) => v.diff).map(([k, v]) => `${k} ${v.diff} (${v.ex.map((e) => e.join(":")).join(", ")})`);
  console.log(`${f} (${mine.length} XML, read ${readMs} ms): activities ${R.acts}${R.missing ? ` (${R.missing} missing)` : ""}; fields differ: ${fd.length ? fd.join("; ") : "none"}; calendar ${R.calSame}/${R.acts}; WBS path ${R.wbsSame}/${R.acts}; links ${R.linksSame}/${R.links}${R.linksMissing ? ` (${R.linksMissing} missing)` : ""}; schedule same ${R.schedSame}/${R.sched}${R.schedDiff.length ? ` e.g. ${R.schedDiff.join(", ")}` : ""}; P6's dates XER ${R.p6.xer.ok}/${R.p6.xer.n}, XML ${R.p6.xml.ok}/${R.p6.xml.n}; XML->XER round trip schedule ${R.trip.same}/${R.trip.n}`);
}
console.log(`TOTAL activities ${T.acts}; fields ${T.fieldsSame}/${T.fieldsChecked}; calendar ${T.calSame}/${T.acts}; WBS ${T.wbsSame}/${T.acts}; links ${T.linksSame}/${T.links}; schedule ${T.schedSame}/${T.sched}; P6's dates XER ${T.p6Xer}/${T.p6N}, XML ${T.p6Xml}/${T.p6N}; round trip ${T.trip}/${T.tripN}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ total: T, files: out }, null, 1));
