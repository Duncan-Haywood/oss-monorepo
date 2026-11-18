// US productivity (quarterly and annual means) against the bar by n and rho (critical: 'auto') and the Monte Carlo p-value.
// usage: node eval/slope-productivity-auto.mjs
import { readFileSync } from 'node:fs';
import { slopeBreaks, slopeBreakPValue, barFor } from '../slope-breaks.mjs';
const rows = readFileSync(new URL('../data/us-labor-productivity.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const q = rows.map((r) => [r[0], Math.log(+r[1])]);
const by = new Map();
for (const [l, v] of q) { const y = l.slice(0, 4); (by.get(y) ?? by.set(y, []).get(y)).push(v); }
const ann = [...by].filter(([, a]) => a.length === 4).map(([y, a]) => [y, a.reduce((s, z) => s + z, 0) / 4]);
const lag1 = (x) => { const d = x.slice(1).map((v, i) => v - x[i]); const m = d.reduce((s, z) => s + z, 0) / d.length; let a = 0, b = 0; for (let i = 0; i < d.length; i++) { b += (d[i] - m) ** 2; if (i) a += (d[i] - m) * (d[i - 1] - m); } return a / b; };
for (const [name, ser, step] of [['quarterly', q, 4], ['annual means', ann, 1]]) {
  const x = ser.map((a) => a[1]);
  const t = slopeBreaks(x, { maxKnots: 1, critical: 0 }).knots[0];
  const rep = slopeBreaks(x, { critical: 'auto' }).knots.length;
  const p = slopeBreakPValue(x, { reps: 499, seed: 1 });
  console.log(`${name}: n=${x.length}, rho ${lag1(x).toFixed(2)}, best split ${ser[t.index][0]}, W ${t.wald.toFixed(1)}, auto bar ${barFor(x.length, lag1(x)).toFixed(1)}, p ${typeof p === 'object' ? p.p : p}, reported: ${rep ? 'yes' : 'no'}`);
}
