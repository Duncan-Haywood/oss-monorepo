import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/au-departures.csv): monthly short-term resident departures from Australia, thousands, 1976-01 to
// 2017-06 (498 values, fpp2::departures resshort). Documented shocks: the Bali bombing (2002-10) and SARS (2003-04 to
// 2003-06). The mean models cut neither; the trend model cuts 2003-03, a month before SARS (README "Australian departures").
const rows = readFileSync(new URL('./data/au-departures.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, period: 12, ...o }).pelt.changepoints.map((c) => c.label);
const shock = (l) => l >= '2002-09' && l <= '2003-07';

test('au-departures: 498 values; the mean models do not cut at Bali or SARS; trend cuts 2003-03', () => {
  assert.equal(values.length, 498);
  for (const o of [{}, { ar1: true }, { ar1: 'auto' }]) assert.ok(!labs(o).some(shock));
  assert.deepEqual(labs({ model: 'trend' }).filter(shock), ['2003-03']);
});

test('au-departures: counts by model (a growing series is over-cut)', () => {
  assert.equal(labs({}).length, 42);
  assert.equal(labs({ ar1: true }).length, 28);
  assert.equal(labs({ model: 'trend' }).length, 21);
});
