import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real daily counts with real holidays (data/bike-sharing-daily.csv, Capital Bikeshare 2011-2012). Numbers match
// eval/holiday-bikes.out.txt. A negative result is pinned: the holiday list does not reduce the changes here.
const rows = readFileSync(new URL('./data/bike-sharing-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const hol = rows.filter((r) => r[3] === '1').map((r) => r[0]);

test('real bikeshare days: 21 holidays, and the holiday factor neither adds nor removes changes', () => {
  assert.equal(labels.length, 731);
  assert.equal(hol.length, 21);
  const values = rows.map((r) => +r[2]);
  const base = { values, labels, model: 'poisson', period: 7, overdispersion: 'nb' };
  const a = analyze(base), b = analyze({ ...base, holidays: hol });
  // (2026-11-15: the clumping size is read against the local level, eval/nb-size-local-preregistration.md; the old global-mean size was too large on these series, so the NB cost cut more often): 56 and 61 before
  assert.equal(a.pelt.changepoints.length, 30);
  assert.equal(b.pelt.changepoints.length, 30);
  assert.ok(Math.abs(b.holidays.factor - 0.877) < 0.005);
});
