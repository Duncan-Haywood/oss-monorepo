// Real daily counts: English Wikipedia pageviews of "Payroll" (data/payroll-views.csv), 2023-2024, with US federal holidays listed.
// Does the holiday factor change what PELT reports? usage: node eval/holiday-real.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/payroll-views.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const hol = '2023-01-02,2023-01-16,2023-02-20,2023-05-29,2023-06-19,2023-07-04,2023-09-04,2023-11-23,2023-12-25,2024-01-01,2024-01-15,2024-02-19,2024-05-27,2024-06-19,2024-07-04,2024-09-02,2024-11-28,2024-12-25'.split(',');
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const wd = values.filter((_, i) => { const d = new Date(labels[i] + 'T00:00Z').getUTCDay(); return d > 0 && d < 6 && !hol.includes(labels[i]); });
const hv = labels.map((l, i) => hol.includes(l) ? values[i] : null).filter((v) => v !== null);
console.log(`n ${values.length}; median weekday views ${med(wd)}; median holiday views ${med(hv)} (ratio ${(med(hv) / med(wd)).toFixed(2)})`);
for (const [name, opt] of [['no holidays', {}], ['with holidays', { holidays: hol }]]) {
  const o = analyze({ values, labels, model: 'poisson', period: 7, overdispersion: 'nb', ...opt });
  console.log(`${name}: ${o.pelt.changepoints.length} changes, ${o.holidays ? 'holiday factor ' + o.holidays.factor.toFixed(3) : ''}`);
}
