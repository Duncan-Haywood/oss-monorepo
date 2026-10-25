// Does the Bayesian view (bocpd, meanvar) false-alarm on heavy-tailed noise, as PELT's Gaussian cost does
// (meanvar-robustness.mjs)? Share of constant-variance series with any Bayesian detection above 0.5, and on a
// true sd 1 -> 2 break at the midpoint, and on a mean shift of 1.5 sd, the share with a detection within 3 points of it.
// Each cell is run with and without the robust option (clipped Bayesian input). Seeded.
// usage: node eval/meanvar-bayes-tails.mjs [reps]
import { analyze } from '../engine.mjs';
const reps = +process.argv[2] || 200;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
};
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
console.log(`reps ${reps} per cell, seeded`);
for (const robust of [false, true]) for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
  let fa = 0, hit = 0, shift = 0;
  const near = (v) => analyze({ values: v, model: 'meanvar', robust }).bocpd.detections.some((d) => Math.abs(d.index - n / 2) <= 3);
  for (let k = 0; k < reps; k++) {
    if (analyze({ values: gen(rng(5000 * n + 7 * k + 1), n), model: 'meanvar', robust }).bocpd.detections.length) fa++;
    if (near(gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : 2 * x))) hit++;
    if (near(gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : x + 1.5))) shift++;
  }
  console.log(`robust=${robust} n=${n} ${name.padEnd(5)} | null false alarm ${pct(fa, reps)} | sd1->2 found ${pct(hit, reps)} | mean +1.5 found ${pct(shift, reps)}`);
}
