import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/noise-floor-real.mjs output is current and k<=1 leaves the six real series unchanged', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-real.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-real.out.txt', import.meta.url), 'utf8'));
  const blocks = out.trim().split(/\n(?=\S)/);
  assert.equal(blocks.length, 6);
  for (const b of blocks) { const l = b.split('\n').slice(1).map((s) => s.replace(/^\s*k=\S+:/, '')); assert.equal(l[0], l[1]); assert.equal(l[0], l[2]); }
});
