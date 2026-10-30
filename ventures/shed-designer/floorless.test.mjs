import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultDesign, buildShed, normalize, PRESETS } from './model.mjs';
import { estimate } from './estimate.mjs';
import { structuralChecks, anchorage } from './checks.mjs';
import { floorlessChecks } from './floorless.mjs';
import { connectionChecks } from './connections.mjs';
import { invariants } from './invariants.mjs';
import { buildSheets, sheetSvg, sheetsDxf } from './drawings.mjs';
import { buildInstructions, instructionsMarkdown } from './instructions.mjs';
import { dxfProblems } from './invariants.mjs';

const none = (x = {}) => buildShed(normalize({ ...defaultDesign(), floor: 'none', ...x }));

test('the default keeps its framed floor; floor and blockSpacing are sanitised', () => {
  assert.equal(normalize(defaultDesign()).floor, 'framed');
  assert.equal(normalize({ ...defaultDesign(), floor: 'slab' }).floor, 'framed');
  assert.equal(normalize({ ...defaultDesign(), blockSpacing: 500 }).blockSpacing, 96);
  assert.equal(normalize({ ...defaultDesign(), blockSpacing: 1 }).blockSpacing, 24);
});

test('no floor: no skids, blocks, joists or subfloor; four PT 4x6 timbers under the walls on a full pad', () => {
  const s = none();
  const k = s.dims;
  const kinds = new Set(s.members.map((m) => m.kind));
  for (const gone of ['skid', 'rim joist', 'floor joist']) assert.ok(!kinds.has(gone), gone);
  assert.equal(s.panels.filter((p) => p.kind === 'floor sheet').length, 0);
  assert.equal(s.fixtures.filter((f) => f.kind === 'block').length, 0);
  const timbers = s.members.filter((m) => m.kind === 'perimeter timber');
  assert.equal(timbers.length, 4, 'a 12 ft and an 8 ft shed needs no splice at a 12 ft haul');
  assert.ok(timbers.every((m) => m.material === 'PT 4x6' && m.group === 'foundation'));
  assert.equal(k.floorTop, 5.5, 'walls start on top of a 4x6 on edge');
  assert.equal(k.sidingBottom, 4.5, 'the siding laps 1" over the timber');
  assert.ok(k.gravelCuYd > 1.5 && !k.underBlocks && !k.noPad, 'a full gravel pad, whatever the pad choice');
  assert.ok(s.members.filter((m) => m.kind === 'bottom plate').every((m) => m.material === 'PT 2x4'), 'a plate on a ground-level timber is treated');
  // The framed starter's floor sits 13-3/4" up; without it the peak drops by the difference.
  const framed = buildShed(normalize(defaultDesign()));
  assert.ok(Math.abs((framed.dims.peak - k.peak) - (framed.dims.floorTop - k.floorTop)) < 0.01);
  assert.ok(s.notes.some((n) => /^Damp:/.test(n)) && s.notes.some((n) => /Rodents/.test(n)), 'honest notes on damp and rodents');
});

test('a ridge beam gets a pier under each gable post; other roofs get none', () => {
  const s = none();
  assert.equal(s.dims.postPiers, true);
  assert.equal(s.fixtures.filter((f) => f.kind === 'post pier').length, 2);
  assert.equal(s.dims.pierCount, 2);
  assert.equal(s.dims.pierLen, 24 + 4, 'frost depth below grade plus the 4" pad');
  const est = estimate(s);
  const names = est.shopping.map((r) => r.name).join('|');
  assert.match(names, /form tube/);
  assert.match(names, /Concrete mix, 80 lb/);
  assert.match(names, /Crushed stone|gravel/i);
  assert.doesNotMatch(names, /tongue-and-groove|Solid concrete block|Paver base/);
  for (const roofType of ['ridgeBoard', 'truss']) {
    const t = none({ roofType });
    assert.equal(t.dims.postPiers, false, roofType);
    assert.equal(t.dims.pierCount, 0, roofType);
    assert.doesNotMatch(estimate(t).shopping.map((r) => r.name).join('|'), /form tube/);
  }
  assert.equal(none({ style: 'leanTo' }).dims.postPiers, false);
});

test('the checks swap floor rows for the timbers, the plate bearing and the post piers', () => {
  const s = none();
  const rows = structuralChecks(s).rows;
  const names = rows.map((r) => r.member);
  for (const gone of ['Floor joists', 'Subfloor', 'Skids on blocks', 'Blocks on the soil']) assert.ok(!names.includes(gone), gone);
  for (const row of ['Perimeter timbers on the gravel', 'Bottom plate on the timbers', 'Post piers on the soil']) assert.ok(names.includes(row), row);
  assert.ok(rows.every((r) => Number.isFinite(r.ratio)));
  // Hand check of the timbers on the soil: the eave wall's line load over the
  // 3-1/2" timber spread 2" each side (7-1/2") against 1,500 psf.
  const c = /** @type {NonNullable<ReturnType<typeof floorlessChecks>>} */ (floorlessChecks(s));
  assert.equal(c.timbers.widthIn, 7.5);
  assert.ok(Math.abs(c.timbers.psf - c.timbers.plf / (7.5 / 12)) < 1e-9);
  assert.ok(Math.abs(c.timbers.ratio - c.timbers.psf / 1500) < 1e-9);
  // The post: half the ridge beam's roof, (15/cos + 30) psf over half the width and the full length.
  const cos = 1 / Math.sqrt(1 + (s.design.pitch / 12) ** 2);
  const post = ((15 / cos + 30) * 4 * 12) / 2;
  assert.ok(Math.abs(/** @type {any} */ (c.pier).postLb - post) < 1e-6);
  // Fc_perp of wet Southern pine No. 2: 565 x 0.67.
  assert.ok(Math.abs(c.plate.Fc - 565 * 0.67) < 1e-9);
  assert.ok(c.timbers.ratio < 1 && c.plate.ratio < 1 && /** @type {any} */ (c.pier).ratio < 1, 'the starter passes all three');
  assert.ok(Number.isFinite(anchorage(s).ratio) && anchorage(s).ratio > 0);
  assert.equal(floorlessChecks(buildShed(normalize(defaultDesign()))), null);
});

