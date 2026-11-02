import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real daily counts with real holidays (data/bike-sharing-daily.csv, Capital Bikeshare 2011-2012). Numbers match
// eval/holiday-bikes.out.txt. A negative result is pinned: the holiday list does not reduce the changes here.
const rows = readFileSync(new URL('./data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const hol = rows.filter((r) => r[3] === '1').map((r) => r[0]);

test('real bikeshare days: 21 holidays, and the holiday factor adds changes rather than removing them', () => {
  assert.equal(labels.length, 731);
  assert.equal(hol.length, 21);
  const values = rows.map((r) => +r[2]);
  const base = { values, labels, model: 'poisson', period: 7, overdispersion: 'nb' };
  const a = analyze(base), b = analyze({ ...base, holidays: hol });
  assert.equal(a.pelt.changepoints.length, 56);
  assert.equal(b.pelt.changepoints.length, 61);
  assert.ok(Math.abs(b.holidays.factor - 0.877) < 0.005);
});
