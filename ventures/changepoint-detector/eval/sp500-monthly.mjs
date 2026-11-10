// A real return series with documented regimes: S&P 500 monthly log returns, Feb 2000 to Mar 2010 (data/sp500-monthly.csv, 122 returns).
// Recalled history (no source read): the 2000-02 bear market, a calm 2003-07 expansion, the 2007-09 crash, the 2009 rebound.
// Does `meanvar` find those regimes? usage: node eval/sp500-monthly.mjs
import { readFileSync } from 'node:fs';
import { analyze } from '../engine.mjs';
const rows = readFileSync(new URL('../data/sp500-monthly.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.slice(1).map((r) => r[0]);
const values = rows.slice(1).map((r, i) => Math.log(+r[1] / +rows[i][1]));
console.log(`n ${values.length}`);
for (const [name, opt] of [['meanvar, defaults', { model: 'meanvar' }], ['meanvar, --robust', { model: 'meanvar', robust: true }], ['meanvar, --bootstrap', { model: 'meanvar', bootstrap: true }], ['mean, defaults', { model: 'mean' }]]) {
  const r = analyze({ values, labels, ...opt });
  console.log(`\n${name}: ${r.pelt.changepoints.length} changes`);
  for (const c of r.pelt.changepoints) console.log(`  ${labels[c.index]}  mean ${(+c.meanBefore).toFixed(4)} -> ${(+c.meanAfter).toFixed(4)}`);
}
