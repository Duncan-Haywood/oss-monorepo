import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/boston-marathon.csv): Boston Marathon winning times in minutes, 1897-2016 (120 values, fpp2::marathon).
// The 1924 course lengthening is not visible in the winners' means (153.0 before, 152.2 after), so it is not a test.
// Counts match README "Boston Marathon".
const rows = readFileSync(new URL('./data/boston-marathon.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, ...o }).pelt.changepoints.map((c) => c.label);

test('boston-marathon: 120 values; no model dates a change at 1924', () => {
  assert.equal(values.length, 120);
  for (const o of [{}, { model: 'mean', ar1: 'auto' }, { model: 'trend' }, { model: 'meanvar' }]) assert.ok(!labs(o).includes('1924'));
});

test('boston-marathon: counts by model', () => {
  assert.equal(labs({}).length, 9);
  assert.equal(labs({ model: 'mean', ar1: 'auto' }).length, 6);
  assert.equal(labs({ model: 'trend' }).length, 7);
  assert.equal(labs({ model: 'meanvar' }).length, 5);
});
