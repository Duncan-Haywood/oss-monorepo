import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const run = (f) => execFileSync('node', [new URL(`./eval/${f}.mjs`, import.meta.url).pathname], { encoding: 'utf8' });
const saved = (f) => readFileSync(new URL(`./eval/${f}.out.txt`, import.meta.url), 'utf8');
test('annual means of US productivity: 1973 again, still under the bar of 11 (negative result, 2026-11-04)', () => {
  const out = run('slope-productivity-annual');
  assert.equal(out, saved('slope-productivity-annual'));
  assert.equal((out.match(/best split 1973,/g) || []).length, 3);
  assert.equal((out.match(/reported: no/g) || []).length, 3);
});
test('short-series null: the 95th percentile of W is above 11 for correlated annual-length series', () => {
  const out = run('slope-calibrate-short');
  assert.equal(out, saved('slope-calibrate-short'));
  assert.match(out, /n 44 rho 0.5 95% 19.2/);
});
