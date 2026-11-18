// The shape-repeat check (consensus.mjs shapeRepeats; README "Agreed changes that are the same
// waveform repeated", pre-registered in eval/shape-repeat-prereg-2026-11-15.md, measured by
// eval/shape-repeat.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { shapeRepeats, segmentShape, SHAPE_REPEAT, consensus } from './consensus.mjs';
import { parseUtsaName } from './eval/shape-repeat.mjs';

let s = 11; const noise = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32 - 0.5);

test('the pre-registered settings', () => {
  assert.deepEqual(SHAPE_REPEAT, { points: 32, minLen: 4, lenRatio: 1.5, minCorr: 0.8, minMatches: 2 });
});

test('a segment shape: 32 points, z-normalised; none for flat or tiny segments', () => {
  const sh = segmentShape(Array.from({ length: 100 }, (_, i) => i));
  assert.equal(sh.length, 32);
  assert.ok(Math.abs(sh.reduce((a, v) => a + v, 0)) < 1e-9);
  assert.ok(Math.abs(sh.reduce((a, v) => a + v * v, 0) / 32 - 1) < 1e-9);
  assert.equal(segmentShape([5, 5, 5, 5, 5]), null);
  assert.equal(segmentShape([1, 2, 3]), null);
  assert.equal(segmentShape([1, 2, 3, 4]).length, 32); // short ones are interpolated
});

test('a sawtooth cut once per cycle: every inner cut is a repeat cut', () => {
  const values = Array.from({ length: 600 }, (_, i) => (i % 60) / 6 + 0.1 * noise());
  const cuts = Array.from({ length: 9 }, (_, k) => 60 * (k + 1));
  const r = shapeRepeats(values, cuts);
  assert.deepEqual(r.dropped, cuts);
  assert.deepEqual(r.kept, []);
});

test('a staircase of noisy flat levels: nothing is dropped', () => {
  const values = Array.from({ length: 600 }, (_, i) => 3 * Math.floor(i / 100) + noise());
  const r = shapeRepeats(values, [100, 200, 300, 400, 500]);
  assert.deepEqual(r.dropped, []);
});

test('fewer than 3 agreed changes are never dropped; lengths beyond 1.5x do not match', () => {
  const values = Array.from({ length: 300 }, (_, i) => (i % 60) / 6);
  assert.deepEqual(shapeRepeats(values, [60, 120]).dropped, []);
  // the same ramp at three lengths (40, 100, 250 points): shapes match, lengths do not
  const ramp = (m) => Array.from({ length: m }, (_, i) => i / m);
  const v2 = [...ramp(40), ...ramp(100), ...ramp(250), ...ramp(40)];
  assert.deepEqual(shapeRepeats(v2, [40, 140, 390]).dropped, []);
});

test('consensus() does not call the check until its lines are scored', () => {
  const values = Array.from({ length: 300 }, (_, i) => (i < 100 ? 0 : i < 200 ? 5 : 1) + noise());
  assert.equal('shapeRepeatWarning' in consensus({ values }), false);
});

test('UTSA names carry window and labels', () => {
  assert.deepEqual(parseUtsaName('WalkJogRun1_80_3800_6800.txt'), { name: 'WalkJogRun1', window: 80, cps: [3800, 6800] });
  assert.equal(parseUtsaName('UCR_semantic segmentation_2017.ppt'), null);
});

test('the committed round: S1 fails, S2 to S4 met, so the check is measured, not offered', () => {
  const out = readFileSync(new URL('./eval/shape-repeat.out.txt', import.meta.url), 'utf8');
  assert.match(out, /S1 TSSB shape-filtered covering 0\.365 >= zero 0\.401 - 0\.02 = 0\.381: NOT MET/);
  assert.match(out, /S2 TCPD .*: MET/);
  assert.match(out, /S3 HAS .*: MET/);
  assert.match(out, /S4 UTSA shape-filtered minus every-setting mean \+0\.064 \(bar 0\); where it drops \(5\): better on 5, worse on 0: MET/);
  assert.ok(existsSync(new URL('./eval/shape-repeat-prereg-2026-11-15.md', import.meta.url)));
});
