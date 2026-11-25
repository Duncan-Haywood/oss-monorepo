// Score the engine against P6 23.12's own values on the public P6 probe set of
// danafitkowski/cpp-cpm-engine (MIT): 338 synthetic XERs, each imported into
// Primavera P6 Professional 23.12.1 and scheduled once (F9), with P6's early
// start/finish, late start/finish, total and free float for every unfinished
// activity read back from P6's database into each folder's p6-values.json.
//
// Unlike eval/cpm-vs-p6.mjs, the XERs here are P6's *inputs* (no stored dates
// and no relationship dates): the expected values come from the JSON. The
// probes were written to isolate P6 behaviours, so they are the only public
// files with many start-to-finish links and SS links whose lag runs on a
// calendar other than the predecessor's; those are broken out.
//
//   node eval/p6-probes.mjs <cpp-cpm-engine>/validation/p6-probes [--show N] [--json out.json]
//
// Fetch: bash eval/corpus-fetch.sh DIR --probes (sparse checkout, ~5 s), then
// run on DIR/p6-probes.
// An activity matches when all six values agree (dates to the minute, floats
// to 0.01 h). P6's ES/LS of work under way are its remaining ones (restart
// date, remaining late start), compared with the engine's remES/remLS.
import { readFileSync, readdirSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate, formatDate } from "../xer.mjs";
import { schedule, lagCalendar } from "../cpm.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const show = +opt("--show", 0), jsonOut = opt("--json", null);
// --no-import: score the XERs as written. By default P6's own import is laid
// over each file first (each folder's p6-imported-*.json, read back from P6
// before its F9): P6 re-sizes resource-dependent work on import (remaining
// and original durations, assignment rates), so the file P6 scheduled is not
// byte for byte the XER. The probe author's scorers lay it the same way.
const useImport = !args.includes("--no-import");
const variant = opt("--variant", null) ? JSON.parse(opt("--variant")) : undefined;
function layImport(xer, folderPath) {
  const T = xer.tables;
  const projByCode = new Map((T.PROJECT || []).map((p) => [p.proj_short_name, p.proj_id]));
  const rsrcName = new Map((T.RSRC || []).map((r) => [r.rsrc_id, r.rsrc_short_name]));
  let laid = 0;
  for (const f of readdirSync(folderPath).filter((f) => /^p6-imported-.*\.json$/.test(f))) {
    const j = JSON.parse(readFileSync(join(folderPath, f), "utf8"));
    const pid = projByCode.get(j.case);
    if (!pid || !j.resource_dependent) continue;
    const tasks = (T.TASK || []).filter((t) => t.proj_id === pid);
    const byCode = new Map(tasks.map((t) => [t.task_code, t]));
    for (const [code, v] of Object.entries(j.resource_dependent.tasks || {})) {
      const t = byCode.get(code);
      if (!t) continue;
      for (const k of ["remain_drtn_hr_cnt", "target_drtn_hr_cnt"]) if (v[k] !== undefined && v[k] !== null) { t[k] = String(v[k]); laid++; }
    }
    const codeOf = new Map(tasks.map((t) => [t.task_id, t.task_code]));
    for (const a of j.resource_dependent.assignments || []) {
      const row = (T.TASKRSRC || []).find((r) => codeOf.get(r.task_id) === a.task_code && rsrcName.get(r.rsrc_id) === a.rsrc_short_name);
      if (!row) continue;
      for (const k of ["remain_qty", "target_qty", "remain_qty_per_hr", "target_qty_per_hr", "target_lag_drtn_hr_cnt", "relag_drtn_hr_cnt", "restart_date", "reend_date"]) if (a[k] !== undefined && a[k] !== null) { row[k] = String(a[k]); laid++; }
    }
  }
  return laid;
}
const root = args.find((a, i) => !a.startsWith("--") && !["--show", "--json", "--variant", "--rows"].includes(args[i - 1]));
if (!root) { console.error("usage: node eval/p6-probes.mjs <p6-probes dir> [--show N] [--json out.json]"); process.exit(2); }

const FIELDS = ["es", "ef", "ls", "lf", "tf", "ff"];
const blank = () => ({ n: 0, all: 0, ...Object.fromEntries(FIELDS.map((f) => [f, 0])) });
const T = { all: blank(), sf: blank(), ssOther: blank(), plain: blank(), rsrcDep: blank(), rsrcFiles: blank(), noRsrcFiles: blank() };
// --rows out.json: every row's all-six result, to diff two runs (fixed / made worse)
const rowsOut = opt("--rows", null), rowOk = {};
const perFolder = [], misses = [];
let files = 0, skipped = [];

