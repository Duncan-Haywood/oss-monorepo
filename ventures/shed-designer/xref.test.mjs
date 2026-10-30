// Cross-reference beyond framing: shopping lines for sheet goods, siding,
// roofing, trim and hardware point at drawn pieces, every drawn piece can be
// picked, and a site-built door's frame parts have geometry.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, PRESETS } from './model.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { solidsOf, pickMember } from './render3d.mjs';
import { idsForLine, describePiece } from './xref.mjs';

const presets = Object.entries(PRESETS);

test('every panel, fixture and door part has a unique id', () => {
  for (const [name, f] of presets) {
    const s = buildShed(f());
    const ids = [...s.members, ...s.panels, ...s.fixtures, ...s.doorParts].map((x) => x.id);
    assert.ok(ids.every(Boolean), name);
    assert.equal(new Set(ids).size, ids.length, name);
  }
});

test('sheet goods, siding, roofing and trim lines all point at something drawn', () => {
  for (const [name, f] of presets) {
    const s = buildShed(f());
    const e = estimate(s, examplePrices());
    for (const r of e.shopping.filter((x) => ['Sheet goods', 'Siding', 'Roofing', 'Roof trim', 'Wall trim', 'Doors and windows', 'Door hardware'].includes(x.section))) {
      assert.ok(idsForLine(s, r).length > 0, `${name}: ${r.name}`);
    }
    // Every id a line names is a real piece of this shed.
    const all = new Set([...s.panels, ...s.fixtures, ...s.doorParts].map((x) => x.id));
    for (const r of e.shopping) for (const id of idsForLine(s, r)) assert.ok(all.has(id), `${name}: ${r.name} -> ${id}`);
  }
});

test('door hardware points at its own door, not "(door skin)" screws at nothing', () => {
  const s = buildShed(PRESETS['8x12']());
  const e = estimate(s, examplePrices());
  const hinge = e.shopping.find((r) => r.source?.key === 'tHinge');
  const ids = idsForLine(s, hinge);
  assert.ok(ids.includes(s.fixtures.find((f) => f.op === 'o1' && f.kind === 'door').id));
  const screws = e.shopping.find((r) => r.source?.key === 'screws');
  assert.equal(idsForLine(s, screws).length, s.doorParts.length);
  assert.match(describePiece(s, ids[0]), /^Door o1$/);
});

test('door frame parts lie inside their opening, laid flat on the back of the door', () => {
  const s = buildShed(PRESETS['8x12']());
  const slab = s.fixtures.find((f) => f.op === 'o1');
  const [sw, sh] = [slab.geom.profile[2][0], slab.geom.profile[2][1]];
  assert.ok(s.doorParts.length > 0);
  for (const p of s.doorParts) {
    assert.ok(p.geom, p.id);
    assert.equal(p.geom.thickness, 1.5);
    for (const [u, v] of p.geom.profile) {
      assert.ok(u >= 0 && u <= sw + 1e-9, `${p.id} u ${u}`);
      assert.ok(v >= 0 && v <= sh + 1e-9, `${p.id} v ${v}`);
    }
    // The opposite direction to the door skin: into the shed.
    assert.deepEqual(p.geom.w, slab.geom.w.map((x) => -x || 0));
  }
});

test('a ray at the front wall picks the siding, not the stud behind it', () => {
  const s = buildShed(PRESETS['8x12']());
  const solids = solidsOf(s).filter((x) => x.id);
  // From outside the front wall (y < 0) looking in, at mid-wall height, between openings.
  const z = s.dims.floorTop + 30;
  // In line with a front-wall stud clear of the corner board, so the stud is behind the siding there.
  const stud = s.members.find((m) => m.group === 'wall:front' && m.kind === 'stud' && m.geom.origin[0] > 6 && m.geom.origin[0] < 40);
  const x = stud.geom.origin[0] + 0.75;
  const hit = pickMember(/** @type {any} */ (solids), [x, -200, z], [0, 1, 0]);
  const p = s.panels.find((q) => q.id === hit?.id);
  assert.ok(p, `picked ${hit?.id}`);
  assert.match(p.kind, /siding|sheathing/);
  // With only framing to pick from, the same ray finds a member.
  const framing = solids.filter((q) => s.members.some((m) => m.id === q.id));
  assert.ok(s.members.some((m) => m.id === pickMember(/** @type {any} */ (framing), [x, -200, z], [0, 1, 0])?.id));
});
