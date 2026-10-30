import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { integrity, bbox } from './integrity.mjs';

const variants = [{}, { foundation: 'blocks' }, { roofType: 'ridgeBeam' }, { roofType: 'ridgeBoard' }, { interior: 'teen bedroom' }, { overhang: 0 }, { length: 240 }, { studSize: '2x6' }];

test('nothing floats and no two boards share wood, in every preset and variation', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    for (const v of variants) {
      const r = integrity(buildShed({ ...make(), ...v }));
      assert.deepEqual(r.floating, [], `${name} ${JSON.stringify(v)} floating`);
      assert.deepEqual(r.clashes, [], `${name} ${JSON.stringify(v)} clashes`);
    }
  }
});

// The bug this file was written for: every wall member was placed from the
// floor up, so top plates, headers and sills sat at floor level in 3D.
test('wall members sit at their own heights, top plates at the top of the wall', () => {
  const s = buildShed(PRESETS['8x12 classic']());
  const top = s.members.find((m) => m.group === 'wall:front' && m.kind === 'cap plate');
  const b = bbox(top.geom);
  assert.equal(b.hi[2], s.dims.plateTop);
  assert.equal(b.lo[2], s.dims.plateTop - 1.5);
  const header = s.members.find((m) => m.group === 'wall:front' && m.kind === 'header');
  assert.equal(bbox(header.geom).lo[2], s.dims.floorTop + 82);
});

test('eave blocking closes each wall top between rafters', () => {
  const s = buildShed(defaultDesign());
  const blocks = s.members.filter((m) => m.kind === 'eave blocking');
  assert.equal(blocks.length, 2 * (s.dims.rafterCenters.length - 1));
});
