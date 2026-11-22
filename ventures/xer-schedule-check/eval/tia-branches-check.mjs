// Check probabilistic branches in the time impact analysis (tia.mjs,
// branchSetup / rowsForOutcome) on real P6 exports.
//
//   node eval/tia-branches-check.mjs <dir-or-files...> [--plants 8] [--seed 1] [--json out.json]
//
// No public job publishes a fragnet with alternatives, so they are planted
// (seeded) on each file's main project, between pairs A -> B (A's only
// successor, finish-to-start, no lag, both on the project calendar; the
// pairs of tia-check.mjs check 3). Each plant has two branch groups on two
// different pairs: group 1 has two or three branches that all insert the
// same activity ID with different durations (the "review takes 5 days or
// 15" case), the last branch sometimes with a follow-on activity that only
// that branch has; group 2 has one branch under 100%, so "none of these"
// takes the rest. Checked against answers reached another way:
//
// 1. Every outcome's finish equals a plain time impact analysis (no branch
//    columns) of exactly that outcome's rows, written out by hand here.
// 2. The expected delay equals the sum of probability x plain delay over the
//    outcomes; the probabilities add to 1.
// 3. The "none of these" outcome of group 2 together with group 1's most
//    likely branch is the deterministic result, and every outcome where
//    group 2 is "none of these" equals group 1's branch alone.
// 4. A branch group with one branch at 100% gives the same finish and
//    fragnet as the same rows with no branch columns.
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseXer, decodeXer } from "../xer.mjs";
import { schedule, buildModel } from "../cpm.mjs";
import { pickProject } from "../compare.mjs";
import { timeImpact } from "../tia.mjs";

