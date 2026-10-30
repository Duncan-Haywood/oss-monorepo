import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real count series (data/coal-mining-disasters.csv): British coal-mining disasters with 10 or more deaths, per year,
// 1851-1962 (Jarrett 1979). The textbook Poisson changepoint: the rate falls from about 3 a year to about 1 around 1890
// (Raftery and Akman 1986 put the mode at 1890). Not the seasonal or trend paths; plain annual Poisson counts.
const rows = readFileSync(new URL('./data/coal-mining-disasters.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (opt) => analyze({ values, labels, ...opt }).pelt.changepoints;

test('real coal-mining disasters: Poisson finds the late-1880s/early-1890s fall and a range that holds 1890', () => {
  assert.equal(values.length, 112);
  assert.equal(values.reduce((a, b) => a + b, 0), 191);
  const cps = run({ model: 'poisson' });
  const c = cps.find((x) => +x.label >= 1885 && +x.label <= 1895);
  assert.ok(c, 'a change near 1890');
  assert.ok(c.meanBefore > 2.8 && c.meanBefore < 3.4 && c.meanAfter > 0.9 && c.meanAfter < 1.3, `${c.meanBefore} -> ${c.meanAfter}`);
  const truth = labels.indexOf('1890');
  assert.ok(c.range95.fromIndex <= truth && truth <= c.range95.toIndex, `${c.range95.from}-${c.range95.to}`);
  assert.ok(cps.length <= 3, `${cps.length} changes`);
});
