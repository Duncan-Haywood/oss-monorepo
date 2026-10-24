// How often does the 95% range on a change date hold the planted date?
// Seeded series with one planted shift; usage: node eval/change-interval.mjs
import { analyze } from '../engine.mjs';
let seed = 2026;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const N = 200, RUNS = 200;
console.log('shift (noise sd)  found  covered  median width');
for (const shift of [1, 1.5, 2, 3]) {
  let found = 0, covered = 0; const widths = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 60 + Math.floor(rnd() * 80);
    const x = Array.from({ length: N }, (_, t) => gauss() + (t >= at ? shift : 0));
    const cps = analyze({ values: x }).pelt.changepoints.filter((c) => Math.abs(c.index - at) <= 15);
    if (!cps.length) continue;
    found++;
    const c = cps[0].range95;
    if (c.fromIndex <= at && at <= c.toIndex) covered++;
    widths.push(c.toIndex - c.fromIndex + 1);
  }
  widths.sort((a, b) => a - b);
  console.log(`${shift}  ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / found).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
}
