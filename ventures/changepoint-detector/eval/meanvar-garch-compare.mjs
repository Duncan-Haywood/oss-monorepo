// Head to head on one set of seeds: plain meanvar, `--bootstrap` (shipped), the GARCH prune of meanvar's cuts
// (eval/meanvar-garch-segments.mjs) and the joint GARCH forward search (eval/meanvar-garch-binseg.mjs). Earlier tables
// put --bootstrap on other seeds (meanvar-dispersion.mjs), so they could not be compared row for row.
// usage: node eval/meanvar-garch-compare.mjs [reps] [seedShift] [prunePen] [jointPen]   (penalties in multiples of ln n)
import { analyze } from '../engine.mjs';
import { pruneByGarch } from './meanvar-garch-segments.mjs';
import { NOISE, garchForward } from './meanvar-garch-binseg.mjs';
const reps = +process.argv[2] || 100, shift = +process.argv[3] || 0;
const prunePen = +process.argv[4] || 1.5, jointPen = +process.argv[5] || 1.5;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
const METHODS = {
  plain: (v) => analyze({ values: v, model: 'meanvar' }).pelt.changepoints.length,
  bootstrap: (v) => analyze({ values: v, model: 'meanvar', bootstrap: true }).pelt.changepoints.length,
  prune: (v) => pruneByGarch(v, analyze({ values: v, model: 'meanvar' }).pelt.changepoints.map((c) => c.index), prunePen * Math.log(v.length)).length,
  joint: (v) => garchForward(v, { minPen: jointPen * Math.log(v.length), maxCuts: 2 }).cuts.length,
};
console.log(`reps ${reps}, seed shift ${shift}, prune ${prunePen} ln n, joint ${jointPen} ln n\nnull any change / sd 1->2 exactly one / mean +1.5 exactly one`);
console.log(`n | noise | ${Object.keys(METHODS).join(' | ')}`);
for (const n of [100, 200]) for (const name of ['gauss', 'garch', 't3']) {
  const gen = NOISE[name], tally = Object.keys(METHODS).map(() => [0, 0, 0]);
  for (let k = 0; k < reps; k++) {
    const series = [
      gen(rng(5000 * n + 7 * k + 1 + shift), n),
      gen(rng(9000 * n + 7 * k + 3 + shift), n).map((x, i) => i < n / 2 ? x : 2 * x),
      gen(rng(13000 * n + 7 * k + 5 + shift), n).map((x, i) => i < n / 2 ? x : x + 1.5),
    ];
    Object.values(METHODS).forEach((f, m) => series.forEach((v, j) => { const c = f(v); if (j === 0 ? c > 0 : c === 1) tally[m][j]++; }));
  }
  console.log(`${n} | ${name.padEnd(5)} | ${tally.map((t) => t.map((v) => pct(v, reps)).join(' / ')).join(' | ')}`);
}
