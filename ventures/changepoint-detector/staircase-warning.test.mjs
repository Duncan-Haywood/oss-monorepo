import { test } from 'node:test';
import assert from 'node:assert/strict';
import { table } from './eval/staircase-warning.mjs';

// Series whose steps are all real: the block-variance warning cannot tell them from drift (README, "A staircase of real steps").
test('block-variance rangeWarning fires on nearly every staircase of 5 to 12 real steps', () => {
  const rows = table(10);
  assert.equal(rows.length, 12);
  for (const r of rows) assert.ok(r.fired >= 8, JSON.stringify(r));
  for (const r of rows) assert.ok(Math.abs(r.meanFound - r.k) <= 1, JSON.stringify(r));
});
