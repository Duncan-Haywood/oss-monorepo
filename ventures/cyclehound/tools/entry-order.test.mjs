import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cycleFiles, enter, parseArgs, run } from './entry-order.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const tdz = join(here, '..', 'tests', 'fixtures', 'tdz');
// The report cyclehound --json gives for tests/fixtures/tdz (two components).
const report = { components: [
  { files: ['a.mjs', 'b.mjs'] },
  { files: ['safe-a.mjs', 'safe-b.mjs'] },
] };

test('entering the cycle from b reads a constant b has not set yet', () => {
  assert.equal(enter(join(tdz, 'a.mjs'), 20000).ok, true);
  const b = enter(join(tdz, 'b.mjs'), 20000);
  assert.equal(b.ok, false);
  assert.equal(b.kind, 'tdz');
  assert.match(b.message, /RATE/);
});

test('a cycle that only calls across inside functions loads from either end', () => {
  for (const f of ['safe-a.mjs', 'safe-b.mjs']) assert.equal(enter(join(tdz, f), 20000).ok, true, f);
});

test('run over a saved report finds exactly the one bad entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'entry-order-'));
  const from = join(dir, 'c.json');
  writeFileSync(from, JSON.stringify(report));
  const out = run({ dir: tdz, from, timeout: 20000 });
  assert.equal(out.files, 4);
  assert.deepEqual(out.results.filter((r) => !r.ok).map((r) => [r.file.endsWith('b.mjs') && !r.file.endsWith('safe-b.mjs'), r.kind]), [[true, 'tdz']]);
});

test('type-only files on a cycle are skipped, files are deduplicated', () => {
  const files = cycleFiles({ components: [{ files: ['x.ts', 'y.mjs'] }, { files: ['y.mjs', 'z.cjs'] }] }, '/r');
  assert.deepEqual(files, ['/r/y.mjs', '/r/z.cjs']);
});

test('bad arguments are refused', () => {
  assert.throws(() => parseArgs([]), /folder/);
  assert.throws(() => parseArgs(['--timeout', '0', '.']), /positive/);
  assert.throws(() => parseArgs(['--nope', '.']), /unknown/);
});
