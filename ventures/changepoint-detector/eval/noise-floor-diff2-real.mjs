// Second-difference noise floor on real smooth drift series (2026-11-10).
// Rows: k=0 (off), first-difference k=1 and k=2, second-difference k=2 and k=3.
// Series are committed real CSVs; no documented break is claimed for most, the question is over-cutting.
// usage: node eval/noise-floor-diff2-real.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const load = (f, col = 1) => {
  const rows = readFileSync(new URL(`../data/${f}`, import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
  return { labels: rows.map((r) => r[0]), values: rows.map((r) => +r[col]) };
};
const cases = [
  ['us-real-gdp.csv', 'US real GDP (logs), quarterly', { model: 'trend', log: true }],
  ['uspop.csv', 'US population (logs), census', { model: 'trend', log: true }],
  ['austres.csv', 'Australian residents, quarterly', { model: 'trend' }],
  ['co2-mauna-loa.csv', 'Mauna Loa CO2, monthly', { model: 'trend', period: 12 }],
  ['us-electricity.csv', 'US electricity (logs), monthly', { model: 'trend', log: true, period: 12 }],
  ['global-temp-annual.csv', 'Global temperature anomaly', { model: 'trend' }],
];
const settings = [['off', {}], ['d1 k=1', { noiseFloor: 1 }], ['d1 k=2', { noiseFloor: 2 }], ['d2 k=2', { noiseFloor: 2, noiseFloorOrder: 2 }], ['d2 k=3', { noiseFloor: 3, noiseFloorOrder: 2 }]];
for (const [f, name, opt] of cases) {
  const d = load(f);
  const { log, ...o } = opt;
  const vals = log ? d.values.map(Math.log) : d.values;
  console.log(`${name} (n=${vals.length})`);
  for (const [s, extra] of settings) {
    let cps;
    try { cps = analyze({ values: vals, labels: d.labels, ...o, ...extra }).pelt.changepoints; } catch (e) { console.log(`  ${s}: error ${e.message}`); continue; }
    console.log(`  ${s}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
  }
}
