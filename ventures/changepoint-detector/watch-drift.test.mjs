// The watch's 'drift' detector (watch-core.mjs detectDrift; README "Round 8: a watch for a level that wanders").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectChanges, watchCheck, DETECTORS } from './watch-core.mjs';

function rng(seed) {
  let s = seed >>> 0 || 1;
  const u = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return (s + 0.5) / 4294967296; };
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}
// A level that wanders (random-walk step sd omega) under noise sd 1, with an optional jump.
const walk = (n, omega, seed, jumpAt = Infinity, jump = 0) => { const g = rng(seed); let lev = 0; return Array.from({ length: n }, (_, i) => { lev += omega * g(); return 100 + lev + (i >= jumpAt ? jump : 0) + g(); }); };
const labelsOf = (v) => v.map((_, i) => `d${i + 1}`);
const csvOf = (v) => ['day,price', ...v.map((x, i) => `d${i + 1},${x.toFixed(3)}`)].join('\n');

test("'drift' is a named detector, for the level model only", () => {
  assert.ok(DETECTORS.includes('drift'));
  const v = walk(120, 0.2, 3);
  assert.throws(() => detectChanges(v, labelsOf(v), { model: 'poisson', detector: 'drift' }), /level model/);
});

test('it finds a 6-sd jump on a wandering level, with the level on each side', () => {
  const v = walk(300, 0.3, 11, 200, 6);
  const c = detectChanges(v, labelsOf(v), { detector: 'drift' });
  const hit = c.find((x) => Math.abs(x.index - 200) <= 2);
  assert.ok(hit, `changes at ${c.map((x) => x.index)}`);
  assert.equal(hit.label, labelsOf(v)[hit.index]);
  assert.ok(hit.shift > 3 && hit.shift < 9, `shift ${hit.shift}`);
  assert.ok(hit.meanAfter > hit.meanBefore);
});

test('a watch with the drift detector reports the jump once and not the wander', () => {
  const v = walk(260, 0.3, 5, 200, 7);
  let state = null, reported = [];
  for (let n = 100; n <= v.length; n++) {
    const out = watchCheck({ csv: csvOf(v.slice(0, n)), state, detector: 'drift' });
    state = JSON.parse(JSON.stringify(out.state));
    reported.push(...out.alerts.map((a) => a.index));
  }
  assert.ok(reported.some((i) => Math.abs(i - 200) <= 5), `alerts at ${reported}`);
  assert.equal(reported.length, 1, `alerts at ${reported}`);
});

test('the window and --log are honoured', () => {
  const v = walk(400, 0.2, 9, 350, 8).map((x) => x + 50);
  const c = detectChanges(v, labelsOf(v), { detector: 'drift', window: 120 });
  assert.ok(c.every((x) => x.index >= 280), 'only the newest 120 points are fitted');
  assert.ok(c.some((x) => Math.abs(x.index - 350) <= 2));
  const lg = detectChanges(v, labelsOf(v), { detector: 'drift', log: true });
  assert.ok(lg.some((x) => Math.abs(x.index - 350) <= 2));
  assert.throws(() => detectChanges([1, -1, ...v], labelsOf([1, -1, ...v]), { detector: 'drift', log: true }), /above zero/);
});
