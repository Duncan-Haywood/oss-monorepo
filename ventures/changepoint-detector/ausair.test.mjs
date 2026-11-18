import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/ausair.csv): Australian air transport passengers in millions, 1970-2016 (47 values, fpp2::ausair).
// Event dates (1989 pilots' dispute, 2001 Ansett collapse) are recalled, not read from a source. Counts match README "Australian air passengers".
const rows = readFileSync(new URL('./data/ausair.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, ...o }).pelt.changepoints.map((c) => c.label);

test('ausair: 47 values; three of four models date 2002, the trend model also 1989', () => {
  assert.equal(values.length, 47);
  assert.deepEqual(labs({ model: 'mean', ar1: 'auto' }), ['2002']);
  assert.deepEqual(labs({ model: 'trend' }), ['1989', '1993', '2002', '2010']);
  assert.deepEqual(labs({ model: 'meanvar' }), ['1980', '1991', '2002']);
});

test('ausair: the default mean model over-cuts the smooth growth', () => {
  assert.equal(labs({}).length, 13);
});
