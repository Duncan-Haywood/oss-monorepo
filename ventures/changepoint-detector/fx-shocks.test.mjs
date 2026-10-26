import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';

// Real daily FX returns (data/fx-daily-returns.csv). Numbers match eval/fx-shocks.out.txt.
const rows = readFileSync(new URL('./data/fx-daily-returns.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]);
const chf = rows.map((r) => +r[1]);
const run = (opt) => analyze({ values: chf, labels, model: 'meanvar', ...opt }).pelt.changepoints.map((c) => c.label);

test('Swiss franc: the 2015-01-15 floor removal is found by default and by --robust, which drops three of the four other changes', () => {
  assert.equal(rows.length, 1751);
  const d = run({});
  assert.deepEqual(d, ['2014-03-07', '2014-09-04', '2015-01-15', '2015-01-30', '2016-03-18', '2018-03-09']);
  assert.deepEqual(run({ robust: true }), ['2015-01-15', '2015-01-30', '2016-03-18']);
});
