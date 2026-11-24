// eval/turns-jp-ci.mjs: should a published composite fed in as one column take 3-month phases? Japan's Cabinet
// Office coincident CI against ESRI's reference dates (README "Japan's coincident index"). Pins the
// pre-registered result: J1 and J2 fail, J3 and J4 pass, nothing in the CLI changes. Also pins the short-phase
// fix in turning-points.mjs that this round found.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run } from './eval/turns-jp-ci.mjs';
import { bbq } from './turning-points.mjs';

const r = run({ draws: 500 });

test('Japan CI: both arms date 11 of ESRI\'s 14 turns; 3-month phases add 2 false turns and match none more', () => {
  assert.equal(r.main.turns.length, 14);
  assert.deepEqual([r.A6.matched, r.A6.falses, r.A3.matched, r.A3.falses], [11, 7, 11, 9]);
  assert.deepEqual([r.J1, r.J2, r.J3, r.J4], [false, false, true, true]);
  assert.equal(r.decision, 'nothing changes');
  // what 3-month phases add: a 1995 pause ESRI did not date
  assert.deepEqual(r.A3.falseLabels.filter((l) => !r.A6.falseLabels.includes(l)), ['1995-04p', '1995-07t']);
});

test('the misses are the index\'s own: 1991 and 2008 and 2018 peaks dated 4, 9 and 10 months early', () => {
  const off = Object.fromEntries(r.A6.per.map((p) => [`${p.month}${p.kind[0]}`, p.off]));
  assert.deepEqual([off['1991-02p'], off['2008-02p'], off['2018-10p']], [-4, -9, -10]);
  for (const t of ['2009-03t', '2012-03p', '2012-11t', '2020-05t']) assert.equal(off[t], 0, t);
});

test('the older copy (to 2024-07) dates the same matched turns, 1997 moving 3 months', () => {
  assert.equal(r.V3.matched, 11);
  const u = Object.fromEntries(r.j4rows.map((x) => [x.month, x.spread]));
  assert.equal(u['1997-05'], 3);
  assert.ok(r.j4rows.filter((x) => x.month !== '1997-05').every((x) => x.spread === 0));
});

test('short-phase fix: a lower peak is not kept over a higher one when the phase between them is dropped', () => {
  // peak 5 at 3, a short dip to 3 at 5, a higher peak 6 at 6, then down to a trough at 10
  const x = [0, 1, 2, 5, 4, 3, 6, 5, 2, 1, 0, 1, 2];
  assert.deepEqual(bbq(x, { window: 1, minPhase: 2, minCycle: 1 }), [{ i: 6, kind: 'peak' }, { i: 10, kind: 'trough' }]);
  // the mirror image: the deeper trough is kept
  assert.deepEqual(bbq(x.map((v) => -v), { window: 1, minPhase: 2, minCycle: 1 }), [{ i: 6, kind: 'trough' }, { i: 10, kind: 'peak' }]);
  // on the index itself: the 2007-05 high, not the 2005-04 one, is the peak before the 2009 trough
  assert.ok(r.A6.found.some((f) => f.label === '2007-05' && f.kind === 'peak'));
  assert.ok(!r.A6.found.some((f) => f.label === '2005-04'));
});
