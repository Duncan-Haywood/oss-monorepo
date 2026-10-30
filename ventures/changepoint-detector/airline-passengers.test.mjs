import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/airline-passengers.csv): monthly airline passengers 1949-1960, a season that grows with the level.
// It has no documented step, so every changepoint below is a false alarm. Counts match README "Multiplicative season on a real series".
const rows = readFileSync(new URL('./data/airline-passengers.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.replace(/"/g, '').split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]), logs = raw.map(Math.log);
const n = (o, v = raw) => analyze({ values: v, labels, period: 12, ...o }).pelt.changepoints.length;

test('airline passengers: the raw level models cut a smooth exponential rise into 15 to 22 steps, additive or multiplicative season', () => {
  assert.equal(raw.length, 144);
  assert.equal(n({}), 21);
  assert.equal(n({ seasonMode: 'multiplicative' }), 22);
  assert.equal(n({ trend: 'bend' }), 20);
  assert.equal(n({ seasonMode: 'multiplicative', trend: 'bend' }), 15);
});

test('airline passengers: the log series with one linear trend is the model that fits, 8 steps, 5 with meanvar', () => {
  assert.equal(n({ trend: 'bend' }, logs), 8);
  assert.equal(n({ trend: 'bend', model: 'meanvar' }, logs), 5);
});
