// The shape-or-shock log refit (README, "third try") is deterministic: the committed output must match a rerun.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('eval/drift-warning-log.mjs reproduces its committed output', () => {
  const out = execFileSync('node', [new URL('./eval/drift-warning-log.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/drift-warning-log.out.txt', import.meta.url), 'utf8'));
});
