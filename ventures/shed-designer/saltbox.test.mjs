// The saltbox roof (saltbox.mjs): an off-centre ridge, two pitches, two rafter
// cuts, unequal loads on the eave walls, through the engine and its checks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, defaultDesign, SALTBOX_PRESETS, WALLS, eaveWallLoads } from './model.mjs';
import { roofSides, threeHinged } from './saltbox.mjs';
import { structuralChecks, heelJoint } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { invariants } from './invariants.mjs';
import { estimate } from './estimate.mjs';

const salt = (o = {}) => ({ ...SALTBOX_PRESETS['8x12 saltbox'](), ...o });

test('the three-hinged pair: a gable gives wL^2/8h, and every saltbox is in equilibrium', () => {
  const g = threeHinged(100, 100, 48, 48, 20);
  assert.ok(Math.abs(g.H - (100 * 8 * 8) / (8 * (20 / 12))) < 1e-9);
  assert.ok(Math.abs(g.Va - 400) < 1e-9 && Math.abs(g.ridge) < 1e-9);
  for (const [wF, wB, a, b] of [[90, 60, 30, 66], [60, 60, 32, 64], [120, 45, 20, 80]]) {
    const h = 25;
    const r = threeHinged(wF, wB, a, b, h);
    assert.ok(Math.abs(r.Va + r.Vb - (wF * a + wB * b) / 12) < 1e-9, 'vertical');
    // Moments about the ridge, each half: what the wall reaction turns one way, the load and the thrust turn back.
    assert.ok(Math.abs(r.Va * (a / 12) - (wF * (a / 12) ** 2) / 2 - r.H * (h / 12)) < 1e-9, 'front half');
    assert.ok(Math.abs(r.Vb * (b / 12) - (wB * (b / 12) ** 2) / 2 - r.H * (h / 12)) < 1e-9, 'back half');
  }
  // An even load: equal wall reactions wherever the ridge is, and H = w a b / 2h.
  const e = threeHinged(60, 60, 32, 64, 20);
  assert.ok(Math.abs(e.Va - e.Vb) < 1e-9);
  assert.ok(Math.abs(e.H - (60 * (32 / 12) * (64 / 12)) / (2 * (20 / 12))) < 1e-9);
});

test('a saltbox with equal pitches is the gable, board for board', () => {
  for (const roofType of ['ridgeBoard', 'ridgeBeam']) {
    const base = { ...defaultDesign(), roofType, pitch: 6, autoPitch: false, autoOverhang: false };
    const g = buildShed(base);
    const s = buildShed({ ...base, style: 'saltbox', frontPitch: 6 });
    assert.equal(s.dims.ridgeY, base.width / 2);
    assert.deepEqual(s.members.map((m) => [m.kind, m.length, m.geom.profile]), g.members.map((m) => [m.kind, m.length, m.geom.profile]));
    assert.ok(Math.abs(estimate(s).total - estimate(g).total) < 1e-9);
  }
});

test('the 8x12 saltbox: ridge a third of the way back, two rafter cuts, clean framing, every check passes', () => {
  const s = buildShed(salt());
  const k = s.dims;
  assert.deepEqual(s.warnings, []);
  assert.ok(k.ridgeY > 96 / 3 - 2 && k.ridgeY < 96 / 3 + 1, `ridge at ${k.ridgeY}`);
  // The two slopes' top lines meet over the ridge: rise over each seat is the same.
  const sides = roofSides(s.design);
  const D = k.stud;
  const seat = sides.seatAt;
  assert.ok(Math.abs((k.ridgeY - seat) * sides.front.t + k.rafterDepth / sides.front.cos - ((96 - k.ridgeY - seat) * sides.back.t + k.rafterDepth / sides.back.cos)) < 1e-9);
  const cuts = [...new Set(s.members.filter((m) => m.kind === 'rafter').map((m) => m.length))];
  assert.equal(cuts.length, 2);
  assert.ok(k.slopes.front.len < k.slopes.back.len);
  const ridge = s.members.find((m) => m.kind === 'ridge board');
  assert.ok(ridge && Math.abs(ridge.geom.origin[1] - (k.ridgeY - 0.75)) < 1e-9);
  const integ = integrity(s);
  assert.deepEqual([integ.floating, integ.clashes], [[], []]);
  for (const row of connectionChecks(s).rows) assert.ok(row.ok, `${row.check}: ${row.detail}`);
  const sc = structuralChecks(s);
  assert.ok(sc.ok, JSON.stringify(sc.rows.filter((r) => !r.ok)));
  assert.ok(sc.rows.some((r) => r.member === 'Rafters, front (steep)') && sc.rows.some((r) => r.member === 'Rafters, back (long slope)'));
  // The gable ends' siding peaks over the ridge.
  for (const wall of ['left', 'right']) {
    const top = Math.max(...s.panels.filter((p) => p.wall === wall && p.kind === 'wall sheathing').flatMap((p) => p.geom.profile.map((q) => q[1])));
    const peakAt = s.panels.filter((p) => p.wall === wall && p.kind === 'wall sheathing').flatMap((p) => p.geom.profile).find((q) => Math.abs(q[1] - top) < 1e-9);
    assert.ok(Math.abs(peakAt[0] - k.ridgeY) < 1e-9, `${wall} peak at ${peakAt[0]}`);
  }
  assert.ok(Object.keys(s.walls).every((w) => WALLS.includes(/** @type {any} */ (w))));
});

