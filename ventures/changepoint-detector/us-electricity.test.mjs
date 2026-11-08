import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';
import { slopeBreaks, slopeBreakPValue } from './slope-breaks.mjs';

// Real series (data/us-electricity.csv): US monthly net electricity generation, billion kWh, 1973-01 to 2013-06
// (486 values, fpp2::usmelec). Documented: US generation grew for decades, peaked in 2007 and has been flat since
// (recalled, source not read). Counts match README "US electricity generation".
const rows = readFileSync(new URL('./data/us-electricity.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, period: 12, ...o }).pelt.changepoints.map((c) => c.label);
const annual = Array.from({ length: 40 }, (_, y) => values.slice(y * 12, y * 12 + 12).reduce((a, b) => a + b));

test('us-electricity: 486 months', () => assert.equal(values.length, 486));

test('us-electricity: a fixed-season mean model over-cuts a growing series, 38 changes', () => {
  assert.equal(labs({ model: 'mean' }).length, 38);
});

test('us-electricity: --ar1 joint keeps three changes (1978-09, 1989-02, 1998-05); none is near 2007', () => {
  assert.deepEqual(labs({ model: 'mean', ar1: 'joint' }), ['1978-09', '1989-02', '1998-05']);
});

test('us-electricity: the annual slope test dates the stall at 2007 but does not clear its bar', () => {
  assert.equal(slopeBreaks(annual, { critical: 'auto' }).knots.length, 0);
  const p = slopeBreakPValue(annual, { reps: 499 });
  assert.ok(p.w > 7 && p.w < p.bar95 && p.p > 0.05);
  const best = slopeBreaks(annual, { critical: 0 }).knots.find((k) => k.index === 34); // 1973 + 34
  assert.ok(best.before > 60 && best.after < 0);
});
