import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// eval/drift-warning-null195.mjs: 195 synthetic months, fixed season, no shock. Output committed in eval/drift-warning-null195.out.txt.
test('driftWarning on a same-length null: fires without a trend term, and under autocorrelation', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-null195.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/drift-warning-null195.out.txt', import.meta.url), 'utf8'));
  const rows = out.trim().split('\n').map((l) => ({ l, w: +/warned\s+(\d+)\//.exec(l)[1] }));
  const pick = (re) => rows.filter((r) => re.test(r.l));
  assert.ok(pick(/rho 0 {2}\w+ bend/).every((r) => r.w <= 3), out); // white noise with a trend term: at most 3 of 40
  assert.ok(pick(/sd 0.01 rho 0 {2}\w+ no trend/).every((r) => r.w === 40), out); // a drifting level read as steps
  assert.ok(pick(/rho 0.5 {2}\w+ bend/).every((r) => r.w >= 30), out); // autocorrelation alone triggers it
});
