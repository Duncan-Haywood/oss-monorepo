import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('US productivity against the auto bar: 1973 dated, W under the bar both ways (negative result, 2026-11-04)', () => {
  const out = execFileSync('node', [new URL('./eval/slope-productivity-auto.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/slope-productivity-auto.out.txt', import.meta.url), 'utf8'));
  assert.equal((out.match(/reported: no/g) || []).length, 2);
  assert.equal((out.match(/best split 1973/g) || []).length, 2);
});
