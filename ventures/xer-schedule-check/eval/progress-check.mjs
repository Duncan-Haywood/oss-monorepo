// Check for progress.mjs on the public P6 files.
//
//   bash eval/corpus-fetch.sh DIR && node eval/progress-check.mjs DIR/xer [--plants 40] [--seed 1] [--json out.json]
//
// 1. Counts: what the review flags on each file as published.
// 2. Plants: in a copy of each file whose project has a data date, --plants
//    activities that the review did not flag (tasks, not milestones, level of
//    effort or WBS summaries) get one defect each, the kind drawn at random,
//    written into the TASK row the way an update would carry it:
//      overclaimed         started 30 calendar days before the data date,
//                          90% physical, remaining 3 x the working days spent
//      optimistic          started the same, 20% physical, remaining = spent
//      stalled             started the same, 0% physical, remaining = spent
//      zero-remaining      started the same, 50% physical, remaining 0
//      full-not-finished   started the same, 100% physical, remaining = spent
//      progress-unstarted  not started, 30% physical
//      finished-short      finished the day before the data date, 80% physical
//    Each planted activity must be flagged with its kind (another kind may
//    come with it: a stalled plant can also be an overrun), and every
//    activity not planted must keep exactly the flags it had.

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseXer, formatDate } from "../xer.mjs";
import { buildModel } from "../cpm.mjs";
import { progressReview } from "../progress.mjs";

const args = process.argv.slice(2);
const val = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const inputs = args.filter((a, i) => !a.startsWith("--") && !(i > 0 && args[i - 1].startsWith("--")));
if (!inputs.length) { console.error("usage: node eval/progress-check.mjs DIR|files... [--plants 40] [--seed 1] [--json out.json]"); process.exit(2); }
const files = inputs.flatMap((p) => statSync(p).isDirectory() ? readdirSync(p).filter((f) => /\.xer$/i.test(f)).sort().map((f) => join(p, f)) : [p]);
const PLANTS = Number(val("--plants", 40));
let seed = Number(val("--seed", 1));
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const KINDS = ["overclaimed", "optimistic", "stalled", "zero-remaining", "full-not-finished", "progress-unstarted", "finished-short"];

const flagsOf = (r) => { const m = new Map(); for (const x of r.items) { if (!m.has(x.code)) m.set(x.code, []); m.get(x.code).push(x.kind); } for (const v of m.values()) v.sort(); return m; };

const out = { files: [], plants: { planted: 0, found: 0, byKind: {}, misses: [], changedUnplanted: 0 } };
for (const f of files) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const r0 = progressReview(xer);
  const name = f.split("/").pop();
  out.files.push({ file: name, ...r0.summary, byType: r0.byType });
  console.log(`${name}: ${r0.checked} activities (${r0.byType.CP_Phys} phys, ${r0.byType.CP_Units} units, ${r0.byType.CP_Drtn} duration), ${r0.active} in progress, ${r0.flagged} flagged: ${Object.entries(r0.summary).filter(([k, v]) => !["checked", "active", "flagged"].includes(k) && v).map(([k, v]) => `${k} ${v}`).join(", ") || "none"}`);

  // plants
  const model = buildModel(xer);
  const before = flagsOf(r0);
  const cands = [...model.tasks.values()].filter((t) => !t.span && t.type !== "TT_Mile" && t.type !== "TT_FinMile" && !before.has(t.code) && t.orig > 0)
    .filter((t) => { const p = model.projects.get(t.proj); return p && p.dataDate !== null && p.dataDate !== undefined; });
  if (!cands.length) continue;
  const chosen = new Map();
  while (chosen.size < Math.min(PLANTS, cands.length)) { const t = cands[Math.floor(rnd() * cands.length)]; if (!chosen.has(t.id)) chosen.set(t.id, KINDS[Math.floor(rnd() * KINDS.length)]); }
  const tasks = xer.tables.TASK.map((row) => {
    if (!chosen.has(row.task_id)) return row;
    const t = model.tasks.get(row.task_id);
    const dd = model.projects.get(t.proj).dataDate;
    const hpd = (t.cal.hoursPerDay || 8);
    const start = dd - 30 * 1440;
    const spentH = t.cal.workBetween(start, dd) / 60;
    const kind = chosen.get(row.task_id);
    const n = { ...row, complete_pct_type: "CP_Phys", act_end_date: "", restart_date: "", reend_date: "" };
    const startRow = { status_code: "TK_Active", act_start_date: formatDate(start) };
    if (kind === "overclaimed") Object.assign(n, startRow, { phys_complete_pct: "90", remain_drtn_hr_cnt: String(Math.max(3 * spentH, spentH + 5 * hpd)) });
    if (kind === "optimistic") Object.assign(n, startRow, { phys_complete_pct: "20", remain_drtn_hr_cnt: String(spentH) });
    if (kind === "stalled") Object.assign(n, startRow, { phys_complete_pct: "0", remain_drtn_hr_cnt: String(spentH) });
    if (kind === "zero-remaining") Object.assign(n, startRow, { phys_complete_pct: "50", remain_drtn_hr_cnt: "0" });
    if (kind === "full-not-finished") Object.assign(n, startRow, { phys_complete_pct: "100", remain_drtn_hr_cnt: String(spentH) });
    if (kind === "progress-unstarted") Object.assign(n, { status_code: "TK_NotStart", act_start_date: "", phys_complete_pct: "30", act_work_qty: "0", act_equip_qty: "0" });
    if (kind === "finished-short") Object.assign(n, { status_code: "TK_Complete", act_start_date: formatDate(start), act_end_date: formatDate(dd - 1440), phys_complete_pct: "80", remain_drtn_hr_cnt: "0" });
    return n;
  });
  const planted = { ...xer, tables: { ...xer.tables, TASK: tasks } };
  const after = flagsOf(progressReview(planted));
  const codeOf = new Map(xer.tables.TASK.map((r) => [r.task_id, r.task_code]));
  const plantedCodes = new Set([...chosen.keys()].map((id) => codeOf.get(id)));
  for (const [id, kind] of chosen) {
    const code = codeOf.get(id);
    const P = (out.plants.byKind[kind] ||= { planted: 0, found: 0 });
    P.planted++; out.plants.planted++;
    if ((after.get(code) || []).includes(kind)) { P.found++; out.plants.found++; } else out.plants.misses.push({ file: name, code, kind, got: after.get(code) || [] });
  }
  for (const [code, ks] of before) if (!plantedCodes.has(code) && JSON.stringify(after.get(code) || []) !== JSON.stringify(ks)) out.plants.changedUnplanted++;
  for (const [code, ks] of after) if (!plantedCodes.has(code) && !before.has(code)) { out.plants.changedUnplanted++; void ks; }
}
const P = out.plants;
console.log(`\nPlants: ${P.found} of ${P.planted} named with their kind; unplanted activities whose flags changed: ${P.changedUnplanted}`);
for (const [k, v] of Object.entries(P.byKind)) console.log(`  ${k}: ${v.found}/${v.planted}`);
for (const m of P.misses.slice(0, 20)) console.log(`  miss ${m.file} ${m.code} ${m.kind}: got ${m.got.join(", ") || "nothing"}`);
if (val("--json")) writeFileSync(val("--json"), JSON.stringify(out, null, 2) + "\n");
