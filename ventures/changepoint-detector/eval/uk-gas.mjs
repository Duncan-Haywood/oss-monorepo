// A second real series with a slope change, not a count: UK quarterly gas consumption 1960-1986 (data/uk-gas.csv).
// Runs the engine on the raw and the log series, with and without the drifting seasonal shape, and prints what each finds.
// usage: node eval/uk-gas.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/uk-gas.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]), lg = raw.map(Math.log);
const fmt = (c) => `${c.label}[${labels[c.range95.fromIndex]}..${labels[c.range95.toIndex]}]`;
for (const [name, opt] of [['mean, trend', { trend: true }], ['mean, trend bend', { trend: 'bend' }], ['mean, drift, trend bend', { drift: true, trend: 'bend' }], ['meanvar, trend bend', { model: 'meanvar', trend: 'bend' }]]) {
  for (const [vn, values] of [['raw', raw], ['log', lg]]) {
    const a = analyze({ values, labels, period: 4, ...opt });
    const t = a.trend || {};
    const bend = t.slopeChangeRange95 ? `slope ${t.slopePerPoint.toPrecision(3)} -> ${t.slopeAfter.toPrecision(3)} at ${t.slopeChangeRange95[0].at} [${t.slopeChangeRange95[0].from}..${t.slopeChangeRange95[0].to}]` : 'no slope change';
    console.log(`${name} | ${vn} | steps: ${(a.pelt.changepoints.map(fmt).join(' ') || 'none')} | ${bend}`);
  }
}
