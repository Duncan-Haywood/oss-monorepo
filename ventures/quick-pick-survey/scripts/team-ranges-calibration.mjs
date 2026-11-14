// node scripts/team-ranges-calibration.mjs [--runs 40] [--out docs/team-ranges-2026-11-14.jsonl]
//
// Do the rank page's team rank ranges hold what they claim? (docs/RANK-PAGE.md,
// "Team ranges".) A wider group has true scores theta, evenly spaced over
// `spread` logits and shuffled. Each of m members likes theta plus their own
// N(0, tau^2) per option, and answers the page's own nextPair questions,
// P(i over j) = sigmoid(b_i - b_j), for a fixed number of picks. Then:
//
// - group: 90% ranges from groupFit, scored against the order of the members'
//   own mean true scores (what "this group" claims);
// - pop: 90% ranges from populationFit, scored against theta's order;
// - naive: groupFit's ranges scored against theta's order (what reading the
//   group ranges as "people like us" would claim);
// - fixed: populationAt(tau = 0) against theta (every answer in one fit).
//
// Coverage is the share of options whose true rank falls in its range.
import { writeFileSync } from "node:fs";
import { fit, nextPair, personInfo, groupFit, populationFit, populationAt, rankTable, order, combine } from "../site/rank-core.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(opt("--runs", 20));
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 2000));

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const ranksOf = (s) => {
  const r = new Array(s.length);
  s.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).forEach(([, i], k) => (r[i] = k + 1));
  return r;
};
const spearman = (shown, truth) => {
  const n = truth.length, tr = ranksOf(truth), sr = new Array(n);
  shown.forEach((it, k) => (sr[it] = k + 1));
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (tr[i] - sr[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
};
const coverage = (f, truth) => {
  const tr = ranksOf(truth);
  const t = rankTable(f, { draws: 1000 });
  return { cov: t.filter((r) => tr[r.item] >= r.low && tr[r.item] <= r.high).length / t.length, width: t.reduce((a, r) => a + r.high - r.low + 1, 0) / t.length };
};

const cells = [];
for (const n of [8, 15]) for (const m of [3, 5, 10]) for (const tau of [0, 0.5, 1, 2]) cells.push({ n, m, tau, spread: 4 });

const rows = [];
for (const cell of cells) {
  const { n, m, tau, spread } = cell;
  const picks = Math.ceil(n * Math.log2(n));
  const acc = {};
  const add = (k, v) => ((acc[k] ||= []).push(v));
  for (let run = 0; run < RUNS; run++) {
    const r = mulberry32(SEED0 + run * 7919 + n * 131 + m * 17 + Math.round(tau * 1000));
    const theta = Array.from({ length: n }, (_, i) => spread * (0.5 - i / (n - 1)));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [theta[i], theta[j]] = [theta[j], theta[i]]; }
    const people = [];
    const bs = [];
    for (let p = 0; p < m; p++) {
      const b = theta.map((x) => x + tau * gauss(r));
      bs.push(b);
      const answers = [];
      for (let k = 0; k < picks; k++) {
        const [i, j] = nextPair(fit(n, answers), answers, { seed: run * 101 + p + 1 });
        answers.push(r() < 1 / (1 + Math.exp(-(b[i] - b[j]))) ? [i, j, false] : [j, i, false]);
      }
      people.push({ answers });
    }
    const members = theta.map((_, i) => bs.reduce((a, b) => a + b[i], 0) / m);
    const infos = people.map((p) => personInfo(n, p.answers));
    const g = groupFit(n, infos), pop = populationFit(n, infos), fixed = populationAt(n, infos, 0);
    const c = combine(theta.map(String), people);
    const gc = coverage(g, members), nc = coverage(g, theta), pc = coverage(pop, theta), fc = coverage(fixed, theta);
    add("group_cov", gc.cov); add("group_width", gc.width);
    add("naive_cov", nc.cov);
    add("pop_cov", pc.cov); add("pop_width", pc.width);
    add("fixed_cov", fc.cov); add("fixed_width", fc.width);
    add("tau_hat", pop.tau);
    add("rho_combine_members", spearman(c.order.map((o) => o.item), members));
    add("rho_group_members", spearman(order(g), members));
    add("rho_combine_theta", spearman(c.order.map((o) => o.item), theta));
    add("rho_pop_theta", spearman(order(pop), theta));
  }
  const mean = (k) => acc[k].reduce((a, b) => a + b, 0) / acc[k].length;
  const row = { ...cell, picks, runs: RUNS };
  for (const k of Object.keys(acc)) row[k] = +mean(k).toFixed(3);
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (OUT) writeFileSync(OUT, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
