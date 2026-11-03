// A real mean series with documented regimes: US ex-post real interest rate (tbill minus CPI inflation), 1959Q2-2009Q3
// (data/us-real-interest.csv). Garcia and Perron (1996) date shifts near 1973Q3 (down) and 1980Q3 (up); Bai and Perron
// (2003) find the same pair on 1961-86. Does the mean model find them?
// usage: node eval/us-real-interest.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/us-real-interest.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
console.log(`n ${values.length}`);
for (const [name, opt] of [['mean, defaults', {}], ['mean, --ar1', { ar1: true }], ['mean, --bootstrap', { bootstrap: true }]]) {
  const r = analyze({ values, labels, ...opt });
  console.log(`\n${name}: ${r.pelt.changepoints.length} changes`);
  for (const c of r.pelt.changepoints) {
    const rg = c.range95 ? `${labels[c.range95.fromIndex]} to ${labels[c.range95.toIndex]}` : 'none';
    console.log(`  ${labels[c.index]}  ${(+c.meanBefore).toFixed(2)} -> ${(+c.meanAfter).toFixed(2)}  range95 ${rg}`);
  }
}
