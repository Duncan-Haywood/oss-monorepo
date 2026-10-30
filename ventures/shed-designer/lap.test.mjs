// Lap siding: courses, butt joints on studs, staggering, the order and the build steps.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign } from './model.mjs';
import { estimate } from './estimate.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { buildInstructions } from './instructions.mjs';
import { LAP_PRODUCTS, lapStagger, backed } from './lap.mjs';
import { sidingSpan } from './simplify.mjs';
import { SWAPS } from './catalog.mjs';

const lap = (o) => buildShed({ ...defaultDesign(), sidingType: 'fiber cement', ...o });

test('the default 8x12 in fiber cement: no butt joints, 7" courses, OSB under it, every check passes', () => {
  const shed = lap({});
  assert.equal(shed.panels.filter((p) => p.kind === 'siding').length, 0, 'no 4x8 siding panels');
  assert.ok(shed.panels.some((p) => p.kind === 'wall sheathing'));
  assert.equal(shed.lap.reduce((t, f) => t + f.joints.length, 0), 0, 'a 12 ft wall takes one 12 ft plank a course');
  const front = shed.lap.find((f) => f.wall === 'front');
  // 90-3/4" from the skids to the plate top (the 84-1/2" wall under a two-2x4
  // door header): 13 even courses of 6-7/8" (the maker allows up to 7").
  assert.equal(shed.lapExposure, 6.875);
  assert.deepEqual(front.courses.slice(0, 3).map((c) => c.zb - shed.dims.skidTop), [0, 6.875, 13.75]);
  for (const f of shed.lap) for (const p of f.pieces) assert.ok(p.len <= 144 && p.len > 0, `${f.wall} piece ${p.len}`);
  const rows = connectionChecks(shed).rows;
  assert.ok(rows.every((r) => r.ok), rows.filter((r) => !r.ok).map((r) => r.detail).join('\n'));
  assert.ok(rows.some((r) => r.check === 'Wall sheathing joints on framing'));
  const ig = integrity(shed);
  assert.deepEqual(ig.floating, []);
});

test('long walls: every butt joint on a stud, two stud bays from the course below for fiber cement at 16", one for LP', () => {
  for (const [type, sp, gap] of [['fiber cement', 16, 32], ['fiber cement', 24, 24], ['LP SmartSide lap', 16, 16]]) {
    const shed = lap({ sidingType: type, length: 288, width: 144, studSpacing: sp, autoStuds: false, maxHaulFt: 0 });
    assert.equal(lapStagger(shed.design), gap);
    const joints = shed.lap.flatMap((f) => f.joints.map((j) => ({ ...j, f })));
    assert.ok(joints.length > 0, `${type} has joints on a 24 ft wall`);
    for (const j of joints) {
      assert.ok(j.backed, `${type} ${j.f.wall} course ${j.course} at ${j.x}`);
      for (const o of joints) if (o.f === j.f && o.course === j.course - 1) assert.ok(Math.abs(o.x - j.x) >= gap - 1e-6, `${type} stagger ${o.x} / ${j.x}`);
    }
    for (const f of shed.lap) for (const p of f.pieces) assert.ok(p.len <= LAP_PRODUCTS[type].length + 1e-6);
    const rows = connectionChecks(shed).rows.filter((r) => r.check.startsWith('Lap'));
    assert.equal(rows.length, 2);
    assert.ok(rows.every((r) => r.ok), rows.map((r) => r.detail).join('\n'));
  }
});

test('backed() counts two pieces meeting end to end as wood, and a gap as none', () => {
  const plates = [{ s0: 0, s1: 127, z0: 0, z1: 10 }, { s0: 127, s1: 200, z0: 0, z1: 10 }];
  assert.equal(backed(plates, 127, 1, 9), true);
  assert.equal(backed([{ s0: 0, s1: 126, z0: 0, z1: 10 }, { s0: 128, s1: 200, z0: 0, z1: 10 }], 127, 1, 9), false);
});

