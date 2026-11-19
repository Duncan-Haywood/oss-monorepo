// Read Microsoft Project XML (MSPDI) files with mspdi.mjs, recompute every
// open task's dates and total float with the same engine the XER checks use
// (cpm.mjs), and compare them with what Microsoft Project stored in the file
// (Finish, LateFinish, TotalSlack) at its last calculation.
//
//   node eval/cpm-vs-project.mjs <dir-or-files...> [--show N] [--json out.json]
//
// A task counts as matching when early finish, late finish and total float
// all equal Project's (dates to the minute of working time, float to
// 0.01 h). Completed and summary tasks are left out. Files that are not
// MSPDI are skipped.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseDate, formatDate, num } from "../xer.mjs";
import { parseMspdi } from "../mspdi.mjs";
import { schedule } from "../cpm.mjs";
import { assess } from "../dcma.mjs";

const args = process.argv.slice(2);
const show = args.includes("--show") ? Number(args[args.indexOf("--show") + 1]) : 0;
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const files = [];
const walk = (a) => {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) walk(join(a, f));
  else if (/\.xml$/i.test(a)) files.push(a);
};
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--show", "--json"].includes(args[i - 1]))) walk(a);
const summary = [];
for (const f of files) {
  const text = readFileSync(f, "utf8");
  if (!/schemas\.microsoft\.com\/project/.test(text.slice(0, 2000))) continue;
  const xer = parseMspdi(text);
  const out = schedule(xer);
  let checks = null;
  try { checks = assess(xer, { result: out }).checks.filter((c) => !c.pass).map((c) => c.id); } catch (e) { checks = `assess failed: ${e.message}`; }
  let n = 0, ef = 0, lf = 0, tf = 0, all = 0;
  const bad = [];
  for (const t of out.model.tasks.values()) {
    if (t.span || t.status === "TK_Complete") continue;
    const r = out.tasks.get(t.id);
    const row = t.row;
    if (!r || r.lf === undefined || !row.reend_date || !row.late_end_date) continue;
    n++;
    const pEF = parseDate(row.reend_date), pLF = parseDate(row.late_end_date), pTF = num(row.total_float_hr_cnt);
    // Project writes a late finish that a successor's late start bounds as
    // that start (08:00 the next working day) where P6 writes the end of the
    // last working period (17:00 the day before): the same point in working
    // time, so two dates with no working time between them are the same date
    const same = (a, b) => a === b || (a !== null && b !== null && t.cal.workBetween(Math.min(a, b), Math.max(a, b)) === 0);
    const okEF = same(pEF, r.ef), okLF = same(pLF, r.lf), okTF = pTF !== null && Math.abs(pTF - r.tf) < 0.01;
    ef += okEF; lf += okLF; tf += okTF;
    if (okEF && okLF && okTF) all++;
    else bad.push({ uid: t.code, name: t.name, status: t.status, ef: [formatDate(r.ef), row.reend_date], lf: [formatDate(r.lf), row.late_end_date], tf: [r.tf, pTF] });
  }
  if (!n && !xer.tables.TASKPRED.length) continue;
  const p = [...out.projects.values()][0];
  const s = { file: f.split("/").pop(), version: xer.version, tasks: n, links: xer.tables.TASKPRED.length, ef, lf, tf, all,
    finish: `${formatDate(p.finish)} (Project ${formatDate(p.storedFinish)})`, failedChecks: checks, warnings: xer.warnings.length };
  summary.push(s);
  console.log(`${s.file} (${s.version}): ${all}/${n} match all three; EF ${ef}, LF ${lf}, TF ${tf}; ${s.links} links; finish ${s.finish}; DCMA fails ${JSON.stringify(checks)}`);
  for (const b of bad.slice(0, show)) console.log("   ", JSON.stringify(b));
}
const tot = summary.reduce((a, s) => ({ n: a.n + s.tasks, all: a.all + s.all, tf: a.tf + s.tf, ef: a.ef + s.ef, lf: a.lf + s.lf }), { n: 0, all: 0, tf: 0, ef: 0, lf: 0 });
console.log(`TOTAL: ${summary.length} files, ${tot.all}/${tot.n} open tasks match Project on early finish, late finish and total float (EF ${tot.ef}, LF ${tot.lf}, TF ${tot.tf})`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(summary, null, 2));
