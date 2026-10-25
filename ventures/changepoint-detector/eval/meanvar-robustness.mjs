// How does `--model meanvar` behave when the noise is not Gaussian? meanvar-min-segment.mjs covered Gaussian noise only.
// Noise kinds (all unit variance, so the "no change" truth is the same): gauss, t3 (heavy tails, scaled to sd 1),
// garch (volatility clustering: h = 0.1 + 0.2 e^2 + 0.7 h, so the variance wanders without any break), ar1 (x = 0.5 x' + e).
// Per kind and n: false-alarm share on a constant-variance series, and on a true sd 1 -> 2 break at the midpoint the share
// with exactly one change, the median dating error, and how often range95 holds the true index. Default minimum segment.
// usage: node eval/meanvar-robustness.mjs [reps]   (seeded; same output every run)
import { analyze } from '../engine.mjs';
const reps = +process.argv[2] || 200;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const med = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
  ar1: (r, n) => { let p = 0; const o = []; for (let i = 0; i < n + 50; i++) { p = 0.5 * p + gauss(r); if (i >= 50) o.push(p / Math.sqrt(1 / (1 - 0.25))); } return o; },
};
console.log(`reps ${reps} per cell, seeded, default minimum segment`);
for (const n of [100, 200]) {
  const truth = n / 2;
  console.log(`\nn = ${n}\nnoise | null: any change | sd1->2: one change, median error, range holds`);
  for (const [name, gen] of Object.entries(NOISE)) {
    let any = 0, one = 0, held = 0; const err = [];
    for (let k = 0; k < reps; k++) {
      const v0 = gen(rng(5000 * n + 7 * k + 1), n);
      if (analyze({ values: v0, model: 'meanvar' }).pelt.changepoints.length) any++;
      const v = gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < truth ? x : 2 * x);
      const cps = analyze({ values: v, model: 'meanvar' }).pelt.changepoints;
      if (cps.length === 1) { one++; err.push(Math.abs(cps[0].index - truth)); const g = cps[0].range95; if (g && g.fromIndex <= truth && truth <= g.toIndex) held++; }
    }
    console.log(`${name.padEnd(5)} | ${pct(any, reps)} | ${pct(one, reps)}, ${med(err)}, ${one ? pct(held, one) : '-'}`);
  }
}

// How often the noise warning (rangeWarning mentioning "variance model assumes") fires, on the same null and break series.
console.log('\nnoise warning rate (rangeWarning from meanvarNoiseCheck): null series | sd1->2 series');
for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
  let a = 0, b = 0;
  for (let k = 0; k < reps; k++) {
    const w = (v) => /variance model assumes/.test(analyze({ values: v, model: 'meanvar' }).rangeWarning || '');
    if (w(gen(rng(5000 * n + 7 * k + 1), n))) a++;
    if (w(gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : 2 * x))) b++;
  }
  console.log(`n=${n} ${name.padEnd(5)} | ${pct(a, reps)} | ${pct(b, reps)}`);
}
