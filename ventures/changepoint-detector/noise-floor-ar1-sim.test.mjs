import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/noise-floor-ar1-sim.mjs output is current; --ar1 trims false cuts but loses the step in a third or more of series', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-ar1-sim.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-ar1-sim.out.txt', import.meta.url), 'utf8'));
  assert.match(out, /noise sd 1 [\s\S]*k=0 ar1=on: changes 1\.07, step found 36\/60/);
});
