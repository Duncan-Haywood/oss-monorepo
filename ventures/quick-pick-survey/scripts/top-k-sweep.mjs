// node scripts/top-k-sweep.mjs [--runs 12] [--sizes 10,15,20,30] [--ks 3,5] [--spreads 100,6,3] [--out docs/top-k-2026-11-14.jsonl]
//
// The list ranker's "top k" mode (site/rank.html, "Find my top k") against
// the full-order mode, on the same simulated people. The page's own code runs
// every arm: pairs from nextPair, stops from stopCheck / topStopCheck, the cap
// suggestedMax. Arms:
//   order     today's full-order picker and stop rule (the shortlist is read
//             off the order it stops on)
//   order+set full-order picker, stopped by the shortlist rule (isolates the
//             stop rule from the picker)
//   live      top-k picker pairing every option that could still be in the
//             top k (>= 1%), shortlist stop rule
//   boundary  top-k picker pairing only options that could be in or out
//             (1% to 99%), shortlist stop rule
// Respondent as in scripts/picks-needed.mjs: true scores evenly spaced over
// `spread` logits, shuffled, P(i over j) = sigmoid(s_i - s_j), no ties.
// Recorded per run: picks at the stop (or the cap), whether it hit the cap,
// whether the shown top k is exactly the true top k (as a set), how many of
// the shown k are truly in it, and whether the shown first is the true first.
import { writeFileSync } from "node:fs";
import { fit, nextPair, order, orderConfidence, suggestedMax, stopCheck, topStopCheck } from "../site/rank-core.mjs";

const args = process.argv.slice(2);
const opt = (key, d) => (args.includes(key) ? args[args.indexOf(key) + 1] : d);
const RUNS = Number(opt("--runs", 12));
const SIZES = opt("--sizes", "10,15,20,30").split(",").map(Number);
const KS = opt("--ks", "3,5").split(",").map(Number);
const SPREADS = opt("--spreads", "100,6,3").split(",").map(Number);
const ARMS = opt("--arms", "order,order+set,live,boundary").split(",");
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 4100));
const MEASURE = opt("--measure", "overlap");
const LEVEL = Number(opt("--level", 0.9));

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

function person(n, spread, seed) {
  const rand = mulberry32(seed);
  const truth = Array.from({ length: n }, (_, i) => -spread / 2 + (spread * i) / (n - 1));
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [truth[i], truth[j]] = [truth[j], truth[i]]; }
  return truth;
}

export function runArm(arm, n, k, spread, seed) {
  const truth = person(n, spread, seed);
  const rand = mulberry32(seed ^ 0x9e3779b9); // the same answer stream for every arm of this person
  const trueOrder = truth.map((s, i) => [s, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
  const trueTop = new Set(trueOrder.slice(0, k));
  const cap = suggestedMax(n);
  const answers = [];
  let f = fit(n, answers);
  const pick = arm === "live" || arm === "boundary" ? { mode: "top", k, topPool: arm } : { mode: "order" };
  const stops = () => (arm === "order" ? stopCheck(n, answers, { fixedFit: f, fixedConfidence: orderConfidence(f) }) : topStopCheck(n, answers, k, { fixedFit: f, measure: MEASURE, level: LEVEL })).done;
  let stopped = false;
  while (answers.length < cap) {
    const [a, b] = nextPair(f, answers, { ...pick, seed });
    const p = 1 / (1 + Math.exp(-(truth[a] - truth[b])));
    answers.push(rand() < p ? [a, b, false] : [b, a, false]);
    f = fit(n, answers);
    if (stops()) { stopped = true; break; }
  }
  const shown = order(f);
  const hits = shown.slice(0, k).filter((i) => trueTop.has(i)).length;
  return { picks: answers.length, atCap: !stopped, setRight: hits === k, hits, firstRight: shown[0] === trueOrder[0] };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop());
if (isMain) {
  const rows = [];
  for (const n of SIZES) for (const k of KS) for (const spread of SPREADS) {
    if (k >= n) continue;
    for (const arm of ARMS) {
      const t0 = Date.now();
      const xs = [];
      for (let r = 0; r < RUNS; r++) xs.push(runArm(arm, n, k, spread, SEED0 + 7919 * r + 31 * n + Math.round(10 * spread)));
      const mean = (key) => xs.reduce((s, x) => s + Number(x[key]), 0) / xs.length;
      const row = {
        arm, n, k, spread, runs: RUNS, cap: suggestedMax(n),
        picksMean: +mean("picks").toFixed(1), atCap: xs.filter((x) => x.atCap).length,
        setRight: xs.filter((x) => x.setRight).length, hitsMean: +mean("hits").toFixed(2), firstRight: xs.filter((x) => x.firstRight).length,
        seconds: +((Date.now() - t0) / 1000).toFixed(1),
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    }
  }
  if (OUT) writeFileSync(OUT, rows.map((r) => JSON.stringify({ run: "top-k", seed0: SEED0, measure: MEASURE, level: LEVEL, ...r })).join("\n") + "\n");
}
