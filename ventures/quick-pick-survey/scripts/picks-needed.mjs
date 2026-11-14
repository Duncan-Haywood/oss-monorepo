// node scripts/picks-needed.mjs [--runs 8] [--sizes 5,8,10,12,15,20,25,30,40] [--out docs/picks-needed-2026-11-14.jsonl]
//
// How many pairwise picks the list ranker (site/rank.html) asks before it
// stops, by list length and by how consistent the person is, next to the two
// numbers people usually quote: every pair once, n(n-1)/2, and the fewest a
// perfect sort could need, ceil(log2 n!). The page's own code runs it: pairs
// from nextPair, the stop rule from stopCheck (orderConfidence >= 0.9 at the
// fixed prior, rechecked at the person's own prior), the cap suggestedMax.
//
// Respondent: true scores evenly spaced over `spread` logits, shuffled;
// P(i over j) = sigmoid(s_i - s_j), no ties. spread 100 never errs; 6 is
// ordinary noise (neighbours on a 15-item list are 0.43 logits apart, so
// about 61/39); 3 is a person whose likes are close together. Each run
// records picks at the stop (or the cap), whether it hit the cap, the true
// Spearman of the order shown, and whether the shown top item is the true top;
// and, for the same person, the same two scores when every pair is asked
// exactly once (the n(n-1)/2 baseline) and refit the same way.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fit, nextPair, order, orderConfidence, suggestedMax, stopCheck } from "../site/rank-core.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(opt("--runs", 8));
const SIZES = opt("--sizes", "5,8,10,12,15,20,25,30,40").split(",").map(Number);
const SPREADS = opt("--spreads", "100,6,3").split(",").map(Number);
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 2026));

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

export function spearmanWithTruth(shownOrder, truth) {
  const n = truth.length;
  const trueOrder = truth.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const tr = new Array(n), sr = new Array(n);
  trueOrder.forEach((it, k) => (tr[it] = k));
  shownOrder.forEach((it, k) => (sr[it] = k));
  let d2 = 0;
  for (let i = 0; i < n; i++) d2 += (tr[i] - sr[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}

export const allPairs = (n) => (n * (n - 1)) / 2;
export function sortBound(n) {
  let s = 0;
  for (let k = 2; k <= n; k++) s += Math.log2(k);
  return Math.ceil(s);
}

/** One simulated person through the page's loop; returns what the page would show at its stop. */
export function runOne(n, spread, seed) {
  const rand = mulberry32(seed);
  const truth = Array.from({ length: n }, (_, i) => -spread / 2 + (spread * i) / (n - 1));
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [truth[i], truth[j]] = [truth[j], truth[i]]; }
  const top = truth.indexOf(Math.max(...truth));
  const cap = suggestedMax(n);
  const answers = [];
  let f = fit(n, answers);
  while (answers.length < cap) {
    const [a, b] = nextPair(f, answers, { seed });
    const p = 1 / (1 + Math.exp(-(truth[a] - truth[b])));
    answers.push(rand() < p ? [a, b, false] : [b, a, false]);
    f = fit(n, answers);
    if (stopCheck(n, answers, { fixedFit: f, fixedConfidence: orderConfidence(f) }).done) break;
  }
  const shown = order(f);
  // Baseline on the same person: every pair asked exactly once, in random order, same refit.
  const once = [];
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) once.push(rand() < 0.5 ? [i, j] : [j, i]);
  const onceAnswers = once.map(([a, b]) => (rand() < 1 / (1 + Math.exp(-(truth[a] - truth[b]))) ? [a, b, false] : [b, a, false]));
  const onceShown = order(fit(n, onceAnswers));
  return { onceRho: spearmanWithTruth(onceShown, truth), onceTopRight: onceShown[0] === top, picks: answers.length, atCap: answers.length >= cap && !stopCheck(n, answers, { fixedFit: f }).done, rho: spearmanWithTruth(shown, truth), topRight: shown[0] === top };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = [];
  for (const n of SIZES) for (const spread of SPREADS) {
    const xs = [];
    const t0 = Date.now();
    for (let r = 0; r < RUNS; r++) xs.push(runOne(n, spread, SEED0 + 7919 * r + 31 * n + Math.round(10 * spread)));
    const picks = xs.map((x) => x.picks).sort((a, b) => a - b);
    const mean = (k) => xs.reduce((s, x) => s + Number(x[k]), 0) / xs.length;
    const row = {
      n, spread, runs: RUNS,
      picksMean: +mean("picks").toFixed(1), picksMin: picks[0], picksMax: picks.at(-1),
      atCap: xs.filter((x) => x.atCap).length, cap: suggestedMax(n),
      trueSpearman: +mean("rho").toFixed(3), topRight: xs.filter((x) => x.topRight).length,
      allPairs: allPairs(n), allPairsSpearman: +mean("onceRho").toFixed(3), allPairsTopRight: xs.filter((x) => x.onceTopRight).length, sortBound: sortBound(n), seconds: +((Date.now() - t0) / 1000).toFixed(1),
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
  if (OUT) writeFileSync(OUT, rows.map((r) => JSON.stringify({ run: "picks-needed", seed0: SEED0, ...r })).join("\n") + "\n");
}
