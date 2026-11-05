import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Numbers match eval/holiday-bikes-yearly.out.txt: a period-365 term on two years of real bike-share days.
const rows = readFileSync(new URL('./data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const hol = rows.filter((r) => r[3] === '1').map((r) => r[0]);

test('period 365 on 731 bike-share days: more changes than period 7, and the holiday list removes some of them', () => {
  const values = rows.map((r) => +r[2]);
  const base = { values, labels, model: 'poisson', period: 365, overdispersion: 'nb' };
  const a = analyze(base), b = analyze({ ...base, holidays: hol });
  assert.equal(a.pelt.changepoints.length, 134);
  assert.equal(b.pelt.changepoints.length, 125);
  assert.ok(Math.abs(b.holidays.factor - 0.894) < 0.005);
});
