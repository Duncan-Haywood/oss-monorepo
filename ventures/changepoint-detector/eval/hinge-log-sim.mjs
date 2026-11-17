// Size of the shipped hinge test (guard 'cut') at n 40, as pre-registered in eval/hinge-log-prereg-2026-11-15.md
// (bars S1, S2), on fresh seeds from 63,000,000. On logs the test is this same procedure applied to log x, so these
// cells are its size for a 40-point growth series whose log is a line plus AR(1). Synthetic only.
// usage: node eval/hinge-log-sim.mjs [series per cell=300] [bootstrap reps=99] [n=40]
import { hingeTest } from '../hinge-test.mjs';
const [N = 300, REPS = 99, n = 40] = process.argv.slice(2).map(Number);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
// rho 1 is a random walk with drift 0.02 (sd 1 innovations, started at 0); the same generator as hinge-cut-guard-sim.mjs
function series(rho, seed) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const x = []; let u = rho < 1 ? g() / Math.sqrt(1 - rho * rho) : 0;
  for (let t = 0; t < n; t++) { if (t) u = rho * u + g(); x.push(0.02 * t + u); }
  return x;
}
const out = (s) => console.log(s);
out(`n ${n}, series per cell ${N}, bootstrap reps ${REPS}, guard cut; share of ALL series with p <= 0.05 (refused = not rejected)`);
let base = 63e6;
for (const [bar, rho] of [['S1', 0], ['S1', 0.3], ['S1', 0.6], ['S1', 0.8], ['S2', 0.9], ['S2', 0.95], ['S2', 1]]) {
  let rej = 0, ref = 0, cut = 0;
  for (let i = 0; i < N; i++) {
    const h = hingeTest(series(rho, base + i), { reps: REPS, seed: i + 1 });
    if (h.refused) ref++; else { if (h.admittedByCut) cut++; if (h.p <= 0.05) rej++; }
  }
  base += 1e5;
  const pct = rej / N * 100;
  out(`${bar} ${rho === 1 ? 'random walk' : `rho ${rho.toFixed(2)}`}`.padEnd(20) + `${pct.toFixed(1).padStart(5)}%  tested ${N - ref} (by the cut ${cut})  ${pct <= 8 ? 'holds' : 'FAILS'} (cap 8%)`);
}
