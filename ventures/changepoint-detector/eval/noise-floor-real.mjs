// Does --noise-floor k (sigma >= k x median |step|) leave real series with a documented break alone?
// Runs k = 0, 0.5, 1, 2 on committed real CSVs and prints the change labels. usage: node eval/noise-floor-real.mjs
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
];
for (const [f, name, opt] of cases) {
  const d = load(f);
  const vals = opt.log ? d.values.map(Math.log) : d.values;
  console.log(name);
  for (const k of [0, 0.5, 1, 2]) {
    const { log, ...o } = opt;
    const cps = analyze({ values: vals, labels: d.labels, ...o, noiseFloor: k }).pelt.changepoints;
    console.log(`  k=${k}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
  }
}
