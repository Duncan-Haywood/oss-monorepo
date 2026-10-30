// False alarms and detection of the Poisson model, plain vs --bootstrap, on iid counts and on clustered (runs of busy and quiet
// days: rate multiplied by an AR(1) log factor) counts (seeded, 100 series per cell, n = 200).
import { analyze } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const pois = (r, m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
const gen = (seed, n, sd, ratio) => { const r = rng(seed); let a = 0; return Array.from({ length: n }, (_, i) => { a = 0.8 * a + Math.sqrt(1 - 0.64) * gauss(r) * sd; return pois(r, 10 * Math.exp(a - sd * sd / 2) * (i >= n / 2 ? ratio : 1)); }); };
const N = 100;
console.log('counts, mean 10, n=200 | false alarms plain / bootstrap | detection (rate x1.5 at 100) plain / bootstrap');
for (const sd of [0, 0.2, 0.4]) {
  const c = { fa: [0, 0], det: [0, 0] };
  for (let k = 0; k < N; k++) {
    const a = gen(5000 + k, 200, sd, 1), b = gen(7000 + k, 200, sd, 1.5);
    [false, true].forEach((bs, j) => {
      if (analyze({ values: a, model: 'poisson', bootstrap: bs }).pelt.changepoints.length) c.fa[j]++;
      if (analyze({ values: b, model: 'poisson', bootstrap: bs }).pelt.changepoints.some((q) => Math.abs(q.index - 100) <= 10)) c.det[j]++;
    });
  }
  console.log(`log-rate AR(1) sd ${sd} | ${c.fa[0]}% / ${c.fa[1]}% | ${c.det[0]}% / ${c.det[1]}%`);
}
