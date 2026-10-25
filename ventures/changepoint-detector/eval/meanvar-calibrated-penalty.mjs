// Can meanvar's penalty be scaled by how much the noise inflates the variance-change statistic, instead of switching noise model?
// Under a Gaussian variance-change test the squared standardised residuals have variance 2; their long-run variance (Bartlett kernel)
// divided by 2 is the factor c, and the BIC penalty is multiplied by max(1, c). Variant A standardises by the first-pass segments,
// variant B by segments from a 3x BIC pass. Same generators, seeds and cells as meanvar-laplace.mjs (plus AR(1) rho 0.5).
// usage: node eval/meanvar-calibrated-penalty.mjs [reps]   (seeded; same output every run). Result: README, "A calibrated penalty".
import { pelt, penaltyValue } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
  ar1: (r, n) => { let p = 0; const o = []; const s = Math.sqrt(1 - .25); for (let i = 0; i < n + 50; i++) { p = .5 * p + s * gauss(r); if (i >= 50) o.push(p); } return o; },
};
function inflation(x, cps) {
  const b = [0, ...cps, x.length]; const w = [];
  for (let s = 0; s < b.length - 1; s++) { const seg = x.slice(b[s], b[s + 1]); const m = seg.reduce((a, c) => a + c, 0) / seg.length; const sd = Math.sqrt(seg.reduce((a, c) => a + (c - m) ** 2, 0) / seg.length) || 1; for (const c of seg) w.push(((c - m) / sd) ** 2); }
  const n = w.length, mu = w.reduce((a, c) => a + c, 0) / n, d = w.map((c) => c - mu);
  const L = Math.floor(4 * (n / 100) ** (2 / 9));
  let v = d.reduce((a, c) => a + c * c, 0) / n;
  for (let l = 1; l <= L; l++) { let g = 0; for (let i = l; i < n; i++) g += d[i] * d[i - l]; v += 2 * (1 - l / (L + 1)) * g / n; }
  return Math.max(1, v / 2);
}
function fit(x, cal) {  // cal: false | 'A' | 'B'
  const p = pelt(x, { model: 'meanvar', minSegment: 10 });
  if (!cal || !p.changepoints.length) return p.changepoints;
  const ref = cal === 'B' ? pelt(x, { model: 'meanvar', minSegment: 10, penalty: 3 * penaltyValue('bic', x.length, 'meanvar') }) : p;
  const c = inflation(x, ref.changepoints);
  return pelt(x, { model: 'meanvar', minSegment: 10, penalty: c * penaltyValue('bic', x.length, 'meanvar') }).changepoints;
}
const reps = +process.argv[2] || 100;
for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) for (const cal of [false, 'A', 'B']) {
  let any = 0, one = 0;
  for (let k = 0; k < reps; k++) {
    if (fit(gen(rng(5000 * n + 7 * k + 1), n), cal).length) any++;
    const v = gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : 2 * x);
    const c = fit(v, cal); if (c.length === 1 && Math.abs(c[0] - n / 2) <= 15) one++;
  }
  console.log(`n=${n}`, name.padEnd(5), cal || 'raw', `| no change, any alarm: ${any}% | sd 1->2 break, exactly one change within 15 points: ${one}%`);
}
