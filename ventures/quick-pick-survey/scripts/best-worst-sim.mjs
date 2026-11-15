// node scripts/best-worst-sim.mjs [--runs 24] [--run0 0] [--sizes 8,15,30] [--spreads 6,3] [--answerer gumbel|probit] [--out docs/best-worst-2026-11-15.jsonl.gz]
// node scripts/best-worst-sim.mjs --from a.jsonl.gz,b.jsonl.gz   summarise saved rows
//
// Best-worst screens of four against pairs, on the rank page's own loop and
// stop rule (docs/RANK-PAGE.md, "Best and worst of four"). Each simulated
// person has true scores evenly spaced over `spread` logits, shuffled. The
// pairs arm is scripts/pile-first.mjs's picks-only loop. The screens arm asks
// nextScreen, reads each screen with the exact best-worst likelihood and stops
// on the same stopCheck at 0.9; its cap is half the pair cap in screens (two
// taps each, so the same taps).
//
// Answerers: "gumbel" answers screens with the model's own process (best by
// Gumbel-max, worst likewise on the rest) and pairs logistically, so both arms
// meet their model. "probit" is the mismatch check: each screen and pair is
// answered from s + N(0, 1.6^2) per option (Thurstone), best is the highest
// seen, worst the lowest, which the softmax model does not assume. A pair's
// noise is then N(0, 2.26^2) on the difference, noisier than the logistic
// pick (about 1.7 on the probit scale), so this answerer is both off-model
// and less consistent than the gumbel one. The question is whether the stop
// rule's 0.9 still holds when the person does not answer as the model says.
//
// Rows: arm, screens or picks, taps, capped, true Spearman of the shown order
// at the stop, top right, stop confidence, and the Spearman after each tap
// count (curve, by tap) to compare at equal effort.
import { writeFileSync, readFileSync } from "node:fs";
import { gzipSync, gunzipSync } from "node:zlib";
import { pathToFileURL } from "node:url";
import { fit, nextPair, order, orderConfidence, suggestedMax, stopCheck } from "../site/rank-core.mjs";
import { nextScreen, simulateScreen, BW_SET_SIZE } from "../site/best-worst.mjs";
import { spearmanWithTruth } from "./picks-needed.mjs";

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const RUNS = Number(opt("--runs", 24));
const RUN0 = Number(opt("--run0", 0)); // first run index, so a cell can be split into shards that run in parallel
const SIZES = opt("--sizes", "8,15,30").split(",").map(Number);
const SPREADS = opt("--spreads", "6,3").split(",").map(Number);
const ANSWERER = opt("--answerer", "gumbel");
const OUT = opt("--out", null);
const SEED0 = Number(opt("--seed", 1511));
const PROBIT_SD = 1.6;

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

function answerPair(truth, a, b, rand, answerer) {
  if (answerer === "probit") return truth[a] + PROBIT_SD * gauss(rand) > truth[b] + PROBIT_SD * gauss(rand) ? [a, b, false] : [b, a, false];
  return rand() < 1 / (1 + Math.exp(-(truth[a] - truth[b]))) ? [a, b, false] : [b, a, false];
}
function answerScreen(truth, S, rand, answerer) {
  if (answerer !== "probit") return simulateScreen(truth, S, rand);
  const seen = S.map((i) => [truth[i] + PROBIT_SD * gauss(rand), i]).sort((x, y) => y[0] - x[0]);
  return { set: S.slice(), best: seen[0][1], worst: seen.at(-1)[1] };
}

