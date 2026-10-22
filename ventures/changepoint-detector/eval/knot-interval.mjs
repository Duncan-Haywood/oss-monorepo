// How often does the 95% range on a slope-change position hold the planted knot?
// Seeded series: slope 0.05 then 0.05 + d after a knot, Gaussian noise sd 1; usage: node eval/knot-interval.mjs
import { analyze } from '../engine.mjs';
let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const N = 200, RUNS = 200;
console.log('slope change d  found  covered  median width');
for (const d of [0.05, 0.1, 0.2]) {
  let found = 0, covered = 0; const widths = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 70 + Math.floor(rnd() * 60);
    const x = Array.from({ length: N }, (_, t) => 0.05 * t + d * Math.max(0, t - at) + gauss());
    const tr = analyze({ values: x, trend: 'bend' }).trend;
    if (tr.slopeChangesAt === undefined || Math.abs(tr.slopeChangesAt - at) > 25) continue;
    found++;
    const c = tr.slopeChangesRange95[0];
    if (c.fromIndex <= at && at <= c.toIndex) covered++;
    widths.push(c.toIndex - c.fromIndex + 1);
  }
  widths.sort((a, b) => a - b);
  console.log(`${d}  ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / Math.max(1, found)).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
}
