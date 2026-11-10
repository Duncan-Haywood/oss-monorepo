import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real return series (data/sp500-monthly.csv): S&P 500 monthly log returns, Feb 2000 to Mar 2010. History is recalled, no source read.
// Numbers match eval/sp500-monthly.out.txt.
const rows = readFileSync(new URL('./data/sp500-monthly.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.slice(1).map((r) => r[0]);
const values = rows.slice(1).map((r, i) => Math.log(+r[1] / +rows[i][1]));
const run = (opt) => analyze({ values, labels, ...opt }).pelt.changepoints.map((c) => labels[c.index]);

test('meanvar cuts the crash start and the March 2009 rebound, defaults and --robust', () => {
  assert.equal(values.length, 122);
  for (const opt of [{ model: 'meanvar' }, { model: 'meanvar', robust: true }]) {
    const l = run(opt);
    assert.equal(l.length, 3);
    assert.ok(l.includes('Nov 1 2007') && l.includes('Mar 1 2009'));
  }
});

test('the mean model dates the Lehman month, Sep 2008, then the March 2009 turn', () => {
  assert.deepEqual(run({ model: 'mean' }), ['Sep 1 2008', 'Mar 1 2009']);
});

test('--bootstrap reports no change at all (a negative result, pinned)', () => {
  assert.deepEqual(run({ model: 'meanvar', bootstrap: true }), []);
});
