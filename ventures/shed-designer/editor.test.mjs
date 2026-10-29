import test from 'node:test';
import assert from 'node:assert/strict';
import { dropOpening, pitchFromRise, axisStart } from './editor.mjs';
import { defaultDesign, PRESETS } from './model.mjs';

const classic = () => PRESETS['8x12 classic']();

const d = classic();
const door = d.openings[0];

test('dragging a door snaps to the nearest wall, centred on the pointer', () => {
  assert.deepEqual(dropOpening(d, door, 72, 3), { wall: 'front', offset: 53 });
  // Right gable end: offsets read from its left corner as seen from outside (the front corner).
  assert.deepEqual(dropOpening(d, door, 143, 48), { wall: 'right', offset: 29 });
  // Back wall is seen from behind, so its left corner is at x = length.
  assert.deepEqual(dropOpening(d, door, 30, 95), { wall: 'back', offset: 95 });
  // Clamped to the wall.
  assert.deepEqual(dropOpening(d, door, 5, 1), { wall: 'front', offset: 0 });
});

test('a back-wall opening lands where it was drawn', () => {
  const op = { ...door, wall: 'back', offset: 95 };
  assert.equal(axisStart(d, op), 144 - 95 - 38);
});

test('peak drag gives whole-number pitches within limits', () => {
  assert.equal(pitchFromRise(24, 96), 6);
  assert.equal(pitchFromRise(1, 96), 2);
  assert.equal(pitchFromRise(500, 96), 14);
});
