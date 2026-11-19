// Check the "Lags edited after the last schedule run" list (dcma.mjs).
//
//   1. as found: on every file, test every link into an unstarted activity
//      against the dates P6 stored (brokenLinks, run whether or not the file's
//      stored dates differ from the logic). P6 meets every link when it
//      schedules, so a file it had just scheduled should break none.
//   2. planted: for each seed, lengthen the lag of K links into unstarted
//      activities by 1 to 20 working days (8 h) without rescheduling, as a
//      scheduler does who edits a lag and exports. Every planted lag that
//      moves a date should be listed, nothing else should be, and
//      rescheduling with the lags the stored dates leave room for should
//      account for the stored-date differences the edits caused.
//
//   node eval/edited-lags.mjs <dir-or-files...> [--seeds 10] [--k 5] [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { buildModel } from "../cpm.mjs";
import { assess, brokenLinks } from "../dcma.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SEEDS = +opt("--seeds", 10), K = +opt("--k", 5), jsonOut = opt("--json", null);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--seeds", "--k", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}

function rng(seed) {
  let x = seed * 2654435761 >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const listOf = (a) => a.extra.find((e) => e.id === "edited-lags");
const out = [];
const T = { checked: 0, broken: 0, planted: 0, moved: 0, found: 0, missed: 0, extra: 0, differ: 0, explained: 0, near: 0 };
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const model = buildModel(xer);
  const open = [...model.tasks.values()].filter((t) => !t.span && t.status !== "TK_Complete");
  const stats = {};
  const broken = brokenLinks(model, open, new Set(), stats);
  const a0 = assess(xer);
  const l0 = listOf(a0);
  const asFound = new Set(broken.map((b) => b.rel.id));
  const row = { file: basename(f), version: xer.version, compared: a0.recompute.compared, matched: a0.recompute.matched, linksChecked: stats.checked || 0,
    broken: broken.map((b) => ({ succ: b.t.code, pred: b.pr.code, type: b.rel.type, lagH: b.rel.lag / 60, roomH: Math.round(b.room / 6) / 10 })),
    listed: l0 ? { count: l0.count, explained: l0.explained, near: l0.near, differ: l0.differ } : null, seeds: [] };
  T.checked += row.linksChecked; T.broken += broken.length;
  console.log(`${row.file} (P6 ${xer.version}): ${a0.recompute.matched}/${a0.recompute.compared} agree; links checked ${row.linksChecked}, broken by the stored dates ${broken.length}${broken.length ? ": " + row.broken.map((b) => `${b.pred} -> ${b.succ} ${b.type} lag ${b.lagH} h, room ${b.roomH} h`).join("; ") : ""}${l0 ? `; listed, explaining ${l0.explained} of ${l0.differ} (+${l0.near} but for a gap with no working time)` : ""}`);
  // plant on links into unstarted activities of the assessed project that the check can test
  const proj = a0.project.id;
  const pool = [];
  for (const t of open) {
    if (t.proj !== proj || t.status !== "TK_NotStart" || !t.row.early_start_date || !t.row.early_end_date) continue;
    for (const rel of t.preds) {
      const pr = model.tasks.get(rel.predId);
      if (!pr || pr.span || rel.external || asFound.has(rel.id)) continue;
      if (pr.status === "TK_Active" && (rel.type === "PR_SS" || rel.type === "PR_SF")) continue;
      pool.push(rel);
    }
  }
  for (let s = 1; s <= SEEDS && pool.length; s++) {
    const R = rng(s * 7919 + pool.length);
    const pick = new Map();
    while (pick.size < Math.min(K, pool.length)) {
      const rel = pool[Math.floor(R() * pool.length)];
      if (pick.has(rel.id)) continue;
      pick.set(rel.id, rel.lag / 60 + (1 + Math.floor(R() * 20)) * 8);
    }
    const TASKPRED = xer.tables.TASKPRED.map((r) => (pick.has(r.task_pred_id) ? { ...r, lag_hr_cnt: String(pick.get(r.task_pred_id)) } : r));
    const x2 = { ...xer, tables: { ...xer.tables, TASKPRED } };
    const a = assess(x2);
    const l = listOf(a);
    const m2 = buildModel(x2);
    const listedIds = new Set(brokenLinks(m2, [...m2.tasks.values()].filter((t) => !t.span && t.status !== "TK_Complete" && t.proj === proj)).map((b) => b.rel.id));
    const shown = l ? listedIds : new Set();
    // a planted lag "moves" the schedule when, alone, it makes a stored date disagree
    let moved = 0, found = 0;
    for (const [id, lagH] of pick) {
      const one = { ...xer, tables: { ...xer.tables, TASKPRED: xer.tables.TASKPRED.map((r) => (r.task_pred_id === id ? { ...r, lag_hr_cnt: String(lagH) } : r)) } };
      const a1 = assess(one, { projId: proj });
      const differs = a1.recompute.compared - a1.recompute.matched > a0.recompute.compared - a0.recompute.matched;
      if (differs) { moved++; if (shown.has(id)) found++; }
    }
    const extra = [...shown].filter((id) => !pick.has(id) && !asFound.has(id)).length;
    const differ = a.recompute.compared - a.recompute.matched - (a0.recompute.compared - a0.recompute.matched);
    const explained = l ? (l.explained ?? 0) - (l0 ? l0.explained ?? 0 : 0) : 0;
    const near = l ? (l.near ?? 0) - (l0 ? l0.near ?? 0 : 0) : 0;
    T.planted += pick.size; T.moved += moved; T.found += found; T.missed += moved - found; T.extra += extra; T.differ += differ; T.explained += explained; T.near += near;
    row.seeds.push({ seed: s, planted: pick.size, moved, found, extra, differ, explained, near });
  }
  const sd = row.seeds, sum = (k) => sd.reduce((x, y) => x + y[k], 0);
  if (sd.length) console.log(`  planted ${sum("planted")} over ${sd.length} seeds: ${sum("moved")} move a stored date, found ${sum("found")}, extra ${sum("extra")}; differences caused ${sum("differ")}, explained ${sum("explained")} (+${sum("near")} but for a gap with no working time)`);
  out.push(row);
}
console.log(`TOTAL links checked ${T.checked}, broken as found ${T.broken}; planted ${T.planted}: ${T.moved} move a stored date, found ${T.found}, missed ${T.missed}, extra ${T.extra}; differences ${T.differ}, explained ${T.explained} (+${T.near} near)`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seeds: SEEDS, k: K, totals: T, files: out }, null, 1) + "\n");
