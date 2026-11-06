import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/us-saving-rate.csv): US personal saving rate, % of disposable income, monthly 1967-07 to 2015-04
// (574 rows; FRED PSAVERT via ggplot2 `economics`). It falls slowly from about 12% to about 2% by 2005, then jumps in
// 2008-09. Counts match README "US personal saving rate".
const rows = readFileSync(new URL('./data/us-saving-rate.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, ...o });
const labs = (o) => run(o).pelt.changepoints.map((c) => c.label);

test('us-saving-rate: the default cuts a slow decline into 56 steps and warns about rho', () => {
  assert.equal(values.length, 574);
  assert.equal(labs({}).length, 56);
  assert.match(run({}).rangeWarning, /autocorrelated \(rho about 0\.75/);
});

test('us-saving-rate: --bootstrap still finds 49; --ar1 gives 7 and keeps the 2008 jump', () => {
  assert.equal(labs({ bootstrap: true }).length, 49);
  const a = labs({ ar1: true });
  assert.equal(a.length, 7);
  assert.ok(a.includes('2008-10'));
});

test('us-saving-rate: meanvar gives 24 changes', () => {
  assert.equal(labs({ model: 'meanvar' }).length, 24);
});
