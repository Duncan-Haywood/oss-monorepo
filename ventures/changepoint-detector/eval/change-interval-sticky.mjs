// Does the 95% range on a change date hold the planted date under sticky (AR(1)) noise?
// Seeded series, one planted shift, marginal noise sd 1; usage: node eval/change-interval-sticky.mjs
import { analyze } from '../engine.mjs';
let seed = 2027;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const N = 200, RUNS = 200;
console.log('rho  shift  option   found  covered  median width');
for (const rho of [0.5, 0.7]) for (const shift of [2, 3]) {
  const series = [];
  for (let r = 0; r < RUNS; r++) {
    const at = 60 + Math.floor(rnd() * 80);
    let e = gauss(); const x = [];
    for (let t = 0; t < N; t++) { e = rho * e + Math.sqrt(1 - rho * rho) * gauss(); x.push(e + (t >= at ? shift : 0)); }
    series.push({ at, x });
  }
  for (const [name, opt] of [['plain', {}], ['--ar1', { ar1: true }]]) {
    let found = 0, covered = 0; const widths = [];
    for (const { at, x } of series) {
      const cps = analyze({ values: x, ...opt }).pelt.changepoints.filter((c) => Math.abs(c.index - at) <= 15);
      if (!cps.length) continue;
      found++;
      const c = cps[0].range95;
      if (c.fromIndex <= at && at <= c.toIndex) covered++;
      widths.push(c.toIndex - c.fromIndex + 1);
    }
    widths.sort((a, b) => a - b);
    console.log(`${rho}  ${shift}  ${name.padEnd(7)}  ${found}/${RUNS}  ${covered}/${found} (${(100 * covered / found).toFixed(0)}%)  ${widths[widths.length >> 1]}`);
  }
}
