// Does the Poisson --bootstrap penalty still hold when combined with --trend, a weekly season or --overdispersion nb?
// Counts mean 10 at the start, n = 210, log-rate AR(1) factor (rho 0.8) sd 0.2 or 0.4; optional steady growth 0.3%/day and weekly
// season (x0.6 on two days). Seeded, 100 series per cell. False alarms = any changepoint on a series with no step;
// detection = a changepoint within 10 of day 105 when the rate steps x1.5 there.
import { analyze } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const pois = (r, m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
const N = 100, n = 210;
const gen = (seed, sd, ratio, grow, season) => { const r = rng(seed); let a = 0; return Array.from({ length: n }, (_, i) => { a = 0.8 * a + 0.6 * gauss(r) * sd; return pois(r, 10 * Math.exp(a - sd * sd / 2) * (i >= n / 2 ? ratio : 1) * Math.exp(grow * i) * (season && i % 7 >= 5 ? 0.6 : 1)); }); };
const cells = [
  ['trend', { trend: true }, 0.003, false],
  ['weekly season', { period: 7 }, 0, true],
  ['trend + season', { trend: true, period: 7 }, 0.003, true],
  ['trend + nb', { trend: true, overdispersion: 'nb' }, 0.003, false],
];
console.log('counts, n=210 | false alarms plain / bootstrap | detection (x1.5 at 105) plain / bootstrap');
for (const sd of [0, 0.2, 0.4]) for (const [name, opt, grow, season] of cells) {
  const c = { fa: [0, 0], det: [0, 0] };
  for (let k = 0; k < N; k++) {
    const a = gen(5000 + k, sd, 1, grow, season), b = gen(7000 + k, sd, 1.5, grow, season);
    [false, true].forEach((bs, j) => {
      try {
        if (analyze({ values: a, model: 'poisson', bootstrap: bs, ...opt }).pelt.changepoints.length) c.fa[j]++;
        if (analyze({ values: b, model: 'poisson', bootstrap: bs, ...opt }).pelt.changepoints.some((q) => Math.abs(q.index - 105) <= 10)) c.det[j]++;
      } catch (e) { c.err = e.message; }
    });
  }
  console.log(`sd ${sd} ${name} | ${c.fa[0]}% / ${c.fa[1]}% | ${c.det[0]}% / ${c.det[1]}%${c.err ? ' ERR ' + c.err : ''}`);
}
