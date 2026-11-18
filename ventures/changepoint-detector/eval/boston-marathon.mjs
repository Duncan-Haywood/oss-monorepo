// Boston Marathon winning times 1897-2016 (data/boston-marathon.csv, fpp2::marathon, 120 values, minutes).
// Documented step: the course was lengthened from about 24.5 miles to the full 26.2 in 1924 (recalled from the Boston
// Athletic Association's history; the BAA page was not read here), about +7% in distance. Does any model date a change at 1924?
// usage: node eval/boston-marathon.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/boston-marathon.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
console.log(`Boston marathon: n ${values.length}, ${labels[0]} to ${labels[labels.length - 1]}, minutes`);
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
console.log(`  mean 1897-1923 ${mean(values.slice(0, 27)).toFixed(1)}, 1924-1950 ${mean(values.slice(27, 54)).toFixed(1)}`);
for (const [name, opt] of [['default', {}], ['mean, ar1 auto', { model: 'mean', ar1: 'auto' }], ['trend', { model: 'trend' }], ['meanvar', { model: 'meanvar' }]]) {
  const a = analyze({ values, labels, ...opt });
  console.log(`  ${name}: ${a.pelt.changepoints.length} change(s) [${a.pelt.changepoints.map((c) => c.label).join(' ')}]${a.rangeWarning ? ', rangeWarning' : ''}${a.driftWarning ? ', driftWarning' : ''}`);
}
