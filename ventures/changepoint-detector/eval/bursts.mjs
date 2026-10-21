// Does cutting isolated bursts back (--bursts) stop a spike being read as two changes?
// Seeded clumpy daily counts (negative binomial, weekly season), 200 points; usage: node eval/bursts.mjs
import { readFileSync } from 'node:fs';
import { analyze, findBursts } from '../engine.mjs';
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const gamma = (k) => { if (k < 1) return gamma(k + 1) * Math.pow(rnd(), 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { const x = gauss(), v = (1 + c * x) ** 3; if (v > 0 && Math.log(rnd()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; } };
const pois = (m) => { const L = Math.exp(-Math.min(m, 700)); let k = 0, p = 1; if (m > 50) return Math.max(0, Math.round(m + Math.sqrt(m) * gauss())); do { k++; p *= rnd(); } while (p > L); return k - 1; };
const nb = (m, size = 8) => pois(gamma(size) * m / size);
const season = [1.3, 1.2, 1.1, 1.0, 0.9, 0.6, 0.5];
const N = 200, RUNS = 40;
function series(step, nBursts) {
  const x = Array.from({ length: N }, (_, t) => nb(30 * season[t % 7] * (step && t >= 100 ? 1.8 : 1)));
  const at = [];
  while (at.length < nBursts) { const t = 5 + Math.floor(rnd() * (N - 10)); if (!at.some((a) => Math.abs(a - t) < 4)) at.push(t); }
  for (const t of at) x[t] = Math.round(x[t] * (2.5 + 3.5 * rnd()));
  return { x, at };
}
const near = (cps, t, w = 6) => cps.some((c) => Math.abs(c - t) <= w);
for (const [name, step, nb_] of [['no step, 4 bursts', false, 4], ['step 1.8x at 100, 4 bursts', true, 4], ['step 1.8x at 100, no bursts', true, 0]]) {
  const tot = { off: { ch: 0, hit: 0 }, on: { ch: 0, hit: 0 } };
  let flagged = 0, found = 0, planted = 0, wrong = 0;
  for (let r = 0; r < RUNS; r++) {
    const { x, at } = series(step, nb_);
    for (const [k, opt] of [['off', {}], ['on', { bursts: true }]]) {
      const o = analyze({ values: x, model: 'poisson', period: 7, overdispersion: 'nb', ...opt });
      const cps = o.pelt.changepoints.map((c) => c.index);
      tot[k].ch += cps.length; if (step && near(cps, 100)) tot[k].hit++;
      if (k === 'on') { const b = o.bursts.map((v) => v.index); flagged += b.length; found += at.filter((t) => b.includes(t)).length; planted += at.length; wrong += b.filter((i) => !at.includes(i)).length; }
    }
  }
  console.log(`${name}: changes/series ${(tot.off.ch / RUNS).toFixed(2)} -> ${(tot.on.ch / RUNS).toFixed(2)}${step ? `; step found ${tot.off.hit}/${RUNS} -> ${tot.on.hit}/${RUNS}` : ''}; bursts found ${found}/${planted}, other days flagged ${wrong} (${(wrong / RUNS).toFixed(2)}/series)`);
}
// real series
const rows = readFileSync(new URL('../data/payroll-views.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
for (const [name, opt] of [['off', {}], ['bursts', { bursts: true }], ['bursts 3x', { bursts: 3 }]]) {
  const o = analyze({ values, labels, model: 'poisson', period: 7, overdispersion: 'nb', ...opt });
  console.log(`Payroll views, ${name}: ${o.pelt.changepoints.length} changes${o.bursts ? `, ${o.bursts.length} bursts cut` : ''}`);
}
