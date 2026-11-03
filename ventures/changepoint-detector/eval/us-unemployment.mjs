// A real series of recessions: US civilian unemployment rate (%), 1959Q2-2009Q3 (data/us-unemployment.csv, macrodata `unemp`).
// Rises in 1970, 1974-75, 1980-82, 1990-92, 2001-03 and 2008-09 are recessions that decay: shocks with a slow return, not steps.
// What does the mean model do with a series that moves like this? usage: node eval/us-unemployment.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-unemployment.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
console.log(`n ${values.length}`);
for (const [name, opt] of [['mean, defaults', {}], ['mean, --ar1', { ar1: true }], ['mean, --bootstrap', { bootstrap: true }], ['mean, --min-segment 12', { minSegment: 12 }]]) {
  const r = analyze({ values, labels, ...opt });
  console.log(`\n${name}: ${r.pelt.changepoints.length} changes`);
  for (const c of r.pelt.changepoints) {
    const rg = c.range95 ? `${labels[c.range95.fromIndex]} to ${labels[c.range95.toIndex]}` : 'none';
    console.log(`  ${labels[c.index]}  ${(+c.meanBefore).toFixed(2)} -> ${(+c.meanAfter).toFixed(2)}  range95 ${rg}`);
  }
}
