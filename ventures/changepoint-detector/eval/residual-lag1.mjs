// Can the residual lag-1 autocorrelation after the default fit flag a false-alarm run when raw rho does not?
// treering has raw rho 0.16 (no hint) and 38 false steps. Compares real series with documented steps (nile),
// real series with none (lh, treering, lynx, sunspot-year, nottem) and seeded white noise.
// Run: node eval/residual-lag1.mjs
import { readFileSync } from 'node:fs';
import { analyze, ar1Rho } from '../engine.mjs';

const load = (f) => readFileSync(new URL(`../data/${f}.csv`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => +l.split(',')[1]);
export function lag1(r) {
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  let n = 0, d = 0;
  for (let i = 0; i < r.length; i++) { d += (r[i] - m) ** 2; if (i) n += (r[i] - m) * (r[i - 1] - m); }
  return n / d;
}
export function residualLag1(values) {
  const a = analyze({ labels: values.map((_, i) => String(i)), values });
  const b = [0, ...a.pelt.changepoints.map((c) => c.index), values.length], res = [];
  for (let k = 0; k < b.length - 1; k++) {
    const s = values.slice(b[k], b[k + 1]), m = s.reduce((x, y) => x + y, 0) / s.length;
    for (const y of s) res.push(y - m);
  }
  return { steps: b.length - 2, rho: ar1Rho(values), resid: lag1(res) };
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
export function whiteNoise(n, seed) {
  const r = rng(seed);
  return Array.from({ length: n }, () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r()));
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  for (const f of ['nile', 'lh', 'treering', 'lynx', 'sunspot-year', 'nottem']) {
    const r = residualLag1(load(f));
    console.log(f.padEnd(14), `steps ${r.steps}`.padEnd(10), `raw rho ${r.rho.toFixed(2)}`.padEnd(14), `residual lag-1 ${r.resid.toFixed(2)}`);
  }
  const rs = [];
  for (let s = 1; s <= 200; s++) rs.push(residualLag1(whiteNoise(100, s)).resid);
  rs.sort((a, b) => a - b);
  console.log(`white noise n=100, 200 seeds: residual lag-1 median ${rs[100].toFixed(2)}, 5th ${rs[10].toFixed(2)}, 95th ${rs[189].toFixed(2)}`);
}
