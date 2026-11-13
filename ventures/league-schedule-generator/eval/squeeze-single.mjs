// Do squeezes close the frontier gaps a single round robin's best-of-12 leaves? The same question
// as eval/squeeze-gap.mjs (home and away), on one leg: squeezeSingleRounds searches the timetable
// and every match's ground together under a break cap (README "Squeezing a single round robin").
// Runs the page's 12 tries (8 weighted, 2 capped, 2 gap), then `--count` squeezes (default 4) one
// after another, each at the widest gap left, and reports the frontier before and after, the
// widest break gap, the least carry-over at each break budget, and the time.
//
//   node eval/squeeze-single.mjs --sizes 12,16,18,19,20 --seeds 1,2,3 [--count 4] [--effort 1] [--cycles 0] [--cache dir]
//
// `--cycles 0` turns off the three-cycle ground move (on by default for one leg) to measure it;
// `--cache dir` keeps each size and seed's 12 tries as JSON so a second run skips them.
//
// One JSON line per (size, seed), then a table; eval/squeeze-single.txt holds the run behind the README.
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { carryOverTry, carryOverSqueezes, CARRY_OVER_GAP } from "../carryover.mjs";
import { frontierOf } from "./frontier-gap.mjs";

const widestGap = (f) => f.reduce((g, x, i) => (i ? Math.max(g, f[i - 1].breaks - x.breaks) : 0), 0);
const label = (x) => `${x.coe}/${x.breaks}`;
// least carry-over within k breaks, for every k from the fewest to the most on the frontier
const budgetCurve = (f, lo, hi) => { const out = []; for (let k = lo; k <= hi; k++) { const c = f.filter((x) => x.breaks <= k); out.push(c.length ? Math.min(...c.map((x) => x.coe)) : null); } return out; };

export function probe(n, seed, { count = 4, effort = 1, cycles, cache = null } = {}) {
  const t0 = Date.now();
  const file = cache ? `${cache}/single-${n}-${seed}.json` : null;
  let tries = file && existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : null;
  if (!tries) {
    tries = [];
    for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) tries.push(carryOverTry(n, i, { seed, weighted: 8 }));
    if (file) { mkdirSync(cache, { recursive: true }); writeFileSync(file, JSON.stringify(tries.map(({ rounds, coe, breaks, index, circleCoe, lowerBound }) => ({ rounds, coe, breaks, index, circleCoe, lowerBound })))); }
  }
  const tTries = Date.now() - t0;
  const t1 = Date.now();
  const all = carryOverSqueezes(n, tries, count, { seed, effort, cycles });
  const sq = all.slice(tries.length);
  const tSq = Date.now() - t1;
  const cand = (xs) => xs.map((t) => ({ index: t.index, coe: t.coe, breaks: t.breaks }));
  const before = frontierOf(cand(tries)), after = frontierOf(cand([...tries, ...sq]));
  const lo = Math.min(...before.map((x) => x.breaks)), hi = Math.max(...before.map((x) => x.breaks));
  const cb = budgetCurve(before, lo, hi), ca = budgetCurve(after, lo, hi);
  const cuts = cb.map((b, k) => (b - ca[k]) / b);
  return {
    teams: n, seed,
    before: before.map(label), after: after.map((x) => label(x) + (x.index >= tries.length ? "*" : "")),
    squeezes: sq.map((s) => `${label(all[s.squeezedFrom])} cap ${s.maxBreaks} -> ${label(s)}`),
    added: after.filter((x) => x.index >= tries.length).length,
    dominated: before.filter((x) => after.every((y) => y.index !== x.index)).length,
    gapBefore: widestGap(before), gapAfter: widestGap(after),
    meanCut: +(100 * cuts.reduce((a, b) => a + b, 0) / cuts.length).toFixed(1), maxCut: +(100 * Math.max(...cuts)).toFixed(1),
    triesS: +(tTries / 1000).toFixed(1), squeezeS: +(tSq / 1000).toFixed(2),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].split(",").map(Number) : d; };
  const [count] = arg("--count", [4]);
  const [effort] = arg("--effort", [1]);
  const [cyc] = arg("--cycles", [1]);
  const ci = process.argv.indexOf("--cache"), cache = ci > 0 ? process.argv[ci + 1] : null;
  const rows = [];
  for (const n of arg("--sizes", [12, 16, 18, 19, 20])) for (const seed of arg("--seeds", [1, 2, 3])) { const r = probe(n, seed, { count, effort, cycles: cyc !== 0, cache }); rows.push(r); console.log(JSON.stringify(r)); }
  console.log("\nteams seed | frontier before | squeezes | added | dominated | widest gap | mean cut | max cut | squeeze s");
  for (const r of rows) console.log(`${r.teams} s${r.seed} | ${r.before.join(" ")} | ${r.squeezes.join("; ")} | ${r.added} | ${r.dominated} | ${r.gapBefore} -> ${r.gapAfter} | ${r.meanCut}% | ${r.maxCut}% | ${r.squeezeS}`);
  console.log(`all ${rows.length} | mean cut ${(rows.reduce((a, r) => a + r.meanCut, 0) / rows.length).toFixed(1)}% | added ${rows.reduce((a, r) => a + r.added, 0)} | squeeze s mean ${(rows.reduce((a, r) => a + r.squeezeS, 0) / rows.length).toFixed(2)}`);
}
