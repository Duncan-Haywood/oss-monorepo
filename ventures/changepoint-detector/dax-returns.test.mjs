import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/dax-returns.csv): DAX daily log returns in percent, 1,859 days, 1991-1998.
// Counts and rows match README "A real volatility rise: DAX returns".
const rows = readFileSync(new URL('./data/dax-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, model: 'meanvar', ...o }).pelt.changepoints.map((c) => +c.label);

test('dax: plain meanvar cuts six times, including a 10-day spike and a 57-day dip', () => {
  assert.equal(values.length, 1859);
  assert.deepEqual(run({}), [32, 42, 275, 332, 1132, 1482]);
});

test('dax: --bootstrap and --dispersion cut far less, and the last cut sits at row 1482 (1488 with --robust)', () => {
  assert.deepEqual(run({ bootstrap: true }), [32, 42, 1482]);
  assert.deepEqual(run({ dispersion: true }), [39, 1482]);
  assert.deepEqual(run({ robust: true }).slice(-1), [1488]);
});
