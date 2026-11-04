// The "trend fit under the steps" question on log US real GDP, answered the plain way: difference the log
// series (annualised growth, % per year) and run the level models on that. usage: node eval/gdp-growth.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-real-gdp.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const lv = rows.map((r) => Math.log(+r[1]));
const values = lv.slice(1).map((v, i) => (v - lv[i]) * 400);
const labels = rows.slice(1).map((r) => r[0]);
for (const [name, opt] of [['model mean', { model: 'mean' }], ['model mean, ar1 auto', { model: 'mean', ar1: 'auto' }], ['model meanvar', { model: 'meanvar' }]]) {
  const cps = analyze({ values, labels, ...opt }).pelt.changepoints;
  console.log(`${name}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
}
