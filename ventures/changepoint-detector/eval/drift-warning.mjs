// False-alarm rate of `driftWarning` (engine.mjs) on simulated seasonal series, with `drift: true`.
// Cells: a fixed seasonal profile with no change, with real level steps far apart, with three real steps packed
// inside two cycles (a warning there is arguable), and with an amplitude that really grows (the warning should fire).
// Seeded; all series made up here. usage: node eval/drift-warning.mjs [reps=100]
import { analyze } from '../engine.mjs';
const reps = +process.argv[2] || 100;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
function series(seed, n, period, { steps = [], grow = 0, swing = 4 }) {
  const r = rng(seed), out = [];
  for (let t = 0; t < n; t++) {
    const level = 100 + steps.reduce((a, [at, d]) => a + (t >= at ? d : 0), 0);
    const amp = swing * (1 + grow * t / n);
    out.push(level + amp * Math.sin(2 * Math.PI * t / period) + gauss(r));
  }
  return out;
}
const cells = [];
for (const [period, n] of [[4, 120], [12, 144]]) {
  const c = (p) => Math.round(n * p);
  cells.push([`P${period} n${n} no change`, period, n, {}]);
  cells.push([`P${period} n${n} 2 steps far apart`, period, n, { steps: [[c(0.3), 5], [c(0.7), -5]] }]);
  cells.push([`P${period} n${n} 3 steps in 2 cycles`, period, n, { steps: [[c(0.4), 4], [c(0.4) + period, 4], [c(0.4) + 2 * period - 1, 4]] }]);
  cells.push([`P${period} n${n} amplitude x3 over series`, period, n, { grow: 2 }]);
}
console.log(`reps ${reps}, drift: true, mean model, noise sd 1, swing 4`);
for (const [name, period, n, spec] of cells) {
  let warn = 0, steps = 0; const alt = [0, 0, 0];
  for (let i = 0; i < reps; i++) {
    const values = series(9000 + i, n, period, spec);
    const a = analyze({ values, period, drift: true });
    steps += a.pelt.changepoints.length;
    if (a.driftWarning) warn++;
    // alternative windows on the same change points: 2 cycles (shipped), one cycle plus 3 points, one cycle
    const cp = a.pelt.changepoints.map((c) => c.index);
    [2 * period, period + 3, period].forEach((w, j) => { if (cp.some((c, q) => q + 2 < cp.length && cp[q + 2] - c <= w)) alt[j]++; });
  }
  console.log(`${name.padEnd(36)} warning ${String(warn).padStart(3)}/${reps}  steps/series ${(steps / reps).toFixed(2)}  window 2P/P+3/P: ${alt.join('/')}`);
}
