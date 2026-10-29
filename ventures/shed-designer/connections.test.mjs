import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { connectionChecks } from './connections.mjs';
import { bbox } from './integrity.mjs';

const bboxMid = (m) => { const b = bbox(m.geom); return (b.lo[1] + b.hi[1]) / 2; };

const variants = [{}, { foundation: 'blocks' }, { roofType: 'ridgeBoard' }, { roofType: 'ridgeBeam' }, { length: 240 }, { studSize: '2x6' }, { overhang: 0 },
  { foundation: 'blocks', lengths: [8, 10, 12] }, { foundation: 'deck blocks', lengths: [8, 10, 12] }, { studSpacing: 24, rafterSpacing: 24 }, { length: 150, width: 102 }];

test('every preset and variation ties together', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    for (const v of variants) {
      const r = connectionChecks(buildShed({ ...make(), ...v }));
      assert.deepEqual(r.rows.filter((x) => !x.ok).map((x) => `${x.check}: ${x.detail}`), [], `${name} ${JSON.stringify(v)}`);
    }
  }
});

test('the cap plates interlock: long walls stop short, end walls lap over', () => {
  const s = buildShed(defaultDesign());
  const cap = (g) => s.members.filter((m) => m.group === `wall:${g}` && m.kind === 'cap plate');
  assert.deepEqual(cap('front').map((m) => m.length), [144 - 7]);
  assert.deepEqual(cap('left').map((m) => m.length), [96]);
  const top = (g) => s.members.filter((m) => m.group === `wall:${g}` && m.kind === 'top plate');
  assert.deepEqual(top('front').map((m) => m.length), [144]);
  assert.deepEqual(top('left').map((m) => m.length), [96 - 7]);
});

// The check has to fail when the frame is wrong, or it proves nothing.
test('a missing jack, a floating cripple and an unlapped corner are each caught', () => {
  const s = buildShed(PRESETS['8x12 classic']());
  const noJack = { ...s, walls: { ...s.walls, front: { ...s.walls.front, members: s.walls.front.members.filter((m, i, a) => !(m.kind === 'jack stud' && a.findIndex((x) => x.kind === 'jack stud') === i)) } } };
  assert.ok(!connectionChecks(noJack).rows.find((r) => r.check === 'front wall: headers bear on jacks').ok);

  const back = s.walls.back.members.map((m) => (m.kind === 'bottom cripple' ? { ...m, local: { ...m.local, z1: m.local.z1 - 1 } } : m));
  const floating = { ...s, walls: { ...s.walls, back: { ...s.walls.back, members: back } } };
  assert.ok(!connectionChecks(floating).rows.find((r) => r.check === 'back wall: cripples and sills bear').ok);

  const unlapped = { ...s, members: s.members.filter((m) => !(m.group === 'wall:left' && m.kind === 'cap plate')) };
  assert.ok(!connectionChecks(unlapped).rows.find((r) => r.check === 'Cap plates lap the corners').ok);
});

// Found by the panel and skid checks on 2026-10-29. Short stock splits each
// skid in two; the blocks were spaced evenly and the joint fell between them.
test('a spliced skid on blocks has a block under its joint', () => {
  const s = buildShed({ ...PRESETS['8x12 classic'](), foundation: 'blocks', lengths: [8, 10] });
  const row = connectionChecks(s).rows.find((r) => r.check === 'Skid joints land on blocks');
  assert.ok(row?.ok, row?.detail);
  assert.equal(s.dims.blockCount, s.fixtures.filter((f) => f.kind === 'block').length);
  const lifted = { ...s, fixtures: s.fixtures.filter((f) => !(f.kind === 'block' && Math.abs(f.geom.origin[0] - (72 - 8)) < 1e-6)) };
  assert.ok(!connectionChecks(lifted).rows.find((r) => r.check === 'Skid joints land on blocks').ok);
});

// A 32" window with one stud-layout line inside got sill cripples only at its
// ends, so the siding joint on that line had nothing behind it under the window.
test('a window with one layout line inside keeps a sill cripple on it, and the siding joint is backed', () => {
  const s = buildShed(PRESETS['8x10']());
  const cr = s.walls.right.members.filter((m) => m.kind === 'bottom cripple').map((m) => m.local.s0 + s.walls.right.start + 0.75);
  assert.ok(cr.includes(48), String(cr));
  assert.ok(connectionChecks(s).rows.find((r) => r.check === 'Siding joints on framing').ok);
  const stripped = { ...s, members: s.members.filter((m) => !(m.group === 'wall:right' && m.kind === 'bottom cripple')) };
  assert.ok(!connectionChecks(stripped).rows.find((r) => r.check === 'Siding joints on framing').ok);
});

test('sheathing and subfloor joints off the framing are caught', () => {
  const s = buildShed(defaultDesign());
  const shift = (kind) => ({ ...s, panels: s.panels.map((p) => (p.kind === kind ? { ...p, geom: { ...p.geom, origin: [p.geom.origin[0] + 4, p.geom.origin[1], p.geom.origin[2]] } } : p)) });
  assert.ok(!connectionChecks(shift('floor sheet')).rows.find((r) => r.check === 'Subfloor edges on joists').ok);
  assert.ok(!connectionChecks(shift('roof sheathing')).rows.find((r) => r.check === 'Roof sheathing edges on rafters').ok);
});

// Found 2026-10-29: four skids under a 10 ft wide ridge-beam shed left the
// gable posts 19" from the nearest skid, mid-span on a single 2x6 end joist.
test('a ridge beam always has a skid under its gable posts', () => {
  for (const width of [84, 96, 108, 120, 132, 144]) {
    for (const skidSpacing of [36, 48, 60]) {
      const s = buildShed({ ...PRESETS['10x12'](), width, skidSpacing, roofType: 'ridgeBeam' });
      const row = connectionChecks(s).rows.find((r) => r.check === 'Ridge-beam posts bear on a skid');
      assert.ok(row?.ok, `${width} ${skidSpacing}: ${row?.detail}`);
      assert.ok(s.dims.skidYs.some((y) => Math.abs(y - width / 2) < 1e-9));
    }
  }
  const s = buildShed({ ...PRESETS['10x12'](), roofType: 'ridgeBeam' });
  const noMiddle = { ...s, members: s.members.filter((m) => !(m.kind === 'skid' && Math.abs(bboxMid(m) - 60) < 1)) };
  assert.ok(!connectionChecks(noMiddle).rows.find((r) => r.check === 'Ridge-beam posts bear on a skid').ok);
});

// The default's back window starts 1-3/4" past the 96" layout line, so its
// king stud took the line and the siding joint there had 1/4" of wood for
// the 13" above the header. A cripple over the jack backs it.
test('a layout line pushed aside by a king stud gets a cripple over the jack', () => {
  const s = buildShed(defaultDesign());
  const tops = s.walls.back.members.filter((m) => m.kind === 'top cripple').map((m) => bbox(m.geom).lo[0]);
  assert.ok(tops.some((x) => Math.abs(x - 96.25) < 1e-6), String(tops));
  assert.ok(connectionChecks(s).rows.find((r) => r.check === 'Siding joints on framing').ok);
});
