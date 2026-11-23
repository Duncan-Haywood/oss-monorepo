// Check the collapsed as-built analysis (collapse.mjs) on real P6 exports.
//
//   node eval/collapse-check.mjs <dir-or-files...> [--plants 10] [--seed 1] [--json out.json]
//
// No public job publishes its as-built schedule with the delays named, so
// each file's main project is finished "as planned" by status.mjs (every
// activity done on the dates the file's own logic gives it), with and
// without planted slips, and the result is checked against an answer reached
// another way:
//
// 0. The file as exported (in progress: actual dates where there are any,
//    the file's own forecast for the rest): how many activities the model
//    lands on those dates, and whether it finishes where the file does.
// 1. The model. The as-built model of the file finished as planned must land
//    every activity on its as-built dates, and its finish on the last actual
//    finish (the subtraction means nothing on a model that does not).
// 2. Null collapse. An empty delay list must leave the finish where it is.
// 3. Planted slips, collapsed. At a data date part-way through, 1 to 3 open
//    activities on the project calendar in progress then get d working days
//    of extra remaining work (d from 1 to 30), and the project is finished as
//    planned from there. The same is done without the slips. Taking exactly
//    those days out of those activities must give the finish of the run
//    without them: the "but for" date is known.
// 3b. Planted waits, collapsed from the gap. A not-started activity with
//    predecessors is held d working days past its early start by a
//    start-on-or-after constraint (a permit, an approval), and the project
//    finished as planned. Taking d days out of the gap before it ("gap" in
//    the delay list) must give the finish of the run without the hold.
// 4. The collapsed XER, written with xerText() (the download a scheduler
//    opens in P6), read back and scheduled again: the same finish.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer, xerText, formatDate } from "../xer.mjs";
import { schedule } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { statusAsPlanned } from "../status.mjs";
import { collapsedAsBuilt } from "../collapse.mjs";

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

const lastActual = (xer, pid) => {
  let f = -Infinity;
  for (const r of xer.tables.TASK || []) if (r.proj_id === pid && r.act_end_date) f = Math.max(f, Date.parse(r.act_end_date.replace(" ", "T") + "Z") / 60000);
  return f;
};

