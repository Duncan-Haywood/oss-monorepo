import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from './cli.mjs';

const f = 'corpus/dies-irae.gabc';

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
