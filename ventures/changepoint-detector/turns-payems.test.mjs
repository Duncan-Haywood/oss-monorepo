import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run, usrecTurns } from './eval/turns-payems.mjs';
import { bbq } from './turning-points.mjs';

// README "BBQ on monthly payrolls" (2026-11-24, pre-registered; P1 fails on both arms, P2 passes, nothing ships).
test('BBQ on PAYEMS 1939-2026: A 17 of 26, B 19 of 26, 4 false each; P1 fails, P2 passes', () => {
  const o = run({ draws: 500 });
  assert.equal(o.n, 1051);
  assert.equal(o.turns.length, 26);
  const [a, b] = o.arms;
  assert.equal(a.matched, 17); assert.equal(a.falses, 4);
  assert.equal(b.matched, 19); assert.equal(b.falses, 4);
  for (const arm of o.arms) { assert.equal(arm.P1, false); assert.equal(arm.P2, true); }
  assert.equal(o.decision, 'none');
  assert.ok(a.F > 0.75 && a.F < 0.77 && b.F > 0.80 && b.F < 0.81);
  assert.deepEqual(o.labelDiff, { onlyUsrec: ['2020-02p'], onlyTis: ['2019-12p'] });
});

test('USREC gives NBER 2020 peak in February', () => {
  const t = usrecTurns().filter((x) => x.month >= '2020');
  assert.deepEqual(t.map((x) => x.month + x.kind[0]), ['2020-02p', '2020-04t']);
});

test('bigMove keeps a short deep phase and is off by default', () => {
  // a 2-step 30% fall inside long rises, on a log scale
  const x = [];
  for (let i = 0; i < 30; i++) x.push(i * 0.01);
  x.push(0.15, 0.0);
  for (let i = 1; i < 30; i++) x.push(i * 0.01);
  const o = { window: 2, minPhase: 6, minCycle: 15 };
  assert.equal(bbq(x, o).length, 0);
  assert.deepEqual(bbq(x, { ...o, bigMove: 0.05 }).map((t) => t.kind), ['peak', 'trough']);
});
