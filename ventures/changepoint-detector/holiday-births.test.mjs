import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real daily US births 1978-1988; numbers match eval/holiday-births.out.txt. The holiday list removes changes here.
const rows = readFileSync(new URL('./data/us-births-daily.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));

test('real births: the holiday list removes changes in every year it was run on', () => {
  assert.equal(rows.length, 4018);
  let ta = 0, tb = 0;
  for (let y = 1978; y <= 1988; y++) {
    const win = rows.filter((r) => r[0].startsWith(y + '-'));
    const values = win.map((r) => +r[1]), labels = win.map((r) => r[0]);
    const hol = win.filter((r) => r[2] === '1').map((r) => r[0]);
    assert.equal(hol.length, 6);
    const base = { values, labels, model: 'poisson', period: 7, overdispersion: 'nb' };
    const a = analyze(base).pelt.changepoints.length, b = analyze({ ...base, holidays: hol }).pelt.changepoints.length;
    assert.ok(b <= a, String(y));
    ta += a; tb += b;
  }
  assert.equal(ta, 239);
  assert.equal(tb, 205);
});
