// Slope-break test (slope-breaks.mjs) on real global temperature, 1880-2024 (data/global-temp-annual.csv, 145 values).
// The 1976 acceleration is recalled from the literature, not read from a source here. Positive control with a documented break
// at a length (n=144 differences) where the bar is valid, on a series with noise far smaller than GDP's.
// usage: node eval/slope-global-temp.mjs
import { readFileSync } from 'node:fs';
import { slopeBreaks, slopeBreakPValue, barFor } from '../slope-breaks.mjs';
const rows = readFileSync(new URL('../data/global-temp-annual.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), x = rows.map((r) => +r[1]);
const d = x.slice(1).map((v, i) => v - x[i]), m = d.reduce((s, v) => s + v, 0) / d.length;
let a = 0, b = 0; for (let i = 0; i < d.length; i++) { b += (d[i] - m) ** 2; if (i) a += (d[i] - m) * (d[i - 1] - m); }
const rho = a / b;
console.log(`n=${x.length}, lag-1 autocorrelation of the differences ${rho.toFixed(2)}, auto bar ${barFor(x.length, rho).toFixed(1)}`);
const one = slopeBreaks(x, { maxKnots: 1, critical: 0 }).knots[0];
console.log(`best single split ${labels[one.index]}, W ${one.wald.toFixed(1)}`);
const r = slopeBreaks(x, { critical: 'auto' });
console.log(`reported at the auto bar: ${r.knots.map((k) => `${labels[k.index]} (W ${k.wald.toFixed(1)})`).join(', ') || 'none'}`);
const p = slopeBreakPValue(x, { reps: 499, seed: 1 });
console.log(`Monte Carlo p ${typeof p === 'object' ? p.p : p}`);
for (const [lo, hi] of [[0, 100], [30, 145], [50, 145]]) {
  const s = x.slice(lo, hi), t = slopeBreaks(s, { maxKnots: 1, critical: 0 }).knots[0];
  console.log(`window ${labels[lo]}-${labels[hi - 1]}: best split ${labels[lo + t.index]}, W ${t.wald.toFixed(1)}`);
}
