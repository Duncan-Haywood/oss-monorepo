import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { closestUncut, driftLevel, driftLevelChanges, driftSegmentCost } from './drift-level.mjs';

// README "The closest call" (2026-11-22). closestUncut is not printed (eval/closest-call.out.txt:
// C2 and C3 failed); these tests pin the arithmetic and the seat-belt reading quoted there.
const rows = readFileSync(new URL('./data/uk-driver-deaths.csv', import.meta.url), 'utf8').trim().split('\n').slice(1).map((l) => l.split(','));
const labels = rows.map((r) => r[0]), values = rows.map((r) => +r[1]);

function rand(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

test('the backward pass gives the same segment costs as driftSegmentCost (brute force over every split)', () => {
  const u = rand(7);
  let lvl = 0;
  const x = Array.from({ length: 80 }, (_, t) => { lvl += 0.3 * (u() - 0.5); return lvl + (t >= 50 ? 1.5 : 0) + (u() - 0.5); });
  const sigma = 0.4, omega = 0.12, penalty = 2 * Math.log(80), cps = [20];
  const c = closestUncut(x, cps, { sigma, omega, penalty });
  let best = { saving: -Infinity };
  for (const [a, b] of [[0, 20], [20, 80]]) {
    const whole = driftSegmentCost(x.slice(a, b), { sigma, omega });
    for (let t = a + 2; t <= b - 2; t++) {
      const sv = whole - driftSegmentCost(x.slice(a, t), { sigma, omega }) - driftSegmentCost(x.slice(t, b), { sigma, omega });
      if (sv > best.saving) best = { index: t, saving: sv };
    }
  }
  assert.equal(c.index, best.index);
  assert.ok(Math.abs(c.saving - best.saving) < 1e-9, `${c.saving} vs ${best.saving}`);
  assert.ok(Math.abs(c.shortfall - (penalty - best.saving)) < 1e-9);
});

test('seat belts: no jump at the fitted wander, and the closest call is the January 1983 law, 9.15 of 10.51', () => {
  const r = driftLevel(values, { noise: 'ml' });
  assert.deepEqual(r.changepoints, []);
  const c = closestUncut(values, r.changepoints, { sigma: r.sigma, omega: r.omega, penalty: r.penalty });
  assert.equal(labels[c.index], '1983-01');
  assert.equal(c.saving.toFixed(2), '9.15');
  assert.equal(c.penalty.toFixed(2), '10.51');
  assert.equal(c.jumpSd.toFixed(1), '-3.6');
  // Here (not on 7 of 37 TCPD series) a refit at the same wander lists it just under the saving.
  const fix = { sigma: r.sigma, omega: r.omega };
  assert.deepEqual(driftLevelChanges(values, { ...fix, penalty: c.saving - 0.01 }).changepoints, [c.index]);
  assert.deepEqual(driftLevelChanges(values, { ...fix, penalty: c.saving + 0.01 }).changepoints, []);
});

test('a steady growth is taken out before the search, as driftLevelChanges does', () => {
  const x = Array.from({ length: 60 }, (_, t) => 2 * t + (t >= 30 ? 3 : 0) + ((t * 7) % 5) * 0.2);
  const c0 = closestUncut(x, [], { sigma: 1, omega: 0.01, penalty: 100, slope: 2 });
  assert.equal(c0.index, 30);
  assert.ok(Math.abs(c0.jump - 3) < 0.5, String(c0.jump));
});

test('no room for a cut, or no fit, gives null', () => {
  assert.equal(closestUncut([1, 2, 3], [], { sigma: 1, omega: 0.1, penalty: 5 }), null);
  assert.equal(closestUncut([1, 2, 3, 4, 5], [], { sigma: null, omega: 0.1, penalty: 5 }), null);
});
