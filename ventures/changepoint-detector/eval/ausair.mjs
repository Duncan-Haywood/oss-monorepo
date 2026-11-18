// Australian air transport passengers 1970-2016 (data/ausair.csv, fpp2::ausair, 47 annual values, millions).
// Documented events: the 1989 domestic pilots' dispute (a dip) and the 2001 Ansett collapse with 11 September.
// Do any of the models date a change near 1989 or 2001? (Event dates recalled from memory, not read from a source.)
// usage: node eval/ausair.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/ausair.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
console.log(`Australian air passengers: n ${values.length}, ${labels[0]} to ${labels[labels.length - 1]}, millions`);
for (const [name, opt] of [['default', {}], ['mean, ar1 auto', { model: 'mean', ar1: 'auto' }], ['trend', { model: 'trend' }], ['meanvar', { model: 'meanvar' }]]) {
  const a = analyze({ values, labels, ...opt });
  console.log(`  ${name}: ${a.pelt.changepoints.length} change(s) [${a.pelt.changepoints.map((c) => c.label).join(' ')}]${a.rangeWarning ? ', rangeWarning' : ''}${a.driftWarning ? ', driftWarning' : ''}`);
}
