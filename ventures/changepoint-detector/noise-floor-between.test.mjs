import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/noise-floor-between.mjs output is current; Peace Bridge loses 2009-06 once k > 1, New Haven 1944 once k >= 1.75', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-between.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-between.out.txt', import.meta.url), 'utf8'));
  const block = (n) => out.split(/\n(?=\S)/).find((b) => b.startsWith(n)).split('\n').slice(1);
  const pb = block('Peace Bridge');
  assert.match(pb[0], /2009-06/);
  for (const l of pb.slice(1)) assert.doesNotMatch(l, /2009-06/);
  const nh = block('New Haven');
  assert.match(nh[2], /1944/);
  assert.match(nh[3], /0 \[\]/);
});
