// The "not tried" item in README ("Holidays on a second real daily series"): a period-365 seasonal term on the
// Capital Bikeshare days, with and without the dataset's holiday list. Period 7 is the earlier baseline.
// usage: node eval/holiday-bikes-yearly.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const hol = rows.filter((r) => r[3] === '1').map((r) => r[0]);
for (const [name, col] of [['registered', 2], ['casual', 1]]) {
  const values = rows.map((r) => +r[col]);
  for (const period of [7, 365]) {
    const out = [false, true].map((h) => {
      const o = analyze({ values, labels, model: 'poisson', period, overdispersion: 'nb', ...(h ? { holidays: hol } : {}) });
      return { changes: o.pelt.changepoints.length, factor: o.holidays ? o.holidays.factor : null };
    });
    console.log(`${name} period ${period}: no list ${out[0].changes} changes; list ${out[1].changes} changes, factor ${out[1].factor.toFixed(3)}`);
  }
}
