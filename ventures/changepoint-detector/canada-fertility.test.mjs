import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/canada-fertility.csv): Canada's total fertility rate (births per 1,000 women), 1931-1968,
// 38 values, carData::Hartnagel column tfr. The baby boom starting 1946 is the documented step (recalled, not
// read from a source). Counts match README "Canada's baby boom".
const rows = readFileSync(new URL('./data/canada-fertility.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, ...o }).pelt.changepoints.map((c) => c.label);

test('canada-fertility: 38 values; the plain model cuts the 1946 boom among seven changes', () => {
  assert.equal(values.length, 38);
  assert.deepEqual(labs({}), ['1933', '1942', '1946', '1953', '1963', '1965', '1967']);
});

test('canada-fertility: meanvar keeps 1946 and 1959 as the only two cuts', () => {
  assert.deepEqual(labs({ model: 'meanvar' }), ['1946', '1959']);
});

test('canada-fertility: the trend model keeps 1946; ar1 sees no change at all', () => {
  assert.deepEqual(labs({ model: 'trend' }), ['1937', '1946', '1962']);
  assert.deepEqual(labs({ ar1: true }), []);
});
