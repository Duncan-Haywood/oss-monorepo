import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real daily counts (data/payroll-views.csv, data/SOURCE.md): English Wikipedia pageviews of "Payroll", 2023-2024.
// Pins README "Holidays on a real daily series": a negative result for the holiday factor (47 -> 45 changes).
const rows = readFileSync(new URL('./data/payroll-views.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const hol = '2023-01-02,2023-01-16,2023-02-20,2023-05-29,2023-06-19,2023-07-04,2023-09-04,2023-11-23,2023-12-25,2024-01-01,2024-01-15,2024-02-19,2024-05-27,2024-06-19,2024-07-04,2024-09-02,2024-11-28,2024-12-25'.split(',');
const run = (o) => analyze({ values, labels, model: 'poisson', period: 7, overdispersion: 'nb', ...o });

// (2026-11-15: the clumping size is read against the local level, eval/nb-size-local-preregistration.md; the old global-mean size was too large on these series, so the NB cost cut more often): 47 and 45 before
test('payroll: 731 days; holidays move 26 changes to 25 with a factor near 0.96', () => {
  assert.equal(values.length, 731);
  assert.equal(run({}).pelt.changepoints.length, 26);
  const o = run({ holidays: hol });
  assert.equal(o.pelt.changepoints.length, 25);
  assert.ok(Math.abs(o.holidays.factor - 0.957) < 0.005);
});
