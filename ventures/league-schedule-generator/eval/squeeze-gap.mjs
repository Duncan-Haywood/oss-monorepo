// Do squeezes (squeezeDoubleRounds: the timetable and the grounds searched together under a
// season break cap) close the frontier gaps a home-and-away best-of-12 leaves at 17 to 20 teams?
// Runs the page's 12 tries (8 weighted, 2 capped, 2 gap), then the squeezes squeezeTargets lists
// one after another, each at the widest gap left (`--count`, default 4), and reports the frontier before and after, the widest break gap, and
// each squeeze's start, cap and result.
//
//   node eval/squeeze-gap.mjs --sizes 17,18 --seeds 1,2,3 [--count 4] [--effort 1]
//
// One JSON line per (size, seed); eval/squeeze-gap.txt holds the run behind the README section.
import { fileURLToPath } from "node:url";
import { carryOverTry, carryOverSqueezes, CARRY_OVER_GAP } from "../carryover.mjs";
import { frontierOf } from "./frontier-gap.mjs";

const widestGap = (f) => f.reduce((g, x, i) => (i ? Math.max(g, f[i - 1].breaks - x.breaks) : 0), 0);
const label = (x) => `${x.coe}/${x.breaks}`;

export function probe(n, seed, { count = 4, effort = 1 } = {}) {
  const t0 = Date.now();
  const tries = [];
  for (let i = 0; i < 10 + CARRY_OVER_GAP; i++) tries.push(carryOverTry(n, i, { double: true, seed, weighted: 8 }));
  const tTries = Date.now() - t0;
  const t1 = Date.now();
  const all = carryOverSqueezes(n, tries, count, { seed, effort });
  const sq = all.slice(tries.length);
  const tSq = Date.now() - t1;
  const cand = (xs) => xs.map((t) => ({ index: t.index, coe: t.coe + (t.repeats || 0) * 1000, breaks: t.breaks }));
  const before = frontierOf(cand(tries)), after = frontierOf(cand([...tries, ...sq]));
  const dominated = before.filter((x) => after.every((y) => y.index !== x.index)).length;
  return {
    teams: n, seed,
    before: before.map(label), after: after.map((x) => label(x) + (x.index >= tries.length ? "*" : "")),
    squeezes: sq.map((s) => `${label(all[s.squeezedFrom])} cap ${s.maxBreaks} -> ${label(s)}`),
    added: after.filter((x) => x.index >= tries.length).length, dominated,
    gapBefore: widestGap(before), gapAfter: widestGap(after),
    triesS: +(tTries / 1000).toFixed(1), squeezeS: +(tSq / 1000).toFixed(2),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1].split(",").map(Number) : d; };
  const [count] = arg("--count", [4]);
  const [effort] = arg("--effort", [1]);
  for (const n of arg("--sizes", [17, 18, 19, 20])) for (const seed of arg("--seeds", [1, 2, 3])) console.log(JSON.stringify(probe(n, seed, { count, effort })));
}
