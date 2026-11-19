// Pre-registered in eval/poisson-window.prereg.md: bocpd vs bocpd-window for watched daily counts.
//   node eval/poisson-window.mjs > eval/poisson-window.out.txt
import { replayWatch } from '../watch-core.mjs';

const lcg = (seed) => { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; }; };
const poisson = (u, lam) => { let k = 0, p = Math.exp(-lam), c = p; const x = u(); while (x > c) { k++; p *= lam / k; c += p; } return k; };
// Gamma(shape k, scale) by Marsaglia-Tsang (k >= 1), for a negative binomial as a Gamma-Poisson mixture.
const normal = (u) => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
const gamma = (u, k, scale) => { const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { let x, v; do { x = normal(u); v = 1 + c * x; } while (v <= 0); v = v ** 3; if (Math.log(u()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v * scale; } };
// variance = mean * f  ->  Gamma shape mean/(f-1), scale f-1
const nb = (u, mean, f) => poisson(u, gamma(u, mean / (f - 1), f - 1));

const N = 120, FROM = 90, AT = 108, SEEDS = Array.from({ length: 20 }, (_, i) => 101 + i);
const CELLS = [
  { key: 'N1', what: 'Poisson 30', gen: (u, i) => poisson(u, 30) },
  { key: 'N2', what: 'NB 30, var 60', gen: (u, i) => nb(u, 30, 2) },
  { key: 'N3', what: 'Poisson 30, weekends 0.6x', gen: (u, i) => poisson(u, i % 7 >= 5 ? 18 : 30) },
  { key: 'N4', what: 'Poisson 5', gen: (u, i) => poisson(u, 5) },
  { key: 'S1', what: '30 -> 15', step: true, gen: (u, i) => poisson(u, i < AT ? 30 : 15) },
  { key: 'S2', what: '30 -> 21', step: true, gen: (u, i) => poisson(u, i < AT ? 30 : 21) },
  { key: 'S3', what: '30 -> 45', step: true, gen: (u, i) => poisson(u, i < AT ? 30 : 45) },
  { key: 'S4', what: '5 -> 2', step: true, gen: (u, i) => poisson(u, i < AT ? 5 : 2) },
  { key: 'S5', what: 'NB 30 -> 18', step: true, gen: (u, i) => nb(u, i < AT ? 30 : 18, 2) },
];
const DETS = ['bocpd', 'bocpd-window'];
const res = {};
for (const det of DETS) for (const c of CELLS) {
  let alerts = 0, checks = 0, found = 0; const delays = [];
  for (const seed of SEEDS) {
    const u = lcg(seed * 2654435761 + c.key.charCodeAt(1) * 97);
    const v = Array.from({ length: N }, (_, i) => c.gen(u, i));
    const r = replayWatch(v, null, { model: 'poisson', detector: det, from: FROM, budget: Infinity });
    checks += r.checks; alerts += r.alerts.length;
    if (c.step) { const hit = r.alerts.find((a) => Math.abs(a.index - AT) <= 3); if (hit) { found++; delays.push(hit.reportedAt - AT); } }
  }
  const med = delays.length ? delays.sort((a, b) => a - b)[Math.floor(delays.length / 2)] : null;
  res[`${det}|${c.key}`] = { rate: (1000 * alerts) / checks, found, med };
}
console.log(`replayWatch, model poisson, ${N} points, checks from ${FROM}, seeds ${SEEDS[0]}-${SEEDS.at(-1)}; steps at ${AT}`);
console.log(['detector', ...CELLS.map((c) => `${c.key} ${c.what}`)].join(' | '));
for (const det of DETS) console.log([det, ...CELLS.map((c) => { const x = res[`${det}|${c.key}`]; return c.step ? `${x.found}/20 (median delay ${x.med ?? '-'})` : x.rate.toFixed(2); })].join(' | '));
const nulls = CELLS.filter((c) => !c.step), steps = CELLS.filter((c) => c.step);
const meanFalse = (d) => nulls.reduce((t, c) => t + res[`${d}|${c.key}`].rate, 0) / nulls.length;
const totalFound = (d) => steps.reduce((t, c) => t + res[`${d}|${c.key}`].found, 0);
const [a, b] = DETS;
console.log(`mean false alerts per 1,000 checks: ${a} ${meanFalse(a).toFixed(2)}, ${b} ${meanFalse(b).toFixed(2)}`);
console.log(`steps found of 100: ${a} ${totalFound(a)}, ${b} ${totalFound(b)}`);
const pass = meanFalse(b) <= meanFalse(a) && totalFound(b) > totalFound(a);
console.log(`rule (a) false alerts at or below: ${meanFalse(b) <= meanFalse(a) ? 'pass' : 'FAIL'}; (b) more steps: ${totalFound(b) > totalFound(a) ? 'pass' : 'FAIL'} -> ${pass ? 'switch the poisson default to bocpd-window' : 'keep bocpd'}`);
