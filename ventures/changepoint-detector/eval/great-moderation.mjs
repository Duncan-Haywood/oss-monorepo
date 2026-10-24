// A real series with a documented volatility break: US real GDP growth, 1959Q2-2009Q3 (data/us-gdp-growth.csv).
// McConnell and Perez-Quiros (2000) date the "Great Moderation", a sharp fall in the volatility of quarterly growth, at 1984Q1.
// Does --model meanvar find it, and does its 95% range hold 1984Q1?  usage: node eval/great-moderation.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-gdp-growth.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const TRUTH = labels.indexOf('1984Q1');
const sd = (a) => { const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); };
console.log(`n ${values.length}; sd of growth before 1984Q1 ${sd(values.slice(0, TRUTH)).toFixed(2)}, 1984Q1 to 2007Q4 ${sd(values.slice(TRUTH, labels.indexOf('2008Q1'))).toFixed(2)} (annualised % points)`);
for (const [name, opt] of [['meanvar, default min segment (5)', {}], ['meanvar, min segment 20', { minSegment: 20 }], ['meanvar, min segment 12', { minSegment: 12 }]]) {
  const r = analyze({ values, labels, model: 'meanvar', ...opt });
  console.log(`\n${name}: ${r.pelt.changepoints.length} changes`);
  for (const c of r.pelt.changepoints) {
    const held = c.range95 && c.range95.fromIndex <= TRUTH && TRUTH <= c.range95.toIndex;
    console.log(`  ${labels[c.index]}  sd ${c.sdBefore} -> ${c.sdAfter}  range95 ${c.range95 ? `${labels[c.range95.fromIndex]} to ${labels[c.range95.toIndex]}` : 'none'}${held ? '  (holds 1984Q1)' : ''}`);
  }
}
