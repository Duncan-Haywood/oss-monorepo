// Cuts searched jointly with a segment-wise GARCH(1,1) likelihood (README, "Pruning meanvar cuts with a segment-wise
// GARCH likelihood": the prune of plain meanvar cuts removed the true variance break, and "candidates searched jointly
// with the GARCH fit" was the open route).
//
// Same likelihood as eval/meanvar-garch-segments.mjs: each segment has its own mean and scale, and inside a segment the
// standardised residual follows a unit-variance GARCH(1,1) whose a and b are shared by all segments (the same grid).
// Instead of pruning meanvar's cuts, a greedy forward search adds, at each step, the one cut at any position (segments at
// least `minSeg` long) that raises the best-over-grid quasi-log-likelihood most, and stops when the best gain is under
// the penalty. Forward search is nested, so one run to the smallest penalty gives the answer at every larger one: the
// cut count at penalty p is the number of leading gains >= p.
//
// usage: node eval/meanvar-garch-binseg.mjs [reps] [seedShift] [pens, comma list of multiples of ln n]
// Seeds are those of meanvar-garch-segments.mjs, moved by seedShift (default 0, the in-sample seeds).
const reps = +process.argv[2] || 100;
const shift = +process.argv[3] || 0;
const PENS = (process.argv[4] || '1,1.5,2,2.5,3').split(',').map(Number);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
export const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
};
export { GARCH_GRID as GRID, garchSegLL as segLL, garchForward, garchCuts as garchChoose } from '../engine.mjs';

// cut count at penalty pen from a forward run: the leading gains that clear it
export const countAt = (gains, pen) => { let k = 0; while (k < gains.length && gains[k] >= pen) k++; return k; };

if (process.argv[1]?.endsWith('meanvar-garch-binseg.mjs')) {
  const lo = Math.min(...PENS);
  console.log(`reps ${reps} per cell, seed shift ${shift}, greedy forward search on the segment-wise GARCH likelihood, minSeg 10\n` +
    `per penalty (multiples of ln n): null any change / sd 1->2 exactly one / mean +1.5 exactly one`);
  console.log(`n | noise | ${PENS.map((p) => `pen ${p}`).join(' | ')}`);
  for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
    const ln = Math.log(n), tally = PENS.map(() => [0, 0, 0]);
    for (let k = 0; k < reps; k++) {
      const series = [
        gen(rng(5000 * n + 7 * k + 1 + shift), n),
        gen(rng(9000 * n + 7 * k + 3 + shift), n).map((x, i) => i < n / 2 ? x : 2 * x),
        gen(rng(13000 * n + 7 * k + 5 + shift), n).map((x, i) => i < n / 2 ? x : x + 1.5),
      ];
      series.forEach((v, j) => {
        const { gains } = garchForward(v, { minPen: lo * ln, maxCuts: j === 0 ? 1 : 2 });
        PENS.forEach((p, q) => { const c = countAt(gains, p * ln); if (j === 0 ? c > 0 : c === 1) tally[q][j]++; });
      });
    }
    console.log(`${n} | ${name.padEnd(5)} | ${tally.map((t) => t.map((v) => pct(v, reps)).join(' / ')).join(' | ')}`);
  }
}
