// A real count series with a documented break: monthly UK drivers killed or seriously injured, 1969-1984
// (data/uk-driver-deaths.csv). The front-seat seat-belt law took effect on 31 January 1983 (Harvey and Durbin 1986).
// Does the seasonal count model find it, and does the 95% range hold 1983-02, the first full month under the law?
// usage: node eval/seatbelt-law.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/uk-driver-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const TRUTH = labels.indexOf('1983-02');
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
console.log(`n ${values.length}; mean before 1983-02 ${mean(values.slice(0, TRUTH)).toFixed(0)}, from 1983-02 ${mean(values.slice(TRUTH)).toFixed(0)}`);
for (const [name, opt] of [
  ['mean, seasonal 12', { model: 'mean', period: 12 }],
  ['poisson, seasonal 12', { model: 'poisson', period: 12 }],
  ['poisson nb, seasonal 12', { model: 'poisson', period: 12, overdispersion: 'nb' }],
  ['poisson nb, seasonal 12, bends', { model: 'poisson', period: 12, overdispersion: 'nb', trend: 'bends' }],
]) {
  const r = analyze({ values, labels, ...opt });
  console.log(`\n${name}: ${r.pelt.changepoints.length} changes`);
  for (const c of r.pelt.changepoints) {
    const held = c.range95 && c.range95.fromIndex <= TRUTH && TRUTH <= c.range95.toIndex;
    console.log(`  ${c.label}  ${c.meanBefore} -> ${c.meanAfter}  range95 ${c.range95 ? `${c.range95.from} to ${c.range95.to}` : 'none'}${held ? '  (holds 1983-02)' : ''}`);
  }
}
