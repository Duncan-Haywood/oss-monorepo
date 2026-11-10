import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/noise-floor-diff2-real.mjs output is current; on real smooth drift series the second-difference floor at k=2 still over-cuts', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-diff2-real.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-diff2-real.out.txt', import.meta.url), 'utf8'));
  const count = (series, setting) => { const b = out.split(/\n(?=\S)/).find((x) => x.startsWith(series)); return +b.split('\n').find((l) => l.trim().startsWith(setting + ':')).match(/: (\d+) \[/)[1]; };
  assert.ok(count('US real GDP', 'd2 k=2') >= 10);
  assert.equal(count('Australian residents', 'd2 k=2'), count('Australian residents', 'off'));
  // third differences (2026-11-10) do not rescue it: same over-cutting on the two series where second differences failed
  assert.equal(count('Australian residents', 'd3 k=3'), 7);
  assert.ok(count('US real GDP', 'd3 k=3') >= 10);
});
