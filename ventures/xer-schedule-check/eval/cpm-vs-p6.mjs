// Recompute every open activity's dates and total float and compare them with
// the values P6 stored in the same XER file (TASK early/late dates and
// total_float_hr_cnt), which P6 wrote at its last schedule run.
//
//   node eval/cpm-vs-p6.mjs <dir-or-files...> [--show N] [--json out.json]
//
// An activity counts as matching when early finish, late finish and total
// float all equal P6's (dates to the minute, float to 0.01 h). Completed
// activities, level of effort and WBS summaries are left out.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer, parseDate, formatDate, num } from "../xer.mjs";
import { schedule } from "../cpm.mjs";

const args = process.argv.slice(2);
const show = args.includes("--show") ? Number(args[args.indexOf("--show") + 1]) : 0;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--show", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const summary = [];
for (const f of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(f)));
  const out = schedule(xer);
  const ms = Date.now() - t0;
  let n = 0, es = 0, ef = 0, lf = 0, tf = 0, all = 0, ffm = 0;
  const bad = [];
  for (const t of out.model.tasks.values()) {
    if (t.span || t.status === "TK_Complete") continue;
    const r = out.tasks.get(t.id);
    if (!r || r.lf === undefined) continue;
    if (!t.row.early_end_date || !t.row.late_end_date) continue; // P6 never scheduled it
    n++;
    const row = t.row;
    const pES = parseDate(row.status_code === "TK_Active" ? (row.restart_date || row.early_start_date) : row.early_start_date);
    const pEF = parseDate(row.early_end_date), pLF = parseDate(row.late_end_date), pTF = num(row.total_float_hr_cnt), pFF = num(row.free_float_hr_cnt);
    const okES = pES === r.remES, okEF = pEF === r.ef, okLF = pLF === r.lf, okTF = pTF !== null && Math.abs(pTF - r.tf) < 0.01;
    es += okES; ef += okEF; lf += okLF; tf += okTF;
    if (pFF !== null && Math.abs(pFF - r.ff) < 0.01) ffm++;
    if (okEF && okLF && okTF) all++;
    else bad.push({ code: t.code, type: t.type, status: t.status, ef: [formatDate(r.ef), row.early_end_date], lf: [formatDate(r.lf), row.late_end_date], tf: [r.tf, pTF], es: [formatDate(r.remES), row.early_start_date] });
  }
  // finished activities are zero-length nodes with late dates of their own;
  // P6 stores them too (late_end_date), so count how many agree
  let dn = 0, dok = 0;
  for (const t of out.model.tasks.values()) {
    if (t.span || t.status !== "TK_Complete" || !t.row.late_end_date) continue;
    const r = out.tasks.get(t.id);
    if (!r || r.lf === undefined) continue;
    dn++; if (parseDate(t.row.late_end_date) === r.lf) dok++;
  }
  const p = [...out.projects.values()];
  const s = { file: f.split("/").pop(), version: xer.version, activities: n, es, ef, lf, tf, ff: ffm, all, doneNodes: dn, doneLate: dok, loops: out.loops.length, ms,
    finish: p.map((x) => `${x.code}: ${formatDate(x.finish)} (P6 ${formatDate(x.storedFinish)})`).join("; ") };
  summary.push(s);
  console.log(`${s.file} (P6 ${s.version}): ${all}/${n} match all three; ES ${es}, EF ${ef}, LF ${lf}, TF ${tf}, FF ${ffm}; finished-node late dates ${dok}/${dn}; loops ${s.loops}; ${ms} ms; ${s.finish}`);
  for (const b of bad.slice(0, show)) console.log("   ", JSON.stringify(b));
}
const tot = summary.reduce((a, s) => ({ n: a.n + s.activities, all: a.all + s.all, tf: a.tf + s.tf, ef: a.ef + s.ef, lf: a.lf + s.lf, dn: a.dn + s.doneNodes, dok: a.dok + s.doneLate }), { n: 0, all: 0, tf: 0, ef: 0, lf: 0, dn: 0, dok: 0 });
console.log(`TOTAL: ${tot.all}/${tot.n} activities match P6 on early finish, late finish and total float (EF ${tot.ef}, LF ${tot.lf}, TF ${tot.tf}); finished-node late dates ${tot.dok}/${tot.dn}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
