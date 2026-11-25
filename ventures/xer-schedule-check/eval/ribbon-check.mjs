// Check for ribbon.mjs (DCMA points 1-11 per WBS node or activity code) on
// the public P6 files.
//
//   bash eval/corpus-fetch.sh DIR && node eval/ribbon-check.mjs DIR/xer [--json out.json]
//
// For every file, every WBS level from 1 to 3 that exists and every activity
// code type the project's activities carry:
// 1. Sums: each point's per-group counts add up to the project-wide count,
//    and its per-group populations to the project-wide population (points 9
//    and 11 count completed work too; groups whose work is all complete and
//    clean are hidden, so their totals may add to less, never more).
// 2. Attribution by a second route: each finding is put in a group again by
//    its activity ID text (the successor's ID after "->" for a relationship)
//    looked up in TASK.task_code and that row's WBS or code assignment read
//    straight from PROJWBS/TASKACTV, not through ribbon.mjs's activity ids;
//    every group's count must match.
// 3. Pass/fail: a group's pass flag is recomputed from its count and total
//    against the DCMA threshold.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseXer } from "../xer.mjs";
import { assess } from "../dcma.mjs";
import { ribbon, ribbonOptions } from "../ribbon.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) { console.error("usage: node eval/ribbon-check.mjs DIR [--json out.json]"); process.exit(2); }
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;

const MAXPCT = new Map([[1, 5], [3, 5], [5, 5], [6, 5], [7, 0], [8, 5], [10, 0], [11, 5]]);
const passOf = (id, count, total) => {
  if (id === 2 || id === 9) return count === 0;
  if (!total) return true;
  if (id === 4) return (100 * (total - count)) / total >= 90;
  return (100 * count) / total <= MAXPCT.get(id) + 1e-9;
};

const out = [];
let failures = 0;
for (const f of readdirSync(dir).filter((x) => /\.xer$/i.test(x)).sort()) {
  const xer = parseXer(decodeXer(readFileSync(join(dir, f))));
  const report = assess(xer);
  const pid = report.project.id;
  const opts = ribbonOptions(xer, pid);
  const tasks = (xer.tables.TASK || []).filter((t) => t.proj_id === pid);
  const byCode = new Map();
  for (const t of tasks) byCode.set(t.task_code, (byCode.get(t.task_code) || []).concat(t));
  const wbs = new Map((xer.tables.PROJWBS || []).filter((w) => w.proj_id === pid).map((w) => [w.wbs_id, w]));
  const wbsKey = (t, level) => {
    const chain = [];
    for (let k = t.wbs_id; k && wbs.has(k) && wbs.get(k).proj_node_flag !== "Y"; k = wbs.get(k).parent_wbs_id) chain.unshift(k);
    return chain.length ? chain[Math.min(level, chain.length) - 1] : "";
  };
  const codeKey = (typeId) => {
    const held = new Map();
    for (const a of xer.tables.TASKACTV || []) if (a.actv_code_type_id === typeId && !held.has(a.task_id)) held.set(a.task_id, a.actv_code_id);
    const known = new Set((xer.tables.ACTVCODE || []).filter((c) => c.actv_code_type_id === typeId).map((c) => c.actv_code_id));
    return (t) => (held.has(t.task_id) && known.has(held.get(t.task_id)) ? held.get(t.task_id) : "");
  };
  const ways = [];
  for (let l = 1; l <= Math.min(3, opts.wbsLevels); l++) ways.push({ by: "wbs", level: l, key: (t) => wbsKey(t, l) });
  // flat code types only: a nested type's level-1 key needs the parent chain
  for (const c of opts.codes.filter((c) => !c.hierarchical)) ways.push({ by: c.id, name: c.name, level: 1, key: codeKey(c.id) });
  for (const w of ways) {
    const rb = ribbon(xer, report, { by: w.by, level: w.level });
    const row = { file: f, by: w.name || `WBS level ${w.level}`, groups: rb.groups.length, failingGroups: rb.groups.filter((g) => g.failing).length, sumOk: true, totalOk: true, attribution: { findings: 0, matched: 0, ambiguous: 0 }, passOk: true, worst: rb.groups[0] ? { name: rb.groups[0].name, failing: rb.groups[0].failing, population: rb.groups[0].population } : null };
    for (const c of rb.columns) {
      const pc = report.checks.find((x) => x.id === c.id);
      const s = rb.groups.reduce((a, g) => a + g.cells[c.id].count, 0);
      const t = rb.groups.reduce((a, g) => a + g.cells[c.id].total, 0);
      if (s !== pc.count) row.sumOk = false;
      if (c.id === 9 || c.id === 11 ? t > pc.total : t !== pc.total) row.totalOk = false;
      for (const g of rb.groups) if (g.cells[c.id].pass !== passOf(c.id, g.cells[c.id].count, g.cells[c.id].total)) row.passOk = false;
      // second route: by the ID text
      const want = new Map();
      let amb = 0;
      for (const it of pc.items) {
        row.attribution.findings++;
        const code = String(it.code).includes(" -> ") ? String(it.code).split(" -> ").pop() : String(it.code);
        const hits = byCode.get(code) || [];
        if (hits.length !== 1) { row.attribution.ambiguous++; amb++; continue; }
        const k = w.key(hits[0]);
        want.set(k, (want.get(k) || 0) + 1);
      }
      // exact when every ID is unique; at least as many otherwise
      let ok = true;
      for (const [k, n] of want) {
        const g = rb.groups.find((x) => x.key === k);
        if (!g || (amb ? g.cells[c.id].count < n : g.cells[c.id].count !== n)) ok = false;
      }
      if (!amb) for (const g of rb.groups) if (g.cells[c.id].count !== (want.get(g.key) || 0)) ok = false;
      const matched = [...want.values()].reduce((a, b) => a + b, 0);
      if (ok) row.attribution.matched += matched;
      else row.attribution.mismatch = (row.attribution.mismatch || 0) + 1;
    }
    if (!row.sumOk || !row.totalOk || !row.passOk || row.attribution.mismatch) failures++;
    out.push(row);
    console.log(`${f}\t${row.by}\t${row.groups} groups, ${row.failingGroups} failing a point\tsums ${row.sumOk ? "ok" : "BAD"}\ttotals ${row.totalOk ? "ok" : "BAD"}\tpass flags ${row.passOk ? "ok" : "BAD"}\tby ID text ${row.attribution.matched}/${row.attribution.findings - row.attribution.ambiguous}${row.attribution.ambiguous ? ` (${row.attribution.ambiguous} IDs not unique)` : ""}${row.attribution.mismatch ? " MISMATCH" : ""}`);
  }
}
console.log(`${out.length} groupings on ${new Set(out.map((r) => r.file)).size} files; ${failures} with a failure`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(out, null, 2) + "\n");
process.exit(failures ? 1 : 0);
