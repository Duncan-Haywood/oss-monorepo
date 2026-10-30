// A real mean series with documented regimes: US quarterly CPI inflation, 1959Q2-2009Q3 (data/us-inflation.csv).
// The Great Inflation starts with the 1973 oil shock, a second surge in 1978-79, and the Volcker disinflation ends it
// in 1981-82 (Stock and Watson 2007, "Why has US inflation become harder to forecast?"). Does the mean model find them?
// usage: node eval/us-inflation.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-inflation.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
console.log(`n ${values.length}`);
for (const [name, opt] of [['mean, defaults', {}], ['mean, --ar1', { ar1: true }], ['mean, --bootstrap', { bootstrap: true }], ['mean, --bootstrap, min segment 8', { bootstrap: true, minSegment: 8 }]]) {
  const r = analyze({ values, labels, ...opt });
  console.log(`\n${name}: ${r.pelt.changepoints.length} changes`);
  for (const c of r.pelt.changepoints) {
    const rg = c.range95 ? `${labels[c.range95.fromIndex]} to ${labels[c.range95.toIndex]}` : 'none';
    console.log(`  ${labels[c.index]}  ${(+c.meanBefore).toFixed(2)} -> ${(+c.meanAfter).toFixed(2)}  range95 ${rg}`);
  }
}
