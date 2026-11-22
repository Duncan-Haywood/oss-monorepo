import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

// README "The trend-walk route on fresh series: NBER turning points" (2026-11-22, pre-registered;
// N1-N3 fail). The committed output is what the script prints now.
const root = dirname(fileURLToPath(import.meta.url));
const out = execFileSync('node', ['eval/trend-walk-nber.mjs'], { cwd: root, encoding: 'utf8' });

test('every one of the seven series is one the rule routes', () => {
  assert.equal((out.match(/routes yes/g) || []).length, 7);
  assert.doesNotMatch(out, /routes NO/);
});

test('the three registered bars fail and nothing ships', () => {
  assert.match(out, /N1 FAILS: mean diff -0\.107/);
  assert.match(out, /N2 FAILS: 2 wins, 5 losses/);
  assert.match(out, /N3 FAILS: pooled recall routed 16\/110 vs shipped 29\/110/);
  assert.match(out, /Ships: nothing in the CLI/);
});

test('the committed output file matches a fresh run', async () => {
  const { readFileSync } = await import('node:fs');
  assert.equal(readFileSync(`${root}/eval/trend-walk-nber.out.txt`, 'utf8'), out);
});
