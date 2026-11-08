import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/au-arrivals-us.csv): quarterly short-term visitor arrivals to Australia from the US,
// thousands, 1981Q1-2012Q3 (127 values, fpp2::arrivals). Event dates (Expo 88, Sydney Olympics Sept 2000,
// 11 Sept 2001) are recalled, not read from a source. Counts match README "Australian arrivals from the US".
const rows = readFileSync(new URL('./data/au-arrivals-us.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, period: 4, ...o }).pelt.changepoints.map((c) => c.label);

test('arrivals-us: 127 values; the default mean model cuts 1988Q3, the Olympics quarter 2000Q3 and 2001Q3 among twelve', () => {
  assert.equal(values.length, 127);
  assert.deepEqual(labs({}), ['1983Q2', '1985Q2', '1986Q4', '1988Q3', '1989Q1', '1991Q3', '1995Q4', '1998Q1', '1999Q4', '2000Q3', '2001Q3', '2005Q1']);
});

test('arrivals-us: the trend model keeps the Olympics quarter and 2002Q1 with five cuts', () => {
  assert.deepEqual(labs({ model: 'trend' }), ['1986Q4', '1989Q1', '1997Q3', '2000Q3', '2002Q1']);
});

test('arrivals-us: meanvar and ar1 auto lose the Olympics quarter; meanvar dates 2002Q2', () => {
  const mv = labs({ model: 'meanvar' });
  assert.deepEqual(mv, ['1985Q4', '1993Q1', '1995Q3', '1998Q1', '2002Q2', '2005Q1']);
  assert.ok(!labs({ ar1: 'auto' }).includes('2000Q3'));
});
