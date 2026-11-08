import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Crimean War army disease death rate, monthly, 1854-04 to 1856-03 (data/nightingale-disease.csv).
// The Sanitary Commission reached the Crimea in March 1855; deaths from disease fell from there.
const rows = readFileSync(new URL('./data/nightingale-disease.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);

test('real documented fall: the level model dates a fall within a month of the March 1855 Sanitary Commission', () => {
  assert.equal(values.length, 24);
  const cps = analyze({ values, labels, model: 'mean', minSegment: 3 }).pelt.changepoints;
  const falls = cps.filter((c) => c.label >= '1855-02' && c.label <= '1855-04');
  assert.equal(falls.length, 1);
  assert.ok(falls[0].label === '1855-03');
});

test('the same series is cut into several steps, not one: a fall this smooth is a ramp', () => {
  const cps = analyze({ values, labels, model: 'mean', minSegment: 3 }).pelt.changepoints;
  assert.ok(cps.length >= 3);
});
