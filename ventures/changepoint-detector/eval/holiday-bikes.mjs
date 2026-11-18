// Real daily counts with real holidays: Capital Bikeshare (Washington DC) registered-rider rentals per day,
// 2011-2012, with the dataset's own holiday flag. Does the holiday factor change what PELT reports?
// usage: node eval/holiday-bikes.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const hol = rows.filter((r) => r[3] === '1').map((r) => r[0]);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
for (const col of [['registered', 2], ['casual', 1]]) {
  const values = rows.map((r) => +r[col[1]]);
  const wd = rows.filter((r, i) => r[3] === '0' && new Date(r[0] + 'T00:00Z').getUTCDay() % 6 !== 0).map((r) => +r[col[1]]);
  const hv = hol.map((h) => values[labels.indexOf(h)]);
  console.log(`${col[0]}: n ${values.length}, ${hol.length} holidays; median weekday ${med(wd)}, median holiday ${med(hv)} (ratio ${(med(hv) / med(wd)).toFixed(2)})`);
  for (const [name, opt] of [['no holidays', {}], ['with holidays', { holidays: hol }]]) {
    const o = analyze({ values, labels, model: 'poisson', period: 7, overdispersion: 'nb', ...opt });
    console.log(`  ${name}: ${o.pelt.changepoints.length} changes${o.holidays ? ', holiday factor ' + o.holidays.factor.toFixed(3) : ''}`);
  }
}
