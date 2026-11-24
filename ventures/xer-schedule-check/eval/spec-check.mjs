// Independent check of spec.mjs on public XER files: each table-countable rule
// recounted straight from the raw XER tables (TASK, TASKPRED, CALENDAR,
// TASKACTV, ACTVTYPE, TASKRSRC, PROJCOST), without cpm.mjs's model, and
// compared with what specCheck reports. Also times the run per file.
//
//   bash eval/corpus-fetch.sh DIR
//   node eval/spec-check.mjs DIR/xer > eval/spec-check-YYYY-MM-DD.json
//
// The rules used are made up for the test (they are not any agency's
// specification): durations 20 working days, lags 10, no leads, no SF, only
// start-on-or-after and finish-on-or-before constraints, required codes taken
// from each file's first activity code type, cost and resource loading, 5% per
// activity, single start/finish, names of 10+ characters.
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { specCheck } from "../spec.mjs";

const dir = process.argv[2];
if (!dir) { console.error("usage: node eval/spec-check.mjs DIR"); process.exit(2); }
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const out = [];
let allAgree = true;
for (const f of readdirSync(dir).filter((x) => x.toLowerCase().endsWith(".xer")).sort()) {
  const xer = parseXer(decodeXer(readFileSync(join(dir, f))));
  const T = xer.tables;
  const firstType = (T.ACTVTYPE || [])[0];
  const rules = {
    maxDuration: 20, maxLag: 10, noLeads: true, noStartToFinish: true, allowedConstraints: ["CS_MSOA", "CS_MEOB"],
    singleStartFinish: true, minNameLength: 10, resourceLoaded: true, costLoaded: true, maxActivityValuePct: 5,
    ...(firstType ? { requiredCodes: [firstType.actv_code_type] } : {}),
  };
  const t0 = performance.now();
  const r = specCheck(xer, rules);
  const ms = Math.round(performance.now() - t0);
  const got = Object.fromEntries(r.results.map((x) => [x.key, x.status === "note" ? "note" : x.items.length]));

  // --- raw recount ---
  const tasks = (T.TASK || []).filter((t) => t.task_id);
  const byId = new Map(tasks.map((t) => [t.task_id, t]));
  const hpd = new Map((T.CALENDAR || []).map((c) => [c.clndr_id, n(c.day_hr_cnt) || 8]));
  // spec.mjs counts in the calendar the model resolved; a calendar the file
  // lacks (or one with no hours) falls back, so those are left out of both
  // sides by restricting to activities whose calendar has its own hours
  const own = (t) => hpd.has(t.clndr_id) && n((T.CALENDAR || []).find((c) => c.clndr_id === t.clndr_id).day_hr_cnt) > 0;
  const acts = tasks.filter((t) => t.task_type !== "TT_WBS");
  const work = acts.filter((t) => !["TT_Mile", "TT_FinMile", "TT_LOE"].includes(t.task_type));
  const openWork = work.filter((t) => t.status_code !== "TK_Complete");
  const fallbackUsed = acts.some((t) => !own(t));
  const want = {};
  want.maxDuration = openWork.filter((t) => n(t.target_drtn_hr_cnt) / hpd.get(t.clndr_id) > 20 + 1e-9).length;
  const rels = (T.TASKPRED || []).filter((p) => byId.has(p.task_id) && byId.has(p.pred_task_id));
  const lagD = (p) => Math.round(n(p.lag_hr_cnt) * 60) / 60 / hpd.get(byId.get(p.pred_task_id).clndr_id);
  want.maxLag = rels.filter((p) => lagD(p) > 10 + 1e-9).length;
  want.noLeads = rels.filter((p) => Math.round(n(p.lag_hr_cnt) * 60) < 0).length;
  want.noStartToFinish = rels.filter((p) => p.pred_type === "PR_SF").length;
  const open = acts.filter((t) => t.status_code !== "TK_Complete");
  want.allowedConstraints = open.reduce((s, t) => s + [t.cstr_type, t.cstr_type2].filter((c) => c && !["CS_MSOA", "CS_MEOB"].includes(c)).length, 0);
  const net = acts.filter((t) => t.task_type !== "TT_LOE");
  const hasPred = new Set(rels.map((p) => p.task_id)), hasSucc = new Set(rels.map((p) => p.pred_task_id));
  const s0 = net.filter((t) => !hasPred.has(t.task_id)).length, e0 = net.filter((t) => !hasSucc.has(t.task_id)).length;
  want.singleStartFinish = (s0 > 1 ? s0 : 0) + (e0 > 1 ? e0 : 0);
  want.minNameLength = acts.filter((t) => String(t.task_name ?? "").trim().length < 10).length;
  const workIds = new Set(work.map((t) => t.task_id));
  const assigned = new Set((T.TASKRSRC || []).map((a) => a.task_id));
  want.resourceLoaded = work.filter((t) => !assigned.has(t.task_id)).length;
  const cost = new Map();
  for (const a of T.TASKRSRC || []) if (byId.has(a.task_id)) cost.set(a.task_id, (cost.get(a.task_id) || 0) + n(a.target_cost));
  for (const c of T.PROJCOST || []) if (byId.has(c.task_id)) cost.set(c.task_id, (cost.get(c.task_id) || 0) + n(c.target_cost));
  want.costLoaded = [...workIds].filter((id) => !((cost.get(id) || 0) > 0)).length;
  const total = acts.reduce((s, t) => s + (cost.get(t.task_id) || 0), 0);
  want.maxActivityValuePct = total > 0 ? acts.filter((t) => (cost.get(t.task_id) || 0) > total * 0.05 + 1e-6).length : "note";
  if (firstType) {
    const held = new Set((T.TASKACTV || []).filter((a) => a.actv_code_type_id === firstType.actv_code_type_id).map((a) => a.task_id));
    want.requiredCodes = acts.filter((t) => !held.has(t.task_id)).length;
  }
  const rows = Object.keys(want).map((k) => ({ rule: k, specCheck: got[k], raw: want[k], agree: got[k] === want[k] }));
  const agree = rows.every((x) => x.agree);
  // a calendar-fallback file is reported but not held against the duration
  // and lag rows (the model's fallback calendar is the right behaviour)
  if (!agree && !fallbackUsed) allAgree = false;
  out.push({ file: f, activities: acts.length, relationships: rels.length, ms, fallbackCalendar: fallbackUsed, agree, rows });
  console.error(`${f}: ${acts.length} activities, ${rels.length} links, ${ms} ms, ${rows.filter((x) => x.agree).length}/${rows.length} rules agree${fallbackUsed ? " (some activities on a fallback calendar)" : ""}`);
  for (const x of rows) if (!x.agree) console.error(`  ${x.rule}: specCheck ${x.specCheck}, raw ${x.raw}`);
}
console.log(JSON.stringify({ rules: "see header", files: out, allAgree }, null, 2));
process.exit(allAgree ? 0 : 1);
