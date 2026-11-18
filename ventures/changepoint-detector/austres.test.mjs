import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Real Australian residents 1971-1993 (data/austres.csv): smooth growth, no documented break. Negative result, pinned.
test('a smooth real population series is over-cut by every model; the output is committed', () => {
  const out = execFileSync('node', [new URL('./eval/austres.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/austres.out.txt', import.meta.url), 'utf8'));
  const n = (t) => +out.split('\n').find((l) => l.startsWith(t)).match(/: (\d+) change/)[1];
  assert.equal(n('trend'), 10);
  assert.ok(n('mean (level only)') >= 40);
  assert.ok(n('mean, ar1 auto') >= 5);
});
