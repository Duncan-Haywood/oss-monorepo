// Check the time impact analysis's step-by-step insertion (tia.mjs byStep:
// the events in date order, each scheduled on top of the ones before it) on
// real P6 exports.
//
//   node eval/tia-steps-check.mjs <dir-or-files...> [--plants 15] [--seed 1] [--json out.json]
//
// No public job publishes a dated multi-event fragnet, so two-event fragnets
// are planted on each file's main project where the right steps follow from
// plain one-row time impact runs (no event column), never from the stepwise
// runs themselves. Event dates are put before the data date, where a
// start-on-or-after date moves nothing, and the rows are written in the
// fragnet newest first half the time, so the order must come from the dates.
//
// 1. Series. A then B, its only FS-0 successor, both with zero float over the
//    driving path. Event E1 makes A a days longer, E2 (dated later) makes B
//    b days longer. Each day lands on the finish in turn, so the order does
//    not matter: step 1 = run(A + a), step 2 = run(B + b), the same newest
//    first, and orderSensitive is false.
// 2. Parallel. X is a not-started, unconstrained activity with no float over
//    the driving path and only FS-0 links. E1 makes X a days longer; E2 adds
//    a new activity beside X (X's links, X's remaining duration plus b). Both
//    together are X made max(a, b) longer. In date order step 1 =
//    run(X + a), step 2 = run(X + max) - run(X + a); newest first E2 gets
//    run(X + b) and E1 run(X + max) - run(X + b). With a and b both above 0
//    the split depends on the order whenever run(X + a) and run(X + b) are
//    both above 0, and orderSensitive must say so.
//
// Every check also confirms the steps add up to the total and the last
// cumulative figure is the total.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule, buildModel, drivingPath } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { timeImpact } from "../tia.mjs";
import { formatDate } from "../xer.mjs";
import { finishActivity, targetBound, floatAgainst } from "../floatpaths.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const plants = Number(val("--plants", 15));
let seed = Number(val("--seed", 1));
const jsonOut = val("--json", null);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const pick = (arr, n) => { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--plants", "--seed", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const near = (x, y) => Math.abs(x - y) < 0.05;
const adds = (r) => near(r.byStep.reduce((s, x) => s + x.stepDays, 0), r.finish.delayDays) && near(r.byStep[r.byStep.length - 1].cumulativeDays, r.finish.delayDays);
const stepOf = (r, e) => r.byStep.find((x) => x.event === e);
const report = [];
const tot = { series: [0, 0], parallel: [0, 0], ordered: [0, 0] };
for (const file of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(file)));
  const model = buildModel(xer);
  const base = schedule(null, { model });
  const p = pickProject(xer, model, null);
  const pcal = p.cal;
  const hpd = pcal.hoursPerDay || 8;
  const open = [...model.tasks.values()].filter((t) => t.proj === p.id && !t.span && t.status !== "TK_Complete" && base.tasks.get(t.id) && Number.isFinite(base.tasks.get(t.id).tf));
  const fin = finishActivity(base, p.id);
  const bound = fin ? targetBound(base, fin.id, base.tasks.get(fin.id).ef) : new Map();
  const onPath = new Set(drivingPath(base, p.id));
  const inNet = (id) => { const t = model.tasks.get(id); return t && !t.span; };
  const fs0 = (rel) => rel.type === "PR_FS" && rel.lag === 0 && !rel.external;
  const isMs = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
  // plain: on the project calendar, not a milestone, no constraint, no
  // expected finish, no FF/SF predecessor holding its finish
  const plain = (t) => t.cal === pcal && !isMs(t) && !t.cstr.length && t.expEnd === null && !t.preds.some((rel) => rel.type === "PR_FF" || rel.type === "PR_SF");
  const zero = (t) => bound.has(t.id) && onPath.has(t.id) && Math.abs(floatAgainst(base, t.id, bound.get(t.id))) < 1e-6;
  const startOnly = (t) => { const n = t.succs.filter((rel) => inNet(rel.succId)); return n.length > 0 && n.every((rel) => rel.type === "PR_SS" || rel.type === "PR_SF"); };
  const run = (code, d) => timeImpact(xer, `Activity ID,Duration\n${code},+${d}\n`, { projId: p.id }).finish.delayDays;
  const r = { file: basename(file), project: p.code, open: open.length, series: [], parallel: [] };
  const dd = p.dataDate;
  const day = (k) => formatDate(dd - k * 1440).slice(0, 10);
  // E1 dated 20 days before the data date, E2 10 days before
  const H = "Activity ID,Name,Duration,Predecessors,Successors,Calendar,Not before,Event\n";
  const write = (rows) => { const flip = rnd() < 0.5; return { text: H + (flip ? [...rows].reverse() : rows).join("\n") + "\n", flipped: flip }; };

  // 1. series
  const pairs = [];
  for (const a of open) {
    if (!plain(a) || !zero(a) || startOnly(a)) continue;
    const succs = a.succs.filter((rel) => inNet(rel.succId));
    if (succs.length !== 1 || !fs0(succs[0])) continue;
    const b = model.tasks.get(succs[0].succId);
    if (b.proj !== p.id || b.status === "TK_Complete" || !plain(b) || !zero(b) || startOnly(b)) continue;
    pairs.push([a, b]);
  }
  for (const [a, b] of pick(pairs, plants)) {
    const da = 1 + Math.floor(rnd() * 30), db = 1 + Math.floor(rnd() * 30);
    const w = write([`${a.code},,+${da},,,,${day(20)},E1`, `${b.code},,+${db},,,,${day(10)},E2`]);
    const res = timeImpact(xer, w.text, { projId: p.id });
    const ra = run(a.code, da), rb = run(b.code, db);
    const s1 = stepOf(res, "E1"), s2 = stepOf(res, "E2");
    const ordered = res.byStep.map((x) => x.event).join() === "E1,E2";
    const ok = ordered && near(s1.stepDays, ra) && near(s2.stepDays, rb) && near(s1.newestFirstDays, ra) && near(s2.newestFirstDays, rb) && !res.orderSensitive && adds(res);
    r.series.push({ a: a.code, b: b.code, da, db, flipped: w.flipped, want: [ra, rb], got: [s1.stepDays, s2.stepDays, s1.newestFirstDays, s2.newestFirstDays], ordered, ok });
  }

  // 2. parallel
  const xs = open.filter((t) => {
    if (t.status !== "TK_NotStart" || !plain(t) || !zero(t)) return false;
    const preds = t.preds.filter((rel) => inNet(rel.predId)), succs = t.succs.filter((rel) => inNet(rel.succId));
    return preds.length > 0 && succs.length > 0 && preds.every(fs0) && succs.every(fs0) && preds.every((rel) => model.tasks.get(rel.predId).proj === p.id) && succs.every((rel) => model.tasks.get(rel.succId).proj === p.id);
  });
  for (const x of pick(xs, plants)) {
    const da = 1 + Math.floor(rnd() * 30);
    const db = rnd() < 0.2 ? da : 1 + Math.floor(rnd() * 30);
    const preds = x.preds.filter((rel) => inNet(rel.predId)).map((rel) => model.tasks.get(rel.predId).code).join(";");
    const succs = x.succs.filter((rel) => inNet(rel.succId)).map((rel) => model.tasks.get(rel.succId).code).join(";");
    const days = Math.round((x.remain / 60 / hpd) * 1000) / 1000 + db;
    const w = write([`${x.code},,+${da},,,,${day(20)},E1`, `TIA-PAR,Work beside ${x.code},${days},${preds},${succs},${pcal.id},${day(10)},E2`]);
    const res = timeImpact(xer, w.text, { projId: p.id });
    const ra = run(x.code, da), rb = run(x.code, db), hi = run(x.code, Math.max(da, db));
    const r1 = (v) => Math.round(v * 10) / 10;
    const s1 = stepOf(res, "E1"), s2 = stepOf(res, "E2");
    const ordered = res.byStep.map((v) => v.event).join() === "E1,E2";
    const want = { total: hi, e1: ra, e2: r1(hi - ra), e1NewestFirst: r1(hi - rb), e2NewestFirst: rb };
    const got = { total: res.finish.delayDays, e1: s1.stepDays, e2: s2.stepDays, e1NewestFirst: s1.newestFirstDays, e2NewestFirst: s2.newestFirstDays };
    const sensitive = !near(want.e1, want.e1NewestFirst) || !near(want.e2, want.e2NewestFirst);
    const ok = ordered && Object.keys(want).every((k) => near(want[k], got[k])) && res.orderSensitive === sensitive && adds(res);
    r.parallel.push({ x: x.code, a: da, b: db, flipped: w.flipped, want, got, sensitive, ordered, ok, warnings: ok ? undefined : res.warnings });
  }

  for (const k of ["series", "parallel"]) { tot[k][0] += r[k].filter((x) => x.ok).length; tot[k][1] += r[k].length; }
  const all = [...r.series, ...r.parallel];
  tot.ordered[0] += all.filter((x) => x.flipped && x.ordered).length; tot.ordered[1] += all.filter((x) => x.flipped).length;
  tot.sensitive = (tot.sensitive || 0) + r.parallel.filter((x) => x.sensitive).length;
  r.seconds = (Date.now() - t0) / 1000;
  report.push(r);
  const f = (k) => `${r[k].filter((x) => x.ok).length}/${r[k].length}`;
  console.log(`${r.file} (${p.code}, ${open.length} open): series ${f("series")}, parallel ${f("parallel")} (${r.parallel.filter((x) => x.sensitive).length} order-sensitive); ${r.seconds.toFixed(1)} s`);
  for (const k of ["series", "parallel"]) for (const x of r[k].filter((x) => !x.ok)) console.log(`  MISS ${k}: ${JSON.stringify(x)}`);
}
console.log(`TOTAL: series ${tot.series.join("/")}, parallel ${tot.parallel.join("/")} (${tot.sensitive} of them order-sensitive), fragnets written newest first put in date order ${tot.ordered.join("/")}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seed: Number(val("--seed", 1)), plants, totals: tot, files: report }, null, 1));
