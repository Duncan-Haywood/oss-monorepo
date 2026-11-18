import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/au-arrivals-japan.csv): quarterly short-term visitor arrivals to Australia from Japan,
// thousands, 1981Q1-2012Q3 (127 values, fpp2::arrivals). Event dates (Asian financial crisis 1997-98, SARS in
// 2003, global financial crisis 2008-09) are recalled, not read from a source. Counts match README
// "Australian arrivals from Japan".
const rows = readFileSync(new URL('./data/au-arrivals-japan.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const labs = (o) => analyze({ values, labels, period: 4, ...o }).pelt.changepoints.map((c) => c.label);

test('arrivals-japan: 127 values; the default mean model dates 1998Q4, 2003Q2 and 2009Q1 among twelve cuts', () => {
  assert.equal(values.length, 127);
  assert.deepEqual(labs({}), ['1986Q2', '1988Q2', '1990Q1', '1991Q4', '1994Q1', '1995Q2', '1998Q4', '2003Q2', '2003Q4', '2006Q2', '2008Q1', '2009Q1']);
});

test('arrivals-japan: the trend model keeps SARS (2003Q4) and the crisis year 2008Q2 with four cuts; meanvar misses SARS', () => {
  assert.deepEqual(labs({ model: 'trend' }), ['1987Q2', '1996Q2', '2003Q4', '2008Q2']);
  const mv = labs({ model: 'meanvar' });
  assert.ok(mv.includes('1998Q4') && mv.includes('2008Q2'));
  assert.ok(!mv.some((l) => l.startsWith('2003')));
});

test('arrivals-japan: ar1 auto drops to eight cuts, keeps 1998Q4, loses SARS', () => {
  const a = labs({ ar1: 'auto' });
  assert.equal(a.length, 8);
  assert.ok(a.includes('1998Q4'));
  assert.ok(!a.some((l) => l.startsWith('2003')));
});
