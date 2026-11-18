// Real series: US female murder rate per 100,000, 1950-2004 (data/us-female-murder-rate.csv, 55 values, fpp2 `wmurders`).
// The rate rose through the 1960s to a peak in the mid-1970s and fell from the mid-1990s (recalled, not checked against a source).
// usage: node eval/us-female-murder-rate.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-female-murder-rate.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
for (const [name, opt] of [['mean', {}], ['mean, ar1 auto', { ar1: 'auto' }], ['trend', { model: 'trend' }], ['meanvar', { model: 'meanvar' }], ['mean, trend bend', { trend: 'bend' }], ['mean, trend bends', { trend: 'bends' }]]) {
  const a = analyze({ values, labels, ...opt });
  const t = a.trend || {};
  const sc = t.slopeChangeRange95 ? t.slopeChangeRange95.map((s) => `${s.at}[${s.from}..${s.to}]`).join(' ') : 'none';
  console.log(`${name} | steps: ${a.pelt.changepoints.map((c) => c.label).join(' ') || 'none'} | slope changes: ${sc}`);
}
