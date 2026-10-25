// Does the Laplace cost (`robust: true`) fix meanvar's false alarms on heavy-tailed noise, and what does it cost on Gaussian noise?
// Same generators, seeds and cells as meanvar-robustness.mjs (unit variance; no change, and an sd 1 -> 2 break at the midpoint).
// usage: node eval/meanvar-laplace.mjs [reps]   (seeded; same output every run)
import { analyze } from '../engine.mjs';
const reps = +process.argv[2] || 100;
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const chi2 = (r, k) => { let s = 0; for (let i = 0; i < k; i++) { const g = gauss(r); s += g * g; } return s; };
const med = (a) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.floor(b.length / 2)]; };
const pct = (k, n) => `${Math.round(100 * k / n)}%`;
const NOISE = {
  gauss: (r, n) => Array.from({ length: n }, () => gauss(r)),
  t3: (r, n) => Array.from({ length: n }, () => gauss(r) / Math.sqrt(chi2(r, 3) / 3) / Math.sqrt(3)),
  garch: (r, n) => { let h = 1; const o = []; for (let i = 0; i < n + 50; i++) { const e = Math.sqrt(h) * gauss(r); h = 0.1 + 0.2 * e * e + 0.7 * h; if (i >= 50) o.push(e); } return o; },
};
console.log(`reps ${reps} per cell, seeded, default minimum segment`);
for (const n of [100, 200]) {
  const truth = n / 2;
  console.log(`\nn = ${n}\nnoise, cost | null: any change | sd1->2: one change, median error, range holds`);
  for (const [name, gen] of Object.entries(NOISE)) for (const robust of [false, true]) {
    let any = 0, one = 0, held = 0; const err = [];
    for (let k = 0; k < reps; k++) {
      const v0 = gen(rng(5000 * n + 7 * k + 1), n);
      if (analyze({ values: v0, model: 'meanvar', robust }).pelt.changepoints.length) any++;
      const v = gen(rng(9000 * n + 7 * k + 3), n).map((x, i) => i < truth ? x : 2 * x);
      const cps = analyze({ values: v, model: 'meanvar', robust }).pelt.changepoints;
      if (cps.length === 1) { one++; err.push(Math.abs(cps[0].index - truth)); const g = cps[0].range95; if (g && g.fromIndex <= truth && truth <= g.toIndex) held++; }
    }
    console.log(`${name.padEnd(5)} ${robust ? 'laplace' : 'gauss  '} | ${pct(any, reps)} | ${pct(one, reps)}, ${med(err)}, ${one ? pct(held, one) : '-'}`);
  }
}
