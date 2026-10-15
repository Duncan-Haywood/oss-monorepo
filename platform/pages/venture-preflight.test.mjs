import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { launchedProblems } from './venture-preflight.mjs';

async function fixture(launched) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'pf-'));
  const file = path.join(dir, 'launched.json');
  await fs.writeFile(file, JSON.stringify({ launched }));
  return file;
}

test('clean when the slug is dated and keys are sorted', async () => {
  assert.deepEqual(await launchedProblems('a', await fixture({ a: '2026-10-01', b: '2026-10-02' })), []);
});

test('flags a slug with no date', async () => {
  const p = await launchedProblems('c', await fixture({ a: '2026-10-01' }));
  assert.equal(p.length, 1);
  assert.match(p[0], /no launch date/);
});

test('flags out-of-order keys', async () => {
  const p = await launchedProblems('a', await fixture({ b: '2026-10-02', a: '2026-10-01' }));
  assert.match(p.join('\n'), /out of order/);
});
