// Local-fit noise floor: window width and fit degree, on the same six real smooth drift series (2026-11-10).
// The 7-point line floor (noise-floor-local-real.mjs) left Australian residents at 4 cuts against 1 for first-difference k=2;
// the flagship asked for a wider or quadratic window. Rows: first-difference k=2 as the reference, then line and quadratic
// local fits over 7, 13 and 25 points at k=2 and k=3. Series are committed real CSVs; no documented break is claimed for most,
// the question is over-cutting.
// A series no longer than the window falls back to the first-difference floor (airmiles, n=24, in part 2).
// usage: node eval/noise-floor-local-window-real.mjs
import { readFileSync } from 'node:fs';
import { analyze, localFitScale } from '../engine.mjs';
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
const settings = [['d1 k=2', { noiseFloor: 2 }]];
for (const deg of [1, 2]) for (const w of [7, 13, 25]) for (const k of [2, 3]) settings.push([`${deg === 1 ? 'line' : 'quad'} w=${w} k=${k}`, { noiseFloor: k, noiseFloorOrder: 'local', noiseFloorWindow: w, noiseFloorDegree: deg }]);
settings.push(['line w=25 k=1.5', { noiseFloor: 1.5, noiseFloorOrder: 'local', noiseFloorWindow: 25 }]);
for (const [f, name, opt] of cases) {
  const d = load(f);
  const { log, ...o } = opt;
  const vals = log ? d.values.map(Math.log) : d.values;
  const d1 = vals.slice(1).map((v, i) => Math.abs(v - vals[i])).sort((a, b) => a - b)[Math.floor((vals.length - 1) / 2)];
  const sc = (w, deg) => (vals.length > w ? (localFitScale(vals, w, deg) / d1).toFixed(2) : '-');
  console.log(`${name} (n=${vals.length}); local scale / median |d1| (raw series): line ${[7, 13, 25].map((w) => sc(w, 1)).join(' ')}, quad ${[7, 13, 25].map((w) => sc(w, 2)).join(' ')}`);
  for (const [s, extra] of settings) {
    let cps;
    try { cps = analyze({ values: vals, labels: d.labels, ...o, ...extra }).pelt.changepoints; } catch (e) { console.log(`  ${s}: error ${e.message}`); continue; }
    console.log(`  ${s}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
  }
}

// Part 2: what the floors cost on the committed real series with a documented break (noise-floor-real.mjs's six).
console.log('\nDocumented-break series (cost check; the documented date is in the name)');
const broke = [
  ['nile.csv', 'Nile flow, dam 1898', { model: 'mean' }],
  ['lake-huron.csv', 'Lake Huron', { model: 'mean' }],
  ['peace-bridge.csv', 'Peace Bridge, passports 2009-06', { model: 'mean', period: 12 }],
  ['airmiles.csv', 'airmiles, 1946 (logs)', { model: 'trend', log: true }],
  ['uk-gas.csv', 'UK gas, 1970 conversion', { model: 'trend', log: true }],
  ['nhtemp.csv', 'New Haven temp', { model: 'mean' }],
];
const costArms = [['off', {}], ['d1 k=1', { noiseFloor: 1 }], ['d1 k=2', { noiseFloor: 2 }], ['line w=25 k=2', { noiseFloor: 2, noiseFloorOrder: 'local', noiseFloorWindow: 25 }], ['line w=25 k=1.5', { noiseFloor: 1.5, noiseFloorOrder: 'local', noiseFloorWindow: 25 }]];
for (const [f, name, opt] of broke) {
  const d = load(f);
  const { log, ...o } = opt;
  const vals = log ? d.values.map(Math.log) : d.values;
  console.log(`${name} (n=${vals.length})`);
  for (const [s, extra] of costArms) {
    const cps = analyze({ values: vals, labels: d.labels, ...o, ...extra }).pelt.changepoints;
    console.log(`  ${s}: ${cps.length} [${cps.map((c) => c.label ?? c.index).join(', ')}]`);
  }
}
