import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('US labour productivity: the slope-break test dates the 1970s slowdown at 1973Q1 but does not clear its bar (positive control, 2026-11-04)', () => {
  const out = execFileSync('node', [new URL('./eval/slope-productivity.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/slope-productivity.out.txt', import.meta.url), 'utf8'));
  assert.equal((out.match(/best split 1973Q1/g) || []).length, 3);
  assert.equal((out.match(/reported: no/g) || []).length, 3);
});
