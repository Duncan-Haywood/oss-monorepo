import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// eval/drift-warning-null195-ar1.mjs: the same 195-month null with and without --ar1. Output committed alongside.
test('--ar1 removes the drift warning that autocorrelated noise alone causes', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-null195-ar1.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/drift-warning-null195-ar1.out.txt', import.meta.url), 'utf8'));
  const w = (re) => out.trim().split('\n').filter((l) => re.test(l)).map((l) => +/warned\s+(\d+)\//.exec(l)[1]);
  assert.ok(w(/rho 0.5 {2}raw bend {7}/).every((n) => n >= 30));
  assert.ok(w(/rho 0.5 {2}raw bend ar1/).every((n) => n <= 3));
});