for (const folder of readdirSync(root).sort()) {
  const vf = join(root, folder, "p6-values.json");
  if (!existsSync(vf)) continue;
  const j = JSON.parse(readFileSync(vf, "utf8"));
  if (Array.isArray(j.projects)) { skipped.push(`${folder} (a lag-entry probe, no dates)`); continue; }
  const F = blank();
  // group the folder's projects by XER file
  const byFile = new Map();
  for (const [key, p] of Object.entries(j.projects)) {
    if (!p.rows || !p.file) continue;
    if (!byFile.has(p.file)) byFile.set(p.file, []);
    byFile.get(p.file).push([key, p]);
  }
  for (const [file, projs] of byFile) {
    const path = join(root, folder, file);
    if (!existsSync(path)) { skipped.push(`${folder}/${file} (missing)`); continue; }
    files++;
    const xer = parseXer(decodeXer(readFileSync(path)));
    if (useImport) layImport(xer, join(root, folder));
    const out = schedule(xer, variant ? { variant } : {});
    const m = out.model;
    // which activities touch an SF link, or an SS link off the predecessor's calendar
    const sfIds = new Set(), ssIds = new Set();
    for (const rel of m.rels) {
      const p = m.tasks.get(rel.predId), s = m.tasks.get(rel.succId);
      if (!p || !s) continue;
      if (rel.type === "PR_SF") { sfIds.add(p.id); sfIds.add(s.id); }
      if (rel.type === "PR_SS" && lagCalendar(m, rel) !== p.cal) { ssIds.add(p.id); ssIds.add(s.id); }
    }
    const hasRsrc = new Set((xer.tables.TASKRSRC || []).map((a) => a.proj_id));
    const projCode = new Map([...m.projects.values()].map((p) => [p.id, p.code]));
    const multi = projs.length > 1 || m.projects.size > 1;
    for (const [key, p] of projs) {
      for (const [code, v] of Object.entries(p.rows)) {
        const t = [...m.tasks.values()].find((t) => t.code === code && (!multi || projCode.get(t.proj) === key));
        const r = t && out.tasks.get(t.id);
        const got = r ? { es: r.remES, ef: r.ef, ls: r.remLS ?? r.ls, lf: r.lf, tf: r.tf, ff: r.ff } : null;
        const want = { es: parseDate(v.es), ef: parseDate(v.ef), ls: parseDate(v.ls), lf: parseDate(v.lf), tf: v.tf_hr, ff: v.ff_hr };
        const ok = {};
        for (const f of FIELDS) ok[f] = !!got && (f === "tf" || f === "ff" ? want[f] !== null && Math.abs(want[f] - got[f]) < 0.01 : want[f] === got[f]);
        const allOk = FIELDS.every((f) => ok[f]);
        const buckets = [T.all, F];
        if (t && sfIds.has(t.id)) buckets.push(T.sf);
        if (t && ssIds.has(t.id)) buckets.push(T.ssOther);
        if (t && !sfIds.has(t.id) && !ssIds.has(t.id)) buckets.push(T.plain);
        if (t && t.type === "TT_Rsrc") buckets.push(T.rsrcDep);
        if (t) buckets.push(hasRsrc.has(t.proj) ? T.rsrcFiles : T.noRsrcFiles);
        rowOk[`${folder}/${file}/${key}/${code}`] = allOk;
        for (const b of buckets) { b.n++; b.all += allOk; for (const f of FIELDS) b[f] += ok[f]; }
        if (!allOk) misses.push({ folder, file, project: key, code, sf: !!t && sfIds.has(t.id), ssOther: !!t && ssIds.has(t.id), off: FIELDS.filter((f) => !ok[f]).map((f) => `${f} ${got ? (f === "tf" || f === "ff" ? got[f] : formatDate(got[f])) : "-"} vs P6 ${f === "tf" || f === "ff" ? want[f] : v[f]}`) });
      }
    }
  }
  perFolder.push({ folder, ...F });
  console.log(`${folder}: ${F.all}/${F.n} match all six (ES ${F.es}, EF ${F.ef}, LS ${F.ls}, LF ${F.lf}, TF ${F.tf}, FF ${F.ff})`);
}
const line = (name, b) => `${name}: ${b.all}/${b.n} match all six (ES ${b.es}, EF ${b.ef}, LS ${b.ls}, LF ${b.lf}, TF ${b.tf}, FF ${b.ff})`;
console.log(`\n${files} XER files; skipped: ${skipped.join(", ") || "none"}`);
console.log(line("TOTAL", T.all));
console.log(line("  touching an SF link", T.sf));
console.log(line("  touching an SS link off the predecessor's calendar", T.ssOther));
console.log(line("  neither", T.plain));
console.log(line("  resource-dependent activities (TT_Rsrc)", T.rsrcDep));
console.log(line("  in projects with resource assignments", T.rsrcFiles));
console.log(line("  in projects without", T.noRsrcFiles));
if (rowsOut) writeFileSync(rowsOut, JSON.stringify(rowOk) + "\n");
for (const x of misses.slice(0, show)) console.log("   ", JSON.stringify(x));
// the JSON keeps only the misses on SF and off-calendar SS links (the full
// list, ~2,200 rows, is one run away and would be ~0.8 MB)
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ probes: "danafitkowski/cpp-cpm-engine validation/p6-probes", totals: T, perFolder, missesSfOrSsOther: misses.filter((x) => x.sf || x.ssOther), missesOther: misses.length - misses.filter((x) => x.sf || x.ssOther).length }, null, 1) + "\n");
