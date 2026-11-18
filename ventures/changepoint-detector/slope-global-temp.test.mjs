import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('slope-global-temp: eval output is current', () => {
  const out = execFileSync('node', [new URL('./eval/slope-global-temp.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/slope-global-temp.out.txt', import.meta.url), 'utf8'));
});

test('slope-global-temp: the best split is 1976 in three windows but no break is reported (W 1.8, bar 8.4, p 0.80)', () => {
  const o = readFileSync(new URL('./eval/slope-global-temp.out.txt', import.meta.url), 'utf8');
  assert.match(o, /best single split 1976, W 1\.8/);
  assert.match(o, /reported at the auto bar: none/);
  assert.match(o, /window 1910-2024: best split 1976/);
  assert.match(o, /window 1930-2024: best split 1976/);
});
