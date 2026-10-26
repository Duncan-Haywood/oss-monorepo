// Block-bootstrap penalty for meanvar: resample the segment-standardised residuals in blocks (which keeps volatility clustering
// and short memory), take the 95th percentile of the best single-split cost drop across resamples, and use the larger of that
// and the BIC penalty. Variant A standardises by a BIC pass, B by a 3x BIC pass. Same generators and seeds as meanvar-dispersion.mjs.
// usage: node eval/meanvar-block-bootstrap.mjs [reps] [resamples]   (seeded)
import { pelt, penaltyValue, makeCost } from '../engine.mjs';
const reps = +process.argv[2] || 100, B = +process.argv[3] || 100;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
  ar1: (r, n) => { let p = 0; const o = []; for (let i = 0; i < n + 50; i++) { p = 0.5 * p + gauss(r); if (i >= 50) o.push(p / Math.sqrt(1 / (1 - 0.25))); } return o; },
};
const MS = 10;
function standardise(x, cps) {
  const b = [0, ...cps, x.length], z = [];
  for (let s = 0; s < b.length - 1; s++) {
    const seg = x.slice(b[s], b[s + 1]); const m = seg.reduce((a, c) => a + c, 0) / seg.length;
    const sd = Math.sqrt(seg.reduce((a, c) => a + (c - m) ** 2, 0) / seg.length) || 1;
    for (const c of seg) z.push((c - m) / sd);
  }
  return z;
}
function bestSplit(x) {
  const n = x.length, c = makeCost(x, 'meanvar'); const whole = c(0, n); let g = 0;
  for (let s = MS; s <= n - MS; s++) g = Math.max(g, whole - c(0, s) - c(s, n));
  return g;
}
function bootPenalty(x, mult, rr) {
  const n = x.length, bic = penaltyValue('bic', n, 'meanvar');
  const z = standardise(x, pelt(x, { model: 'meanvar', penalty: mult * bic, minSegment: MS }).changepoints);
  const L = Math.ceil(2 * Math.cbrt(n)), gains = [];
  for (let b = 0; b < B; b++) {
    const y = []; while (y.length < n) { const s = Math.floor(rr() * (n - L + 1)); for (let i = 0; i < L; i++) y.push(z[s + i]); }
    gains.push(bestSplit(y.slice(0, n)));
  }
  gains.sort((a, c) => a - c);
  return Math.max(bic, gains[Math.floor(0.95 * (B - 1))]);
}
console.log(`reps ${reps}, ${B} resamples\nn | noise | variant: null any change / sd1->2 exactly one`);
for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
  const res = {};
  for (const v of ['plain', 'A', 'B']) {
    let any = 0, one = 0;
    const run = (x, k) => {
      const pen = v === 'plain' ? 'bic' : bootPenalty(x, v === 'A' ? 1 : 3, rng(31 * k + 5));
      return pelt(x, { model: 'meanvar', penalty: pen, minSegment: MS }).changepoints.length;
    };
    for (let k = 0; k < reps; k++) {
      if (run(gen(rng(5000 * n + 7 * k + 1), n), k)) any++;
      if (run(gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : 2 * x), k) === 1) one++;
    }
    res[v] = `${pct(any, reps)} / ${pct(one, reps)}`;
  }
  console.log(`${n} | ${name.padEnd(5)} | plain ${res.plain} | A ${res.A} | B ${res.B}`);
}
