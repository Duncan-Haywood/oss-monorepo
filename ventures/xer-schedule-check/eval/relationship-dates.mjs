// Check reldates.mjs: P6's stored relationship dates (TASKPRED aref, arls).
//
//   1. decode: on every link between two unstarted activities, does aref
//      equal the early start the link gives the successor, and arls the late
//      date it gives the predecessor (formulas in reldates.mjs), computed from
//      the activities' own stored dates and the link's current lag?
//   2. as found: links relationshipLags() lists on the real files (P6 had
//      just scheduled them, so none should be listed unless a lag changed).
//   3. planted: per seed, change the lag of K checked links by -10 to +20
//      working days of 8 h (never below 0), and add K links with no stored
//      dates between unstarted activities, without rescheduling. Every
//      changed lag should be listed with its old value exactly, every added
//      link listed as added, and nothing else.
//   4. finished nodes: a finished activity is a zero-length node, so its
//      stored late date should be the earliest arls over its links to
//      activities that are not level of effort. Count where it is not.
//
//   node eval/relationship-dates.mjs <dir-or-files...> [--seeds 10] [--k 20] [--json out.json]
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, parseDate, formatDate } from "../xer.mjs";
import { buildModel } from "../cpm.mjs";
import { relationshipLags, impliedLags } from "../reldates.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const SEEDS = +opt("--seeds", 10), K = +opt("--k", 20), jsonOut = opt("--json", null);
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--seeds", "--k", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
function rng(seed) {
  let x = seed * 2654435761 >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; };
}

