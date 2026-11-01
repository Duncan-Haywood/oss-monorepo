// Panel siding run horizontally, primed T1-11, and T1-11 sold as 4x8 only (owner, 2026-11-01).
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, clipRect } from './model.mjs';
import { estimate } from './estimate.mjs';
import { sidingLook } from './hoa.mjs';
import { idsForLine } from './xref.mjs';
import { bbox } from './integrity.mjs';

const area = (pts) => Math.abs(pts.reduce((t, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return t + x * v - u * y; }, 0)) / 2;

test('clipRect: a full rectangle under a flat top, a trimmed piece under a gable, nothing above it', () => {
  const flat = () => 100;
  assert.deepEqual(clipRect(flat, [], 0, 96, 0, 48), [[0, 0], [96, 0], [96, 48], [0, 48]]);
  // A gable from 100 at the eaves to 124 at the middle (48), down to 100 at 96.
  const gable = (s) => 100 + 24 * (1 - Math.abs(s - 48) / 48);
  const top = clipRect(gable, [48], 0, 96, 96, 144);
  assert.equal(area(/** @type {any} */ (top)), 96 * 4 + 0.5 * 96 * 24);
  assert.equal(clipRect(gable, [48], 0, 96, 130, 178), null);
  // A row whose top cuts through the slope: a pentagon, area checked by hand.
  const mid = clipRect(gable, [48], 0, 96, 104, 120);
  // Each half: the slope (100 + s/2) rises through the row from s = 8 to 40, then the
  // row is full height to the middle: integral of (s/2 - 4) over 8..40 is 256, plus 16 x 8.
  const exact = 2 * (256 + 128);
  assert.ok(Math.abs(area(/** @type {any} */ (mid)) - exact) < 1e-6);
});

test('vertical runs stay the default; horizontal is an option', () => {
  assert.equal(normalize({}).sidingRun, 'vertical');
  assert.equal(normalize({ sidingRun: 'horizontal' }).sidingRun, 'horizontal');
  assert.equal(normalize({ sidingRun: 'diagonal' }).sidingRun, 'vertical');
  assert.equal(normalize({}).sidingPrimed, false);
});

test('T1-11 is bought as 4x8 only: no 9 or 10 ft panels on any wall height', () => {
  for (const wallHeight of [84, 96, 108, 120]) {
    const shed = buildShed(normalize({ style: 'gable', wallHeight, sidingType: 'T1-11' }));
    assert.ok(shed.sidingFull.every((x) => x.length === 96), `wall ${wallHeight}`);
    const est = estimate(shed);
    assert.ok(!est.shopping.some((r) => /4x9|4x10/.test(r.name)), `wall ${wallHeight}`);
  }
});

test('horizontal panels: 4 ft rows from the bottom, under the roof line, joints Z-flashed and blocked', () => {
  const d = normalize({ style: 'gable', sidingRun: 'horizontal' });
  const shed = buildShed(d);
  const pieces = shed.panels.filter((p) => p.kind === 'siding');
  assert.ok(pieces.length > 0);
  for (const p of pieces) {
    const zs = p.geom.profile.map((q) => q[1]);
    const ss = p.geom.profile.map((q) => q[0]);
    assert.ok(Math.max(...zs) - Math.min(...zs) <= 48 + 1e-9, 'a row is at most 4 ft high');
    assert.ok(Math.max(...ss) - Math.min(...ss) <= 96 + 1e-9, 'a piece is at most 8 ft long');
  }
  assert.ok(shed.sidingJoints.length > 0);
  const blocks = shed.members.filter((m) => m.kind === 'siding blocking');
  assert.ok(blocks.length > 0);
  // Every block is centred on a row joint of its own wall.
  for (const b of blocks) {
    const g = bbox(b.geom);
    const zMid = (g.lo[2] + g.hi[2]) / 2;
    const wall = b.group.split(':')[1];
    assert.ok(shed.sidingJoints.some((j) => j.wall === wall && Math.abs(j.z - zMid) < 1e-6), `${b.id} at ${zMid}`);
  }
  const vertical = estimate(buildShed(normalize({ style: 'gable' })));
  const est = estimate(shed);
  const z = (e) => e.shopping.find((r) => /Z-flashing/.test(r.name))?.qty ?? 0;
  assert.ok(z(est) > z(vertical), 'more Z-flashing along the row joints');
  assert.ok(est.parts.some((p) => p.kind === 'siding blocking'), 'the blocks are in the parts list');
  assert.ok(shed.notes.some((n) => /R703\.3\.1/.test(n)));
});

test('no blocking across a door opening', () => {
  // The default design has a door on the front wall and two windows on the back.
  const shed = buildShed(normalize({ sidingRun: 'horizontal' }));
  const blocks = shed.members.filter((m) => m.kind === 'siding blocking').map((b) => ({ g: bbox(b.geom), wall: b.group.split(':')[1] }));
  const fixtures = shed.fixtures.filter((f) => (f.kind === 'door' || f.kind === 'window') && f.geom);
  assert.ok(fixtures.length >= 1);
  let checked = 0;
  for (const f of fixtures) {
    const op = shed.framedOpenings.find((o) => o.id === f.op);
    const fg = bbox(f.geom);
    const ax = op.wall === 'front' || op.wall === 'back' ? 0 : 1;
    for (const b of blocks.filter((x) => x.wall === op.wall)) {
      checked += 1;
      const overlapS = b.g.lo[ax] < fg.hi[ax] - 1e-6 && b.g.hi[ax] > fg.lo[ax] + 1e-6;
      const overlapZ = b.g.lo[2] < fg.hi[2] - 1e-6 && b.g.hi[2] > fg.lo[2] + 1e-6;
      assert.ok(!(overlapS && overlapZ), `block crosses ${f.kind} ${f.op}`);
    }
  }
  assert.ok(checked > 0, 'some blocks share a wall with an opening');
});

test('primed T1-11 swaps the panel for the primed listing and still shows in 3D', () => {
  const shed = buildShed(normalize({ sidingPrimed: true, sidingRun: 'horizontal' }));
  const est = estimate(shed);
  const row = est.shopping.find((r) => r.source?.key === 'siding8primed');
  assert.ok(row, 'primed line present');
  assert.ok(!est.shopping.some((r) => r.source?.key === 'siding8'));
  assert.ok(idsForLine(shed, row).length > 0, 'the line lights the siding in 3D');
  // Primed only applies to T1-11.
  const lp = estimate(buildShed(normalize({ sidingPrimed: true, sidingType: 'LP SmartSide' })));
  assert.ok(!lp.shopping.some((r) => r.source?.key === 'siding8primed'));
});

test('HOA drawings describe level grooves for horizontal T1-11', () => {
  assert.equal(sidingLook('T1-11').direction, 'vertical');
  assert.equal(sidingLook('T1-11', 'horizontal').direction, 'horizontal');
});
