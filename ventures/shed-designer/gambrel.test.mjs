// Gambrel (barn) roof: the framing, its joints, its checks and what it buys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, defaultDesign } from './model.mjs';
import { gambrelShape, gambrelAnalysis, solveFrame, kneeRun } from './gambrel.mjs';
import { integrity } from './integrity.mjs';
import { connectionChecks } from './connections.mjs';
import { structuralChecks } from './checks.mjs';
import { estimate } from './estimate.mjs';

const gambrel = (o = {}) => ({ ...defaultDesign(), style: 'gambrel', maxPeak: 0, autoPitch: false, pitch: 6, ...o });

test('a gambrel is framed as gusseted trusses: no ridge, no birdsmouth, no eave overhang', () => {
  const d = normalize(gambrel({ roofType: 'ridgeBeam', overhang: 12, rafterSeat: 'connector', loft: 'full' }));
  assert.equal(d.roofType, 'ridgeBoard');
  assert.equal(d.overhang, 0);
  assert.equal(d.rafterSeat, 'birdsmouth');
  assert.equal(d.loft, 'full');
  // A loft goes on a gambrel only; a gable keeps none.
  assert.equal(normalize({ ...defaultDesign(), loft: 'full' }).loft, 'none');
  const s = buildShed(gambrel());
  for (const kind of ['rafter', 'ridge board', 'ridge beam', 'beam post', 'ridge post', 'sub-fascia', 'eave blocking']) {
    assert.equal(s.members.filter((m) => m.kind === kind).length, 0, kind);
  }
  const n = s.dims.rafterCenters.length;
  assert.equal(s.members.filter((m) => m.kind === 'lower chord').length, 2 * n);
  assert.equal(s.members.filter((m) => m.kind === 'upper chord').length, 2 * n);
  assert.equal(s.members.filter((m) => m.kind === 'rafter tie').length, n - 2);
  // Two knees and a peak on each inner truss, a gusset on each face of each.
  assert.equal(s.panels.filter((p) => p.kind === 'gambrel gusset').length, 6 * (n - 2));
});

test('the chords follow the roof line: eave at the wall face, knee and peak where the shape puts them', () => {
  const s = buildShed(gambrel({ width: 120 }));
  const g = gambrelShape(s.design, s.dims.plateTop);
  assert.equal(kneeRun(s.design), 30); // a quarter of the width by default
  const lower = s.members.find((m) => m.kind === 'lower chord');
  const upper = s.members.find((m) => m.kind === 'upper chord');
  const has = (m, y, z) => m.geom.profile.some(([py, pz]) => Math.abs(py - y) < 1e-6 && Math.abs(pz - z) < 1e-6);
  assert.ok(has(lower, 0, s.dims.plateTop), 'lower chord starts at the eave');
  assert.ok(has(lower, g.yk, g.zk) && has(upper, g.yk, g.zk), 'they share the knee');
  assert.ok(has(upper, 60, g.ridgeTop), 'upper chord reaches the peak');
  assert.ok(Math.abs(g.zk - s.dims.plateTop - 30 * 20 / 12) < 1e-9);
  assert.ok(Math.abs(g.ridgeTop - g.zk - 30 * 6 / 12) < 1e-9);
  // The cut length is the outer edge from the eave to the knee's long point.
  assert.ok(Math.abs(lower.length - g.lowerLen) < 1 / 16 + 1e-9);
  assert.ok(Math.abs(s.dims.peak - (g.ridgeTop + (7 / 16 + 0.35) / g.cu)) < 1e-9);
  // Four roof planes, sheathed course by course.
  const roofArea = s.panels.filter((p) => p.kind === 'roof sheathing').reduce((t, p) => t + p.geom.profile[2][0] * p.geom.profile[2][1], 0) / 144;
  assert.ok(Math.abs(roofArea - s.dims.roofAreaSqFt) < 0.01, `${roofArea} vs ${s.dims.roofAreaSqFt}`);
});

test('the truss statics match the closed form for a three-hinged frame under a uniform load', () => {
  const g = gambrelShape(normalize(gambrel({ width: 120 })), 0);
  const q = 3; // lb per inch of plan
  const f = solveFrame(g, () => q, 3.5);
  const W = g.W;
  assert.ok(Math.abs(f.VA + f.VB - q * W) < 1e-6);
  assert.ok(Math.abs(f.VA - f.VB) < 1e-6);
  // Moments about the peak hinge of the left half: VA (yC - yA) - H (zC - zA) - q (W/2)^2 / 2 = 0.
  const H = (f.VA * (f.yC - f.yA) - (q * (W / 2) ** 2) / 2) / (f.zC - f.zA);
  assert.ok(Math.abs(f.H - H) / H < 0.002, `${f.H} vs ${H}`);
  // Knee moment: VA (yk - yA) - H (zk - zA) - q yk^2 / 2.
  const Mk = Math.abs(f.VA * (f.ykC - f.yA) - H * (f.zkC - f.zA) - (q * f.ykC ** 2) / 2);
  assert.ok(Math.abs(f.knee[0].M - Mk) / Mk < 0.01, `${f.knee[0].M} vs ${Mk}`);
});

