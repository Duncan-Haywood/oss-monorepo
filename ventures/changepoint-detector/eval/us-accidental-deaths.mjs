// Real US monthly accidental deaths 1973-78 (data/us-accidental-deaths.csv, R's USAccDeaths), 72 months.
// eval/drift-warning-trendless.mjs labels this series "no shock; null". It is not quiet: the detector puts a fall at
// 1973-12, the month after the Nov 1973 oil embargo cut driving and weeks before the 55 mph national limit (Jan 1974).
// usage: node eval/us-accidental-deaths.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-accidental-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
for (const opt of [{ model: 'mean' }, { model: 'mean', period: 12 }, { model: 'poisson', overdispersion: 'nb', period: 12 }, { model: 'mean', period: 12, ar1: true }, { model: 'mean', period: 12, trend: 'bend' }]) {
  const r = analyze({ values, labels, ...opt });
  const cps = r.pelt.changepoints.map((c) => `${c.label}${c.shift > 0 ? '+' : '-'}(${Math.round(c.meanBefore)}->${Math.round(c.meanAfter)})`).join(' ') || 'none';
  console.log(JSON.stringify(opt).padEnd(58), cps);
}
