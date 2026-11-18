import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/noise-floor-ar1-joint-sim.mjs output is current; joint AR(1) finds the step at phi 0.8 where plain --ar1 loses it', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-ar1-joint-sim.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-ar1-joint-sim.out.txt', import.meta.url), 'utf8'));
  assert.match(out, /phi 0\.8, noise sd 1 [\s\S]*ar1=true: changes 0\.62, step found 27\/60[\s\S]*ar1=joint: changes 1\.50, step found 60\/60/);
});
