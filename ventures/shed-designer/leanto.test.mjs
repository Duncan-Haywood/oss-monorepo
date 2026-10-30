// The lean-to style: one slope from a tall front wall down to a low back wall,
// framed, checked and priced by the same engine as the gable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, defaultDesign, minWallFor, STYLE_PRESETS, WALLS } from './model.mjs';
import { estimate, examplePrices } from './estimate.mjs';
import { structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';

const lean = () => STYLE_PRESETS['8x12 lean-to']();

test('a lean-to has no ridge, ties or gable posts, and one rafter a bay running tail to tail', () => {
  const s = buildShed(lean());
  const kinds = new Set(s.members.map((m) => m.kind));
  for (const k of ['ridge beam', 'ridge board', 'rafter tie', 'beam post', 'ridge post', 'post stud']) assert.ok(!kinds.has(k), k);
  const rafters = s.members.filter((m) => m.kind === 'rafter');
  assert.equal(rafters.length, s.dims.rafterCenters.length);
  const ys = rafters[0].geom.profile.map((p) => p[0]);
  assert.equal(Math.min(...ys), -s.design.overhang);
  assert.equal(Math.max(...ys), s.design.width + s.design.overhang);
  // 8 ft wide with 8" tails at 4/12 cuts from a 10 ft board: no long stock to haul.
  assert.ok(s.dims.rafterCut <= 120, `rafter ${s.dims.rafterCut}"`);
  assert.deepEqual(Object.keys(s.vents), [], 'no gable vents on a lean-to');
});

test('the front wall stands taller than the back by the rise between the two seats', () => {
  for (const rafterSeat of ['birdsmouth', 'connector']) {
    const s = buildShed({ ...lean(), rafterSeat });
    const D = s.dims.stud;
    assert.ok(Math.abs(s.dims.rise - (s.design.width - D) * (s.design.pitch / 12)) < 1e-9);
    assert.equal(s.walls.back.height, s.design.wallHeight);
    assert.equal(s.walls.left.height, s.design.wallHeight);
    assert.ok(Math.abs(s.walls.front.height - (s.design.wallHeight + s.dims.rise)) < 1e-9);
    const frontStud = s.members.find((m) => m.group === 'wall:front' && m.kind === 'stud');
    const backStud = s.members.find((m) => m.group === 'wall:back' && m.kind === 'stud');
    assert.ok(frontStud.length > backStud.length + s.dims.rise - 1 / 16);
  }
});

test('every lean-to seat, overhang and stud size frames clean: nothing floats, nothing clashes, every connection holds', () => {
  for (const rafterSeat of ['birdsmouth', 'connector']) {
    for (const overhang of [0, 6, 16]) {
      for (const studSize of ['2x4', '2x6']) {
        for (const [length, width] of [[144, 96], [120, 96], [96, 72], [144, 120]]) {
          const d = { ...lean(), rafterSeat, overhang, autoOverhang: false, studSize, length, width };
          const s = buildShed(d);
          const tag = JSON.stringify({ rafterSeat, overhang, studSize, length, width });
          const integ = integrity(s);
          assert.deepEqual(integ.floating, [], `${tag} floating`);
          assert.deepEqual(integ.clashes, [], `${tag} clashes`);
          const bad = connectionChecks(s).rows.filter((r) => !r.ok);
          assert.deepEqual(bad, [], `${tag} connections`);
          assert.ok(connectionChecks(s).rows.some((r) => r.check === 'Rafters seat on both walls'), tag);
        }
      }
    }
  }
});

test('lean-to structure: rafters span wall to wall, no ridge rows, and the tall wall\'s studs are the ones checked', () => {
  const s = buildShed(lean());
  const rows = structuralChecks(s).rows;
  assert.ok(!rows.some((r) => /Ridge|Rafter tie/.test(r.member)), rows.map((r) => r.member).join());
  const raf = rows.find((r) => r.member === 'Rafters');
  assert.match(raf.detail, /span between the walls/);
  // Clear span 96 - 2 x 3-1/2 = 89": more than the gable's 44-1/2" run, so the rafter works harder.
  assert.match(raf.detail, /^89" /);
  assert.ok(raf.ratio > structuralChecks(buildShed(defaultDesign())).rows.find((r) => r.member === 'Rafters').ratio);
  const studs = rows.find((r) => r.member === 'Wall studs');
  assert.match(studs.detail, /tall front wall/);
  assert.ok(rows.every((r) => r.ok), rows.filter((r) => !r.ok).map((r) => r.member).join());
});

test('a lean-to front wall too tall for its studs fails the stud check instead of returning Infinity', () => {
  const s = buildShed({ ...lean(), width: 192, pitch: 14, wallHeight: 120, snowLoad: 80 });
  const studs = structuralChecks(s).rows.find((r) => r.member === 'Wall studs');
  assert.ok(Number.isFinite(studs.ratio) && !studs.ok);
});

test('lean-to roofing: one slope, two rakes, drip edge on both eaves and both rakes', () => {
  const s = buildShed(lean());
  const k = s.dims;
  assert.ok(Math.abs(k.slopeLen - (s.design.width + 2 * s.design.overhang) / Math.cos(Math.atan(s.design.pitch / 12))) < 1e-9);
  assert.ok(Math.abs(k.roofAreaSqFt - (k.slopeLen * s.design.length) / 144) < 1e-9);
  assert.ok(Math.abs(s.trim.rakeFt - (2 * k.slopeLen) / 12) < 1e-9);
  const e = estimate(s, examplePrices());
  const drip = e.shopping.find((r) => r.section === 'Roofing' && /drip/i.test(r.name));
  assert.equal(drip.qty, Math.ceil((2 * s.design.length + 2 * k.slopeLen) / 12 / 10));
  // Sheathing covers the one slope only, laid from the low back eave up.
  const sheets = s.panels.filter((p) => p.kind === 'roof sheathing');
  assert.ok(sheets.every((p) => p.side === 'back'));
  const first = sheets.find((p) => p.pos[1] === 0);
  assert.ok(Math.abs(first.geom.origin[2] - Math.min(...sheets.map((p) => p.geom.origin[2]))) < 1e-9, 'first course at the low edge');
});

test('the 8x12 lean-to costs less than the default 8x12 gable for about the same wall volume', () => {
  const g = buildShed(defaultDesign());
  const l = buildShed(lean());
  const eg = estimate(g, examplePrices());
  const el = estimate(l, examplePrices());
  assert.ok(el.total < eg.total, `lean-to ${el.total} vs gable ${eg.total}`);
  const vol = (s) => s.design.length * s.design.width * (s.design.wallHeight + (s.dims.rise || 0) / 2);
  assert.ok(vol(l) >= vol(g) * 0.95, 'no less than 95% of the gable\'s walled volume');
});

test('on a lean-to a door in the tall front wall lets the walls drop; auto walls and pitch use that', () => {
  const d = normalize({ ...lean(), openings: [{ id: 'o1', kind: 'door', wall: 'front', offset: 24, width: 36, height: 80 }] });
  const back = normalize({ ...d, openings: [{ ...d.openings[0], wall: 'back' }] });
  assert.ok(minWallFor(d) < minWallFor(back) - 20);
  const auto = buildShed({ ...d, autoWall: true, autoPitch: true, maxPeak: 120 });
  assert.ok(auto.dims.peak <= 120 + 1e-9, `peak ${auto.dims.peak}`);
  assert.deepEqual(auto.warnings.filter((w) => /left out/.test(w)), [], 'the door still frames at the pitch chosen');
  assert.ok(auto.walls.front.openings.length === 1);
});

test('style survives a save and junk falls back to a gable', () => {
  const n = normalize(lean());
  assert.equal(n.style, 'leanTo');
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(n))), n);
  for (const junk of [undefined, null, 'hip', 3, {}]) assert.equal(normalize({ ...defaultDesign(), style: junk }).style, 'gable');
  assert.equal(buildShed(defaultDesign()).dims.lean, false);
});

test('a lean-to with every wall carrying openings frames them on the right wall heights', () => {
  const d = { ...lean(), openings: WALLS.map((wall, i) => ({ id: `o${i + 1}`, kind: 'window', wall, offset: 30, width: 24, height: 24, sill: 36 })) };
  const s = buildShed(d);
  assert.equal(s.framedOpenings.length, 4, s.warnings.join(' | '));
  // A window too tall for the low back wall is left out with the back wall's height in the warning.
  const tall = buildShed({ ...d, openings: [{ id: 'o1', kind: 'window', wall: 'back', offset: 30, width: 24, height: 40, sill: 36 }] });
  assert.ok(tall.warnings.some((w) => /the wall is 72"/.test(w)));
});
