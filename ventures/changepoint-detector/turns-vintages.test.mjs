// eval/turns-vintages.mjs: the composite's turns on real FRED-MD vintages against today's revised data (README
// "Turns on real vintages"). Pins the pre-registered result: V1 and V3 pass, V2 and V4 fail.
import test from 'node:test';
import assert from 'node:assert/strict';
import { run, replay } from './eval/turns-vintages.mjs';
import { readVintages, vintageAsOf } from './eval/fredmd-vintages.mjs';

test('vintage files rebuild: 267 payroll and production vintages, 213 income rows, levels at source precision', () => {
  const p = readVintages('PAYEMS'), w = readVintages('W875RX1'), i = readVintages('INDPRO');
  assert.deepEqual([p.length, w.length, i.length], [267, 213, 267]);
  assert.deepEqual([p[0].last, p.at(-1).last, p.at(-1).first], ['1999-07', '2021-09', '1959-01']);
  for (const r of p) assert.ok(r.values.every(Number.isInteger));
  // income: the row a user held at 2001-08 ends 2001-06 (two months behind), and at 1999-11 none starts by 1967
  assert.equal(vintageAsOf(w, '2001-08', true, '1967-01').last, '2001-06');
  assert.equal(vintageAsOf(w, '1999-11', true, '1967-01').last, '1999-08');
  assert.equal(vintageAsOf(p, '2008-12', false).last, '2008-11');
});

test('real vintages: all six called, but the 2001 peak and 2009 trough held only years later; before NBER on 2 of 6', () => {
  const r = run();
  assert.deepEqual([r.V1, r.V2, r.V3, r.V4, r.pass], [true, false, true, false, false]);
  assert.deepEqual(r.V.calls.map((c) => c.delay), [156, 61, 8, 132, 7, 7]);
  assert.deepEqual(r.P.calls.map((c) => c.delay), [7, 8, 7, 8, 7, 7]);
  assert.deepEqual([r.V.before, r.P.before, r.V.episodes.length, r.P.episodes.length], [2, 5, 5, 4]);
});

test('the misses are dating shifts of four months, not lost turns', () => {
  const v = replay('V');
  const at = (pub) => v.find((c) => c.pub === pub);
  const lab = (k) => `${Math.floor(k / 12)}-${String((k % 12) + 1).padStart(2, '0')}`;
  assert.ok(at('2004-03').turns.some((t) => t.kind === 'peak' && lab(t.k) === '2000-11'));
  assert.ok(at('2012-06').turns.some((t) => t.kind === 'trough' && lab(t.k) === '2009-10'));
});
