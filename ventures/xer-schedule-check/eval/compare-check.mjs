// Does compare.mjs report exactly the changes made between two updates, on
// real P6 files? For each XER file in a folder:
//   1. identity: the file against itself must report no change at all, and
//      the half-step finish must equal the finish;
//   2. planted edits: a seeded copy gets K edits of known kinds (relationship
//      deleted, lag changed, relationship type changed, original duration
//      changed on an unstarted activity, constraint added, activity renamed,
//      activity deleted, actual date edited, activity calendar switched), and
//      the report must list each one and nothing else in those sections.
//   3. progress only: the copy gets only progress (an unstarted activity
//      marked started at the data date), and the half-step finish must equal
//      the current finish (all movement is progress, none is revision).
//
//   node eval/compare-check.mjs <dir-with-xer-files> [--seeds 20] [--json out.json]
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { compare, pickProject } from "../compare.mjs";
import { buildModel } from "../cpm.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const SEEDS = args.includes("--seeds") ? +args[args.indexOf("--seeds") + 1] : 20;
const K = 6;

function rng(seed) {
  let x = seed * 2654435761 >>> 0 || 1;
  return () => ((x ^= x << 13, x ^= x >>> 17, x ^= x << 5) >>> 0) / 4294967296;
}
const clone = (xer) => ({ ...xer, tables: Object.fromEntries(Object.entries(xer.tables).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])) });

function plant(xer, projId, rand) {
  const x = clone(xer);
  const T = x.tables;
  const byId = new Map(T.TASK.map((r) => [r.task_id, r]));
  const mine = T.TASK.filter((r) => r.proj_id === projId && r.task_type !== "TT_LOE" && r.task_type !== "TT_WBS");
  const codeCount = new Map();
  for (const r of mine) codeCount.set(r.task_code, (codeCount.get(r.task_code) || 0) + 1);
  const uniq = (r) => codeCount.get(r.task_code) === 1;
  const touched = new Set();
  const expect = [];
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const relKeys = new Map();
  for (const r of T.TASKPRED || []) {
    const s = byId.get(r.task_id), p = byId.get(r.pred_task_id);
    if (!s || !p) continue;
    const k = `${p.task_code}\t${s.task_code}`;
    relKeys.set(k, (relKeys.get(k) || 0) + 1);
  }
  const relOk = (r) => {
    const s = byId.get(r.task_id), p = byId.get(r.pred_task_id);
    return s && p && s.proj_id === projId && uniq(s) && uniq(p) && !touched.has(s.task_code) && !touched.has(p.task_code) && relKeys.get(`${p.task_code}\t${s.task_code}`) === 1;
  };
  const cals = (T.CALENDAR || []).filter((c) => c.clndr_data);
  const kinds = ["relDelete", "lag", "relType", "orig", "cstr", "rename", "actDelete", "actual", "calendar"];
  let guard = 0;
  while (expect.length < K && guard++ < 500) {
    const kind = pick(kinds);
    if (kind === "relDelete" || kind === "lag" || kind === "relType") {
      const cands = (T.TASKPRED || []).filter(relOk);
      if (!cands.length) continue;
      const r = pick(cands);
      const s = byId.get(r.task_id), p = byId.get(r.pred_task_id);
      if (kind === "relDelete") T.TASKPRED.splice(T.TASKPRED.indexOf(r), 1);
      else if (kind === "lag") r.lag_hr_cnt = String((Number(r.lag_hr_cnt) || 0) + 16);
      else r.pred_type = r.pred_type === "PR_FS" ? "PR_SS" : "PR_FS";
      touched.add(s.task_code); touched.add(p.task_code);
      expect.push({ kind, pred: p.task_code, succ: s.task_code });
      continue;
    }
    const pool = mine.filter((r) => uniq(r) && !touched.has(r.task_code));
    let r;
    if (kind === "orig") {
      const c = pool.filter((t) => t.status_code === "TK_NotStart" && Number(t.target_drtn_hr_cnt) > 0);
      if (!c.length) continue;
      r = pick(c);
      r.target_drtn_hr_cnt = String(Number(r.target_drtn_hr_cnt) + 8);
      r.remain_drtn_hr_cnt = String(Number(r.remain_drtn_hr_cnt) + 8);
    } else if (kind === "cstr") {
      const c = pool.filter((t) => t.status_code === "TK_NotStart" && !t.cstr_type);
      if (!c.length) continue;
      r = pick(c);
      r.cstr_type = "CS_MSOA";
      r.cstr_date = r.early_start_date || r.target_start_date || "";
      if (!r.cstr_date) continue;
    } else if (kind === "rename") {
      r = pick(pool);
      if (!r) continue;
      r.task_name = r.task_name + " (revised)";
    } else if (kind === "actDelete") {
      const c = pool.filter((t) => t.status_code !== "TK_Complete");
      if (!c.length) continue;
      r = pick(c);
      T.TASK.splice(T.TASK.indexOf(r), 1);
      // its links go with it, as in P6; neighbours' links are not "expected"
      T.TASKPRED = (T.TASKPRED || []).filter((l) => l.task_id !== r.task_id && l.pred_task_id !== r.task_id);
      for (const l of xer.tables.TASKPRED || []) {
        if (l.task_id === r.task_id) touched.add(byId.get(l.pred_task_id)?.task_code);
        if (l.pred_task_id === r.task_id) touched.add(byId.get(l.task_id)?.task_code);
      }
    } else if (kind === "actual") {
      const c = pool.filter((t) => t.status_code === "TK_Complete" && t.act_end_date && t.act_start_date && t.act_end_date > t.act_start_date);
      if (!c.length) continue;
      r = pick(c);
      r.act_start_date = r.act_start_date.slice(0, 10) === r.act_end_date.slice(0, 10) ? r.act_start_date : shiftDay(r.act_start_date, 1);
      if (r.act_start_date === xer.tables.TASK.find((t) => t.task_id === r.task_id).act_start_date) continue;
    } else if (kind === "calendar") {
      if (cals.length < 2) continue;
      const c = pool.filter((t) => t.status_code !== "TK_Complete");
      if (!c.length) continue;
      r = pick(c);
      const other = cals.filter((k) => k.clndr_id !== r.clndr_id && (k.clndr_name || k.clndr_id) !== (cals.find((q) => q.clndr_id === r.clndr_id)?.clndr_name));
      if (!other.length) continue;
      r.clndr_id = pick(other).clndr_id;
    }
    touched.add(r.task_code);
    expect.push({ kind, code: r.task_code });
  }
  return { x, expect };
}
function shiftDay(s, n) {
  const d = new Date(s.slice(0, 10) + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10) + s.slice(10);
}

