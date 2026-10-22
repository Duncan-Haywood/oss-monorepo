// Does the likelihood-ratio interval around a change date cover the true date? Seeded series, one planted step at index 100
// of 200; counts only the runs where exactly one change is found within 15 points. Usage: node eval/change-interval.mjs [level]
import { analyze } from '../engine.mjs';
let seed = 777;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return (seed + 0.5) / 4294967296; };
const gauss = () => Math.sqrt(-2 * Math.log(rnd())) * Math.cos(2 * Math.PI * rnd());
const pois = (m) => { if (m > 50) return Math.max(0, Math.round(m + Math.sqrt(m) * gauss())); const L = Math.exp(-m); let k = 0, p = 1; do { k++; p *= rnd(); } while (p > L); return k - 1; };
const N = 200, T = 100, RUNS = 200;
const level = Number(process.argv[2]) || 3.84;
const rows = [];
for (const [name, gen, model] of [
  ['mean, shift 1 sd', (t) => gauss() + (t >= T ? 1 : 0), 'mean'],
  ['mean, shift 2 sd', (t) => gauss() + (t >= T ? 2 : 0), 'mean'],
  ['mean, shift 4 sd', (t) => gauss() + (t >= T ? 4 : 0), 'mean'],
  ['counts 20 -> 30', (t) => pois(t >= T ? 30 : 20), 'poisson'],
  ['counts 20 -> 40', (t) => pois(t >= T ? 40 : 20), 'poisson'],
]) {
  let used = 0, cover = 0, width = 0, exact = 0;
  for (let r = 0; r < RUNS; r++) {
    const x = Array.from({ length: N }, (_, t) => gen(t));
    const o = analyze({ values: x, model, intervalLevel: level });
    const cs = o.pelt.changepoints.filter((c) => Math.abs(c.index - T) <= 15);
    if (o.pelt.changepoints.length !== 1 || cs.length !== 1) continue;
    const iv = cs[0].interval;
    used++; width += iv.toIndex - iv.fromIndex + 1;
    if (iv.fromIndex <= T && T <= iv.toIndex) cover++;
    if (cs[0].index === T) exact++;
  }
  rows.push(`| ${name} | ${used} | ${(100 * cover / used).toFixed(0)}% | ${(width / used).toFixed(1)} | ${(100 * exact / used).toFixed(0)}% |`);
}
console.log(`level ${level}\n| series | runs used of ${RUNS} | covered | mean width (points) | point estimate exact |\n|---|---|---|---|---|\n` + rows.join('\n'));
