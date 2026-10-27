import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/lake-huron.csv): annual mean level of Lake Huron, 1875-1972, feet. Literature puts one drop
// near 1920 (Beaulieu, Chen and Miranda 2012 and others); the lake level is strongly autocorrelated, so this
// is the AR(1) case the Nile is not. The tests pin what the detector does today, not what it should do.
const rows = readFileSync(new URL('./data/lake-huron.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (opt) => analyze({ values, labels, ...opt }).pelt.changepoints;

test('real Lake Huron, plain mean: autocorrelation breeds extra changes, and 1923 is among them', () => {
  const cps = run({});
  assert.ok(cps.length >= 5);
  const c = cps.find((x) => x.label === '1923');
  assert.ok(c);
  assert.ok(labels[c.range95.fromIndex] <= '1923' && labels[c.range95.toIndex] >= '1923');
});

test('real Lake Huron, --ar1 (plain and joint): no change at all, the drop is missed', () => {
  assert.equal(run({ ar1: true }).length, 0);
  assert.equal(run({ ar1: 'joint' }).length, 0);
});

test('real Lake Huron, meanvar: two changes, 1889 and 1923, the 1923 range holding 1919 to 1925', () => {
  const cps = run({ model: 'meanvar' });
  assert.deepEqual(cps.map((c) => c.label), ['1889', '1923']);
  assert.equal(labels[cps[1].range95.fromIndex], '1919');
  assert.equal(labels[cps[1].range95.toIndex], '1925');
});
