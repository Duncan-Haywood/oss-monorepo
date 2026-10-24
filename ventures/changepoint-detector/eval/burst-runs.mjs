// Does the short-run rule (burstRuns: 2 to 5 day plateaus) cut runs a single-day rule misses, without flagging steps?
// Seeded clumpy daily counts, weekly season, 200 points; usage: node eval/burst-runs.mjs
import { readFileSync } from 'node:fs';
import { analyze, findBursts } from '../engine.mjs';
let seed = 12345;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const gamma = (k) => { if (k < 1) return gamma(k + 1) * Math.pow(rnd(), 1 / k); const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d); for (;;) { const x = gauss(), v = (1 + c * x) ** 3; if (v > 0 && Math.log(rnd()) < 0.5 * x * x + d - d * v + d * Math.log(v)) return d * v; } };
const pois = (m) => { const L = Math.exp(-Math.min(m, 700)); let k = 0, p = 1; if (m > 50) return Math.max(0, Math.round(m + Math.sqrt(m) * gauss())); do { k++; p *= rnd(); } while (p > L); return k - 1; };
const nb = (m, size = 8) => pois(gamma(size) * m / size);
const season = [1.3, 1.2, 1.1, 1.0, 0.9, 0.6, 0.5];
const N = 200, RUNS = +(process.env.RUNS || 40);
function series(step, nRuns) {
  const x = Array.from({ length: N }, (_, t) => nb(30 * season[t % 7] * (step && t >= 100 ? 1.8 : 1)));
  const at = [];
  while (at.length < nRuns) { const t = 5 + Math.floor(rnd() * (N - 15)); if (Math.abs(t - 100) > 8 && !at.some((a) => Math.abs(a.t - t) < 12)) at.push({ t, len: 2 + Math.floor(rnd() * 4), f: 1.8 + 1.2 * rnd() }); }
  for (const { t, len, f } of at) for (let i = t; i < t + len; i++) x[i] = Math.round(x[i] * f);
  return { x, at };
}
const near = (cps, t, w = 6) => cps.some((c) => Math.abs(c - t) <= w);
for (const [name, step, nr] of [['no step, 4 runs', false, 4], ['step 1.8x at 100, 4 runs', true, 4], ['step 1.8x at 100, no runs', true, 0], ['no step, no runs', false, 0]]) {
  const res = {};
  for (const r of [0, 5]) res[r] = { ch: 0, hit: 0, days: 0, wrong: 0, planted: 0 };
  for (let k = 0; k < RUNS; k++) {
    const { x, at } = series(step, nr);
    const planted = new Set(at.flatMap(({ t, len }) => Array.from({ length: len }, (_, i) => t + i)));
    for (const r of [0, 5]) {
      const o = analyze({ values: x, model: 'poisson', period: 7, overdispersion: 'nb', bursts: true, burstRuns: r, burstRunRatio: +(process.env.RR || 0) });
      const cps = o.pelt.changepoints.map((c) => c.index), b = o.bursts.map((v) => v.index);
      const R = res[r]; R.ch += cps.length; if (step && near(cps, 100)) R.hit++;
      R.days += b.filter((i) => planted.has(i)).length; R.planted += planted.size; R.wrong += b.filter((i) => !planted.has(i)).length;
    }
  }
  const f = (r) => `${(res[r].ch / RUNS).toFixed(2)}`;
  console.log(`${name}: changes/series ${f(0)} -> ${f(5)}${step ? `; step found ${res[0].hit} -> ${res[5].hit}/${RUNS}` : ''}; run days cut ${res[0].days} -> ${res[5].days}/${res[5].planted}, other days flagged ${(res[0].wrong / RUNS).toFixed(2)} -> ${(res[5].wrong / RUNS).toFixed(2)}/series`);
}