function reported(rep) {
  const out = [];
  // links of a deleted activity are reported as such (bothRemain false), not as edits
  for (const r of rep.logic.deleted) if (r.bothRemain) out.push(`relDelete ${r.pred} ${r.succ}`);
  for (const r of rep.logic.lagChanged) out.push(`lag ${r.pred} ${r.succ}`);
  for (const r of rep.logic.typeChanged) out.push(`relType ${r.pred} ${r.succ}`);
  for (const r of rep.logic.added) out.push(`relAdd ${r.pred} ${r.succ}`);
  for (const r of rep.durations.origChanged) out.push(`orig ${r.code}`);
  for (const r of rep.constraints) out.push(`cstr ${r.code}`);
  for (const r of rep.activities.renamed) out.push(`rename ${r.code}`);
  for (const r of rep.activities.deleted) out.push(`actDelete ${r.code}`);
  for (const r of rep.activities.added) out.push(`actAdd ${r.code}`);
  for (const r of rep.progress.actualsEdited) out.push(`actual ${r.code}`);
  for (const r of rep.calendars) out.push(`calendar ${r.code}`);
  return out;
}
const key = (e) => (e.code ? `${e.kind} ${e.code}` : `${e.kind} ${e.pred} ${e.succ}`);

const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".xer")).sort();
const results = [];
for (const f of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(join(dir, f))));
  const model = buildModel(xer);
  const proj = pickProject(xer, model, null);
  const projId = proj.id;
  const same = compare(xer, xer, { prevProjId: projId, curProjId: projId });
  const identityChanges = reported(same).length + same.progress.started.length + same.progress.finished.length + same.progress.reversed.length + same.float.rows.filter((r) => r.floatUsed).length;
  const identityHalf = same.finish.halfStep === same.current.finish;
  let expected = 0, found = 0, extra = 0, halfOk = 0, halfN = 0;
  const misses = [];
  for (let s = 1; s <= SEEDS; s++) {
    const { x, expect } = plant(xer, projId, rng(s));
    const rep = compare(xer, x, { prevProjId: projId, curProjId: projId });
    const got = new Set(reported(rep));
    const want = new Set(expect.map(key));
    expected += want.size;
    for (const w of want) if (got.has(w)) found++; else misses.push(`seed ${s}: ${w}`);
    for (const g of got) if (!want.has(g)) { extra++; misses.push(`seed ${s}: unexpected ${g}`); }
    // progress only: start one unstarted activity at the data date
    const y = clone(xer);
    const dd = (y.tables.PROJECT.find((p) => p.proj_id === projId) || {}).last_recalc_date;
    const c = y.tables.TASK.filter((t) => t.proj_id === projId && t.status_code === "TK_NotStart" && t.task_type === "TT_Task");
    if (dd && c.length) {
      const t = c[Math.floor(rng(s + 1000)() * c.length)];
      t.status_code = "TK_Active";
      t.act_start_date = dd;
      const rp = compare(xer, y, { prevProjId: projId, curProjId: projId });
      halfN++;
      if (rp.finish.halfStep === rp.current.finish && rp.finish.revisionEffect === 0) halfOk++;
      else misses.push(`seed ${s}: progress-only half-step ${rp.finish.halfStep} vs ${rp.current.finish}`);
    }
  }
  const row = { file: f, project: proj.code, activities: xer.tables.TASK.filter((t) => t.proj_id === projId).length, identityChanges, identityHalf, expected, found, extra, halfOk, halfN, seconds: (Date.now() - t0) / 1000, misses: misses.slice(0, 10) };
  results.push(row);
  console.log(`${f}: identity ${identityChanges} changes, half-step ${identityHalf ? "=" : "!="} finish; planted ${found}/${expected} found, ${extra} unexpected; progress-only half-step ${halfOk}/${halfN}; ${row.seconds.toFixed(1)} s`);
  for (const m of row.misses) console.log("   " + m);
}
if (args.includes("--json")) writeFileSync(args[args.indexOf("--json") + 1], JSON.stringify(results, null, 2) + "\n");
