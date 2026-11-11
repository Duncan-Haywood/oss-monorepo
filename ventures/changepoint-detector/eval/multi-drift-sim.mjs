// Where the joint drift fit should earn its place, and what it costs: d columns (d = 1, 2, 4),
// n 200, noise sd 1, each column's level a random walk with step sd omega (0 = white noise,
// 0.3 = wandering), and one step at t = 100 of the same size in every column (0 = no step).
// 60 seeded series per cell. Detected = a change within 5 points of 100.
//
// Written and fixed 2026-11-11 before multi-drift.mjs was run on any series here.
// Rule (the simulation half of eval/tcpd-multi-drift.mjs's rule): the joint drift fit (noise 'ml',
// (1 + d) log n) passes if (i) on wandering columns (omega 0.3) with no step it reports fewer other
// changes than the joint level default (floor auto) at every d, and (ii) on white noise (omega 0)
// with a step of 1 sd or more its hit rate is within 10 points of the joint level default at every d.
//
// usage: node eval/multi-drift-sim.mjs > eval/multi-drift-sim.out.txt   (seeded, deterministic)
import { multiPelt } from '../multivariate.mjs';
import { multiDriftChanges } from '../multi-drift.mjs';

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-300)) * Math.cos(2 * Math.PI * r());
const N = 200, AT = 100, REPS = 60;
const METHODS = {
  'joint level (floor auto)': (cols) => multiPelt(cols, { model: 'mean', floor: 'auto' }).changepoints,
  'joint drift (ml)': (cols) => multiDriftChanges(cols, { noise: 'ml' }).changepoints,
};
console.log(`n ${N}, noise sd 1, random-walk level step sd omega, a step at ${AT} in every column, ${REPS} seeded series per cell.`);
console.log('Each cell: share of series with a change within 5 points of the step / mean number of other changes.\n');
console.log(`${'d'.padEnd(4)}${'omega'.padEnd(7)}${'step'.padEnd(6)}${Object.keys(METHODS).map((m) => m.padStart(28)).join('')}`);
const out = {};
for (const d of [1, 2, 4]) for (const omega of [0, 0.3]) for (const step of [0, 1, 2, 3]) {
  const hit = {}, extra = {};
  for (const m in METHODS) { hit[m] = 0; extra[m] = 0; }
  for (let rep = 0; rep < REPS; rep++) {
    const r = rng(7919 * d + 104729 * Math.round(omega * 10) + 31 * step + rep + 1);
    const cols = Array.from({ length: d }, () => { let mu = 0; return Array.from({ length: N }, (_, i) => { if (i) mu += omega * gauss(r); return mu + gauss(r) + (i >= AT ? step : 0); }); });
    for (const [m, fn] of Object.entries(METHODS)) {
      const cps = fn(cols), near = cps.filter((c) => Math.abs(c - AT) <= 5);
      if (step > 0 && near.length) hit[m]++;
      extra[m] += cps.length - (step > 0 ? Math.min(1, near.length) : 0);
    }
  }
  out[`${d}/${omega}/${step}`] = Object.fromEntries(Object.keys(METHODS).map((m) => [m, { hit: (100 * hit[m]) / REPS, extra: extra[m] / REPS }]));
  console.log(`${String(d).padEnd(4)}${String(omega).padEnd(7)}${String(step).padEnd(6)}${Object.keys(METHODS).map((m) => `${step > 0 ? `${Math.round((100 * hit[m]) / REPS)}%` : '  - '} / ${(extra[m] / REPS).toFixed(2)}`.padStart(28)).join('')}`);
}
const L = 'joint level (floor auto)', D = 'joint drift (ml)';
const i = [1, 2, 4].every((d) => out[`${d}/0.3/0`][D].extra < out[`${d}/0.3/0`][L].extra);
const ii = [1, 2, 4].every((d) => [1, 2, 3].every((s) => out[`${d}/0/${s}`][D].hit >= out[`${d}/0/${s}`][L].hit - 10));
console.log(`\nRule: (i) fewer other changes on wandering columns with no step at every d: ${i ? 'yes' : 'no'}; (ii) white-noise hit rate within 10 points at every d and step >= 1: ${ii ? 'yes' : 'no'}. ${i && ii ? 'Passes.' : 'Fails.'}`);
