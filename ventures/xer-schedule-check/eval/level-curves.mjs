// node eval/level-curves.mjs <dir with .xer files> [--json out.json] [--scales 50,100,200]
// Levelling with P6 resource curves (level.mjs opts.curves) against the even
// spread, on the public files whose curved assignments sit on a levelled
// resource. For each file and each crew multiple of the file's limits:
//  - the levelled finish, activities delayed, peak before levelling, both ways
//  - self-check: hours over a limit while a placed activity uses it (0)
//  - nothing starts before its unlevelled early start
//  - every zero-lag FS link between open activities still holds
// With --plant F [--seed N] [--files a,b]: P6's five shipped curves (Back
// Loaded, Front Loaded, Bell Shaped, Triangular Increase, Linear, values as
// the CCA file carries them) are set on a fraction F of the not-started
// assignments of every levelled resource, at the file's own limits (x1) and
// x1e6 (where levelling must change nothing: the levelled dates = CPM).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { decodeXer, parseXer, parseDate } from "../xer.mjs";
import { level } from "../level.mjs";
import { buildModel, schedule } from "../cpm.mjs";
import { readCurves } from "../curves.mjs";

const args = process.argv.slice(2);
const dir = args[0];
const opt = (k) => (args.includes(k) ? args[args.indexOf(k) + 1] : null);
const scales = (opt("--scales") || "50,100,200").split(",").map(Number);
const plant = opt("--plant") ? Number(opt("--plant")) : null;
const only = opt("--files") ? opt("--files").split(",") : null;
const SHIPPED = {
  P1: ["Back Loaded", [3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5]],
  P2: ["Bell Shaped", [0.5, 0.5, 1.5, 1.5, 4, 4, 7.5, 7.5, 11.5, 11.5, 11.5, 11.5, 7.5, 7.5, 4, 4, 1.5, 1.5, 0.5, 0.5]],
  P3: ["Front Loaded", [6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 6.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5, 3.5]],
  P4: ["Linear", Array(20).fill(5)],
  P5: ["Triangular Increase", [1, 1, 1.5, 1.5, 3, 3, 3.5, 3.5, 4.5, 4.5, 5.5, 5.5, 6.5, 6.5, 7, 7, 8.5, 8.5, 9, 9]],
};
let seed = Number(opt("--seed") || 1);
const rand = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
function plantCurves(xer, frac) {
  const T = xer.tables;
  T.RSRCCURVDATA = Object.entries(SHIPPED).map(([id, [nm, v]]) => ({ curv_id: id, curv_name: nm, default_flag: "N", pct_usage_0: "0", ...Object.fromEntries(v.map((x, k) => [`pct_usage_${k + 1}`, String(x)])) }));
  const lim = new Set((T.RSRCRATE || []).filter((r) => Number(r.max_qty_per_hr) > 0).map((r) => r.rsrc_id));
  const tasks = new Map((T.TASK || []).map((t) => [t.task_id, t]));
  const ids = Object.keys(SHIPPED);
  let n = 0, of = 0;
  for (const a of T.TASKRSRC || []) {
    a.curv_id = "";
    const t = tasks.get(a.task_id);
    if (!lim.has(a.rsrc_id) || !t || t.status_code !== "TK_NotStart") continue;
    of++;
    if (rand() < frac) { a.curv_id = ids[Math.floor(rand() * ids.length)]; n++; }
  }
  return { planted: n, of };
}
if (plant !== null) {
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.xer$/i.test(f) && !/fixture\.xer|planted/.test(f) && (!only || only.includes(f))) files.push(p); } };
  walk(dir);
  const res = [];
  for (const f of files.sort()) {
    const xer = parseXer(decodeXer(readFileSync(f)));
    const name = f.split("/").pop();
    const { planted, of } = plantCurves(xer, plant);
    if (!planted) { console.log(`${name}: no not-started assignment on a limited resource`); continue; }
    const model = buildModel(xer);
    const base = schedule(xer, { model });
    const row = { file: name, planted, of };
    for (const mode of ["even", "curves"]) {
      const t0 = Date.now();
      const r = level(xer, { model, curves: mode === "curves" });
      const lv = r.result.tasks;
      let links = 0, broken = 0, early = 0;
      for (const rel of model.rels) {
        if (rel.external || rel.lag !== 0) continue;
        const p = model.tasks.get(rel.predId), q = model.tasks.get(rel.succId);
        if (p.span || q.span || p.status !== "TK_NotStart" || q.status !== "TK_NotStart") continue;
        const a = lv.get(rel.predId), b = lv.get(rel.succId);
        if (!a || !b) continue;
        links++;
        const ok = rel.type === "PR_FS" ? b.es >= a.ef : rel.type === "PR_SS" ? b.es >= a.es : rel.type === "PR_FF" ? b.ef >= a.ef : true;
        if (!ok) broken++;
      }
      for (const [id, b] of base.tasks) { const t = model.tasks.get(id), a = lv.get(id); if (t.status === "TK_NotStart" && a && (a.remES ?? a.es) < (b.remES ?? b.es)) early++; }
      row[mode] = { levelledFinish: r.levelledFinish, extensionDays: r.extensionDays, moved: r.activities.length, left: r.left.length, selfCheckHours: r.resources.reduce((x, y) => x + y.selfCheckHours, 0), peakBefore: Math.max(0, ...r.resources.map((q) => q.before.peak)), links: `${links - broken} of ${links}`, startedEarlier: early, lowerBound: r.lowerBound?.date ?? null, curves: r.curves, ms: Date.now() - t0 };
    }
    const big = level(xer, { model, curves: true, limitScale: { "*": 1e6 } });
    let same = 0, n = 0;
    for (const [id, b] of base.tasks) { const a = big.result.tasks.get(id); if (!a || model.tasks.get(id).status === "TK_Complete") continue; n++; if (a.es === b.es && a.ef === b.ef) same++; }
    row.unlimitedEqualsCpm = `${same} of ${n}`;
    res.push(row);
    const e = row.even, c = row.curves;
    console.log(`${name}: planted ${planted} of ${of}; even ${e.levelledFinish} (+${e.extensionDays} d, moved ${e.moved}, left ${e.left}) | curves ${c.levelledFinish} (+${c.extensionDays} d, moved ${c.moved}, left ${c.left}, ${c.curves.curved} curved, ${c.curves.even} linear) | self-check ${e.selfCheckHours}/${c.selfCheckHours} h; links ${e.links} / ${c.links}; earlier ${e.startedEarlier}/${c.startedEarlier}; bound ${e.lowerBound}/${c.lowerBound}; x1e6 = CPM ${row.unlimitedEqualsCpm}; ${e.ms}/${c.ms} ms`);
  }
  if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(res, null, 2) + "\n");
  process.exit(0);
}
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.xer$/i.test(f) && !/fixture\.xer|planted/.test(f)) files.push(p); } };
walk(dir);
const out = [];
for (const f of files.sort()) {
  const xer = parseXer(decodeXer(readFileSync(f)));
  const curves = readCurves(xer);
  const curvedRsrc = new Set((xer.tables.TASKRSRC || []).filter((a) => a.curv_id && curves.has(a.curv_id)).map((a) => a.rsrc_id));
  const name = f.split("/").pop();
  if (!curvedRsrc.size) { out.push({ file: name, curvedAssignments: 0 }); console.log(`${name}: no assignment on a curve the file carries`); continue; }
  const model = buildModel(xer);
  const resources = [...curvedRsrc];
  for (const scale of scales) {
    const row = { file: name, resources: resources.map((id) => xer.tables.RSRC.find((r) => r.rsrc_id === id)?.rsrc_short_name), scale };
    for (const mode of ["even", "curves"]) {
      const t0 = Date.now();
      const r = level(xer, { model, resources, limitScale: { "*": scale }, curves: mode === "curves" });
      const ms = Date.now() - t0;
      const base = r.result; // levelled
      let early = 0, fsBroken = 0;
      for (const a of r.activities) if (parseDate(a.levelledStart) < parseDate(a.es)) early++;
      for (const p of xer.tables.TASKPRED || []) {
        if (p.pred_type !== "PR_FS" || Number(p.lag_hr_cnt || 0) !== 0) continue;
        const a = base.tasks.get(p.pred_task_id), b = base.tasks.get(p.task_id);
        const ta = model.tasks.get(p.pred_task_id), tb = model.tasks.get(p.task_id);
        if (!a || !b || !ta || !tb || ta.status !== "TK_NotStart" || tb.status !== "TK_NotStart" || ta.span || tb.span) continue;
        if ((b.remES ?? b.es) < tb.cal.nextStart(a.ef) - 0 && (b.remES ?? b.es) < a.ef) fsBroken++;
      }
      const res = r.resources;
      row[mode] = {
        levelledFinish: r.levelledFinish, extensionDays: r.extensionDays,
        delayed: r.activities.filter((a) => a.by.length).length, carried: r.activities.filter((a) => !a.by.length).length,
        left: r.left.length, peakBefore: res.map((q) => q.before.peak), peakAfter: res.map((q) => q.after.peak),
        overHoursBefore: res.map((q) => q.before.overHours), selfCheckHours: res.reduce((n, q) => n + q.selfCheckHours, 0),
        startsBeforeEarly: early, fsBroken, lowerBound: r.lowerBound?.date ?? null, curves: r.curves, ms,
      };
    }
    out.push(row);
    const e = row.even, c = row.curves;
    console.log(`${name} ${row.resources.join(",")} x${scale}: even finish ${e.levelledFinish} (+${e.extensionDays} d, ${e.delayed} delayed, peak ${e.peakBefore}) | curves ${c.levelledFinish} (+${c.extensionDays} d, ${c.delayed} delayed, peak ${c.peakBefore}, ${c.curves.curved} curved) | self-check ${e.selfCheckHours}/${c.selfCheckHours} h, early ${e.startsBeforeEarly}/${c.startsBeforeEarly}, FS broken ${e.fsBroken}/${c.fsBroken}, left ${e.left}/${c.left}, ${e.ms}/${c.ms} ms`);
  }
}
if (opt("--json")) writeFileSync(opt("--json"), JSON.stringify(out, null, 2) + "\n");
