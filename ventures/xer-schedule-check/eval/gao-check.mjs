// Planted-fault check for gao.mjs on the public P6 files.
//
//   bash eval/corpus-fetch.sh DIR && node eval/gao-check.mjs DIR/xer [--seeds 5] [--json out.json]
//
// For each file, and each seed, one fault of each kind is planted on a
// randomly chosen eligible activity (or link) in a copy of the file, and the
// GAO scorecard is run on it. A plant is found when the planted activity is
// named under its own test and was not named there before. The six kinds,
// each a test of a practice the DCMA 14 points have no check for:
//
//   wbs          practice 1  an open activity moved onto the project's own WBS node
//   names        practice 1  an activity renamed to another activity's name (both named)
//   zero         practice 4  an unstarted task given zero duration
//   milestone    practice 5  every predecessor of an open finish milestone removed
//   path-lag     practice 6  a lag of one working day on a driving-path link
//   path-cstr    practice 6  a start-on constraint on a driving-path activity, at its early start
//
// It also reports the scorecard of each unplanted file, so a change to a
// threshold shows as a change here.

import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, formatDate } from "../xer.mjs";
import { parseSchedule } from "../mspdi.mjs";
import { gao } from "../gao.mjs";
import { assess } from "../dcma.mjs";
import { schedule } from "../cpm.mjs";

const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith("--"));
if (!dir) { console.error("usage: node eval/gao-check.mjs DIR [--seeds N] [--json out.json]"); process.exit(2); }
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const SEEDS = Number(opt("--seeds") || 5);

function rng(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];
const withTable = (xer, name, rows) => ({ ...xer, tables: { ...xer.tables, [name]: rows } });
const testOf = (g, id) => g.practices.flatMap((p) => p.tests).find((t) => t.id === id);
const named = (g, id, code) => !!testOf(g, id)?.items.some((i) => i.code === code || i.code.startsWith(code + " ") || i.code.endsWith(" " + code) || i.code.split(" -> ").includes(code));

const out = { files: [], totals: {} };
const files = readdirSync(dir).filter((f) => /\.xer$/i.test(f)).sort();
for (const f of files) {
  const xer = parseSchedule(decodeXer(readFileSync(join(dir, f))));
  const result = schedule(xer);
  const report = assess(xer, { result });
  const pid = report.project.id;
  const base = gao(xer, { projId: pid, result, report });
  const tasks = (xer.tables.TASK || []).filter((t) => t.proj_id === pid && t.task_type !== "TT_LOE" && t.task_type !== "TT_WBS");
  const openT = tasks.filter((t) => t.status_code !== "TK_Complete");
  const node = (xer.tables.PROJWBS || []).find((w) => w.proj_id === pid && w.proj_node_flag === "Y");
  const pathCodes = new Set(report.drivingPath.map((d) => d.code));
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  const pathT = openT.filter((t) => pathCodes.has(t.task_code));
  const pathLinks = (xer.tables.TASKPRED || []).filter((l) => pathCodes.has(byId.get(l.task_id)?.task_code) && pathCodes.has(byId.get(l.pred_task_id)?.task_code) && Number(l.lag_hr_cnt) === 0);
  const res = { file: f, project: report.project.name, open: report.project.open, baseline: base.practices.map((p) => ({ n: p.n, rating: p.rating, passed: p.passed, total: p.total })), characteristics: base.characteristics.map((c) => `${c.name}: ${c.rating}`), plants: {} };
  const kinds = {
    wbs: { test: "wbs", eligible: node ? openT.filter((t) => t.wbs_id !== node.wbs_id) : [], plant: (t) => withTable(xer, "TASK", xer.tables.TASK.map((r) => (r === t ? { ...r, wbs_id: node.wbs_id } : r))) },
    names: { test: "names", eligible: tasks, plant: (t, r) => {
      const other = pick(r, tasks.filter((o) => o !== t && o.task_name !== t.task_name));
      return { x: withTable(xer, "TASK", xer.tables.TASK.map((row) => (row === t ? { ...row, task_name: other.task_name } : row))), also: other.task_code };
    } },
    zero: { test: "zero-duration", eligible: openT.filter((t) => t.status_code === "TK_NotStart" && t.task_type !== "TT_Mile" && t.task_type !== "TT_FinMile" && Number(t.target_drtn_hr_cnt) > 0),
      plant: (t) => withTable(xer, "TASK", xer.tables.TASK.map((r) => (r === t ? { ...r, target_drtn_hr_cnt: "0", remain_drtn_hr_cnt: "0" } : r))) },
    milestone: { test: "milestones-linked", eligible: openT.filter((t) => t.task_type === "TT_FinMile" && (xer.tables.TASKPRED || []).some((l) => l.task_id === t.task_id)),
      plant: (t) => withTable(xer, "TASKPRED", xer.tables.TASKPRED.filter((l) => l.task_id !== t.task_id)) },
    "path-lag": { test: "path-lags", eligible: pathLinks, code: (l) => byId.get(l.task_id).task_code,
      plant: (l) => withTable(xer, "TASKPRED", xer.tables.TASKPRED.map((r) => (r === l ? { ...r, lag_hr_cnt: "8" } : r))) },
    "path-cstr": { test: "path-constraints", eligible: pathT.filter((t) => t.status_code === "TK_NotStart" && !t.cstr_type),
      plant: (t) => {
        const es = result.tasks.get(t.task_id)?.es;
        return withTable(xer, "TASK", xer.tables.TASK.map((r) => (r === t ? { ...r, cstr_type: "CS_MSO", cstr_date: formatDate(es) } : r)));
      } },
  };
  const seeds = f.startsWith("CCA") ? Math.min(SEEDS, 2) : SEEDS;
  for (const [kind, k] of Object.entries(kinds)) {
    const row = { planted: 0, found: 0, eligible: k.eligible.length, misses: [] };
    for (let s = 1; s <= seeds && k.eligible.length; s++) {
      const r = rng(s * 7919 + kind.length);
      const target = pick(r, k.eligible);
      const code = k.code ? k.code(target) : target.task_code;
      if (named(base, k.test, code)) continue; // already failing there before the plant
      let planted = k.plant(target, r);
      let also = null;
      if (planted && planted.x) { also = planted.also; planted = planted.x; }
      const g = gao(planted, { projId: pid });
      row.planted++;
      const ok = named(g, k.test, code) && (!also || named(g, k.test, also));
      if (ok) row.found++; else row.misses.push(code);
    }
    res.plants[kind] = row;
    const t = (out.totals[kind] ||= { planted: 0, found: 0 });
    t.planted += row.planted; t.found += row.found;
  }
  out.files.push(res);
  console.log(`${f}: ${res.characteristics.join("; ")}`);
  console.log(`  ${Object.entries(res.plants).map(([k, v]) => `${k} ${v.found}/${v.planted}${v.eligible ? "" : " (none eligible)"}${v.misses.length ? ` missed ${v.misses.join(",")}` : ""}`).join("; ")}`);
}
const tp = Object.values(out.totals).reduce((a, t) => a + t.planted, 0), tf = Object.values(out.totals).reduce((a, t) => a + t.found, 0);
console.log(`\nAll: ${tf} of ${tp} planted faults named under their own test. ${Object.entries(out.totals).map(([k, t]) => `${k} ${t.found}/${t.planted}`).join(", ")}`);
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 2) + "\n");
