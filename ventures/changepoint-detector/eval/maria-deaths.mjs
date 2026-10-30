// A real daily count series with a documented shock: all-cause deaths per day in Puerto Rico, 1,201 days from
// 2015-01-01 (data/puerto-rico-daily-deaths.csv). Hurricane Maria made landfall on 2017-09-20 and the daily count
// jumps from about 80 to about 120. Does each setup put a change on that day, does its 95% range hold it, and
// what else does it report? Other changes are listed, not scored: the series has a winter peak and only three
// and a bit years, so a yearly swing is not pinned down.
// usage: node eval/maria-deaths.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/puerto-rico-daily-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const MARIA = labels.indexOf('2017-09-20');
console.log(`n ${values.length}; landfall ${labels[MARIA]}; deaths that day ${values[MARIA]}, mean of the 60 days before ${(values.slice(MARIA - 60, MARIA).reduce((a, b) => a + b, 0) / 60).toFixed(1)}`);
for (const [name, opt] of [
  ['mean, no season', { model: 'mean' }],
  ['poisson nb, no season', { model: 'poisson', overdispersion: 'nb' }],
  ['poisson nb, weekly 7', { model: 'poisson', overdispersion: 'nb', period: 7 }],
  ['mean, yearly 365', { model: 'mean', period: 365 }],
  ['poisson nb, yearly 365', { model: 'poisson', overdispersion: 'nb', period: 365 }],
]) {
  const cps = analyze({ values, labels, ...opt }).pelt.changepoints;
  const hit = cps.find((c) => Math.abs(labels.indexOf(c.label) - MARIA) <= 1);
  const holds = cps.some((c) => c.range95 && c.range95.fromIndex <= MARIA && MARIA <= c.range95.toIndex);
  console.log(`\n${name}: ${cps.length} changes; one within a day of landfall ${!!hit}, range holds the day ${holds}`);
  for (const c of cps) console.log(`  ${c.label}  ${c.meanBefore} -> ${c.meanAfter}  range95 ${c.range95 ? `${c.range95.from} to ${c.range95.to}` : 'none'}${c === hit ? '  (landfall)' : ''}`);
}
