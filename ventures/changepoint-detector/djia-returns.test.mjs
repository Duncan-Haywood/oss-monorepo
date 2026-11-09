import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real series (data/djia-returns.csv): DJIA daily log returns in percent, 1980-01-03 to 2012-12-31, 8,609 days.
// Counts and dates match README "Dow Jones returns: 1987 and 2008".
const rows = readFileSync(new URL('./data/djia-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);
const run = (o) => analyze({ values, labels, model: 'meanvar', ...o }).pelt.changepoints.map((c) => c.label);

test('djia: plain meanvar cuts 27 times and dates 2008-09-15 (Lehman) exactly', () => {
  assert.equal(values.length, 8609);
  const c = run({});
  assert.equal(c.length, 27);
  assert.ok(c.includes('2008-09-15'));
  assert.ok(c.includes('1987-10-14') && c.includes('1987-10-28'));
});

test('djia: --dispersion keeps 1987-10 and 2008-09 in 10 cuts; --bootstrap keeps both in 11', () => {
  const d = run({ dispersion: true });
  assert.deepEqual(d, ['1987-10-06', '1988-01-11', '1991-12-31', '1997-03-13', '2003-07-28', '2007-07-10', '2008-09-04', '2009-04-21', '2011-08-02', '2011-12-21']);
  const b = run({ bootstrap: true });
  assert.deepEqual(b, ['1987-10-14', '1987-10-28', '1988-01-27', '1991-12-31', '1997-03-13', '2003-07-28', '2007-07-10', '2008-09-04', '2009-04-21', '2011-08-02', '2011-12-21']);
});
