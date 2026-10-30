// Missed holidays: the data has every holiday (x0.3 every 28th day from day 14) but the engine is told only some of them
// (all / every other one / none). Does the Poisson --bootstrap penalty still cut false alarms, and what does a missed holiday cost?
// Counts mean 10 at the start, n = 210, log-rate AR(1) factor (rho 0.8) sd 0 / 0.2 / 0.4. Every 28th day from day 14 is a
// holiday at x0.3 of the rate, given to the engine as 1-based row numbers. Optional weekly season (x0.6 on two days).
// Seeded, 100 series per cell. False alarms = any changepoint on a series with no step; detection = a changepoint within 10
// of day 105 when the rate steps x1.5 there.
import { analyze } from '../engine.mjs';
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(r() || 1e-12)) * Math.cos(2 * Math.PI * r());
const pois = (r, m) => { const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= r(); } while (p > L); return k - 1; };
const N = 100, n = 210;
const hol = []; for (let i = 14; i < n; i += 28) hol.push(i);
const gen = (seed, sd, ratio, season) => { const r = rng(seed); let a = 0; return Array.from({ length: n }, (_, i) => { a = 0.8 * a + 0.6 * gauss(r) * sd; return pois(r, 10 * Math.exp(a - sd * sd / 2) * (i >= n / 2 ? ratio : 1) * (season && i % 7 >= 5 ? 0.6 : 1) * (hol.includes(i) ? 0.3 : 1)); }); };
const cells = [['all holidays given', 1], ['every other given', 2], ['none given', 0]];
console.log('counts with holidays, n=210 | false alarms plain / bootstrap | detection (x1.5 at 105) plain / bootstrap');
for (const sd of [0, 0.2, 0.4]) for (const [name, every] of cells) {
  const c = { fa: [0, 0], det: [0, 0] };
  for (let k = 0; k < N; k++) {
    const a = gen(5000 + k, sd, 1, false), b = gen(7000 + k, sd, 1.5, false);
    [false, true].forEach((bs, j) => {
      try {
        const o = { model: 'poisson', bootstrap: bs, holidays: hol.filter((_, i) => every && i % every === 0).map((h) => String(h + 1)) };
        if (analyze({ values: a, ...o }).pelt.changepoints.length) c.fa[j]++;
        if (analyze({ values: b, ...o }).pelt.changepoints.some((q) => Math.abs(q.index - 105) <= 10)) c.det[j]++;
      } catch (e) { c.err = e.message; }
    });
  }
  console.log(`sd ${sd} ${name} | ${c.fa[0]}% / ${c.fa[1]}% | ${c.det[0]}% / ${c.det[1]}%${c.err ? ' ERR ' + c.err : ''}`);
}
