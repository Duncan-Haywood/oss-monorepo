import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sim, summarise, fredCheck, RULES } from './eval/turns-saas-lines.mjs';

// README "A short-phase rule for composites, on SaaS lines" (2026-11-24, pre-registered; K2 fails for both arms,
// nothing ships).
test('SaaS make: P3 and REL beat the shipped composite rule but stay short of the hindsight-best line', () => {
  const s = summarise(sim());
  assert.equal(s.rules.shipped.F.toFixed(3), '0.833');
  assert.equal(s.rules.P3.F.toFixed(3), '0.915');
  assert.equal(s.rules.REL.F.toFixed(3), '0.858');
  assert.equal(s.best.toFixed(3), '0.960');
  assert.ok(s.rules.P3.F < s.best - 0.03 && s.rules.REL.F < s.best - 0.03); // K2 fails for both
  assert.ok(s.rules.P3.falses <= s.rules.shipped.falses + 0.10); // K3
});

test('shop make guard reproduces the last round: shipped 0.932, hindsight 0.974', () => {
  const s = summarise(sim({ seed: 20261124, make: 'shop' }));
  assert.equal(s.rules.shipped.F.toFixed(3), '0.932');
  assert.equal(s.best.toFixed(3), '0.974');
  assert.equal(s.rules.P3.F.toFixed(3), '0.974');
});

test('FRED composite: every rule keeps NBER 16 of 16; P3 adds the 2002-03 dip as two false turns', async () => {
  const f = await fredCheck();
  for (const name of Object.keys(RULES)) assert.equal(f[name].matched, 16);
  assert.equal(f.shipped.falses, 0);
  assert.equal(f.REL.falses, 0);
  assert.deepEqual(f.P3.turns.filter((t) => t.startsWith('2002') || t.startsWith('2003')), ['2002-11p', '2003-04t']);
});