test('the order: planks from the cut plan, OSB, wrap, starter ripped from a plank, nails; no T1-11', () => {
  const shed = lap({ length: 192 });
  const est = estimate(shed);
  const names = est.shopping.map((l) => l.name);
  assert.ok(!names.some((n) => /T1-11/.test(n)));
  for (const re of [/Fiber cement lap plank/, /OSB wall sheathing/, /House wrap \(/, /seam tape/, /cap nails/, /siding nails/, /flashing coil/]) assert.ok(names.some((n) => re.test(n)), re.source);
  const lc = est.lapCuts;
  assert.equal(lc.boards.flatMap((b) => b.cuts).length, shed.lap.reduce((t, f) => t + f.pieces.length, 0), 'every course piece is on the cut plan');
  const planks = est.shopping.find((l) => /Fiber cement lap plank/.test(l.name));
  assert.equal(planks.qty, lc.boards.length + lc.starterPlanks);
  assert.ok(lc.starterPlanks >= 1 && lc.perPlank === 6);
});

test('engineered wood lap uses only 12 ft planks when 16 ft boards are not ticked', () => {
  // The default 12 ft haul limit keeps 16 ft planks off the order; with no limit the cut plan uses them.
  assert.ok(estimate(lap({ sidingType: 'LP SmartSide lap', length: 240 })).lapCuts.boards.every((b) => b.stock === 144));
  const both = estimate(lap({ sidingType: 'LP SmartSide lap', length: 240, maxHaulFt: 0 }));
  assert.ok(both.lapCuts.boards.some((b) => b.stock === 192));
  const short = lap({ sidingType: 'LP SmartSide lap', length: 240, lengths: [8, 10, 12], maxHaulFt: 0 });
  const est = estimate(short);
  assert.ok(est.lapCuts.boards.every((b) => b.stock === 144));
  assert.ok(!est.shopping.some((l) => /8 in x 16 ft/.test(l.name)));
  for (const f of short.lap) for (const p of f.pieces) assert.ok(p.len <= 144);
  assert.ok(connectionChecks(short).rows.every((r) => r.ok));
});

test('lap costs more than T1-11 on the default 8x12, by the OSB and wrap it needs', () => {
  const t111 = estimate(buildShed({ ...defaultDesign(), sidingType: 'T1-11', sidingColor: 'white' })).total;
  const fc = estimate(lap({ sidingColor: 'white' })).total;
  assert.ok(fc > t111, `${fc} vs ${t111}`);
  const swap = SWAPS.find((s) => s.id === 'lapfc');
  assert.ok(swap.when(defaultDesign()) && /costs more/.test(swap.cost));
  assert.ok(!SWAPS.find((s) => s.id === 'notrim').when({ ...defaultDesign(), sidingType: 'fiber cement' }), 'lap needs trim to butt into');
});

test('build steps: sheathing, wrap, trim first, starter, story pole and the joints by place', () => {
  const shed = lap({ length: 192 });
  const est = estimate(shed);
  const steps = buildInstructions(shed, est);
  const sec = steps.find((s) => s.title === 'Wall sheathing, wrap and lap siding');
  assert.ok(sec);
  const text = sec.steps.join(' ');
  for (const re of [/7\/16" OSB/, /house wrap/, /Starter: rip/, /0", 6-7\/8", 13-3\/4", 20-5\/8"/, /Butt joints \(\d+\)/, /front course 1 at 144"/, /6" above the ground/]) assert.match(text, re);
  assert.ok(!steps.some((s) => s.title === 'Siding'));
  assert.ok(!steps.flatMap((s) => s.steps).some((x) => /T1-11 panels/.test(x)));
});

test('3D: each course leans out at its butt edge, and the elevation draws every piece', () => {
  const shed = lap({});
  const p = shed.panels.find((x) => x.kind === 'lap siding' && x.wall === 'front');
  assert.ok(p.geom.v[1] > 0 && p.geom.v[2] > 0.99, 'front courses lean back toward the wall going up');
  assert.ok(Array.isArray(p.face) && p.face.length >= 3);
});

test('even courses: the top plank on the long walls meets the plate, at no more than the maker\'s exposure', () => {
  for (const type of Object.keys(LAP_PRODUCTS)) for (const o of [{}, { wallHeight: 96, autoWall: false }, { wallHeight: 80, autoWall: false, openings: [] }]) {
    const shed = lap({ sidingType: type, ...o });
    const spec = LAP_PRODUCTS[type];
    assert.ok(shed.lapExposure <= spec.exposure + 1e-9 && spec.width - shed.lapExposure >= (type === 'fiber cement' ? 1.25 : 1) - 1e-9, `${type} ${shed.lapExposure}`);
    const front = shed.lap.find((f) => f.wall === 'front');
    const last = front.courses[front.courses.length - 1];
    assert.ok(Math.abs(last.zb + spec.width - shed.dims.plateTop) < 1e-6, `${type} ${JSON.stringify(o)} top course ends at ${last.zb + spec.width}, plate ${shed.dims.plateTop}`);
  }
});

test('stud spacing: lap over OSB allows 24" o.c. for both products (cited in lap.mjs), and the built shed says so', () => {
  for (const type of Object.keys(LAP_PRODUCTS)) {
    const shed = lap({ sidingType: type, studSpacing: 24 });
    assert.equal(shed.sidingStudLimit, 24);
    assert.equal(sidingSpan(shed.design), 24);
    assert.ok(connectionChecks(shed).rows.every((r) => r.ok), type);
  }
  assert.equal(LAP_PRODUCTS['LP SmartSide lap'].maxStuds.directToStuds, 16);
  assert.equal(buildShed({ ...defaultDesign(), sidingType: 'T1-11' }).sidingStudLimit, undefined);
});

// Fuzz seed 11 (FUZZ_N=2000): a window notching the course above left it no stud
// 32" clear of the joint below, because the lower course picked its joint without
// looking up. Each course now takes the first legal plan that leaves the next one a legal plan.
const SEED11 = [
  {"length": 120, "width": 192, "wallHeight": 65.5, "pitch": 8, "overhang": 18, "studSize": "2x4", "studSpacing": 16, "joistSize": "2x4", "joistSpacing": 16, "rafterSize": "2x4", "rafterSpacing": 12, "roofType": "truss", "beamSize": "2x8", "skidSize": "4x4", "skidSpacing": 66, "foundation": "piers", "pad": "under blocks", "gableVents": false, "ventWidth": 9, "ventHeight": 9, "maxPeak": 151, "autoWall": true, "autoPitch": false, "autoOverhang": false, "sidingType": "fiber cement", "wallTrim": "none", "roofCover": "metal", "rafterSeat": "connector", "maxHaulFt": 12, "kerf": 0.125, "lengths": [8, 10, 12, 14, 16, 18, 20], "openings": [{"id": "o1", "kind": "window", "wall": "front", "offset": 72, "width": 13, "height": 81, "sill": 10}, {"id": "o2", "kind": "window", "wall": "left", "offset": 80, "width": 81, "height": 30, "sill": 1}, {"id": "o3", "kind": "window", "wall": "left", "offset": 56, "width": 51, "height": 16, "sill": 69}]},
  {"length": 282, "width": 120, "wallHeight": 65, "pitch": 6, "overhang": 14, "studSize": "2x6", "studSpacing": 16, "joistSize": "2x8", "joistSpacing": 24, "rafterSize": "2x8", "rafterSpacing": 24, "roofType": "ridgeBoard", "beamSize": "2x12", "skidSize": "4x6", "skidSpacing": 54, "foundation": "blocks", "pad": "full", "gableVents": true, "ventWidth": 13, "ventHeight": 17, "maxPeak": 145, "autoWall": false, "autoPitch": true, "autoOverhang": false, "sidingType": "fiber cement", "wallTrim": "1x4", "roofCover": "metal", "rafterSeat": "birdsmouth", "maxHaulFt": 12, "kerf": 0.125, "lengths": [8, 10, 12, 14, 16, 20], "openings": [{"id": "o1", "kind": "window", "wall": "front", "offset": 56, "width": 21, "height": 23, "sill": 43, "product": "swm-2427"}, {"id": "o2", "kind": "window", "wall": "back", "offset": -4, "width": 52, "height": 37, "sill": 0}, {"id": "o3", "kind": "door", "wall": "back", "offset": 156, "width": 92, "height": 22}, {"id": "o4", "kind": "door", "wall": "back", "offset": 242, "width": 39, "height": 23, "product": "jeldwen-3280-6p"}, {"id": "o5", "kind": "door", "wall": "right", "offset": -7, "width": 61, "height": 94, "product": "masonite-3680"}]},
];
test('fuzz seed 11: a course picks its joints so the notched course above can still break on a stud', () => {
  for (const d of SEED11) {
    const shed = buildShed(d);
    const rows = connectionChecks(shed).rows.filter((r) => r.check.startsWith('Lap'));
    assert.ok(rows.length && rows.every((r) => r.ok), rows.map((r) => r.detail).join('\n'));
  }
});

test('two doors too close for a layout stud between their casings get an extra stud, so the lap joint lands on wood (fuzz seed 27311, #591)', async () => {
  const { buildShed, defaultDesign } = await import('./model.mjs');
  const d = {
    ...defaultDesign(), length: 288, width: 108, wallHeight: 96.5, pitch: 9, overhang: 9, studSize: '2x6', studSpacing: 24, autoStuds: true,
    roofType: 'ridgeBoard', rafterSize: '2x8', sidingType: 'fiber cement', sidingColor: 'pink', maxHaulFt: 12, maxFootprint: 0, maxPeak: 163,
    openings: [
      { id: 'o1', kind: 'door', wall: 'right', offset: 9, width: 54, height: 39, product: 'sr-48x72' },
      { id: 'o3', kind: 'door', wall: 'front', offset: 145, width: 45, height: 59 },
      { id: 'o4', kind: 'door', wall: 'front', offset: 216, width: 49, height: 40 },
    ],
  };
  const shed = buildShed(d);
  const front = shed.lap.find((f) => f.wall === 'front');
  assert.ok(front.joints.length > 0);
  assert.ok(front.joints.every((j) => j.backed), JSON.stringify(front.joints.filter((j) => !j.backed)));
  const extra = shed.members.filter((m) => m.note === 'extra stud to back a lap siding butt joint');
  assert.equal(extra.length, 1);
  assert.ok(extra[0].local.s0 > 193 && extra[0].local.s1 < 213, JSON.stringify(extra[0].local));
  assert.ok(shed.notes.some((n) => /added off the layout/.test(n)));
  // A wall with room for its joints gets no extra stud.
  assert.ok(!buildShed(defaultDesign()).members.some((m) => m.note === 'extra stud to back a lap siding butt joint'));
});
