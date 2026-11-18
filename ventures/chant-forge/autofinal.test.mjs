import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { run } from './cli.mjs';

// Resolved from this file, not the working directory: `node --test` from the
// repository root (redteam.py, CLAUDE.md's checklist) read a missing file.
const f = fileURLToPath(new URL('./corpus/dies-irae.gabc', import.meta.url));

test('--auto-final reports a final inside E2-E4', () => {
  const r = run([f, '--auto-final', '--json']);
  assert.equal(r.code, 0);
  const s = JSON.parse(r.text);
  assert.ok(s.lowest !== undefined);
});

test('--auto-final matches --suggest-final', () => {
  const sug = JSON.parse(run([f, '--suggest-final', '--json']).text);
  if (!sug.fits) return;
  const a = JSON.parse(run([f, '--auto-final', '--json']).text);
  const b = JSON.parse(run([f, '--final', String(sug.recommended.final), '--json']).text);
  assert.deepEqual(a, b);
});

test('--auto-final with --final is refused', () => {
  assert.equal(run([f, '--auto-final', '--final', '50']).code, 2);
});
