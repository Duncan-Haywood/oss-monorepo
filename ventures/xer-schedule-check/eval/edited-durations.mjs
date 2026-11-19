// Check the "Durations edited after the last schedule run" list (dcma.mjs).
//
//   1. as found: assess each file and print what the list says. A file P6
//      had just scheduled should list nothing; a file exported after edits
//      should list them and account for its stored-date differences.
//   2. planted: for each seed, change the remaining duration of K unstarted,
//      non-milestone activities (longer or shorter by 1 to 20 working days)
//      without rescheduling, as a scheduler does who edits and exports. The
//      list should name exactly the planted activities, and rescheduling with
//      the durations the stored dates imply should account for every
//      stored-date difference the edits caused.
//
//   node eval/edited-durations.mjs <dir-or-files...> [--seeds 10] [--k 5] [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { assess } from "../dcma.mjs";

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

const listOf = (a) => a.extra.find((e) => e.id === "edited-durations");
const out = [];
let tPlanted = 0, tFound = 0, tExtra = 0, tMissed = 0, tDiffer = 0, tExplained = 0, tFalseFiles = 0;
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const t0 = Date.now();
  const a0 = assess(xer);
  const l0 = listOf(a0);
  const row = { file: basename(f), version: xer.version, compared: a0.recompute.compared, matched: a0.recompute.matched,
    asFound: l0 ? { listed: l0.count, explained: l0.explained, differ: l0.differ, codes: l0.items.map((i) => i.code) } : { listed: 0 }, ms: Date.now() - t0, seeds: [] };
  console.log(`${row.file} (P6 ${xer.version}): ${a0.recompute.matched}/${a0.recompute.compared} agree; listed as edited: ${row.asFound.listed}${l0 ? `, explaining ${l0.explained} of ${l0.differ}` : ""}`);
  // planting needs a clean file: start from one with nothing listed
  if (l0) { out.push(row); continue; }
  const proj = a0.project.id;
  const pool = xer.tables.TASK.filter((r) => r.proj_id === proj && r.status_code === "TK_NotStart" && (r.task_type === "TT_Task" || r.task_type === "TT_Rsrc")
    && r.early_start_date && r.early_end_date && Number(r.remain_drtn_hr_cnt) > 0 && !r.expect_end_date);
  for (let s = 1; s <= SEEDS && pool.length; s++) {
    const R = rng(s * 7919 + pool.length);
    const pick = new Map();
    while (pick.size < Math.min(K, pool.length)) {
      const r = pool[Math.floor(R() * pool.length)];
      if (pick.has(r.task_id)) continue;
      const hpd = 8, dd = (1 + Math.floor(R() * 20)) * hpd * (R() < 0.5 ? -1 : 1);
      const now = Number(r.remain_drtn_hr_cnt);
      const next = now + dd > 0 ? now + dd : now + Math.abs(dd);
      pick.set(r.task_id, { code: r.task_code, next });
    }
    const TASK = xer.tables.TASK.map((r) => (pick.has(r.task_id) ? { ...r, remain_drtn_hr_cnt: String(pick.get(r.task_id).next) } : r));
    const a = assess({ ...xer, tables: { ...xer.tables, TASK } });
    const l = listOf(a);
    const listed = new Set(l ? l.items.map((i) => i.code) : []);
    const planted = new Set([...pick.values()].map((p) => p.code));
    const found = [...planted].filter((c) => listed.has(c)).length;
    const extra = [...listed].filter((c) => !planted.has(c)).length;
    const differ = a.recompute.compared - a.recompute.matched;
    const explained = l ? l.explained ?? 0 : 0;
    tPlanted += planted.size; tFound += found; tExtra += extra; tMissed += planted.size - found; tDiffer += differ; tExplained += explained;
    row.seeds.push({ seed: s, planted: planted.size, found, extra, differ, explained });
  }
  const sd = row.seeds;
  if (sd.length) console.log(`  planted ${sd.reduce((x, y) => x + y.planted, 0)} over ${sd.length} seeds: found ${sd.reduce((x, y) => x + y.found, 0)}, extra ${sd.reduce((x, y) => x + y.extra, 0)}; stored-date differences ${sd.reduce((x, y) => x + y.differ, 0)}, explained ${sd.reduce((x, y) => x + y.explained, 0)}`);
  out.push(row);
}
for (const r of out) if (r.asFound.listed && r.matched === r.compared) tFalseFiles++;
console.log(`TOTAL planted ${tPlanted}: found ${tFound}, missed ${tMissed}, extra ${tExtra}; differences ${tDiffer}, explained ${tExplained}; consistent files with a listing: ${tFalseFiles}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seeds: SEEDS, k: K, totals: { planted: tPlanted, found: tFound, missed: tMissed, extra: tExtra, differ: tDiffer, explained: tExplained }, files: out }, null, 1) + "\n");
