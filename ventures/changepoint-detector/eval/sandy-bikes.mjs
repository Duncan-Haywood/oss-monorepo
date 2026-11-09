// Real daily counts, a documented shock: Hurricane Sandy closed Washington DC's Capital Bikeshare system around
// 2012-10-29 (recalled, source unread). Does the detector place a short outage, for both rider types, with and
// without a log or a count model?  usage: node eval/sandy-bikes.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
console.log(`Sandy day ${labels.indexOf('2012-10-29')} of ${labels.length}; rows 2012-10-29..11-01: ${rows.slice(667, 671).map((r) => `${r[0]} casual ${r[1]} registered ${r[2]}`).join('; ')}`);
for (const [name, col] of [['registered', 2], ['casual', 1]]) {
  const values = rows.map((r) => +r[col]);
  for (const [setup, opt] of [['poisson nb', { model: 'poisson', period: 7, overdispersion: 'nb' }], ['mean log', { model: 'mean', period: 7, log: true }], ['mean', { model: 'mean', period: 7 }]]) {
    const c = analyze({ values, labels, ...opt }).pelt.changepoints;
    const near = c.filter((x) => x.label >= '2012-10-15' && x.label <= '2012-11-30').map((x) => `${x.label}[${x.range95.fromIndex}-${x.range95.toIndex}]`);
    console.log(`${name} ${setup}: ${c.length} changes; 2012-10-15..11-30: ${near.join(' ')}`);
  }
}