/** One person, one arm. `extraTaps` keeps asking past the stop (no more stop checks) for the equal-effort curve. */
export function runArm(truth, arm, seed, { answerer = "gumbel", extraTaps = 0 } = {}) {
  const n = truth.length;
  const rand = mulberry32(seed);
  const tapsPer = arm === "screens" ? 2 : 1;
  const cap = arm === "screens" ? Math.ceil(suggestedMax(n) / 2) : suggestedMax(n);
  const answers = [];
  let f = fit(n, answers);
  const curve = [spearmanWithTruth(order(f), truth)];
  let stop = null;
  const top = truth.indexOf(Math.max(...truth));
  while (answers.length < cap || answers.length * tapsPer < extraTaps) {
    if (stop && answers.length * tapsPer >= extraTaps) break;
    if (arm === "screens") answers.push(answerScreen(truth, nextScreen(f, answers, { seed, size: BW_SET_SIZE }), rand, answerer));
    else { const [a, b] = nextPair(f, answers, { seed }); answers.push(answerPair(truth, a, b, rand, answerer)); }
    f = fit(n, answers);
    const rho = spearmanWithTruth(order(f), truth);
    for (let t = 0; t < tapsPer; t++) curve.push(rho);
    if (!stop) {
      const s = stopCheck(n, answers, { fixedFit: f, fixedConfidence: orderConfidence(f) });
      if (s.done || answers.length >= cap) stop = { questions: answers.length, taps: answers.length * tapsPer, capped: !s.done, spearman: rho, topRight: order(f)[0] === top, confidence: s.confidence };
    }
  }
  return { ...stop, curve };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const FROM = opt("--from", null);
  const load = (f) => (f.endsWith(".gz") ? gunzipSync(readFileSync(f)).toString("utf8") : readFileSync(f, "utf8")).trim().split("\n").map((l) => JSON.parse(l));
  const rows = FROM ? FROM.split(",").flatMap(load) : [];
  if (!FROM) for (const spread of SPREADS) for (const n of SIZES) for (let r = RUN0; r < RUN0 + RUNS; r++) {
    const seed = SEED0 + 7919 * r + 104729 * n + 13 * spread;
    const rand = mulberry32(seed);
    const truth = Array.from({ length: n }, (_, i) => -spread / 2 + (spread * i) / (n - 1));
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [truth[i], truth[j]] = [truth[j], truth[i]]; }
    const extraTaps = 4 * n;
    for (const arm of ["pairs", "screens"]) rows.push({ n, spread, answerer: ANSWERER, arm, run: r, ...runArm(truth, arm, seed ^ 0x9e37, { answerer: ANSWERER, extraTaps }) });
    process.stderr.write(`${ANSWERER} n ${n} spread ${spread} run ${r}   \r`);
  }
  process.stderr.write("\n");
  const key = (x) => `${x.answerer}|${x.spread}|${x.n}|${x.arm}`;
  const groups = new Map();
  for (const x of rows) (groups.get(key(x)) || groups.set(key(x), []).get(key(x))).push(x);
  const mean = (a, f) => a.reduce((s, x) => s + f(x), 0) / a.length;
  const at = (g, B) => mean(g, (y) => y.curve[Math.min(B, y.curve.length - 1)]);
  console.log("answerer spread   n  arm      runs  questions  taps  spearman  top%  capped%   conf | rho at n / 2n / 3n / 4n taps");
  for (const g of groups.values()) {
    const x = g[0], n = x.n;
    const c = [1, 2, 3, 4].map((m) => at(g, m * n).toFixed(3)).join(" / ");
    console.log(`${x.answerer.padEnd(8)} ${String(x.spread).padStart(6)} ${String(n).padStart(3)}  ${x.arm.padEnd(8)} ${String(g.length).padStart(4)} ${mean(g, (y) => y.questions).toFixed(1).padStart(10)} ${mean(g, (y) => y.taps).toFixed(1).padStart(5)} ${mean(g, (y) => y.spearman).toFixed(3).padStart(9)} ${(100 * mean(g, (y) => +y.topRight)).toFixed(0).padStart(5)} ${(100 * mean(g, (y) => +y.capped)).toFixed(0).padStart(7)} ${mean(g, (y) => y.confidence).toFixed(3).padStart(6)} | ${c}`);
  }
  if (OUT) writeFileSync(OUT, gzipSync(rows.map((x) => JSON.stringify(x)).join("\n") + "\n"));
}
