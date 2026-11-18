// Coverage of the 95% range on `--garch` cuts (README, "A range from the GARCH fit"). One planted change at n/2 on
// clustered (GARCH) noise: sd 1 -> 2, or mean +1.5. Among series where `--garch` finds exactly one cut within 15 points of
// the planted one and reads the noise as clustered, reports how often the range holds the planted index and its median
// width, for the range from the independent-noise meanvar cost (shipped until now) and from the GARCH segment likelihood
// at the fitted (a, b) (garchCost). Pre-registered: eval/meanvar-garch-range-prereg-2026-11-13.md.
// usage: node eval/meanvar-garch-range.mjs [reps] [seedShift] [n list, default 200,400]
import { analyze, changeIntervals, garchCost, makeCost } from '../engine.mjs';
import { NOISE } from './meanvar-garch-binseg.mjs';
const reps = +process.argv[2] || 100, shift = +process.argv[3] || 0;
const NS = (process.argv[4] || '200,400').split(',').map(Number);
function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const med = (a) => { const s = [...a].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : NaN; };
console.log(`reps ${reps}, seed shift ${shift}; among series with one clustered --garch cut within 15 of n/2:\nkept / held by the independent-noise range (median width) / held by the GARCH range (median width)`);
for (const n of NS) for (const [kind, f] of [['sd 1->2', (x, i) => (i < n / 2 ? x : 2 * x)], ['mean +1.5', (x, i) => (i < n / 2 ? x : x + 1.5)]]) {
  let kept = 0; const hit = [0, 0], wid = [[], []];
  for (let k = 0; k < reps; k++) {
    const x = NOISE.garch(rng(31000 * n + 11 * k + 7 + shift), n).map(f);
    const r = analyze({ values: x, model: 'meanvar', garch: true, intervals: false });
    const c = r.pelt.changepoints.map((q) => q.index);
    if (!r.garch.clustered || c.length !== 1 || Math.abs(c[0] - n / 2) > 15) continue;
    kept++;
    const costs = [makeCost(x, 'meanvar'), garchCost(x, r.garch.alpha, r.garch.beta)];
    costs.forEach((cost, j) => {
      const [iv] = changeIntervals(c, n, cost, { minSegment: 10, level: 0.95 });
      if (iv.from <= n / 2 && n / 2 <= iv.to) hit[j]++;
      wid[j].push(iv.to - iv.from + 1);
    });
  }
  const pc = (v) => `${Math.round(100 * v / kept)}%`;
  console.log(`n ${n} | ${kind.padEnd(9)} | ${kept} / ${pc(hit[0])} (${med(wid[0])}) / ${pc(hit[1])} (${med(wid[1])})`);
}
