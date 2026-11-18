import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { analyze } from './engine.mjs';
test('eval/noise-floor-diff2-sim.mjs output is current; the second-difference floor at k=2 keeps the step at every noise level where the first-difference floor loses it', () => {
  const out = execFileSync('node', [new URL('./eval/noise-floor-diff2-sim.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/noise-floor-diff2-sim.out.txt', import.meta.url), 'utf8'));
});
test('second-difference floor ignores a steady drift: a pure line with tiny noise and a step is still cut at the step', () => {
  const v = Array.from({ length: 100 }, (_, t) => 0.5 * t + 0.01 * Math.sin(t * 7.3) + (t >= 50 ? 1 : 0));
  const cps = analyze({ values: v, model: 'trend', noiseFloor: 2, noiseFloorOrder: 2 }).pelt.changepoints.map((c) => c.index);
  assert.ok(cps.some((i) => Math.abs(i - 50) <= 3), JSON.stringify(cps));
});
