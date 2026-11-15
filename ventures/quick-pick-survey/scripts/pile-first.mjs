// node scripts/pile-first.mjs [--runs 24] [--sizes 8,12,15,20,30,40] [--spreads 6,3] [--taus 0,1.28,3.85] [--out docs/pile-first-2026-11-15.jsonl]
// node scripts/pile-first.mjs --from a.jsonl,b.jsonl   summarise saved rows (shards run in parallel)
//
// Does "sort into piles first" (site/rank.html) save picks, and what does it
// cost the order? For each simulated person the page's own loop runs twice on
// the same true scores and the same pick noise stream: once with picks only
// (the ranker as it was) and once after a pile step, one tap per option into
// top / middle / bottom, with the piles fed to the refit as a prior
// (pilePrior). The person places option i by s_i + e_i, e_i ~ N(0, tau^2),
// cut at their own thirds. tau 0 never misplaces; 1.28 is the noise the prior
// assumes (PILE_NOISE); 3.85 is a person three times as careless as assumed,
// to see whether the stop rule then claims a settled order it does not have.
//
// Respondent and stop rule as scripts/picks-needed.mjs: true scores evenly
// spaced over `spread` logits, shuffled; picks logistic; stopCheck at 0.9; cap
// suggestedMax. Each row: picks, hit cap, true Spearman of the shown order,
// whether the shown top is the true top, and the stop-time confidence.
import { writeFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { fit, pairFit, nextPair, order, orderConfidence, suggestedMax, stopCheck } from "../site/rank-core.mjs";
import { spearmanWithTruth } from "./picks-needed.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(opt("--runs", 24));
const SIZES = opt("--sizes", "8,12,15,20,30,40").split(",").map(Number);
const SPREADS = opt("--spreads", "6,3").split(",").map(Number);
const TAUS = opt("--taus", "0,1.28,3.85").split(",").map(Number);
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 1115));

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
const gauss = (rand) => Math.sqrt(-2 * Math.log(rand() || 1e-12)) * Math.cos(2 * Math.PI * rand());

/** The person's piles: their noisy view of each option, cut at their own thirds. */
export function placePiles(truth, tau, rand) {
  const n = truth.length;
  const seen = truth.map((s) => s + tau * gauss(rand));
  const byView = seen.map((o, i) => [o, i]).sort((a, b) => b[0] - a[0]);
  const piles = new Array(n);
  byView.forEach(([, i], r) => (piles[i] = Math.min(2, Math.floor((3 * r) / n))));
  return piles;
}

/**
 * The ranker's loop on one person; `piles` null is picks only. Pick noise has
 * its own stream so both arms see the same coins. The loop records where the
 * stop rule fires, then keeps asking (no stop checks) up to `extra` picks so
 * the two arms can also be compared at equal effort: `curve[k]` is the true
 * Spearman of the order shown after k picks.
 */
export function runLoop(truth, piles, pickSeed, { extra = 0 } = {}) {
  const n = truth.length;
  const coin = mulberry32(pickSeed);
  const cap = suggestedMax(n);
  const answers = [];
  const pp = piles || undefined;
  let f = fit(n, answers, pp);
  const curve = [spearmanWithTruth(order(f), truth)];
  let stop = null;
  const top = truth.indexOf(Math.max(...truth));
  while (answers.length < Math.max(cap, extra)) {
    if (stop && answers.length >= extra) break;
    const [a, b] = nextPair(pairFit(n, answers, pp, f), answers, { seed: pickSeed });
    const p = 1 / (1 + Math.exp(-(truth[a] - truth[b])));
    answers.push(coin() < p ? [a, b, false] : [b, a, false]);
    f = fit(n, answers, pp);
    curve.push(spearmanWithTruth(order(f), truth));
    if (!stop) {
      const s = stopCheck(n, answers, { fixedFit: f, fixedConfidence: orderConfidence(f), piles: pp });
      if (s.done || answers.length >= cap) {
        const shown = order(f);
        stop = { picks: answers.length, capped: !s.done, spearman: curve.at(-1), topRight: shown[0] === top, confidence: s.confidence };
      }
    }
  }
  return { ...stop, curve };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const FROM = opt("--from", null);
  const rows = FROM ? FROM.split(",").flatMap((f) => readFileSync(f, "utf8").trim().split("\n").map((l) => JSON.parse(l))) : [];
  if (!FROM) for (const spread of SPREADS) for (const n of SIZES) for (let r = 0; r < RUNS; r++) {
    const seed = SEED0 + 7919 * r + 104729 * n + 13 * spread;
    const rand = mulberry32(seed);
    const truth = Array.from({ length: n }, (_, i) => -spread / 2 + (spread * i) / (n - 1));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [truth[i], truth[j]] = [truth[j], truth[i]]; }
    const extra = 6 * n;
    const base = runLoop(truth, null, seed ^ 0x9e37, { extra });
    rows.push({ n, spread, tau: null, run: r, ...base });
    for (const tau of TAUS) {
      const piles = placePiles(truth, tau, mulberry32(seed ^ 0x51e5 ^ Math.round(tau * 1000)));
      const pileRight = piles.filter((p, i) => p === Math.min(2, Math.floor((3 * truth.filter((t) => t > truth[i]).length) / n))).length / n;
      rows.push({ n, spread, tau, run: r, taps: n, pileRight, ...runLoop(truth, piles, seed ^ 0x9e37, { extra }) });
    }
    process.stderr.write(`n ${n} spread ${spread} run ${r}\r`);
  }
  process.stderr.write("\n");
  const key = (x) => `${x.spread}|${x.n}|${x.tau}`;
  const groups = new Map();
  for (const x of rows) (groups.get(key(x)) || groups.set(key(x), []).get(key(x))).push(x);
  const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
  // Equal effort: a tap counted as one action, like a pick (a tap is likely
  // quicker, so this flatters picks only). Spearman after B actions: B picks,
  // or n taps and B - n picks.
  const at = (g, B) => mean(g, (y) => { const k = Math.max(0, Math.min(B - (y.taps || 0), y.curve.length - 1)); return B < (y.taps || 0) ? NaN : y.curve[k]; });
  console.log("spread   n   tau   picks  +taps  spearman  top%  capped%   conf | rho at 2n / 3n / 4n / 6n actions");
  for (const g of groups.values()) {
    const x = g[0], n = x.n;
    const c = [2, 3, 4, 6].map((m) => at(g, m * n).toFixed(3)).join(" / ");
    console.log(`${String(x.spread).padStart(6)} ${String(n).padStart(3)} ${String(x.tau ?? "none").padStart(5)} ${mean(g, (y) => y.picks).toFixed(1).padStart(7)} ${mean(g, (y) => y.picks + (y.taps || 0)).toFixed(1).padStart(6)} ${mean(g, (y) => y.spearman).toFixed(3).padStart(9)} ${(100 * mean(g, (y) => +y.topRight)).toFixed(0).padStart(5)} ${(100 * mean(g, (y) => +y.capped)).toFixed(0).padStart(7)} ${mean(g, (y) => y.confidence).toFixed(3).padStart(6)} | ${c}`);
  }
  if (OUT) writeFileSync(OUT, rows.map((x) => JSON.stringify(x)).join("\n") + "\n");
}