const T = { decodeA: 0, decodeAok: 0, decodeL: 0, decodeLok: 0, checked: 0, found: 0, planted: 0, recovered: 0, missed: 0, wrong: 0, extra: 0, addPlanted: 0, addFound: 0, doneNodes: 0, doneEq: 0 };
const out = [];
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const model = buildModel(xer);
  const r0 = relationshipLags(model);
  const row = { file: basename(f), version: xer.version, checked: r0.checked, found: r0.links.length, added: r0.added.length, decode: {}, planted: 0, recovered: 0, missed: 0, wrong: 0, extra: 0, addPlanted: 0, addFound: 0 };
  if (!r0.checked) { out.push(row); console.log(`${row.file} (P6 ${row.version}): no relationship dates stored`); continue; }
  T.checked += r0.checked; T.found += r0.links.length;

  // 1. decode: the lag each stored date implies equals the current lag
  const byId = new Map([...model.tasks.values()].map((t) => [t.id, t]));
  for (const rel of model.rels) {
    const p = byId.get(rel.predId), s = byId.get(rel.succId);
    if (!p || !s || p.span || s.span || p.status !== "TK_NotStart" || s.status !== "TK_NotStart" || rel.type === "PR_SF") continue;
    if (!p.row.early_start_date || !p.row.early_end_date || !s.row.late_start_date || !s.row.late_end_date) continue;
    const w = impliedLags(model, rel, p, s);
    if (!w) continue;
    const d = (row.decode[rel.type] ||= { aref: 0, arefOk: 0, arls: 0, arlsOk: 0 });
    if (w.fromA !== null) { d.aref++; T.decodeA++; if (Math.abs(w.fromA - rel.lag) <= 1) { d.arefOk++; T.decodeAok++; } }
    if (w.fromL !== null) { d.arls++; T.decodeL++; if (Math.abs(w.fromL - rel.lag) <= 1) { d.arlsOk++; T.decodeLok++; } }
  }
  const flagged = new Set(r0.links.map((l) => l.rel.id));

  // 2/3. planted
  const cand = model.rels.filter((rel) => {
    const p = byId.get(rel.predId), s = byId.get(rel.succId);
    return p && s && !p.span && !s.span && p.status === "TK_NotStart" && s.status === "TK_NotStart" && rel.type !== "PR_SF" && rel.row.arls && !flagged.has(rel.id) && p.row.early_start_date && s.row.late_end_date;
  });
  const pairs = [...model.tasks.values()].filter((t) => !t.span && t.status === "TK_NotStart" && t.row.early_start_date && t.row.late_end_date);
  for (let seed = 1; seed <= SEEDS; seed++) {
    const rand = rng(seed * 7919 + f.length);
    const pick = new Map();
    while (pick.size < Math.min(K, cand.length)) {
      const rel = cand[Math.floor(rand() * cand.length)];
      if (pick.has(rel.id)) continue;
      let delta = Math.round((rand() * 30 - 10)) * 8; // -10 to +20 days of 8 h
      if (delta === 0) delta = 8;
      const nl = Math.max(0, rel.lag / 60 + delta);
      if (Math.abs(nl - rel.lag / 60) < 0.01) continue;
      pick.set(rel.id, nl);
    }
    const added = [];
    const relKeys = new Set(model.rels.map((r) => `${r.predId}|${r.succId}`));
    while (added.length < Math.min(K, pairs.length)) {
      const a = pairs[Math.floor(rand() * pairs.length)], b = pairs[Math.floor(rand() * pairs.length)];
      if (a === b || relKeys.has(`${a.id}|${b.id}`)) continue;
      relKeys.add(`${a.id}|${b.id}`);
      added.push({ task_pred_id: `planted-${seed}-${added.length}`, task_id: b.id, pred_task_id: a.id, proj_id: b.proj, pred_proj_id: a.proj, pred_type: "PR_FS", lag_hr_cnt: "0", aref: "", arls: "" });
    }
    const TASKPRED = (xer.tables.TASKPRED || []).map((r) => (pick.has(r.task_pred_id) ? { ...r, lag_hr_cnt: String(pick.get(r.task_pred_id)) } : r)).concat(added);
    const m2 = buildModel({ ...xer, tables: { ...xer.tables, TASKPRED } });
    const r2 = relationshipLags(m2);
    const listed = new Map(r2.links.map((l) => [l.rel.id, l]));
    for (const [id] of pick) {
      row.planted++;
      const orig = model.rels.find((r) => r.id === id);
      const l = listed.get(id);
      if (!l) row.missed++;
      else if (Math.abs(l.was - orig.lag) <= 1) row.recovered++;
      else row.wrong++;
    }
    for (const id of listed.keys()) if (!pick.has(id) && !flagged.has(id)) row.extra++;
    const addedIds = new Set(r2.added.map((a) => a.rel.id));
    row.addPlanted += added.length;
    row.addFound += added.filter((a) => addedIds.has(a.task_pred_id)).length;
    row.extra += [...addedIds].filter((id) => !String(id).startsWith("planted-") && !r0.added.some((a) => a.rel.id === id)).length;
  }
  for (const k of ["planted", "recovered", "missed", "wrong", "extra", "addPlanted", "addFound"]) T[k] += row[k];

  // 4. finished nodes against their own links' arls
  let dn = 0, deq = 0; const odd = [];
  for (const t of model.tasks.values()) {
    if (t.span || t.status !== "TK_Complete" || !t.row.late_end_date) continue;
    const ls = t.succs.filter((r) => !r.external && r.row.arls && !byId.get(r.succId)?.span && byId.get(r.succId)?.row.task_type !== "TT_LOE").map((r) => parseDate(r.row.arls));
    if (!ls.length) continue;
    dn++;
    const mn = Math.min(...ls), lf = parseDate(t.row.late_end_date);
    if (mn === lf) deq++; else odd.push({ code: t.code, late: t.row.late_end_date, minArls: formatDate(mn) });
  }
  row.doneNodes = dn; row.doneEq = deq; row.doneOdd = odd;
  T.doneNodes += dn; T.doneEq += deq;
  out.push(row);
  console.log(`${row.file} (P6 ${row.version}): decode ${Object.entries(row.decode).map(([k, d]) => `${k.slice(3)} aref ${d.arefOk}/${d.aref} arls ${d.arlsOk}/${d.arls}`).join(", ")}`);
  console.log(`  ${row.checked} links checked, ${row.found} listed as found, ${row.added} added; planted ${row.planted} lag edits: ${row.recovered} listed with the old lag exactly, ${row.wrong} with another, ${row.missed} missed; planted ${row.addPlanted} added links: ${row.addFound} listed; ${row.extra} listed that were not planted; finished nodes: late date = earliest arls on ${deq} of ${dn}`);
  for (const o of odd) console.log(`    ${o.code}: stored late ${o.late}, its links' earliest arls ${o.minArls}`);
}
console.log(`\nTotal: decode aref ${T.decodeAok}/${T.decodeA}, arls ${T.decodeLok}/${T.decodeL}; ${T.checked} links checked, ${T.found} listed as found; lag edits ${T.recovered}/${T.planted} recovered exactly (${T.wrong} other value, ${T.missed} missed); added links ${T.addFound}/${T.addPlanted}; ${T.extra} false listings; finished nodes ${T.doneEq}/${T.doneNodes}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seeds: SEEDS, k: K, total: T, files: out }, null, 1) + "\n");
