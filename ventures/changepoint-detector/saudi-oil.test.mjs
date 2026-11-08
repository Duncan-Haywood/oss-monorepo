import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/saudi-oil.csv): Saudi Arabian oil production, millions of tonnes a year, 1965-2013 (49 values, fpp2::oil).
// Known events (recalled, no source read): the 1973 embargo and price jump, the 1982-85 cut as swing producer, the 1990-91 Gulf War surge.
// Counts match README "Saudi oil production".
const rows = readFileSync(new URL('./data/saudi-oil.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, ...o }).pelt.changepoints.map((c) => c.label);

test('saudi-oil: 49 values', () => {
  assert.equal(values.length, 49);
});

test('saudi-oil: the level model dates the 1973 jump, the 1982 fall and the 1991 surge', () => {
  assert.deepEqual(labs({}), ['1971', '1973', '1979', '1982', '1984', '1988', '1991', '2003']);
  const c73 = analyze({ values, labels }).pelt.changepoints.find((c) => c.label === '1973');
  assert.ok(c73.shift > 140 && c73.shiftInNoiseSd > 5);
});

test('saudi-oil: trend model keeps four changes at 1972, 1982, 1986, 1991', () => {
  assert.deepEqual(labs({ model: 'trend' }), ['1972', '1982', '1986', '1991']);
});

test('saudi-oil: meanvar finds 1991 and 2003; the AR(1) level model finds nothing', () => {
  assert.deepEqual(labs({ model: 'meanvar' }), ['1991', '2003']);
  assert.deepEqual(labs({ model: 'mean', ar1: 'auto' }), []);
});
