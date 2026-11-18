// Real series: Australian quarterly beer production 1956Q1-2010Q2 (data/ausbeer.csv, 218 points, megalitres).
// Production rose to the mid-1970s, then flattened and fell. Runs raw and log, with and without a slope bend.
// usage: node eval/ausbeer.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/ausbeer.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]), lg = raw.map(Math.log);
const fmt = (c) => `${c.label}[${labels[c.range95.fromIndex]}..${labels[c.range95.toIndex]}]`;
for (const [name, opt] of [['mean', {}], ['mean, trend bend', { trend: 'bend' }], ['mean, trend bends', { trend: 'bends' }]]) {
  for (const [vn, values] of [['raw', raw], ['log', lg]]) {
    const a = analyze({ values, labels, period: 4, ...opt });
    const t = a.trend || {};
    const sc = t.slopeChangeRange95 ? t.slopeChangeRange95.map((s) => `${s.at}[${s.from}..${s.to}]`).join(' ') : 'none';
    console.log(`${name} | ${vn} | steps: ${a.pelt.changepoints.map(fmt).join(' ') || 'none'} | slope changes: ${sc}`);
  }
}
