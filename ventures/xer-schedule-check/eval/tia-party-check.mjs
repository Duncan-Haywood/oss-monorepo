// Check the time impact analysis's split by party (tia.mjs byParty and
// apportionment) on real P6 exports.
//
//   node eval/tia-party-check.mjs <dir-or-files...> [--plants 15] [--seed 1] [--json out.json]
//
// No public job publishes a fragnet with parties, so two-party fragnets are
// planted on each file's main project where the right answer follows from
// the logic alone, by arithmetic, not by running the split:
//
// 1. Series (no concurrency). A and B are open activities on the project
//    calendar with no float over the driving path (relative float 0 against
//    the activity the finish rests on, floatpaths.mjs), B A's only
//    successor by a finish-to-start link with no lag (B's own successors not
//    all start-to-start). Owner makes A a days longer, Contractor makes B b
//    days longer. Each day of each lands on the finish in turn, so nothing is
//    concurrent and each party's sole delay is its own delay alone: Owner
//    sole = run(A + a), Contractor sole = run(B + b), concurrent 0, where
//    run() is a plain time impact run of that one row, no party column. The
//    count where those equal a and b in working days is reported too (a
//    finish on another calendar, or one that lands across a holiday, can
//    measure a day more or less on the project calendar).
// 2. Parallel (concurrency). X is a not-started, unconstrained activity on the
//    project calendar with no float over the driving path, whose predecessors
//    and successors are all finish-to-start with no lag. Owner makes X a days
//    longer. Contractor adds a new activity beside X: the same predecessors
//    and successors, X's remaining duration plus b days, on the project
//    calendar. The new activity is X made b days longer on a second path, so
//    both together delay the finish as X made max(a, b) longer does, and the
//    delay either causes alone is X made min(a, b) longer. With run() as
//    above: total = run(X + max), concurrent = run(X + min), the larger
//    party's sole = run(X + max) - run(X + min), the smaller's 0. The runs
//    never use the new activity, so they check the split's own runs from
//    outside. a and b are drawn from 1 to 30, equal now and then.
// 3. One party only. A planted fragnet whose rows all name one party: that
//    party's sole delay is the whole delay and nothing is concurrent.
//
// Each check also confirms the parts add up to the total.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule, buildModel, drivingPath } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { timeImpact } from "../tia.mjs";
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
const sole = (r, pt) => r.byParty.find((x) => x.party === pt)?.soleDays;
const adds = (r) => near(r.byParty.reduce((s, x) => s + x.soleDays, 0) + r.apportionment.concurrentDays, r.finish.delayDays);

const report = [];
const tot = { series: [0, 0], parallel: [0, 0], single: [0, 0] };
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
  const r = { file: basename(file), project: p.code, open: open.length, series: [], parallel: [], single: [] };

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
    const res = timeImpact(xer, `Activity ID,Duration,Party\n${a.code},+${da},Owner\n${b.code},+${db},Contractor\n`, { projId: p.id });
    const ra = run(a.code, da), rb = run(b.code, db);
    const want = { total: ra + rb, owner: ra, contractor: rb, concurrent: 0 };
    const got = { total: res.finish.delayDays, owner: sole(res, "Owner"), contractor: sole(res, "Contractor"), concurrent: res.apportionment.concurrentDays };
    const ok = Object.keys(want).every((k) => near(want[k], got[k])) && adds(res);
    r.series.push({ a: a.code, b: b.code, da, db, want, got, ok, daysAsAdded: near(ra, da) && near(rb, db) });
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
    const frag = `Activity ID,Name,Duration,Predecessors,Successors,Calendar,Party\n${x.code},,+${da},,,,Owner\nTIA-PAR,Contractor work beside ${x.code},${days},${preds},${succs},${pcal.id},Contractor\n`;
    const res = timeImpact(xer, frag, { projId: p.id });
    const hi = run(x.code, Math.max(da, db)), lo = run(x.code, Math.min(da, db));
    const want = { total: hi, owner: da >= db ? Math.round((hi - lo) * 10) / 10 : 0, contractor: db > da ? Math.round((hi - lo) * 10) / 10 : 0, concurrent: lo };
    const got = { total: res.finish.delayDays, owner: sole(res, "Owner"), contractor: sole(res, "Contractor"), concurrent: res.apportionment.concurrentDays };
    const ok = Object.keys(want).every((k) => near(want[k], got[k])) && adds(res);
    r.parallel.push({ x: x.code, a: da, b: db, want, got, ok, warnings: ok ? undefined : res.warnings });
  }

  // 3. one party
  for (const a of pick(open.filter(plain), Math.min(5, plants))) {
    const d = 1 + Math.floor(rnd() * 30);
    const res = timeImpact(xer, `Activity ID,Duration,Party\n${a.code},+${d},Owner\n`, { projId: p.id });
    const ok = res.byParty.length === 1 && near(sole(res, "Owner"), res.finish.delayDays) && near(res.apportionment.concurrentDays, 0);
    r.single.push({ a: a.code, d, delay: res.finish.delayDays, ok });
  }

  tot.daysAsAdded = tot.daysAsAdded || [0, 0];
  tot.daysAsAdded[0] += r.series.filter((x) => x.daysAsAdded).length; tot.daysAsAdded[1] += r.series.length;
  for (const k of ["series", "parallel", "single"]) { tot[k][0] += r[k].filter((x) => x.ok).length; tot[k][1] += r[k].length; }
  r.seconds = (Date.now() - t0) / 1000;
  report.push(r);
  const f = (k) => `${r[k].filter((x) => x.ok).length}/${r[k].length}`;
  console.log(`${r.file} (${p.code}, ${open.length} open): series ${f("series")}, parallel ${f("parallel")}, one party ${f("single")}; ${r.seconds.toFixed(1)} s`);
  for (const k of ["series", "parallel", "single"]) for (const x of r[k].filter((x) => !x.ok)) console.log(`  MISS ${k}: ${JSON.stringify(x)}`);
}
console.log(`TOTAL: series ${tot.series.join("/")} (each party's days landed as added on ${tot.daysAsAdded.join("/")}), parallel ${tot.parallel.join("/")}, one party ${tot.single.join("/")}`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seed: Number(val("--seed", 1)), plants, totals: tot, files: report }, null, 1));