const args = process.argv.slice(2);
const val = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const plants = Number(val("--plants", 8));
let seed = Number(val("--seed", 1));
const jsonOut = val("--json", null);
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648), seed / 2147483648);
const pick = (arr, n) => { const a = [...arr]; const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
const files = [];
for (const a of args.filter((a, i) => !a.startsWith("--") && !["--plants", "--seed", "--json"].includes(args[i - 1]))) {
  if (statSync(a).isDirectory()) for (const f of readdirSync(a).sort()) { if (/\.xer$/i.test(f)) files.push(join(a, f)); }
  else files.push(a);
}
const r1 = (x) => Math.round(x * 10) / 10;
const H = "Activity ID,Name,Duration,Predecessors,Successors,Branch group,Branch,Probability\n";
const HP = "Activity ID,Name,Duration,Predecessors,Successors\n";

const tot = { c1: [0, 0], c2: [0, 0], c3: [0, 0], c4: [0, 0], outcomes: 0, moved: 0, spread: 0 };
const report = [];
for (const file of files) {
  const t0 = Date.now();
  const xer = parseXer(decodeXer(readFileSync(file)));
  const model = buildModel(xer);
  const base = schedule(null, { model });
  const p = pickProject(xer, model, null);
  const pcal = p.cal;
  const inNet = (id) => { const t = model.tasks.get(id); return t && !t.span; };
  const isMs = (t) => t.type === "TT_Mile" || t.type === "TT_FinMile";
  const finHeld = (t) => t.preds.some((rel) => rel.type === "PR_FF" || rel.type === "PR_SF");
  const pairs = [];
  for (const a of model.tasks.values()) {
    if (a.proj !== p.id || a.span || a.status === "TK_Complete" || a.cal !== pcal || isMs(a) || finHeld(a) || !base.tasks.get(a.id)) continue;
    const succs = a.succs.filter((rel) => inNet(rel.succId));
    if (succs.length !== 1 || succs[0].type !== "PR_FS" || succs[0].lag !== 0 || succs[0].external) continue;
    const b = model.tasks.get(succs[0].succId);
    if (b.status === "TK_Complete" || b.cal !== pcal || b.proj !== p.id) continue;
    pairs.push([a, b]);
  }
  // prefer pairs with little float, so the branches move the finish
  const tf = (t) => base.tasks.get(t.id).tf;
  pairs.sort((x, y) => tf(x[0]) - tf(y[0]));
  const pool = pairs.slice(0, Math.max(4 * plants, 20));
  const r = { file: basename(file), project: p.code, pairs: pairs.length, c1: [], c2: [], c3: [], c4: [] };
  for (let k = 0; k < plants && pool.length >= 2; k++) {
    const [[a1, b1], [a2, b2]] = pick(pool, 2);
    const n1 = rnd() < 0.5 ? 2 : 3;
    const durs = Array.from({ length: n1 }, () => 1 + Math.floor(rnd() * 25));
    const raw = durs.map(() => 1 + rnd() * 4);
    const probs = raw.map((x) => Math.round((x / raw.reduce((s, y) => s + y, 0)) * 100));
    probs[n1 - 1] = 100 - probs.slice(0, -1).reduce((s, x) => s + x, 0);
    const follow = rnd() < 0.5 ? 1 + Math.floor(rnd() * 10) : 0; // a follow-on only the last branch has
    const d2 = 1 + Math.floor(rnd() * 20), p2 = 10 + Math.floor(rnd() * 70);
    const lines = [];
    const g1rows = [];
    for (let i = 0; i < n1; i++) {
      if (follow && i === n1 - 1) {
        g1rows.push([[`TIA-B1,Review ${i},${durs[i]},${a1.code},${b1.code}`, `TIA-B1F,Rework,${follow},TIA-B1,${b1.code}`]]);
        lines.push(`TIA-B1,Review ${i},${durs[i]},${a1.code},${b1.code},G1,B${i},${probs[i]}%`, `TIA-B1F,Rework,${follow},TIA-B1,${b1.code},G1,B${i},`);
      } else {
        g1rows.push([[`TIA-B1,Review ${i},${durs[i]},${a1.code},${b1.code}`]]);
        lines.push(`TIA-B1,Review ${i},${durs[i]},${a1.code},${b1.code},G1,B${i},${probs[i]}%`);
      }
    }
    lines.push(`TIA-B2,Hold,${d2},${a2.code},${b2.code},G2,Happens,${p2}%`);
    let res;
    try { res = timeImpact(xer, H + lines.join("\n") + "\n", { projId: p.id }); } catch (e) { r.c1.push({ ok: false, error: e.message }); continue; }
    const b = res.branches;
    // 1. each outcome = plain TIA of its rows
    let expect = 0, psum = 0;
    const plainOf = new Map();
    for (const o of b.outcomes) {
      const i = Number(o.picks.find((x) => x.group === "G1").branch.slice(1));
      const g2 = o.picks.find((x) => x.group === "G2").branch === "Happens";
      const rows = [...g1rows[i][0], ...(g2 ? [`TIA-B2,Hold,${d2},${a2.code},${b2.code}`] : [])];
      const plain = timeImpact(xer, HP + rows.join("\n") + "\n", { projId: p.id });
      plainOf.set(`${i}:${g2}`, plain);
      const ok = plain.finish.impacted === o.finish;
      r.c1.push({ ok, picks: o.picks, got: o.finish, want: plain.finish.impacted });
      expect += o.probability * plain.finish.delayDays;
      psum += o.probability;
      tot.outcomes++;
      if (o.delayDays > 0) tot.moved++;
    }
    // 2. the expectation
    r.c2.push({ ok: Math.abs(b.expectedDelayDays - r1(expect)) < 0.051 && Math.abs(psum - 1) < 1e-9, got: b.expectedDelayDays, want: r1(expect), psum });
    if (b.maxDelayDays > b.minDelayDays) tot.spread++;
    // 3. deterministic = most likely of G1 with G2's most likely
    const ml = Number(b.groups.find((g) => g.group === "G1").mostLikely.slice(1));
    const g2ml = b.groups.find((g) => g.group === "G2").mostLikely === "Happens";
    const det = plainOf.get(`${ml}:${g2ml}`);
    r.c3.push({ ok: det && det.finish.impacted === res.finish.impacted && res.fragnet.length === det.fragnet.length, got: res.finish.impacted, want: det?.finish.impacted });
    // 4. one branch at 100% = no branch columns
    const one = timeImpact(xer, H + `TIA-B2,Hold,${d2},${a2.code},${b2.code},G,Only,100%\n`, { projId: p.id });
    const plain1 = timeImpact(xer, HP + `TIA-B2,Hold,${d2},${a2.code},${b2.code}\n`, { projId: p.id });
    r.c4.push({ ok: one.finish.impacted === plain1.finish.impacted && one.branches.outcomes.length === 1 && one.branches.expectedDelayDays === plain1.finish.delayDays && JSON.stringify(one.fragnet) === JSON.stringify(plain1.fragnet) });
  }
  for (const k of ["c1", "c2", "c3", "c4"]) { tot[k][0] += r[k].filter((x) => x.ok).length; tot[k][1] += r[k].length; }
  r.seconds = (Date.now() - t0) / 1000;
  report.push(r);
  const f = (k) => `${r[k].filter((x) => x.ok).length}/${r[k].length}`;
  console.log(`${r.file} (${p.code}, ${pairs.length} pairs): outcome = plain TIA ${f("c1")}, expectation ${f("c2")}, deterministic = most likely ${f("c3")}, one branch = none ${f("c4")}; ${r.seconds.toFixed(1)} s`);
  for (const k of ["c1", "c2", "c3", "c4"]) for (const x of r[k].filter((x) => !x.ok)) console.log(`  MISS ${k}: ${JSON.stringify(x)}`);
}
console.log(`TOTAL: outcome = plain TIA ${tot.c1.join("/")}, expectation ${tot.c2.join("/")}, deterministic = most likely ${tot.c3.join("/")}, one branch = none ${tot.c4.join("/")}; ${tot.moved} of ${tot.outcomes} outcomes moved the finish; ${tot.spread} plants with a spread of outcomes`);
if (jsonOut) writeFileSync(jsonOut, JSON.stringify({ seed: Number(val("--seed", 1)), plants, totals: tot, files: report }, null, 1));
