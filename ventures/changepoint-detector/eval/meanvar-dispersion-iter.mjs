// Does a second dispersion round (re-estimate the factor on the refit's residuals, refit again) cut GARCH/t3 false alarms
// further than the single `--dispersion` pass? Same noise kinds and seeds as meanvar-dispersion.mjs.
// usage: node eval/meanvar-dispersion-iter.mjs [reps]   (seeded)
import { pelt, penaltyValue, squaredDispersion } from '../engine.mjs';
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
const fit = (v, rounds) => {
  const base = penaltyValue('bic', v.length, 'meanvar'), minSegment = 10;
  let p = pelt(v, { model: 'meanvar', penalty: base, minSegment });
  for (let i = 0; i < rounds; i++) {
    const f = squaredDispersion(v, p.changepoints); if (f <= 1.0001) break;
    p = pelt(v, { model: 'meanvar', penalty: f * base, minSegment });
  }
  return p.changepoints.length;
};
console.log(`reps ${reps} per cell, seeded\nn | noise | rounds 1: null any change / sd1->2 exactly one | rounds 2 | rounds 3`);
for (const n of [100, 200]) for (const [name, gen] of Object.entries(NOISE)) {
  const out = [];
  for (const rounds of [1, 2, 3]) {
    let any = 0, one = 0;
    for (let k = 0; k < reps; k++) {
      if (fit(gen(rng(5000 * n + 7 * k + 1), n), rounds)) any++;
      const v = gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < n / 2 ? x : 2 * x);
      if (fit(v, rounds) === 1) one++;
    }
    out.push(`${pct(any, reps)} / ${pct(one, reps)}`);
  }
  console.log(`${n} | ${name.padEnd(5)} | ${out.join(' | ')}`);
}
