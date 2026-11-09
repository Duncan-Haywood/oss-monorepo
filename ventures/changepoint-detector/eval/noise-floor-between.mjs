// Is there a safe k between 1 and 2 for --noise-floor? Runs k = 1, 1.25, 1.5, 1.75, 2 on the six real series
// of noise-floor-real.mjs and on log US real GDP (trend model). usage: node eval/noise-floor-between.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const load = (f, col = 1) => {
  const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[col]) };
};
const cases = [
  ['nile.csv', 'Nile flow, dam 1898', { model: 'mean' }],
  ['lake-huron.csv', 'Lake Huron', { model: 'mean' }],
  ['peace-bridge.csv', 'Peace Bridge, passports 2009-06', { model: 'mean', period: 12 }],
  ['airmiles.csv', 'airmiles, 1946 (logs)', { model: 'trend', log: true }],
  ['uk-gas.csv', 'UK gas, 1970 conversion', { model: 'trend', log: true }],
  ['nhtemp.csv', 'New Haven temp', { model: 'mean' }],
  ['us-real-gdp.csv', 'US real GDP (logs), 1970s slowdown', { model: 'trend', log: true }],
];
for (const [f, name, opt] of cases) {
  const d = load(f);
  const vals = opt.log ? d.values.map(Math.log) : d.values;
  console.log(name);
  for (const k of [1, 1.25, 1.5, 1.75, 2]) {
    const { log, ...o } = opt;
    const cps = analyze({ values: vals, labels: d.labels, ...o, noiseFloor: k }).pelt.changepoints;
    console.log(`  k=${k}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
  }
}
