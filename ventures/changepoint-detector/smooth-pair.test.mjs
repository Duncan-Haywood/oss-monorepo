import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

// Real BJsales (150) and uspop (19), data/bjsales.csv, data/uspop.csv: smooth series, no documented step. Output committed.
test('smooth real series: counts per model are pinned and match the committed output', () => {
  const out = execFileSync('node', [new URL('./eval/smooth-pair.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/smooth-pair.out.txt', import.meta.url), 'utf8'));
  const lines = out.split('\n');
  const n = (section, t) => +lines.slice(lines.findIndex((l) => l.startsWith(section))).find((l) => l.trim().startsWith(t)).match(/: (\d+) change/)[1];
  assert.equal(n('BJsales', 'trend:'), 12);
  assert.equal(n('BJsales', 'mean, ar1 auto'), 1);
  assert.equal(n('uspop', 'trend:'), 1);
  assert.equal(n('uspop', 'mean, ar1 auto'), 0);
});
