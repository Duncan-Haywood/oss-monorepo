// Additive vs multiplicative season on the Gaussian path (README, "Multiplicative season").
// A quarterly or monthly (growth > 0 runs with --trend) series whose season is a factor on a growing level, with and without one real level step.
// usage: node eval/multiplicative-season.mjs [runs] [seed]
import { analyze } from '../engine.mjs';
const runs = +process.argv[2] || 200, seed0 = +process.argv[3] || 2026;
function rng(s) { let a = s >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const SEAS = { 4: [1.35, 1.0, 0.7, 0.95], 12: [1.3, 1.2, 1.1, 1.0, 0.95, 0.85, 0.7, 0.8, 0.95, 1.05, 1.15, 1.25] };
function series(m, n, growth, step, noise, r) {
  const f = SEAS[m], x = [];
  for (let t = 0; t < n; t++) { const lvl = 100 * Math.exp(growth * t) * (step && t >= n / 2 ? step : 1); x.push(lvl * f[t % m] * (1 + noise * gauss(r))); }
  return x;
}
for (const [m, n] of [[4, 120], [12, 144]]) for (const growth of [0, 0.005]) for (const step of [0, 1.3, 2]) {
  const row = { add: [0, 0, 0], mul: [0, 0, 0] };
  for (let i = 0; i < runs; i++) {
    const r = rng(seed0 + i), values = series(m, n, growth, step, 0.03, r);
    for (const [k, extra] of [['add', {}], ['mul', { seasonMode: 'multiplicative' }]]) {
      const cps = analyze({ values, period: m, ...(growth ? { trend: true } : {}), ...extra }).pelt.changepoints.map((c) => c.index ?? c.at ?? c.position);
      row[k][0] += cps.length;
      if (step) row[k][1] += cps.some((c) => Math.abs(c - n / 2) <= 3) ? 1 : 0;
      else row[k][1] += cps.length ? 1 : 0;
    }
  }
  const f = (a) => `${(a[0] / runs).toFixed(2)} steps/series, ${step ? 'step found' : 'any alarm'} ${a[1]}/${runs}`;
  console.log(`period ${m} n ${n} growth ${growth}/pt step ${step || 'none'} | additive: ${f(row.add)} | multiplicative: ${f(row.mul)}`);
}
