import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/nottem.csv): monthly mean air temperature at Nottingham Castle, 1920-1939, deg F.
// A stable climate with a strong season and no documented step, so every changepoint below is a false alarm.
// Counts match README "A real null series: Nottingham temperatures".
const rows = readFileSync(new URL('./data/nottem.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, period: 12, ...o }).pelt.changepoints.map((c) => c.label);

test('nottem: the default mean model cuts two single-month spikes (Jul-Sep 1922, Jan-Mar 1929) as steps', () => {
  assert.equal(values.length, 240);
  assert.deepEqual(run({}), ['1922-07', '1922-09', '1929-01', '1929-03']);
});

test('nottem: a 6-month minimum segment, meanvar, and meanvar with the bootstrap penalty leave no step or only two', () => {
  assert.deepEqual(run({ minSegment: 6 }), ['1933-03', '1933-10']);
  assert.deepEqual(run({ minSegment: 6, model: 'meanvar' }), []);
  assert.deepEqual(run({ model: 'meanvar', bootstrap: true }), []);
});
