// The bottom plate runs straight across a door opening by default: the wall is
// framed on one plate, raised and nailed down, and then the piece in the
// doorway is sawn out. plateThroughDoors: false cuts it at the door first.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize } from './model.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { buildInstructions, instructionsMarkdown } from './instructions.mjs';
import { buildSheets } from './drawings.mjs';
import { solidsOf } from './render3d.mjs';
import { invariants } from './invariants.mjs';

const plates = (shed, wall = 'front') => shed.members.filter((m) => m.kind === 'bottom plate' && m.group === `wall:${wall}`);
const boards = (shed, name) => estimate(shed, examplePrices()).shopping.find((r) => r.section === 'Lumber' && r.name === name)?.qty ?? 0;

test('plateThroughDoors defaults on and keeps false when asked', () => {
  assert.equal(normalize({}).plateThroughDoors, true);
  assert.equal(normalize({ plateThroughDoors: false }).plateThroughDoors, false);
});

test('default 8x12: the front bottom plate is one full-length piece with the door piece flagged', () => {
  const shed = buildShed(defaultDesign());
  const door = defaultDesign().openings.find((o) => o.kind === 'door');
  const front = plates(shed);
  assert.equal(front.length, 1);
  assert.equal(front[0].length, shed.walls.front.len);
  assert.equal(front[0].cutOuts?.length, 1);
  const cut = front[0].cutOuts[0];
  assert.equal(cut.op, door.id);
  assert.equal(cut.s1 - cut.s0, door.width);
  assert.match(front[0].note, /after the wall is raised/);
  // The jacks stand on the plate just outside the piece that comes out.
  const jacks = shed.walls.front.members.filter((m) => m.kind === 'jack stud').map((m) => m.local);
  assert.ok(jacks.some((j) => Math.abs(j.s1 - cut.s0) < 1e-9) && jacks.some((j) => Math.abs(j.s0 - cut.s1) < 1e-9));
  // Walls without a door have nothing to cut out.
  for (const w of ['back', 'left', 'right']) assert.ok(plates(shed, w).every((m) => !m.cutOuts));
});

test('with plateThroughDoors off the plate stops at the door, as before', () => {
  const shed = buildShed({ ...defaultDesign(), plateThroughDoors: false });
  const door = defaultDesign().openings.find((o) => o.kind === 'door');
  const front = plates(shed);
  assert.equal(front.length, 2);
  assert.ok(front.every((m) => !m.cutOuts && !m.note));
  const total = front.reduce((t, m) => t + (m.local.s1 - m.local.s0), 0);
  assert.equal(total, shed.walls.front.len - door.width);
});

test('the full plate takes a 12 ft board where the two short pieces came out of 8 ft ones', () => {
  const on = buildShed(defaultDesign());
  const off = buildShed({ ...defaultDesign(), plateThroughDoors: false });
  assert.equal(boards(on, "2x4 x 12'"), boards(off, "2x4 x 12'") + 1);
  assert.equal(boards(on, "2x4 x 8'"), boards(off, "2x4 x 8'") - 1);
});

test('a wall longer than a board still splits on studs, never inside the door', () => {
  const d = { ...defaultDesign(), length: 240, maxHaulFt: 12, openings: [{ id: 'o1', kind: 'door', wall: 'front', offset: 100, width: 38.5, height: 78 }] };
  const shed = buildShed(d);
  const front = plates(shed);
  assert.ok(front.length > 1);
  const cut = front.flatMap((m) => m.cutOuts || []);
  assert.equal(cut.length, 1);
  for (const m of front.slice(1)) assert.ok(m.local.s0 <= cut[0].s0 - 1e-9 || m.local.s0 >= cut[0].s1 + 1e-9, `joint at ${m.local.s0} inside the door`);
  assert.deepEqual(invariants(d), []);
});

test('the build steps saw the plate out after the wall is raised', () => {
  const shed = buildShed(defaultDesign());
  const text = instructionsMarkdown(buildInstructions(shed, estimate(shed, examplePrices())));
  assert.match(text, /runs straight across the door opening/);
  assert.match(text, /reciprocating saw/);
  assert.match(text, /subfloor/);
  assert.doesNotMatch(text, /The bottom plate stops at each side of the door/);
  const off = buildShed({ ...defaultDesign(), plateThroughDoors: false });
  const offText = instructionsMarkdown(buildInstructions(off, estimate(off, examplePrices())));
  assert.match(offText, /The bottom plate stops at each side of the door/);
  assert.doesNotMatch(offText, /reciprocating saw/);
});

test('floorless: the cut-out step keeps fasteners out of the door and spares the timber', () => {
  const d = { ...defaultDesign(), floor: 'none' };
  const shed = buildShed(d);
  assert.equal(plates(shed)[0].cutOuts?.length, 1);
  const text = instructionsMarkdown(buildInstructions(shed, estimate(shed, examplePrices())));
  assert.match(text, /anchor bolts you add, outside the door opening/);
  assert.match(text, /timber under it/);
  assert.deepEqual(invariants(d), []);
});

test('drawings mark the cut-out and the 3D view shows the doorway clear', () => {
  const shed = buildShed(defaultDesign());
  const wall = buildSheets(shed).find((s) => s.id === 'wall-front');
  assert.ok(wall.items.some((it) => it.t === 'text' && /cut out after raising/.test(it.text)));
  assert.match(wall.note, /sawn out flush with the jacks/);
  const id = plates(shed)[0].id;
  assert.equal(solidsOf(shed).filter((s) => s.id === id).length, 2);
  const offShed = buildShed({ ...defaultDesign(), plateThroughDoors: false });
  assert.ok(!buildSheets(offShed).find((s) => s.id === 'wall-front').items.some((it) => it.t === 'text' && /cut out after raising/.test(it.text)));
  assert.deepEqual(invariants({ ...defaultDesign(), plateThroughDoors: false }), []);
});
