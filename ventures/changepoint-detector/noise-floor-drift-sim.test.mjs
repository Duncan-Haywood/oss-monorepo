import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
test('eval/noise-floor-drift-sim.mjs output is current; k=1.5 trims false cuts but k=2 loses a step the size of the drift', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-drift-sim.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-drift-sim.out.txt', import.meta.url), 'utf8'));
  assert.match(out, /noise sd 0\.1[\s\S]*k=2: changes 0\.00, step found 0\/60/);
});
