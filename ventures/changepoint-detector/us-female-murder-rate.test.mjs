import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/us-female-murder-rate.csv): US female murder rate per 100,000, 1950-2004 (55 values, fpp2::wmurders).
// Recalled, not read from a source: US homicide peaked near 1980 and again about 1991-93, then fell. Counts match eval/us-female-murder-rate.out.txt.
const rows = readFileSync(new URL('./data/us-female-murder-rate.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, ...o }).pelt.changepoints.map((c) => c.label);

test('us-female-murder-rate: 55 values; level model cuts the rise and fall into 10 steps', () => {
  assert.equal(values.length, 55);
  assert.deepEqual(labs({}), ['1960', '1966', '1970', '1973', '1976', '1983', '1986', '1995', '1997', '2002']);
});

test('us-female-murder-rate: the AR(1) level model keeps one step, 1966; trend keeps five', () => {
  assert.deepEqual(labs({ ar1: 'auto' }), ['1966']);
  assert.deepEqual(labs({ model: 'trend' }), ['1963', '1976', '1983', '1994', '2001']);
});

test('us-female-murder-rate: trend bends date slope changes at 1980 and 1993', () => {
  const t = analyze({ values, labels, trend: 'bends' }).trend;
  assert.deepEqual(t.slopeChangeRange95.map((s) => s.at), ['1980', '1993']);
});
