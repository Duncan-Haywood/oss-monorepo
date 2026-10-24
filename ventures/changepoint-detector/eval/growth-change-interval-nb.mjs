// Does the 95% range on a change of growth rate hold the planted bend on CLUMPY counts (--overdispersion nb)?
// Same series as growth-change-interval.mjs, but each count is drawn at an independent lognormal rate (sd `sd`).
// usage: node eval/growth-change-interval-nb.mjs [runs] [seed] [sd] [nb|poisson]
import { analyze } from '../engine.mjs';
let seed = Number(process.argv[3]) || 2026;
const sd = process.argv[4] === undefined ? 0.35 : Number(process.argv[4]);
const od = process.argv[5] || 'nb';
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const pois = (l) => { const L = Math.exp(-l); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const N = 200, RUNS = Number(process.argv[2]) || 40;
console.log(`clumpy counts, lognormal sd ${sd}, overdispersion ${od}\ngrowth bump (per point)  found  covered  median width`);
for (const bump of [0.015, 0.025, 0.04]) {
  let found = 0, covered = 0; const widths = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 70 + Math.floor(rnd() * 60);
    const x = Array.from({ length: N }, (_, t) => pois(Math.exp(2 + 0.004 * t + bump * Math.max(0, t - at) + sd * gauss() - sd * sd / 2)));
    const tr = analyze({ values: x, model: 'poisson', trend: 'bend', ...(od === 'nb' ? { overdispersion: 'nb' } : {}) }).trend;
    if (!tr.growthChangeRange95 || Math.abs(tr.growthChangesAt - at) > 20) continue;
    found++;
    const c = tr.growthChangeRange95[0];
    if (c.fromIndex <= at && at <= c.toIndex) covered++;
    widths.push(c.toIndex - c.fromIndex + 1);
  }
  widths.sort((a, b) => a - b);
  console.log(`${bump}  ${found}/${RUNS}  ${covered}/${found} (${found ? (100 * covered / found).toFixed(0) : '-'}%)  ${widths[widths.length >> 1] ?? '-'}`);
}