test('every gambrel holds together: nothing floats or clashes, every joint and check is there', () => {
  for (const length of [96, 144]) {
    for (const width of [96, 120]) {
      for (const loft of ['none', 'half', 'full']) {
        for (const rafterSize of ['2x4', '2x6']) {
          const s = buildShed(gambrel({ length, width, loft, rafterSize }));
          const where = `${length}x${width} ${loft} ${rafterSize}`;
          const i = integrity(s);
          assert.deepEqual(i.floating, [], where);
          assert.deepEqual(i.clashes, [], where);
          const bad = connectionChecks(s).rows.filter((r) => !r.ok);
          assert.deepEqual(bad, [], where);
          const rows = structuralChecks(s).rows;
          for (const m of ['Lower chords', 'Upper chords', 'Knee gussets (nails)', 'Peak gussets (nails)', 'Heel (tie to lower chord)', 'Chord seat on the plate']) {
            assert.ok(rows.some((r) => r.member === m && Number.isFinite(r.ratio)), `${where}: ${m}`);
          }
          assert.equal(rows.some((r) => r.member.startsWith('Loft joists')), loft !== 'none', where);
        }
      }
    }
  }
});

test('the loft is a floor on the ties, priced with the gussets', () => {
  const none = buildShed(gambrel());
  const full = buildShed(gambrel({ loft: 'full' }));
  const half = buildShed(gambrel({ loft: 'half' }));
  const deck = (s) => s.panels.filter((p) => p.kind === 'loft deck');
  assert.equal(deck(none).length, 0);
  const area = (s) => deck(s).reduce((t, p) => t + p.geom.profile[2][0] * p.geom.profile[2][1], 0);
  assert.ok(area(half) > 0.35 * area(full) && area(half) < 0.65 * area(full));
  // The deck sits on the joists, which are the loft joist size.
  assert.ok(full.members.filter((m) => m.kind === 'rafter tie').every((m) => m.material === '2x6'));
  assert.equal(full.members.filter((m) => m.kind === 'loft joist').length, 2);
  assert.equal(half.members.filter((m) => m.kind === 'loft joist').length, 1);
  const e = estimate(full);
  assert.ok(e.shopping.some((r) => /loft floor/.test(r.name) && r.qty > 0));
  assert.ok(e.shopping.some((r) => /truss gussets/.test(r.name) && r.qty > 0));
  assert.ok(!estimate(buildShed(defaultDesign())).shopping.some((r) => /gusset|loft/.test(r.name)));
});

test('the frame analysis carries the snow: more snow, more thrust, more heel nails, bigger gussets', () => {
  const light = gambrelAnalysis(normalize(gambrel({ snowLoad: 20 })));
  const heavy = gambrelAnalysis(normalize(gambrel({ snowLoad: 100, width: 144, rafterSpacing: 24 })));
  assert.ok(heavy.thrust > 2 * light.thrust);
  assert.ok(heavy.heelNails >= light.heelNails);
  assert.ok(heavy.gusset.knee >= light.gusset.knee);
  // Snow on one side is checked as well as on both.
  assert.ok(heavy.rows.some((r) => /one side/.test(r.detail)));
});

test('the automatic pitch sets the upper slope under the height limit', () => {
  const s = buildShed(gambrel({ autoPitch: true, maxPeak: 150, wallHeight: 72, autoWall: false, openings: [] }));
  assert.ok(s.dims.peak <= 150 + 1e-9);
  assert.ok(s.design.pitch >= 3 && s.design.pitch < s.design.gambrelLower);
  assert.match(s.notes[0], /upper roof \d+\/12/);
});

test('for the same footprint, walls and money, a gambrel holds more than a gable', async () => {
  const { clearSpace } = await import('./storage.mjs');
  const base = { ...defaultDesign(), autoPitch: false, maxPeak: 0 };
  const gable = buildShed({ ...base, roofType: 'ridgeBoard', pitch: 6 });
  const barn = buildShed({ ...base, style: 'gambrel', pitch: 6 });
  const a = clearSpace(gable);
  const b = clearSpace(barn);
  // Same box below the plates: the difference is all in the roof.
  assert.ok(Math.abs(a.volume - a.roofVolume - (b.volume - b.roofVolume)) < 0.5);
  assert.ok(b.roofVolume > 1.8 * a.roofVolume, `${b.roofVolume} vs ${a.roofVolume}`);
  assert.ok(Math.abs(estimate(barn).total - estimate(gable).total) < 0.02 * estimate(gable).total);
  // A loft adds a floor up there, some of it with room for boxes.
  const loft = clearSpace(buildShed({ ...base, style: 'gambrel', pitch: 6, width: 120, loft: 'full' }));
  assert.ok(loft.loftSqFt > 50 && loft.loftUsableSqFt > 0 && loft.loftUsableSqFt < loft.loftSqFt);
  // The box a gable's clear space is built from: inside floor area times wall height, plus its roof space.
  const inside = ((base.length - 7) * (base.width - 7)) / 144;
  assert.ok(Math.abs(a.floorSqFt - inside) < 1e-9);
});
