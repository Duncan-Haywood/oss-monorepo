// The cost of a per-column noise floor where the joint fit earns its place, and what it buys where it does not.
// (1) White noise: d columns, sd 1, n 200, one step at t = 100 in every column (as eval/multi-sim.mjs, same seeds).
// (2) Smooth columns with one shared step: each column a random walk (innovation sd 1) or an AR(1) with rho 0.9
//     (innovation sd 1), plus a step at t = 100 of 3 innovation sds in every column. A level model sees steps everywhere.
// Settings and seeds fixed before scoring, with eval/tcpd-multi-floor.mjs (its header holds the decision rule).
//
// usage: node eval/multi-floor-sim.mjs > eval/multi-floor-sim.out.txt   (seeded, deterministic)
import { multiPelt } from '../multivariate.mjs';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-300)) * Math.cos(2 * Math.PI * r());
const N = 200, AT = 100, REPS = 100;
const METHODS = {
  'plain': { model: 'mean' },
  'floor auto': { model: 'mean', floor: 'auto' },
  'floor 2': { model: 'mean', floor: 2 },
  'ar1': { model: 'mean', ar1: true },
};
const cell = (make, step, d, seedBase) => {
  const hit = {}, extra = {};
  for (const m in METHODS) { hit[m] = 0; extra[m] = 0; }
  for (let rep = 0; rep < REPS; rep++) {
    const r = rng(seedBase + rep + 1);
    const cols = Array.from({ length: d }, () => make(r, step));
    for (const [m, o] of Object.entries(METHODS)) {
      const cps = multiPelt(cols, o).changepoints;
      const near = cps.filter((c) => Math.abs(c - AT) <= 5);
      if (step > 0 && near.length) hit[m]++;
      extra[m] += cps.length - (step > 0 ? Math.min(1, near.length) : 0);
    }
  }
  return Object.keys(METHODS).map((m) => `${step > 0 ? `${hit[m]}%` : '  - '} / ${(extra[m] / REPS).toFixed(2)}`.padStart(16)).join('');
};
const head = `${'columns'.padEnd(9)}${'step'.padEnd(8)}${Object.keys(METHODS).map((m) => m.padStart(16)).join('')}`;
console.log(`n ${N}, step at ${AT} in every column, ${REPS} seeded series per cell.`);
console.log('Each cell: share of series with a change within 5 points of the step / mean number of other changes.');
console.log('');
console.log('(1) White noise, sd 1 (step in noise sds; seeds as eval/multi-sim.mjs)');
console.log(head);
const white = (r, step) => Array.from({ length: N }, (_, i) => gauss(r) + (i >= AT ? step : 0));
for (const d of [1, 2, 4, 8]) for (const step of [0, 0.5, 0.75, 1, 1.5]) console.log(`${String(d).padEnd(9)}${String(step).padEnd(8)}${cell(white, step, d, 1000 * d)}`);
console.log('');
for (const [title, gen] of [
  ['(2a) Random walk, innovation sd 1 (step in innovation sds)', (r, step) => { let x = 0; return Array.from({ length: N }, (_, i) => { x += gauss(r); return x + (i >= AT ? step : 0); }); }],
  ['(2b) AR(1), rho 0.9, innovation sd 1 (step in innovation sds)', (r, step) => { let x = gauss(r) / Math.sqrt(1 - 0.81); return Array.from({ length: N }, (_, i) => { x = 0.9 * x + gauss(r); return x + (i >= AT ? step : 0); }); }],
]) {
  console.log(title);
  console.log(head);
  for (const d of [1, 2, 4]) for (const step of [0, 3]) console.log(`${String(d).padEnd(9)}${String(step).padEnd(8)}${cell(gen, step, d, 50000 + 1000 * d)}`);
  console.log('');
}
