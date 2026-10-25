import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/us-gdp-growth.csv): US real GDP growth, annualised. The documented break is the
// Great Moderation at 1984Q1 (McConnell and Perez-Quiros 2000). Numbers match eval/great-moderation.out.txt.
const rows = readFileSync(new URL('./data/us-gdp-growth.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const TRUTH = labels.indexOf('1984Q1');
const run = (opt) => analyze({ values, labels, model: 'meanvar', ...opt }).pelt.changepoints;

test('real GDP growth: a longer minimum segment dates the volatility drop with a range that holds 1984Q1', () => {
  assert.equal(labels.length, 202);
  const cps = run({ minSegment: 20 });
  const c = cps.find((x) => x.label === '1984Q3');
  assert.ok(c, 'a change at 1984Q3');
  assert.ok(c.sdBefore > 4 && c.sdAfter < 2.1, `sd ${c.sdBefore} -> ${c.sdAfter}`);
  assert.ok(c.range95.fromIndex <= TRUTH && TRUTH <= c.range95.toIndex);
});

test('real GDP growth: the default minimum segment of 5 reports a calm patch whose range misses 1984Q1 (documented limit)', () => {
  const cps = run({});
  const c = cps.find((x) => x.label === '1984Q3');
  assert.ok(c);
  assert.ok(c.sdBefore < 1, 'the segment before it is the 5-quarter calm patch');
  assert.ok(!(c.range95.fromIndex <= TRUTH && TRUTH <= c.range95.toIndex));
});

test('real GDP growth: the default run warns about the short segment; a longer minimum does not', () => {
  const warn = analyze({ values, labels, model: 'meanvar' }).rangeWarning;
  assert.match(warn, /fewer than 10 points/);
  assert.equal(analyze({ values, labels, model: 'meanvar', minSegment: 12 }).rangeWarning, undefined);
});
