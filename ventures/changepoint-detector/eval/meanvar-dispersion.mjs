// `--dispersion` for meanvar: does scaling the penalty by the squared residuals' dispersion cut false alarms on heavy tails and
// clustered volatility without costing detection of a true sd 1 -> 2 break? Same noise kinds and seeds as meanvar-robustness.mjs.
// Noise kinds: gauss, t3, garch, ar1 (as in meanvar-robustness.mjs).
// usage: node eval/meanvar-dispersion.mjs [reps]   (seeded)
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
console.log(`reps ${reps} per cell, seeded, default minimum segment\nn | noise | plain: null any change, sd1->2 exactly one | --dispersion: same two`);
for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
  const out = [];
  for (const dispersion of [false, true]) {
    let any = 0, one = 0;
    for (let k = 0; k < reps; k++) {
      if (analyze({ values: gen(rng(5000 * n + 7 * k + 1), n), model: 'meanvar', dispersion }).pelt.changepoints.length) any++;
      const v = gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : 2 * x);
      if (analyze({ values: v, model: 'meanvar', dispersion }).pelt.changepoints.length === 1) one++;
    }
    out.push(`${pct(any, reps)} / ${pct(one, reps)}`);
  }
  console.log(`${n} | ${name.padEnd(5)} | ${out.join(' | ')}`);
}
