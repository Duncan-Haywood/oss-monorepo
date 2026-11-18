// Synthetic benchmark: the optimiser against first-fit decreasing and the LP
// lower bound on 200 random schedules for one bar size, cut from 12 m stock.
// Lengths are multiples of 25 mm between 600 and 11,000 mm (bars, L-bars,
// links), 4 to 25 distinct lengths, 2 to 60 of each. These are generated
// schedules, not real ones: they say how the method behaves, not what a real
// job saves. Run: node check/benchmark.mjs  (seeded; prints the same numbers)
import { planCutting } from '../stock.mjs';

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const r = rng(8666);
const L = 12000;
let proven = 0, ffdExtra = 0, ffdWorseCases = 0, optSteel = 0, ffdSteel = 0, need = 0, maxGapBars = 0, worstMs = 0;
const N = 200;
for (let t = 0; t < N; t++) {
  const m = 4 + Math.floor(r() * 22);
  const pieces = [];
  for (let i = 0; i < m; i++) {
    const kind = r();
    const len = kind < 0.4 ? 600 + r() * 1800 : kind < 0.8 ? 2400 + r() * 4600 : 7000 + r() * 4000;
    pieces.push({ length: 25 * Math.round(len / 25), count: 2 + Math.floor(r() * 59) });
  }
  const t0 = performance.now();
  const p = planCutting(pieces, [{ length: L }]);
  worstMs = Math.max(worstMs, performance.now() - t0);
  if (p.proven) proven++;
  maxGapBars = Math.max(maxGapBars, (p.cost - p.lowerBound) / L);
  if (p.firstFit.bars > p.bars) ffdWorseCases++;
  ffdExtra += p.firstFit.bars - p.bars;
  optSteel += p.bought; ffdSteel += p.firstFit.bars * L; need += p.needed;
}
const pct = x => (100 * x).toFixed(2);
console.log(`schedules: ${N}, stock ${L} mm, seed 8666`);
console.log(`proven optimal (plan meets the rounded LP bound): ${proven} of ${N}; largest gap to the bound: ${maxGapBars} bar(s)`);
console.log(`first-fit decreasing bought more bars in ${ffdWorseCases} of ${N}; ${ffdExtra} extra 12 m bars in all`);
console.log(`waste (bought - needed) as a share of steel bought: optimiser ${pct((optSteel - need) / optSteel)}%, first-fit decreasing ${pct((ffdSteel - need) / ffdSteel)}%`);
console.log(`steel bought: first-fit decreasing ${pct(ffdSteel / optSteel - 1)}% more than the optimiser`);
console.log(`slowest schedule: ${Math.round(worstMs)} ms`);