test('unequal slopes, unequal loads: a ridge beam loads the long back wall more; ties split the snow evenly', () => {
  const beam = normalize(salt({ roofType: 'ridgeBeam', snowLoad: 30 }));
  const f = eaveWallLoads(beam, 'front');
  const b = eaveWallLoads(beam, 'back');
  assert.ok(b.snow > 1.5 * f.snow, `beam: back ${b.snow} front ${f.snow}`);
  const board = normalize(salt({ roofType: 'ridgeBoard', snowLoad: 30 }));
  assert.ok(Math.abs(eaveWallLoads(board, 'front').snow - eaveWallLoads(board, 'back').snow) < 1e-9);
  // The steep front weighs more per foot on plan, so the front wall's dead load is a little more.
  assert.ok(eaveWallLoads(board, 'front').dead > eaveWallLoads(board, 'back').dead);
  // The ridge beam's posts get a skid under them, off centre.
  const s = buildShed(salt({ roofType: 'ridgeBeam', openings: salt().openings.filter((o) => o.wall !== 'right') }));
  assert.ok(s.dims.skidYs.some((y) => Math.abs(y - s.dims.ridgeY) < 0.26), JSON.stringify(s.dims.skidYs));
  for (const row of connectionChecks(s).rows) assert.ok(row.ok, `${row.check}: ${row.detail}`);
  // The heel joint holds w a b / 2h, less than a gable of the same back pitch over the same width would push.
  const h = heelJoint(buildShed(salt()));
  const g = heelJoint(buildShed({ ...defaultDesign(), roofType: 'ridgeBoard', pitch: 5, autoPitch: false, autoOverhang: false }));
  assert.ok(h && g && h.thrust < g.thrust, `${h?.thrust} vs ${g?.thrust}`);
});

test('normalize: the front is the steep side, at most three times the back; no saltbox truss', () => {
  assert.equal(normalize(salt({ pitch: 6, frontPitch: 4 })).frontPitch, 6);
  assert.equal(normalize(salt({ pitch: 4, frontPitch: 16 })).frontPitch, 12);
  const t = normalize(salt({ roofType: 'truss', atticStorage: true }));
  assert.equal(t.roofType, 'ridgeBoard');
  assert.equal(t.atticStorage, false);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(normalize(salt())))), normalize(salt()));
});

test('auto pitch keeps the saltbox\'s shape under a height limit', () => {
  const s = buildShed(salt({ autoPitch: true, maxPeak: 132 }));
  assert.ok(s.dims.peak <= 132 + 1e-9, String(s.dims.peak));
  assert.equal(s.design.frontPitch, Math.round(s.design.pitch * 2));
  assert.match(s.notes[0], /roof \d+\/12 front and \d+\/12 back/);
});

function rng(seed) {
  let x = seed >>> 0 || 1;
  return () => { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
}

test('random saltboxes keep every invariant', () => {
  const r = rng(Number(process.env.FUZZ_SEED || 5));
  const pick = (a) => a[Math.floor(r() * a.length)];
  const between = (lo, hi, step = 1) => lo + Math.floor(r() * ((hi - lo) / step + 1)) * step;
  const fails = [];
  for (let i = 0; i < 80; i++) {
    const d = salt({
      length: between(48, 240, 6), width: between(60, 168, 6), wallHeight: between(66, 108, 0.5), pitch: between(2, 8), frontPitch: between(3, 18), overhang: between(0, 18),
      studSize: pick(['2x4', '2x6']), studSpacing: pick([12, 16, 24]), rafterSize: pick(['2x4', '2x6', '2x8', '2x10']), rafterSpacing: pick([12, 16, 24]),
      roofType: pick(['ridgeBeam', 'ridgeBoard', 'truss']), beamSize: pick(['2x8', '2x10', '2x12']), foundation: pick(['gravel', 'blocks', 'deck blocks']),
      siding: r() < 0.9, roofing: r() < 0.9, gableVents: r() < 0.6, ventWidth: between(6, 24), ventHeight: between(6, 18),
      autoWall: r() < 0.3, autoPitch: r() < 0.3, autoOverhang: r() < 0.3, maxPeak: r() < 0.5 ? 0 : between(96, 160), snowLoad: between(0, 60, 5), windLoad: between(0, 40, 5),
      sidingType: pick(['T1-11', 'LP SmartSide', 'LP SmartSide 7/16', 'board and batten', 'vinyl', 'fiber cement', 'LP SmartSide lap']), roofCover: pick(['shingles', 'metal']),
      rafterSeat: pick(['birdsmouth', 'connector']), wallTrim: pick(['1x4', 'none']), openings: [],
    });
    for (let k = 0; k < between(0, 4); k++) {
      const kind = r() < 0.4 ? 'door' : 'window';
      const wall = pick(WALLS);
      const face = wall === 'front' || wall === 'back' ? d.length : d.width;
      d.openings.push({ id: `o${k + 1}`, kind, wall, offset: between(0, face - 24), width: between(14, 60), height: between(14, 80), ...(kind === 'window' ? { sill: between(12, 50) } : {}) });
    }
    let bad;
    try { bad = invariants(d); } catch (e) { bad = [`throws: ${e.stack.split('\n').slice(0, 3).join(' | ')}`]; }
    if (bad.length) fails.push({ i, bad: bad.slice(0, 3) });
  }
  assert.deepEqual(fails, []);
});
