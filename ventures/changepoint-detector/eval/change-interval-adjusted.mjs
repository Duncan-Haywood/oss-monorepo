// Does the 95% range on a change date hold the planted date when the series is first adjusted for a
// seasonal cycle (--period) or a common linear trend (--trend)? Seeded white noise (sd 1), 200 points, one
// level shift of 2 or 3 sd at a random date from 60 to 139; usage: node eval/change-interval-adjusted.mjs
import { analyze } from '../engine.mjs';
let seed = 2028;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const N = 200, RUNS = 200;
const cases = [
  ['seasonal period 7, amplitude 1.5', (t) => 1.5 * Math.sin((2 * Math.PI * t) / 7), { period: 7 }],
  ['common trend, 0.02 per point', (t) => 0.02 * t, { trend: true }],
  ['--model trend, 0.02 per point', (t) => 0.02 * t, { model: 'trend' }],
];
console.log('case                               shift  found  covered  median width');
for (const [name, base, opt] of cases) for (const shift of [2, 3]) {
  let found = 0, covered = 0; const widths = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 60 + Math.floor(rnd() * 80);
    const x = Array.from({ length: N }, (_, t) => base(t) + gauss() + (t >= at ? shift : 0));
    const cps = analyze({ values: x, ...opt }).pelt.changepoints.filter((c) => Math.abs(c.index - at) <= 15);
    if (!cps.length) continue;
    found++;
    const c = cps[0].range95;
    if (c.fromIndex <= at && at <= c.toIndex) covered++;
    widths.push(c.toIndex - c.fromIndex + 1);
  }
  widths.sort((a, b) => a - b);
  console.log(`${name.padEnd(34)} ${shift}      ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / found).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
}
