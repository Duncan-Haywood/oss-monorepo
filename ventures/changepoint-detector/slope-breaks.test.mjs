import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { slopeBreaks } from './slope-breaks.mjs';
test('a clean kink in the growth rate is found within 3 points, a straight drift is not cut', () => {
  const kink = Array.from({ length: 120 }, (_, t) => 0.01 * t - 0.006 * Math.max(0, t - 60) + 0.002 * Math.sin(t * 7.3));
  const k = slopeBreaks(kink).knots;
  assert.equal(k.length, 1);
  assert.ok(Math.abs(k[0].index - 60) <= 3);
  assert.ok(k[0].before > k[0].after);
  const straight = Array.from({ length: 120 }, (_, t) => 0.01 * t + 0.002 * Math.sin(t * 7.3));
  assert.equal(slopeBreaks(straight).knots.length, 0);
});
test('eval/slope-breaks.mjs and slope-calibrate.mjs output is current; GDP shows no significant slope break', () => {
  for (const f of ['slope-breaks', 'slope-calibrate']) {
    const out = execFileSync('node', [new URL(`./eval/${f}.mjs`, import.meta.url).pathname], { encoding: 'utf8' });
    assert.equal(out, readFileSync(new URL(`./eval/${f}.out.txt`, import.meta.url), 'utf8'));
  }
  assert.match(readFileSync(new URL('./eval/slope-breaks.out.txt', import.meta.url), 'utf8'), /: 0 slope break/);
});
test('eval/slope-real.mjs output is current; the test reports a slope break on none of the ten real series', () => {
  const out = execFileSync('node', [new URL('./eval/slope-real.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/slope-real.out.txt', import.meta.url), 'utf8'));
  assert.equal((out.match(/reported: yes/g) || []).length, 0);
});
test('barFor reads the calibrated grid and interpolates; critical: auto widens the bar for short sticky series', async () => {
  const { barFor, BAR_N, BAR_RHO, BAR_TABLE } = await import('./slope-breaks.mjs');
  assert.equal(barFor(100, 0.4), 10.8);
  assert.equal(barFor(30, 0.6), 21.6);
  assert.equal(barFor(1000, 0.9), 9.7);
  assert.ok(Math.abs(barFor(90, 0.4) - (11.4 + 10.8) / 2) < 1e-9);
  assert.ok(barFor(44, 0.5) > barFor(44, 0.1) && barFor(44, 0.5) > barFor(400, 0.5));
  assert.equal(BAR_TABLE.length, BAR_N.length); assert.equal(BAR_TABLE[0].length, BAR_RHO.length);
  const r = slopeBreaks(Array.from({ length: 50 }, (_, t) => 0.01 * t), { critical: 'auto' });
  assert.ok(r.critical > 8 && r.critical < 12);
});
test('eval/slope-bar-check.mjs output is current; the auto bar stays under 8% false reports in every cell', () => {
  const out = execFileSync('node', [new URL('./eval/slope-bar-check.mjs', import.meta.url).pathname], { encoding: 'utf8' });
  assert.equal(out, readFileSync(new URL('./eval/slope-bar-check.out.txt', import.meta.url), 'utf8'));
  for (const l of out.split('\n').slice(3)) if (l.trim()) assert.ok(Number(l.trim().split(/\s+/)[3]) < 80, l);
});
