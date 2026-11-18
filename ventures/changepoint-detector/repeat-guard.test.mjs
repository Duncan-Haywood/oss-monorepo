// The repeat guard (consensus.mjs repeatGuard; README "Many agreed changes spread through a series",
// pre-registered in eval/repeat-guard-prereg-2026-11-15.md, measured by eval/repeat-guard.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { repeatGuard, REPEAT_GUARD, consensus } from './consensus.mjs';
import { splitCsv, magnitude, countOnly } from './eval/repeat-guard.mjs';

test('the pre-registered thresholds: 15 agreed changes, 8 of 10 tenths', () => {
  assert.deepEqual(REPEAT_GUARD, { minCount: 15, minTenths: 8 });
});

test('fires on 15 changes spread evenly, with the median gap; quiet on 14', () => {
  const even = Array.from({ length: 15 }, (_, i) => 30 + 60 * i);
  const g = repeatGuard(even, 900);
  assert.equal(g.count, 15);
  assert.equal(g.tenths, 10);
  assert.equal(g.medianGap, 60);
  assert.match(g.text, /repeating pattern/);
  assert.equal(repeatGuard(even.slice(0, 14), 900), null);
});

test('quiet on many changes clustered in a few tenths of the series', () => {
  const clustered = [...Array.from({ length: 10 }, (_, i) => 100 + 5 * i), ...Array.from({ length: 10 }, (_, i) => 700 + 5 * i)];
  assert.equal(repeatGuard(clustered, 1000), null);
  assert.equal(countOnly(clustered), true);
});

test('a change at the very end counts in the last tenth, and n of 0 never fires', () => {
  const g = repeatGuard([...Array.from({ length: 14 }, (_, i) => 50 + 70 * i), 999], 1000);
  assert.ok(g && g.tenths >= 8);
  assert.equal(repeatGuard(Array.from({ length: 20 }, (_, i) => i), 0), null);
});

test('measured, not offered: consensus() carries no repeat warning', () => {
  let s = 3; const r = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5);
  const values = Array.from({ length: 300 }, (_, i) => (i < 100 ? 0 : i < 200 ? 5 : 1) + r());
  assert.equal('repeatWarning' in consensus({ values }), false);
});

test('HAS csv lines: quoted lists keep their commas; magnitude is the axis-free length', () => {
  assert.deepEqual(splitCsv('0,1,"[1, 2]","[\'a, b\']",x'), ['0', '1', '[1, 2]', "['a, b']", 'x']);
  assert.deepEqual(magnitude([3, 0], [4, 0], [0, 2]), [5, 2]);
});

test('the committed output carries the three pre-registered verdicts', () => {
  const f = new URL('./eval/repeat-guard.out.txt', import.meta.url);
  if (!existsSync(f)) return;
  const t = readFileSync(f, 'utf8');
  for (const k of ['G1', 'G2', 'G3']) assert.match(t, new RegExp(`  ${k} .*: (MET|NOT MET|NOT INFORMATIVE)$`, 'm'));
  // As run 2026-11-15: G1 met, G2 and G3 not, so the guard is not offered.
  assert.match(t, /  G1 .*: MET$/m);
  assert.match(t, /  G2 .*: NOT MET$/m);
  assert.match(t, /  G3 .*: NOT MET$/m);
  assert.match(t, /every-setting minus zero: mean \+0\.175/);
});
