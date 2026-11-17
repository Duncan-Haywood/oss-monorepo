// node scripts/rank-range-coverage.mjs [--runs 12] [--seed 2000] [--out docs/rank-range-coverage-2026-11-15.jsonl]
//
// Are the rank page's results honest for people whose picks are close calls?
// The stop rule (stopCheck) already rechecks at the person's own prior sd;
// the results table (rankTable: 90% rank ranges, chance of being the
// favourite) was still drawn from the fixed-prior fit (sd 2.01 logits). This
// runs simulated respondents through the page's own picker and stop rule and,
// at the point the page shows results, scores three fits of the same answers:
//   fixed  - the fixed prior (what the page showed before this script)
//   own    - the person's own empirical-Bayes prior sd (stopCheck's phi)
//   mix    - an evidence-weighted mixture over a phi grid (mixPhiGrid)
// on: 90% rank-range coverage of the true rank, mean range width, the
// favourite chance against how often the shown favourite is the true one,
// and the Spearman of the shown order with the truth.
//
// Respondent: true scores evenly spaced over `spread` logits, shuffled;
// P(i over j) = sigmoid(s_i - s_j), no ties (as rank-stop-calibration.mjs).
import { writeFileSync } from "node:fs";
import { fit, fitAt, nextPair, order, stopCheck, suggestedMax, rankTable, ownPriorPhi } from "../site/rank-core.mjs";
import { mixedRankTable } from "./phi-mixture.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(opt("--runs", 12));
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 2000));
const NS = opt("--n", "8,15,25").split(",").map(Number);
const SPREADS = opt("--spreads", "100,6,3,1.5").split(",").map(Number);

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

function trueRanks(truth) {
  const r = new Array(truth.length);
  truth.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).forEach(([, i], k) => (r[i] = k + 1));
  return r;
}
function spearman(shownOrder, tr) {
  const n = tr.length;
  let d2 = 0;
  shownOrder.forEach((it, k) => (d2 += (tr[it] - (k + 1)) ** 2));
  return 1 - (6 * d2) / (n * (n * n - 1));
}
function score(table, tr) {
  const n = tr.length;
  let cover = 0, width = 0;
  for (const row of table) {
    if (tr[row.item] >= row.low && tr[row.item] <= row.high) cover++;
    width += row.high - row.low + 1;
  }
  const top = table[0];
  return { cover: cover / n, width: width / n, favChance: top.favourite, favRight: tr[top.item] === 1 ? 1 : 0, rho: spearman(table.map((r) => r.item), tr) };
}

const rows = [];
for (const n of NS) for (const spread of SPREADS) {
  const acc = { fixed: [], own: [], mix: [] };
  let picks = 0, cap = 0, phiSum = 0;
  for (let r = 0; r < RUNS; r++) {
    const seed = SEED0 + 7919 * r + 31 * n + Math.round(10 * spread);
    const rand = mulberry32(seed);
    const truth = Array.from({ length: n }, (_, i) => -spread / 2 + (spread * i) / (n - 1));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [truth[i], truth[j]] = [truth[j], truth[i]]; }
    const tr = trueRanks(truth);
    const limit = suggestedMax(n);
    const answers = [];
    let f = fit(n, answers), done = false;
    while (answers.length < limit) {
      const [a, b] = nextPair(f, answers, { seed });
      const p = 1 / (1 + Math.exp(-(truth[a] - truth[b])));
      answers.push(rand() < p ? [a, b, false] : [b, a, false]);
      f = fit(n, answers);
      if (stopCheck(n, answers, { fixedFit: f }).done) { done = true; break; }
    }
    picks += answers.length; if (!done) cap++;
    const phi = ownPriorPhi(n, answers);
    phiSum += Math.log(phi);
    acc.fixed.push(score(rankTable(f), tr));
    acc.own.push(score(rankTable(fitAt(n, answers, phi), { shownOrder: order(f) }), tr));
    acc.mix.push(score(mixedRankTable(n, answers, { fixedFit: f }), tr));
  }
  const mean = (xs, k) => +(xs.reduce((s, x) => s + x[k], 0) / xs.length).toFixed(3);
  const row = { n, spread, runs: RUNS, picks: +(picks / RUNS).toFixed(1), atCap: cap, phiGeo: +Math.exp(phiSum / RUNS).toFixed(2) };
  for (const k of Object.keys(acc)) row[k] = { cover: mean(acc[k], "cover"), width: mean(acc[k], "width"), favChance: mean(acc[k], "favChance"), favRight: mean(acc[k], "favRight"), rho: mean(acc[k], "rho") };
  rows.push(row);
  console.log(JSON.stringify(row));
}
if (OUT) writeFileSync(OUT, rows.map((r) => JSON.stringify({ run: "rank-range-coverage", seed0: SEED0, ...r })).join("\n") + "\n");
