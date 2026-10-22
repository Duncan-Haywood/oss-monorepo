// How often does the 95% range on a change of growth rate (counts, --trend bend) hold the planted bend?
// Seeded Poisson series: log rate 2 + 0.004 t, growing by `bump` per point after a planted point; usage: node eval/growth-change-interval.mjs [runs] [seed]
import { analyze } from '../engine.mjs';
let seed = Number(process.argv[3]) || 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const pois = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const N = 200, RUNS = Number(process.argv[2]) || 100;
console.log('growth bump (per point)  found  covered  median width');
for (const bump of [0.015, 0.025, 0.04]) {
  let found = 0, covered = 0; const widths = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 70 + Math.floor(rnd() * 60);
    const x = Array.from({ length: N }, (_, t) => pois(Math.exp(2 + 0.004 * t + bump * Math.max(0, t - at))));
    const tr = analyze({ values: x, model: 'poisson', trend: 'bend' }).trend;
    if (!tr.growthChangeRange95 || Math.abs(tr.growthChangesAt - at) > 20) continue;
    found++;
    const c = tr.growthChangeRange95[0];
    if (c.fromIndex <= at && at <= c.toIndex) covered++;
    widths.push(c.toIndex - c.fromIndex + 1);
  }
  widths.sort((a, b) => a - b);
  console.log(`${bump}  ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / found).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
}
