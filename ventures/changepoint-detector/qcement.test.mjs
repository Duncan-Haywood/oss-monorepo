import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/qcement.csv): Australian quarterly cement production, 1956Q1-2014Q1 (233 points, fpp2::qcement, tonnes millions).
// Australia's goods and services tax began on 1 July 2000 (recalled, not checked against a source): 2000Q2 is the
// highest quarter of that year (2.07), then 1.90 and 1.65. Counts match README "Cement and the 2000 GST".
const rows = readFileSync(new URL('./data/qcement.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), raw = rows.map((r) => +r[1]), lg = raw.map(Math.log);
const labs = (o) => analyze({ labels, period: 4, ...o }).pelt.changepoints.map((c) => c.label);
const near = (l) => l.filter((x) => /^(1999|2000|2001)/.test(x));

test('qcement: 233 quarters, 2000Q2 is the 2000 peak', () => {
  assert.equal(labels.length, 233);
  assert.ok(raw[labels.indexOf('2000Q2')] > raw[labels.indexOf('2000Q3')]);
});

test('qcement: level and trend fits date the fall at 2000Q3 or 2000Q4, but cut 20 or more times', () => {
  assert.deepEqual(near(labs({ values: raw })), ['2000Q4', '2001Q4']);
  assert.deepEqual(near(labs({ values: lg })), ['2000Q4']);
  assert.deepEqual(near(labs({ values: lg, model: 'trend' })), ['2000Q3', '2001Q4']);
  assert.deepEqual(near(labs({ values: lg, trend: 'bend' })), ['2000Q3']);
  for (const o of [{ values: raw }, { values: lg }, { values: lg, trend: 'bend' }]) assert.ok(labs(o).length >= 20);
});

test('qcement: allowing for autocorrelation or volatility absorbs the GST fall (no change dated 1999-2001)', () => {
  assert.equal(labs({ values: lg, ar1: 'auto' }).length, 8);
  assert.equal(labs({ values: lg, ar1: 'joint' }).length, 6);
  assert.equal(labs({ values: lg, model: 'meanvar' }).length, 9);
  for (const o of [{ ar1: 'auto' }, { ar1: 'joint' }, { model: 'meanvar' }]) assert.deepEqual(near(labs({ values: lg, ...o })), []);
});
