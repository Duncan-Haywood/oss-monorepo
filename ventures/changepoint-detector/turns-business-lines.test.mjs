import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arm, score } from './eval/turns-business-lines.mjs';
import { lineLeads } from './line-leads.mjs';

// README "Several business lines that share a cycle" (2026-11-24, pre-registered; S1 and S2 pass, S3 and S4 fail).
test('business lines, typical noise: composite beats revenue and the heaviest line, not the hindsight best; readout not offered', () => {
  const a = arm();
  assert.equal(a.fc.toFixed(3), '0.932');
  assert.equal(a.fl[1].toFixed(3), '0.869'); // revenue alone
  assert.equal(a.best.toFixed(3), '0.974');
  assert.ok(a.S1 && a.S2);
  assert.ok(!a.S3 && !a.S4);
  assert.deepEqual(a.heavyCount, [0, 0, 500, 0]); // the sticky customers line always weighs most
  assert.equal(a.timingMedian, 1); // the composite turns a month late
});

test('score: kind-aware matching within 3, false beyond 6', () => {
  const truth = [{ i: 20, kind: 'peak' }, { i: 40, kind: 'trough' }];
  assert.equal(score(truth, [{ i: 22, kind: 'peak' }, { i: 40, kind: 'peak' }]).falses, 1);
  assert.equal(score(truth, [{ i: 23, kind: 'peak' }, { i: 37, kind: 'trough' }]).F, 1);
});

test('lineLeads: a copy shifted two rows later reads +2', () => {
  const base = Array.from({ length: 120 }, (_, t) => 100 * Math.exp(0.1 * Math.sin((2 * Math.PI * t) / 40)));
  const late = base.map((_, t) => base[Math.max(0, t - 2)]);
  const turns = [{ i: 10, kind: 'peak' }, { i: 30, kind: 'trough' }, { i: 50, kind: 'peak' }, { i: 70, kind: 'trough' }, { i: 90, kind: 'peak' }];
  const [l0, l2] = lineLeads([base, late], turns, { frequency: 'monthly' });
  assert.equal(l0.lead, 0); assert.equal(l2.lead, 2); assert.ok(l2.paired >= 3);
});
