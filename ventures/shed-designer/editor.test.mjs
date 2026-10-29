import test from 'node:test';
import assert from 'node:assert/strict';
import { dropOpening, pitchFromRise, axisStart, nudgePlan, nudgeOpening, nudgeEnd } from './editor.mjs';
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

test('arrow keys on the plan handles move their own edge by 6", 24" with Shift', () => {
  assert.equal(nudgePlan(d, 'len', 'ArrowRight').length, 150);
  assert.equal(nudgePlan(d, 'len', 'ArrowLeft', true).length, 120);
  assert.equal(nudgePlan(d, 'len', 'ArrowUp'), null, 'the length handle ignores up and down');
  assert.equal(nudgePlan(d, 'wid', 'ArrowUp').width, 102);
  const both = nudgePlan(d, 'both', 'ArrowDown');
  assert.deepEqual([both.length, both.width], [144, 90]);
  assert.equal(nudgePlan({ ...d, length: 480 }, 'len', 'ArrowRight'), null, 'clamped at the limit');
});

test('arrow keys slide an opening along its wall in the direction drawn', () => {
  const front = nudgeOpening(d, door, 'ArrowRight');
  assert.equal(front.openings[0].offset, door.offset + 1);
  // The back wall is drawn at the top, seen from behind: right on the picture is left from outside.
  const back = { ...d, openings: [{ ...door, wall: 'back', offset: 40 }] };
  assert.equal(nudgeOpening(back, back.openings[0], 'ArrowRight', true).openings[0].offset, 28);
  // The left gable end is drawn on the left with the back at the top.
  const left = { ...d, openings: [{ ...door, wall: 'left', offset: 20 }] };
  const up = nudgeOpening(left, left.openings[0], 'ArrowUp').openings[0];
  assert.deepEqual([up.wall, up.offset], ['left', 19]);
  assert.equal(nudgeOpening(d, door, 'Enter'), null);
});

test('arrow keys on the end view turn off the matching automatic choice', () => {
  const p = nudgeEnd({ ...d, autoPitch: true }, 'peak', 'ArrowUp');
  assert.deepEqual([p.pitch, p.autoPitch], [d.pitch + 1, false]);
  const w = nudgeEnd({ ...d, autoWall: true }, 'wall', 'ArrowDown', true);
  assert.deepEqual([w.wallHeight, w.autoWall], [d.wallHeight - 12, false]);
  const o = nudgeEnd({ ...d, autoOverhang: true }, 'eave', 'ArrowLeft');
  assert.deepEqual([o.overhang, o.autoOverhang], [d.overhang + 1, false]);
  assert.equal(nudgeEnd({ ...d, pitch: 14 }, 'peak', 'ArrowUp'), null);
});
