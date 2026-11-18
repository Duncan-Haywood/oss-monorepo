// Real series: Mauna Loa monthly CO2 (ppm, interpolated column), 1958-03 to 2026-09 (data/co2-mauna-loa.csv, 823 values;
// NOAA GML as republished by datahub.io `co2-ppm`). Known from the literature (recalled, not read from a source here):
// the yearly rise speeds up from about 0.8 ppm in the 1960s to about 2.4 ppm in the 2010s, a smooth acceleration with no step.
// usage: node eval/co2-mauna-loa.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/co2-mauna-loa.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
for (const [name, opt] of [['mean', {}], ['trend', { model: 'trend' }], ['trend, period 12', { model: 'trend', period: 12 }], ['mean, period 12, trend bend', { period: 12, trend: 'bend' }], ['mean, period 12, trend bends', { period: 12, trend: 'bends' }], ['period 12, bends, noise-floor 1.5', { period: 12, trend: 'bends', noiseFloor: 1.5 }], ['period 12, bends, ar1 auto', { period: 12, trend: 'bends', ar1: 'auto' }], ['period 12, bends, ar1 joint', { period: 12, trend: 'bends', ar1: 'joint' }], ['period 12, quad', { period: 12, trend: 'quad' }], ['period 12, quad, ar1 auto', { period: 12, trend: 'quad', ar1: 'auto' }], ['period 12, quad, noise-floor 1.5', { period: 12, trend: 'quad', noiseFloor: 1.5 }]]) {
  const a = analyze({ values, labels, ...opt });
  const t = a.trend || {};
  const sc = t.slopeChangeRange95 ? t.slopeChangeRange95.map((s) => `${s.at}[${s.from}..${s.to}]`).join(' ') : 'none';
  const n = a.pelt.changepoints.length;
  if (t.curved !== undefined) console.log(`${name} | curved: ${t.curved}, slope change per month ${t.slopeChangePerPoint}, per year per year ${(t.slopeChangePerPoint * 144).toFixed(4)} ppm`);
  console.log(`${name} | steps: ${n} ${a.pelt.changepoints.slice(0, 6).map((c) => c.label).join(' ')} | slope changes: ${sc}`);
}
