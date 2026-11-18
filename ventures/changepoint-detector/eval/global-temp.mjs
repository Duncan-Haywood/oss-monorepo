// Real series: global mean surface temperature anomaly, annual mean of 12 months, 1880-2024 (data/global-temp-annual.csv, 145 values;
// NOAA/NASA GCAG monthly series as republished by datahub.io `global-temp`).
// Literature dates slope changes near 1910, 1940 and 1976 (recalled, not read from a source here).
// usage: node eval/global-temp.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/global-temp-annual.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
for (const [name, opt] of [['mean', {}], ['mean, ar1 auto', { ar1: 'auto' }], ['trend', { model: 'trend' }], ['mean, trend bend', { trend: 'bend' }], ['mean, trend bends', { trend: 'bends' }]]) {
  const a = analyze({ values, labels, ...opt });
  const t = a.trend || {};
  const sc = t.slopeChangeRange95 ? t.slopeChangeRange95.map((s) => `${s.at}[${s.from}..${s.to}]`).join(' ') : 'none';
  console.log(`${name} | steps: ${a.pelt.changepoints.map((c) => c.label).join(' ') || 'none'} | slope changes: ${sc}`);
}