const report = [];
const tot = { c0: [0, 0], c0acts: [0, 0], c1: [0, 0], c1acts: [0, 0], c2: [0, 0], c3: [0, 0], c3b: [0, 0], c4: [0, 0] };
for (const file of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(file)));
  const base = schedule(xer);
  const p = pickProject(xer, base.model, null);
  const fin = base.projects.get(p.id)?.finish;
  if (!Number.isFinite(fin)) { report.push({ file: basename(file), skipped: "no open finish" }); continue; }
  const far = p.cal.addWork(fin, 400 * 60 * (p.cal.hoursPerDay || 8));
  const rec = { file: basename(file), project: p.code, misses: [] };
  // 0: as exported
  const rx = collapsedAsBuilt(xer, "", { projId: p.id });
  const x0ok = rx.asBuilt.modelFinish === rx.asBuilt.finish;
  tot.c0[1]++; if (x0ok) tot.c0[0]++;
  tot.c0acts[0] += rx.asBuilt.reproduced; tot.c0acts[1] += rx.asBuilt.activities;
  rec.asExported = { activities: rx.asBuilt.activities, reproduced: rx.asBuilt.reproduced, finishMatches: x0ok, gaps: rx.asBuilt.gaps.length, outOfSequence: rx.asBuilt.outOfSequence, firstMisses: rx.asBuilt.misses.slice(0, 5) };
  // 1 and 2: finished as planned
  const done = statusAsPlanned(xer, p.id, far, { costs: false });
  const r0 = collapsedAsBuilt(done, "", { projId: p.id });
  const finOk = r0.asBuilt.modelFinish === formatDate(lastActual(done, p.id));
  tot.c1[1]++; if (finOk && r0.asBuilt.reproduced === r0.asBuilt.activities) tot.c1[0]++;
  tot.c1acts[0] += r0.asBuilt.reproduced; tot.c1acts[1] += r0.asBuilt.activities;
  rec.model = { activities: r0.asBuilt.activities, reproduced: r0.asBuilt.reproduced, finishMatches: finOk, gaps: r0.asBuilt.gaps.length, outOfSequence: r0.asBuilt.outOfSequence, firstMisses: r0.asBuilt.misses.slice(0, 5) };
  tot.c2[1]++; if (r0.all.earlierDays === 0 && r0.all.finish === r0.asBuilt.modelFinish) tot.c2[0]++;
  // 3: planted slips
  const dd0 = base.projects.get(p.id).dataDate;
  const hpd = (p.cal.hoursPerDay || 8) * 60;
  const plantsOut = [];
  for (let k = 0; k < plants; k++) {
    // a data date between 20% and 70% of the way to the forecast finish
    const frac = 0.2 + rnd() * 0.5;
    const dd = p.cal.nextStart(p.cal.addWork(dd0, Math.round(p.cal.workBetween(dd0, fin) * frac)));
    const mid = base;
    const cands = [];
    for (const t of mid.model.tasks.values()) {
      if (t.proj !== p.id || t.span || t.status === "TK_Complete" || t.type === "TT_Mile" || t.type === "TT_FinMile" || t.cal.id !== p.cal.id) continue;
      const r = mid.tasks.get(t.id);
      if (!r) continue;
      const es = r.remES ?? r.es;
      if (es < dd && r.ef > dd) cands.push(t);
    }
    if (!cands.length) continue;
    const slips = pick(cands, 1 + Math.floor(rnd() * 3)).map((t) => ({ code: t.code, days: 1 + Math.floor(rnd() * 30) }));
    const slipped = statusAsPlanned(statusAsPlanned(xer, p.id, dd, { costs: false, slips: slips.map((s) => ({ code: s.code, hours: s.days * hpd / 60 })) }), p.id, far, { costs: false });
    const ref = statusAsPlanned(statusAsPlanned(xer, p.id, dd, { costs: false }), p.id, far, { costs: false });
    const want = formatDate(lastActual(ref, p.id));
    const table = "Activity ID,Days,Party\n" + slips.map((s, i) => `${s.code},${s.days},${i % 2 ? "Owner" : "Contractor"}`).join("\n");
    const r = collapsedAsBuilt(slipped, table, { projId: p.id });
    const ok = r.all.finish === want;
    tot.c3[1]++; if (ok) tot.c3[0]++;
    // 4: the collapsed XER round trip
    const back = schedule(parseXer(xerText(r.collapsedXer)), { expectedFinish: false });
    const okX = formatDate(back.projects.get(p.id)?.finish) === r.all.finish;
    tot.c4[1]++; if (okX) tot.c4[0]++;
    const o = { dataDate: formatDate(dd), slips, slippedFinish: r.asBuilt.finish, butFor: r.all.finish, want, earlierDays: r.all.earlierDays, ok, xerOk: okX, reproduced: `${r.asBuilt.reproduced}/${r.asBuilt.activities}` };
    plantsOut.push(o);
    if (!ok) rec.misses.push(o);
  }
  rec.plants = plantsOut;
  // 3b: planted waits
  const refAll = formatDate(lastActual(done, p.id));
  const waitCands = [];
  for (const t of base.model.tasks.values()) {
    if (t.proj !== p.id || t.span || t.status !== "TK_NotStart" || t.type === "TT_Mile" || t.type === "TT_FinMile" || t.cal.id !== p.cal.id || t.cstr.length) continue;
    if (!t.preds.some((r) => { const q = base.model.tasks.get(r.predId); return q && q.proj === p.id && !q.span; })) continue;
    waitCands.push(t);
  }
  const waits = [];
  for (const t of pick(waitCands, plants)) {
    const d = 1 + Math.floor(rnd() * 30);
    const r0t = base.tasks.get(t.id);
    const at = p.cal.nextStart(p.cal.addWork(r0t.remES ?? r0t.es, d * hpd));
    const held = { ...xer, tables: { ...xer.tables, TASK: xer.tables.TASK.map((row) => (row.task_id === t.id ? { ...row, cstr_type: "CS_MSOA", cstr_date: formatDate(at) } : row)) } };
    const fin2 = statusAsPlanned(held, p.id, far, { costs: false });
    const r = collapsedAsBuilt(fin2, `Activity ID,Days,What\n${t.code},${d},gap`, { projId: p.id });
    const ok = r.all.finish === refAll;
    tot.c3b[1]++; if (ok) tot.c3b[0]++;
    const o = { code: t.code, days: d, heldFinish: r.asBuilt.finish, butFor: r.all.finish, want: refAll, taken: r.rows[0]?.takenDays, ok };
    waits.push(o);
    if (!ok) rec.misses.push(o);
  }
  rec.waits = waits;
  rec.seconds = Math.round((Date.now() - t0) / 100) / 10;
  report.push(rec);
  console.log(`${basename(file)} (${p.code}): as exported ${rx.asBuilt.reproduced}/${rx.asBuilt.activities}, finish ${x0ok ? "matches" : "differs"}; finished as planned: model ${r0.asBuilt.reproduced}/${r0.asBuilt.activities} on as-built dates, finish ${finOk ? "matches" : "differs"}; null collapse ${r0.all.earlierDays === 0 ? "ok" : "moved"}; planted ${plantsOut.filter((x) => x.ok).length}/${plantsOut.length}, waits ${waits.filter((x) => x.ok).length}/${waits.length}, XER ${plantsOut.filter((x) => x.xerOk).length}/${plantsOut.length} (${rec.seconds} s)`);
  for (const m of rec.misses.slice(0, 3)) console.log(m.slips ? `  miss: slips ${m.slips.map((s) => `${s.code}+${s.days}`).join(" ")} at ${m.dataDate}: but-for ${m.butFor}, want ${m.want} (slipped finish ${m.slippedFinish})` : `  miss: wait ${m.code}+${m.days} (took ${m.taken}): but-for ${m.butFor}, want ${m.want} (held finish ${m.heldFinish})`);
}
const f = (x) => `${x[0]}/${x[1]}`;
const moved = report.flatMap((r) => r.plants || []).filter((o) => o.slippedFinish !== o.want).length;
const movedW = report.flatMap((r) => r.waits || []).filter((o) => o.heldFinish !== o.want).length;
console.log(`(plants that moved the finish: slips ${moved}, waits ${movedW}; the rest must leave it where it is)`);
console.log(`\n0 as exported: finish matches ${f(tot.c0)} files; activities on their dates ${f(tot.c0acts)}`);
console.log(`1 model exact on every activity and the finish: ${f(tot.c1)} files; activities on as-built dates ${f(tot.c1acts)}\n2 null collapse: ${f(tot.c2)}\n3 planted slips collapsed to the run without them: ${f(tot.c3)}\n3b planted waits collapsed from the gap: ${f(tot.c3b)}\n4 collapsed XER round trip: ${f(tot.c4)}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seed: Number(val("--seed", 1)), plants, totals: tot, files: report }, null, 1));
