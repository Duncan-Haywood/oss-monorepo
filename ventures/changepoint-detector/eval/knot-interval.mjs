// Does the 95% range on a slope-change knot (--trend bend) hold the planted knot? Seeded white noise (sd 1),
// 200 points, slope 0.05 per point that changes at a random knot from 70 to 129 by `dslope`;
// usage: node eval/knot-interval.mjs
import { analyze } from '../engine.mjs';
let seed = 3031;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const N = 200, RUNS = 200;
console.log('slope change  found  covered  median width');
for (const dslope of [0.1, 0.2, 0.4]) {
  let found = 0, covered = 0; const widths = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 70 + Math.floor(rnd() * 60);
    const x = Array.from({ length: N }, (_, t) => 0.05 * t + (t > at ? dslope * (t - at) : 0) + gauss());
    const tr = analyze({ values: x, trend: 'bend' }).trend;
    if (!tr || !tr.slopeChangesRange95 || Math.abs(tr.slopeChangesAt - at) > 20) continue;
    found++;
    const c = tr.slopeChangesRange95[0];
    if (c.from <= at && at <= c.to) covered++;
    widths.push(c.to - c.from + 1);
  }
  widths.sort((a, b) => a - b);
  console.log(`${String(dslope).padEnd(12)}  ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / found).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
}
