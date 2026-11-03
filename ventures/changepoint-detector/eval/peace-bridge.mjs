// A real monthly series with a documented rule change: Peace Bridge (Buffalo NY - Fort Erie ON) monthly traffic,
// 156 months from 2003-01 (data/peace-bridge.csv, R's Stat2Data::PeaceBridge2003, thousands of vehicles).
// The US Western Hemisphere Travel Initiative required a passport (or equivalent) for land crossings from 2009-06-01,
// in the middle of the 2008-09 recession. Does the detector put a level change near 2009-06 (a year of
// seasonality is 12 months), and does the 95% range hold it? Every other change is listed: the series has a slow
// slide, so the count of changes is the honest cost, and with the recession the cause of any one step is not isolated.
// usage: node eval/peace-bridge.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/peace-bridge.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const WHTI = labels.indexOf('2009-06');
console.log(`n ${values.length}; WHTI month ${labels[WHTI]} (${values[WHTI]}; ${labels[WHTI - 12]} was ${values[WHTI - 12]})`);
const counts = values.map((v) => Math.round(v * 1000));
for (const [name, v, opt] of [
  ['mean, seasonal 12', values, { model: 'mean', period: 12 }],
  ['mean, no season', values, { model: 'mean' }],
  ['poisson nb, seasonal 12', counts, { model: 'poisson', period: 12, overdispersion: 'nb' }],
  ['poisson nb, no season', counts, { model: 'poisson', overdispersion: 'nb' }],
]) {
  let r;
  try { r = analyze({ values: v, labels, ...opt }); } catch (e) { console.log(`\n${name}: error ${e.message}`); continue; }
  const cps = r.pelt.changepoints;
  const near = cps.some((c) => Math.abs(labels.indexOf(c.label) - WHTI) <= 2);
  const hold = cps.some((c) => c.range95 && c.range95.fromIndex <= WHTI && WHTI <= c.range95.toIndex);
  console.log(`\n${name}: ${cps.length} changes; within 2 months of WHTI ${near}, a range holds it ${hold}`);
  for (const c of cps) {
    const rg = c.range95;
    console.log(`  ${c.label}  ${c.meanBefore} -> ${c.meanAfter}  range95 ${rg ? `${rg.from} to ${rg.to}` : 'none'}${rg && rg.fromIndex <= WHTI && WHTI <= rg.toIndex ? '  (holds WHTI)' : ''}`);
  }
}
