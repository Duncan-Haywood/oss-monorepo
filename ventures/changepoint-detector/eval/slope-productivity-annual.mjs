// Does averaging quarterly productivity to annual means give the slope-break test the power it lacked?
// usage: node eval/slope-productivity-annual.mjs
import { readFileSync } from 'node:fs';
import { slopeBreaks } from '../slope-breaks.mjs';
const rows = readFileSync(new URL('../data/us-labor-productivity.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const by = new Map();
for (const [q, val] of rows) { const y = q.slice(0, 4); (by.get(y) ?? by.set(y, []).get(y)).push(Math.log(+val)); }
const years = [...by].filter(([, a]) => a.length === 4).map(([y, a]) => [y, a.reduce((s, z) => s + z, 0) / 4]);
const lab = years.map((a) => a[0]);
const v = years.map((a) => a[1]);
for (const [name, end] of [['all full years', v.length], ['to 2000', lab.indexOf('2001')], ['to 1990', lab.indexOf('1991')]]) {
  const x = v.slice(0, end);
  const t = slopeBreaks(x, { maxKnots: 1, critical: 0 }).knots[0];
  const sig = slopeBreaks(x).knots.length;
  console.log(`${name}: n=${x.length}, best split ${lab[t.index]}, W ${t.wald.toFixed(1)} (bar 11, calibrated for n>=100 quarterly-like), growth ${(t.before * 100).toFixed(2)} to ${(t.after * 100).toFixed(2)} % a year, reported: ${sig ? 'yes' : 'no'}`);
}
