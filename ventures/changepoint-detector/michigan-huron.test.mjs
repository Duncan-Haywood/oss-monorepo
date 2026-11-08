import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/michigan-huron.csv): yearly mean level of Lakes Michigan-Huron, 1918-2009, metres.
// Counts match README "Lakes Michigan-Huron". The lake fell about 0.5 m between 1997 and 2000 and stayed low.
const rows = readFileSync(new URL('./data/michigan-huron.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, ...o });
const labs = (o) => run(o).pelt.changepoints.map((c) => c.label);

test('michigan-huron: the default finds the 1999 fall among 12 changes and warns about rho', () => {
  assert.equal(values.length, 92);
  const l = labs({});
  assert.equal(l.length, 12);
  assert.ok(l.includes('1999'));
  assert.match(run({}).rangeWarning, /autocorrelated \(rho about 0\.9/);
});

test('michigan-huron: --bootstrap keeps 1999 and drops three of the twelve; --ar1 finds nothing', () => {
  const b = labs({ bootstrap: true });
  assert.equal(b.length, 9);
  assert.ok(b.includes('1999'));
  assert.deepEqual(labs({ ar1: true }), []);
});

test('michigan-huron: meanvar gives two changes, 1969 and 1999, and says the variance model is stretched', () => {
  const a = run({ model: 'meanvar' });
  assert.deepEqual(a.pelt.changepoints.map((c) => c.label), ['1969', '1999']);
  const c = a.pelt.changepoints[1];
  assert.equal(labels[c.range95.fromIndex], '1999');
  assert.equal(labels[c.range95.toIndex], '2000');
  assert.match(a.rangeWarning, /autocorrelation \(lag 1: 0\.61\)/);
});
