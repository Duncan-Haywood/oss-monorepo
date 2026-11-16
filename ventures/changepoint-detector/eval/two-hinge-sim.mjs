// Size, unit-root and power cells of eval/two-hinge-prereg-2026-11-16.md, seeds from 64,000,000 (a block of 100,000 per
// cell). usage: node eval/two-hinge-sim.mjs [series per cell=300] [bootstrap reps=99] [part=all|size|power] [only n]
// The optional n runs only that length's size cells (same seeds: the cell numbering is unchanged), to split across cores.
import { twoHingeTest } from '../two-hinge.mjs';
import { hingeTest } from '../hinge-test.mjs';
const [N = 300, REPS = 99] = process.argv.slice(2, 4).map(Number), part = process.argv[4] || 'all', onlyN = Number(process.argv[5]) || 0;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function series(n, rho, mean, seed) {
  const r = rng(seed), g = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const x = []; let u = rho < 1 ? g() / Math.sqrt(1 - rho * rho) : 0;
  for (let t = 0; t < n; t++) { if (t) u = rho * u + g(); x.push(mean(t) + u); }
  return x;
}
const line = (t) => 0.02 * t;
const plateau = (n, rise) => (t) => (t < n / 3 ? 0 : t < 2 * n / 3 ? rise * (t - n / 3) : rise * n / 3);
const out = (s) => console.log(s);
out(`series per cell ${N}, bootstrap reps ${REPS}; share of ALL series with p <= 0.05 (refused = not rejected)`);
let cell = 0;
const seedOf = (i) => 64e6 + cell * 1e5 + i;
if (part !== 'power') {
  for (const n of [40, 60, 95]) for (const [bar, rho] of [['S1', 0], ['S1', 0.3], ['S1', 0.6], ['S1', 0.8], ['S2', 0.9], ['S2', 0.95], ['S2', 1]]) {
    if (onlyN && n !== onlyN) { cell++; continue; }
    let rej = 0, ref = 0, cut = 0;
    for (let i = 0; i < N; i++) {
      const h = twoHingeTest(series(n, rho, line, seedOf(i)), { reps: REPS, seed: i + 1 });
      if (h.refused) ref++; else { if (h.admittedByCut) cut++; if (h.p <= 0.05) rej++; }
    }
    cell++;
    const pct = rej / N * 100;
    out(`${bar} n ${n} ${rho === 1 ? 'random walk' : `rho ${rho.toFixed(2)}`}`.padEnd(26) + `${pct.toFixed(1).padStart(5)}%  tested ${N - ref} (by the cut ${cut})  ${pct <= 8 ? 'holds' : 'FAILS'} (cap 8%)`);
  }
} else cell = 21;
if (part !== 'size') {
  for (const [name, n, rise, bar] of [['P plateau 0.25', 60, 0.25, true], ['reported: plateau 0.25', 95, 0.25, false], ['reported: plateau 0.15', 60, 0.15, false]]) {
    let two = 0, one = 0, t2 = 0, t1 = 0;
    for (let i = 0; i < N; i++) {
      const x = series(n, 0.5, plateau(n, rise), seedOf(i));
      const a = twoHingeTest(x, { reps: REPS, seed: i + 1 }), b = hingeTest(x, { reps: REPS, seed: i + 1 });
      if (!a.refused) { t2++; if (a.p <= 0.05) two++; }
      if (!b.refused) { t1++; if (b.p <= 0.05) one++; }
    }
    cell++;
    const d = (two - one) / N * 100;
    out(`${name}, n ${n}, rho 0.5`.padEnd(34) + `two hinges ${(two / N * 100).toFixed(1)}% (tested ${t2}), one hinge ${(one / N * 100).toFixed(1)}% (tested ${t1}), difference ${d.toFixed(1)} points${bar ? (d >= 10 ? '  holds (bar 10)' : '  FAILS (bar 10)') : ''}`);
  }
}
