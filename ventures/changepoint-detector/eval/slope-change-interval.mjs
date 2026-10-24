// How often does the 95% range on a slope change hold the planted bend?
// Seeded series: slope 0.1 per point that grows by `bump` at a planted point; usage: node eval/slope-change-interval.mjs
import { analyze } from '../engine.mjs';
let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const N = 200, RUNS = Number(process.argv[2]) || 100;
console.log('slope bump (per point)  found  covered  median width');
for (const bump of [0.1, 0.2, 0.3]) {
  let found = 0, covered = 0; const widths = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 70 + Math.floor(rnd() * 60);
    const x = Array.from({ length: N }, (_, t) => 0.1 * t + bump * Math.max(0, t - at) + gauss());
    const tr = analyze({ values: x, trend: 'bend' }).trend;
    if (!tr.slopeChangeRange95 || Math.abs(tr.slopeChangesAt - at) > 20) continue;
    found++;
    const c = tr.slopeChangeRange95[0];
    if (c.fromIndex <= at && at <= c.toIndex) covered++;
    widths.push(c.toIndex - c.fromIndex + 1);
  }
  widths.sort((a, b) => a - b);
  console.log(`${bump}  ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / found).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
}
