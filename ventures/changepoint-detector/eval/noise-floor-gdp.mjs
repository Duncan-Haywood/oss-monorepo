// Does --noise-floor k isolate a documented break in a DRIFTING real series?
// Log US real GDP, 1950Q1-2000Q4 (data/us-real-gdp.csv). The documented break is the early-1970s
// productivity-growth slowdown (from memory, no paper read). usage: node eval/noise-floor-gdp.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-real-gdp.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const values = rows.map((r) => Math.log(+r[1]));
for (const [name, opt] of [['model mean', { model: 'mean' }], ['model trend', { model: 'trend' }]]) {
  console.log(name);
  for (const k of [0, 1, 2]) {
    const cps = analyze({ values, labels, ...opt, noiseFloor: k }).pelt.changepoints;
    console.log(`  k=${k}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
  }
}
