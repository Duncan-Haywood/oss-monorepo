import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

// eval/drift-warning.mjs on made-up seasonal series; the 200-rep numbers are in eval/drift-warning.out.txt and the README.
test('driftWarning: rare without a change, near-certain on three packed steps (40 reps)', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning.mjs', import.meta.url).pathname, '40'], { encoding: 'utf8' });
  const rate = (name) => +out.split('\n').find((l) => l.startsWith(name)).match(/warning\s+(\d+)\/40/)[1];
  assert.ok(rate('P4 n120 no change') <= 4, out);
  assert.ok(rate('P12 n144 no change') <= 4, out);
  assert.ok(rate('P4 n120 3 steps in 2 cycles') >= 34, out);
  assert.ok(rate('P12 n144 3 steps in 2 cycles') >= 36, out);
});
