// After round 5's confirmatory run (not pre-registered; a diagnosis): the n 60 rho 0.9 cell, reported without a bar,
// rejected 23.6% of the series it tested. This replays round 5's sticky null cells on the same seeds (base 25000) and
// splits the tested series by how they got past the guard: the full-model and line checks, or only the random-walk
// cut (the step and slope change cut the line residuals' stickiness more than 99% of walks). node eval/known-date-cut-admitted.mjs
import { knownDateTest } from '../known-date.mjs';
function mulberry(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const BASE = 25000, S = 400;
let allCut = 0, allCutRej = 0;
console.log('# round 5 sticky null cells, seed base 25000 (eval/known-date-sim-round5.out.txt), split by how the series passed the guard');
for (const [n, rho, frac] of [[40, 0.8, 0.5], [40, 0.8, 0.8], [60, 0.8, 0.5], [60, 0.9, 0.5], [40, 0.9, 0.5], [120, 0.8, 0.5], [120, 0.8, 0.8], [120, 0.9, 0.5]]) {
  const r = mulberry(BASE + Math.round(n * 7 + rho * 100 + frac * 10)), k = Math.round(n * frac);
  let tested = 0, rej = 0, cut = 0, cutRej = 0;
  for (let s = 0; s < S; s++) {
    const x = []; let u = gauss(r) / Math.sqrt(1 - rho * rho);
    for (let t = 0; t < n; t++) { if (t) u = rho * u + gauss(r); x.push(0.05 * t + u); }
    const h = knownDateTest(x, k, { reps: 199, seed: BASE + s + 1, rhoGenMethod: 'gated', genCap: 0.95, guard: 'cut' });
    if (h.refused) continue;
    tested++; if (h.p <= 0.05) rej++;
    if (h.admittedByCut) { cut++; if (h.p <= 0.05) cutRej++; }
  }
  allCut += cut; allCutRej += cutRej;
  const pc = (a, b) => (b ? (100 * a / b).toFixed(1) : '-').padStart(5);
  console.log(`null n ${String(n).padStart(3)} rho ${rho} date ${frac * 100}%: tested ${tested}, rejected ${pc(rej, tested)}%; passed by the line checks ${tested - cut}, rejected ${pc(rej - cutRej, tested - cut)}%; passed only by the cut ${cut}, rejected ${cutRej}`);
}
console.log(`all: ${allCutRej} of ${allCut} series passed only by the cut were rejected at p <= 0.05`);
