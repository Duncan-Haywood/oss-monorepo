// GARCH(1,1) filter before meanvar: fit omega, alpha, beta by Gaussian quasi-ML on the series less its median, divide the series
// by the fitted conditional sd, then run the plain meanvar PELT. Does it cut false alarms on clustered volatility (open item in
// README) without losing a true sd 1 -> 2 break or a 1.5 sd mean shift? Same noise kinds and seeds as meanvar-dispersion.mjs.
// usage: node eval/meanvar-garch-filter.mjs [reps]   (seeded)
import { analyze } from '../engine.mjs';
import { garchSigma } from '../engine.mjs';
const reps = +process.argv[2] || 200;
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
const filt = (v) => { const s = garchSigma(v); return v.map((c, i) => c / s[i]); };
console.log(`reps ${reps} per cell, seeded, default minimum segment\nn | noise | plain: null any change, sd1->2 exactly one, mean+1.5 exactly one | garch filter: same three`);
for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
  const out = [];
  for (const g of [false, true]) {
    let any = 0, one = 0, mean = 0;
    const run = (v) => analyze({ values: g ? filt(v) : v, model: 'meanvar' }).pelt.changepoints.length;
    for (let k = 0; k < reps; k++) {
      if (run(gen(rng(5000 * n + 7 * k + 1), n))) any++;
      if (run(gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : 2 * x)) === 1) one++;
      if (run(gen(rng(13000 * n + 7 * k + 5), n).map((x, i) => i < n / 2 ? x : x + 1.5)) === 1) mean++;
    }
    out.push(`${pct(any, reps)} / ${pct(one, reps)} / ${pct(mean, reps)}`);
  }
  console.log(`${n} | ${name.padEnd(5)} | ${out.join(' | ')}`);
}
