// Check the as-planned vs as-built comparison (asplanned.mjs) on real P6
// exports.
//
//   node eval/asplanned-check.mjs <dir-or-files...> [--plants 10] [--seed 1] [--json out.json]
//
// No public job publishes its baseline beside a final as-built with the
// delays named, so each file's main project is the plan, and an as-built is
// made from it by status.mjs (every activity done on the dates the file's own
// logic gives it), with and without planted delays. What is checked:
//
// 0. The file's own Planned Start / Planned Finish against its current dates
//    (the no-baseline mode on a real update, part forecast): the steps along
//    the as-built critical path add up to the delay, exactly.
// 1. Null. The plan finished as planned: the delay is 0 and every step is 0.
// 2. Planted slips. At a data date part-way through, 1 to 3 open activities
//    get d working days of extra remaining work and the project is finished
//    as planned from there. Every positive step on the as-built critical path
//    must be on a slipped activity (nothing else was late; status.mjs can
//    start a slipped activity late as well as run it long), or a step the
//    tool names as held by a finish-to-finish link (the knock-on of a slip,
//    which this check does not trace), or a calendar step; and the steps must
//    add up to the delay.
// 3. Planted waits. A not-started activity is held d working days past its
//    early start by a start-on-or-after constraint (a permit, an approval)
//    and the project finished as planned. If it lands on the as-built
//    critical path, its "late start" step must be exactly d days and be the
//    only positive step; if not, the finish must not have moved more than
//    the planned float allowed (delay <= d).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, formatDate } from "../xer.mjs";
import { schedule } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { statusAsPlanned } from "../status.mjs";
import { asPlannedVsAsBuilt, delaySteps } from "../asplanned.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const plants = Number(val("--plants", 10));
let seed = Number(val("--seed", 1));
const jsonOut = val("--json", null);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const pick = (arr, n) => { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--plants", "--seed", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const adds = (r) => Math.abs(r.sum - r.delayDays) <= 0.15;
const tot = { c0: [0, 0], c1: [0, 0], c2: [0, 0], c2sum: [0, 0], c3: [0, 0], c3on: 0 };
const report = [];
for (const file of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(file)));
  const base = schedule(xer);
  const p = pickProject(xer, base.model, null);
  const fin = base.projects.get(p.id)?.finish;
  if (!Number.isFinite(fin)) { report.push({ file: basename(file), skipped: "no open finish" }); continue; }
  const far = p.cal.addWork(fin, 400 * 60 * (p.cal.hoursPerDay || 8));
  const hpd = (p.cal.hoursPerDay || 8) * 60;
  const rec = { file: basename(file), project: p.code, misses: [] };
  // 0: the file's own planned dates
  try {
    const r = asPlannedVsAsBuilt(xer, null, { projId: p.id });
    tot.c0[1]++; if (adds(r)) tot.c0[0]++;
    const top = delaySteps(r)[0];
    rec.ownPlanned = { delayDays: r.delayDays, sum: r.sum, path: r.path.length, floatTerm: r.floatTerm, late: r.late, top: top ? `${top.code} ${top.kind} ${top.days}` : null, matched: r.late.of };
  } catch (e) { rec.ownPlanned = { error: e.message }; }
  // 1: null
  const done = statusAsPlanned(xer, p.id, far, { costs: false });
  const r1 = asPlannedVsAsBuilt(done, xer, { projId: p.id });
  const nullOk = r1.delayDays === 0 && r1.path.every((x) => !x.waitDays && !x.durationDays);
  tot.c1[1]++; if (nullOk) tot.c1[0]++;
  rec.null = { delayDays: r1.delayDays, path: r1.path.length, ok: nullOk, nonzero: r1.path.filter((x) => x.waitDays || x.durationDays).slice(0, 5).map((x) => `${x.code} w${x.waitDays} d${x.durationDays}`) };
  // 2: planted slips
  const dd0 = base.projects.get(p.id).dataDate;
  rec.slips = [];
  for (let k = 0; k < plants; k++) {
    const frac = 0.2 + rnd() * 0.5;
    const dd = p.cal.nextStart(p.cal.addWork(dd0, Math.round(p.cal.workBetween(dd0, fin) * frac)));
    const cands = [];
    for (const t of base.model.tasks.values()) {
      if (t.proj !== p.id || t.span || t.status === "TK_Complete" || t.type === "TT_Mile" || t.type === "TT_FinMile" || t.cal.id !== p.cal.id) continue;
      const r = base.tasks.get(t.id);
      if (!r) continue;
      const es = r.remES ?? r.es;
      if (es < dd && r.ef > dd) cands.push(t);
    }
    if (!cands.length) continue;
    const slips = pick(cands, 1 + Math.floor(rnd() * 3)).map((t) => ({ code: String(t.code), days: 1 + Math.floor(rnd() * 30) }));
    const slipped = statusAsPlanned(statusAsPlanned(xer, p.id, dd, { costs: false, slips: slips.map((s) => ({ code: s.code, hours: s.days * hpd / 60 })) }), p.id, far, { costs: false });
    const r = asPlannedVsAsBuilt(slipped, xer, { projId: p.id });
    const codes = new Set(slips.map((s) => s.code));
    const stray = delaySteps(r).filter((s) => s.days > 0.05 && s.kind !== "calendar difference" && !s.kind.includes("finish held by") && !codes.has(String(s.code)));
    const ok = !stray.length;
    tot.c2[1]++; if (ok) tot.c2[0]++;
    tot.c2sum[1]++; if (adds(r)) tot.c2sum[0]++;
    const o = { dataDate: formatDate(dd), slips, delayDays: r.delayDays, sum: r.sum, onPath: slips.filter((s) => r.path.some((x) => String(x.code) === s.code)).map((s) => s.code), ok, stray: stray.slice(0, 3) };
    rec.slips.push(o);
    if (!ok || !adds(r)) rec.misses.push(o);
  }
  // 3: planted waits
  const waitCands = [];
  for (const t of base.model.tasks.values()) {
    if (t.proj !== p.id || t.span || t.status !== "TK_NotStart" || t.type === "TT_Mile" || t.type === "TT_FinMile" || t.cal.id !== p.cal.id || t.cstr.length) continue;
    if (!t.preds.some((rel) => { const q = base.model.tasks.get(rel.predId); return q && q.proj === p.id && !q.span; })) continue;
    waitCands.push(t);
  }
  rec.waits = [];
  for (const t of pick(waitCands, plants)) {
    const d = 1 + Math.floor(rnd() * 30);
    const r0t = base.tasks.get(t.id);
    const at = p.cal.nextStart(p.cal.addWork(r0t.remES ?? r0t.es, d * hpd));
    const held = { ...xer, tables: { ...xer.tables, TASK: xer.tables.TASK.map((row) => (row.task_id === t.id ? { ...row, cstr_type: "CS_MSOA", cstr_date: formatDate(at) } : row)) } };
    const fin2 = statusAsPlanned(held, p.id, far, { costs: false });
    const r = asPlannedVsAsBuilt(fin2, xer, { projId: p.id });
    const row = r.path.find((x) => String(x.code) === String(t.code));
    const pos = delaySteps(r).filter((s) => s.days > 0.05 && s.kind !== "calendar difference" && !s.kind.includes("finish held by"));
    let ok;
    if (row) { tot.c3on++; ok = Math.abs(row.waitDays - d) <= 0.15 && pos.length === 1 && adds(r); }
    else ok = r.delayDays <= d + 0.05 && pos.every((s) => s.kind !== "late start") && adds(r);
    tot.c3[1]++; if (ok) tot.c3[0]++;
    const o = { code: t.code, days: d, onPath: !!row, wait: row?.waitDays ?? null, delayDays: r.delayDays, sum: r.sum, positive: pos.slice(0, 3), ok };
    rec.waits.push(o);
    if (!ok) rec.misses.push(o);
  }
  rec.seconds = Math.round((Date.now() - t0) / 100) / 10;
  report.push(rec);
  const op = rec.ownPlanned;
  console.log(`${basename(file)} (${p.code}): own planned dates ${op.error ? `error: ${op.error}` : `delay ${op.delayDays} d, steps sum ${op.sum}, path ${op.path}, top ${op.top}`}; null ${nullOk ? "ok" : "MOVED"}; slips ${rec.slips.filter((x) => x.ok).length}/${rec.slips.length}; waits ${rec.waits.filter((x) => x.ok).length}/${rec.waits.length} (${rec.waits.filter((x) => x.onPath).length} on path) (${rec.seconds} s)`);
  for (const m of rec.misses.slice(0, 3)) console.log(`  miss: ${JSON.stringify(m).slice(0, 400)}`);
}
const f = (x) => `${x[0]}/${x[1]}`;
console.log(`\n0 own planned dates, steps add up to the delay: ${f(tot.c0)} files`);
console.log(`1 null (plan finished as planned): ${f(tot.c1)}`);
console.log(`2 planted slips, every positive step on a slipped activity: ${f(tot.c2)}; steps add up: ${f(tot.c2sum)}`);
console.log(`3 planted waits: ${f(tot.c3)} (${tot.c3on} on the as-built critical path, step = planted days)`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ totals: tot, files: report }, null, 2) + "\n");
