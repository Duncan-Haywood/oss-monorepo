import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/us-unemployment-duration.csv): US median weeks unemployed, monthly 1967-07 to 2015-04
// (574 rows; FRED UEMPMED via ggplot2 `economics`). It cycles with recessions, then rises from about 9 weeks to
// about 25 in 2009-10 and stays high: a documented level shift. Counts match README "US median unemployment duration".
const rows = readFileSync(new URL('./data/us-unemployment-duration.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, ...o });
const labs = (o) => run(o).pelt.changepoints.map((c) => c.label);

test('us-unemployment-duration: the default gives 53 changes and warns about rho', () => {
  assert.equal(values.length, 574);
  assert.equal(labs({}).length, 53);
  assert.match(run({}).rangeWarning, /autocorrelated \(rho about 0\.6/);
});

test('us-unemployment-duration: --bootstrap gives 48; --ar1 gives 15 and cuts the 2009 rise', () => {
  assert.equal(labs({ bootstrap: true }).length, 48);
  const a = labs({ ar1: true });
  assert.equal(a.length, 15);
  assert.ok(a.includes('2009-02') && a.includes('2009-06') && a.includes('2009-11'));
});

test('us-unemployment-duration: meanvar gives 27 changes', () => {
  assert.equal(labs({ model: 'meanvar' }).length, 27);
});