test('connections: every plate on a timber, timbers on the pad, posts on piers', () => {
  const rows = connectionChecks(none()).rows;
  for (const name of ['Bottom plates bear on the timbers', 'Timbers bear on the gravel', 'Ridge-beam posts bear on a pier']) {
    const r = rows.find((x) => x.check === name);
    assert.ok(r, name);
    assert.ok(r.ok, `${name}: ${r.fails}`);
  }
  assert.ok(!rows.some((r) => /Floor joists bear|Skids bear/.test(r.check)));
});

test('drawings drop the floor framing sheet and show the timbers; steps skip the floor', () => {
  const s = none();
  const sheets = buildSheets(s);
  assert.ok(!sheets.some((x) => x.id === 'floor'), 'no floor framing plan');
  const plan = /** @type {any} */ (sheets.find((x) => x.id === 'foundation'));
  assert.match(plan.note, /it is the floor/);
  assert.match(sheetSvg(plan), /No floor/);
  assert.deepEqual(dxfProblems(sheetsDxf(sheets)), []);
  const md = instructionsMarkdown(buildInstructions(s, estimate(s)));
  assert.match(md, /Perimeter timbers/);
  assert.match(md, /Piers under the ridge-beam posts/);
  assert.doesNotMatch(md, /## \d+\. (Skids|Floor frame|Subfloor)/);
  assert.match(md, /Nail the bottom plate down into the timber/);
});

test('no floor holds the model\'s invariants across styles, roofs, sizes and presets', () => {
  const variants = [
    {}, { style: 'leanTo' }, { style: 'gambrel' }, { roofType: 'truss' }, { roofType: 'ridgeBoard' },
    { length: 192, width: 120 }, { length: 96, width: 72 }, { studSize: '2x6' }, { maxHaulFt: 8 },
    { sidingType: 'fiber cement' }, { snowLoad: 70 },
  ];
  for (const v of variants) assert.deepEqual(invariants({ ...defaultDesign(), floor: 'none', ...v }), [], JSON.stringify(v));
  for (const [name, make] of Object.entries(PRESETS)) assert.deepEqual(invariants({ ...make(), floor: 'none' }), [], name);
});

test('a spliced timber run is noted and still carries every plate', () => {
  const s = none({ length: 192, maxHaulFt: 8 });
  assert.ok(s.members.filter((m) => m.kind === 'perimeter timber').length > 4);
  assert.ok(s.notes.some((n) => /Perimeter timbers are longer/.test(n)));
  assert.ok(connectionChecks(s).rows.find((r) => r.check === 'Bottom plates bear on the timbers')?.ok);
});

test('lap siding on a floorless shed is warned about its ground clearance', () => {
  const s = none({ sidingType: 'fiber cement' });
  assert.ok(s.warnings.some((w) => /lap siding starts 4-1\/2"/.test(w) && /framed floor/.test(w)));
});

test('blockSpacing sets how far apart blocks and piers go along a skid', () => {
  const at = (blockSpacing, foundation = 'blocks') => buildShed(normalize({ ...defaultDesign(), foundation, blockSpacing })).dims;
  assert.equal(at(48).blockCount, at(48).skidCount * 4, 'the default: 4 ft apart on a 12 ft skid');
  assert.equal(at(72).blockCount, at(72).skidCount * 3);
  assert.equal(at(72, 'piers').pierCount, at(72, 'piers').skidCount * 3, 'fewer piers');
});

test('a short plate piece by a door on a 2x6 wall still bears on its timber (r4 lane 2\'s case)', () => {
  // A 4-1/2" piece is shorter than a 2x6 plate is deep: its run comes from its wall, not its box.
  const s = buildShed(normalize({ ...PRESETS['8x12'](), floor: 'none', width: 72, pitch: 6, roofType: 'ridgeBoard', rafterSeat: 'birdsmouth', rafterSize: '2x6', studSize: '2x6', sidingType: 'LP SmartSide lap', overhang: 5, openings: [{ id: 'o1', kind: 'door', wall: 'right', offset: 18, width: 44, height: 25 }] }));
  const short = s.members.find((m) => m.group === 'wall:right' && m.kind === 'bottom plate' && m.local && m.local.s1 - m.local.s0 < 5.5);
  assert.ok(short, 'the case still has a plate piece shorter than the wall is deep');
  assert.ok(connectionChecks(s).rows.find((r) => r.check === 'Bottom plates bear on the timbers')?.ok);
});
