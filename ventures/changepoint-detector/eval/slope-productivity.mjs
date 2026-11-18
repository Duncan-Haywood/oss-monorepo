// Positive control for the slope-break test: US labour productivity, a seasonally adjusted quarterly series (n = 318)
// with a documented large slope change, the early-1970s productivity slowdown (growth fell from about 2.8% a year to below 2%).
// usage: node eval/slope-productivity.mjs
import { readFileSync } from 'node:fs';
import { slopeBreaks } from '../slope-breaks.mjs';
const rows = readFileSync(new URL('../data/us-labor-productivity.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const lab = rows.map((r) => r[0]);
const v = rows.map((r) => Math.log(+r[1]));
for (const [name, end] of [['1947Q1-2026Q2', v.length], ['1947Q1-2000Q4', lab.indexOf('2001Q1')], ['1947Q1-1990Q4', lab.indexOf('1991Q1')]]) {
  const x = v.slice(0, end);
  const t = slopeBreaks(x, { maxKnots: 1, critical: 0 }).knots[0];
  const sig = slopeBreaks(x).knots.length;
  console.log(`${name}: n=${x.length}, best split ${lab[t.index]}, W ${t.wald.toFixed(1)} (bar 11), growth ${(t.before * 400).toFixed(2)} to ${(t.after * 400).toFixed(2)} % a year, reported: ${sig ? 'yes' : 'no'}`);
}
