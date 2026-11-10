// Where the joint fit earns its place: d columns of white noise (sd 1), n 200, one step at
// t = 100 of the same size in every column. A column-by-column search needs the step to be
// large in one column; the joint fit pools evidence, so a step of 1/sqrt(d) the size can pass.
// Also the false-alarm side: the same columns with no step. 100 seeded series per cell.
// Detected = a change within 5 points of 100. Settings as in eval/tcpd-multi.mjs, nothing tuned.
//
// usage: node eval/multi-sim.mjs > eval/multi-sim.out.txt   (seeded, deterministic)
import { multiPelt, columnConsensus } from '../multivariate.mjs';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-300)) * Math.cos(2 * Math.PI * r());
const N = 200, AT = 100, REPS = 100;
const METHODS = {
  'joint level': (cols) => multiPelt(cols, { model: 'mean' }).changepoints,
  'columns: every setting': (cols) => columnConsensus(cols).changes.map((c) => c.index),
};
console.log(`n ${N}, step at ${AT} in every column, white noise sd 1, ${REPS} seeded series per cell.`);
console.log('Each cell: share of series with a change within 5 points of the step / mean number of other changes reported.');
console.log('');
console.log(`${'columns'.padEnd(9)}${'step (sd)'.padEnd(11)}${Object.keys(METHODS).map((m) => m.padStart(26)).join('')}`);
for (const d of [1, 2, 4, 8]) {
  for (const step of [0, 0.5, 0.75, 1, 1.5]) {
    const hit = {}, extra = {};
    for (const m in METHODS) { hit[m] = 0; extra[m] = 0; }
    for (let rep = 0; rep < REPS; rep++) {
      const r = rng(1000 * d + rep + 1);
      const cols = Array.from({ length: d }, () => Array.from({ length: N }, (_, i) => gauss(r) + (i >= AT ? step : 0)));
      for (const [m, fn] of Object.entries(METHODS)) {
        const cps = fn(cols);
        const near = cps.filter((c) => Math.abs(c - AT) <= 5);
        if (step > 0 && near.length) hit[m]++;
        extra[m] += cps.length - (step > 0 ? Math.min(1, near.length) : 0);
      }
    }
    console.log(`${String(d).padEnd(9)}${String(step).padEnd(11)}${Object.keys(METHODS).map((m) => `${step > 0 ? `${hit[m]}%` : '  - '} / ${(extra[m] / REPS).toFixed(2)}`.padStart(26)).join('')}`);
  }
}
