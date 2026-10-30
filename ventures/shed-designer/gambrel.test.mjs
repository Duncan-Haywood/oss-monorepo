// Gambrel (barn) roof: the framing, its joints, its checks and what it buys.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, defaultDesign, PRESETS } from './model.mjs';
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
  // No dearer than the gable (within 2%). With two-2x4 door headers the walls are
  // 84-1/2", the gambrel's T1-11 fits shorter panels and it comes out cheaper.
  assert.ok(estimate(barn).total < 1.02 * estimate(gable).total, `${estimate(barn).total} vs ${estimate(gable).total}`);
  // A loft adds a floor up there, some of it with room for boxes.
  const loft = clearSpace(buildShed({ ...base, style: 'gambrel', pitch: 6, width: 120, loft: 'full' }));
  assert.ok(loft.loftSqFt > 50 && loft.loftUsableSqFt > 0 && loft.loftUsableSqFt < loft.loftSqFt);
  // The box a gable's clear space is built from: inside floor area times wall height, plus its roof space.
  const inside = ((base.length - 7) * (base.width - 7)) / 144;
  assert.ok(Math.abs(a.floorSqFt - inside) < 1e-9);
});

test('gusset plywood: APA PDS capacities, the size factor, and a hand check of one section', async () => {
  const { gussetPanel, panelSizeFactor, GUSSET_PANEL } = await import('./gambrel.mjs');
  // PDS 4.5.5: Cs = 0.5 under 8", 0.25 + 0.0313 b to 24", 1 from 24".
  assert.equal(panelSizeFactor(6), 0.5);
  assert.ok(Math.abs(panelSizeFactor(16) - 0.7508) < 1e-9);
  assert.equal(panelSizeFactor(30), 1);
  // 1,000 lb-in on a 10" section of 15/32" (t = 5.625 / 12 = 0.46875"): S = 7.8125 in^3, fb = 128 psi;
  // tension capacity 1,250 / 5.625 = 222.2 psi x Cs 0.563 x CD 1.15 = 143.9 psi, so 89%.
  const r = gussetPanel(1000, 0, 0, 10, 1.15);
  const Ft = (GUSSET_PANEL.FtA / GUSSET_PANEL.A) * 1.15 * (0.25 + 0.0313 * 10);
  assert.ok(Math.abs(r.tension - 128 / Ft) < 1e-9 && r.governs === 'panel tension (bending)');
  // Shear alone: 200 lb over 10" at 62 lb/in x 1.15.
  assert.ok(Math.abs(gussetPanel(0, 0, 200, 10, 1.15).shear - 200 / (62 * 1.15 * 10)) < 1e-12);
});

test('the knee gussets reach into the corner far enough to pass, in barns of several sizes, slopes and loads', () => {
  for (const o of [{}, { snowLoad: 60 }, { width: 144, length: 120 }, { rafterSize: '2x6' }, { gambrelLower: 24, pitch: 4 }, { loft: 'full' }]) {
    const s = buildShed({ ...PRESETS['10x10 barn'](), ...o });
    const rows = structuralChecks(s).rows.filter((x) => /gussets \(plywood\)/.test(x.member));
    assert.equal(rows.length, 2, JSON.stringify(o));
    for (const x of rows) assert.ok(x.ratio <= 1, `${JSON.stringify(o)}: ${x.member} ${x.ratio}`);
    const g = s.dims.gambrel.gusset;
    assert.ok(g.kneeExt >= 0 && g.kneeExt < 24);
  }
});

test('loft access: a ladder to a half loft, a hatch and a ladder through a full one, nothing floating', () => {
  for (const loft of ['half', 'full']) {
    const s = buildShed({ ...PRESETS['10x10 barn'](), loft });
    const rails = s.members.filter((m) => m.kind === 'ladder rail');
    const rungs = s.members.filter((m) => m.kind === 'ladder rung');
    assert.equal(rails.length, 2, loft);
    assert.ok(rungs.length >= 5, loft);
    const ii = integrity(s);
    assert.deepEqual([ii.floating, ii.clashes], [[], []], loft);
    // The preset's door is in the left gable end, so the ladder stands toward the back, clear of it.
    assert.ok(rails.every((m) => m.geom.origin[1] > d(s).width / 2 + 10), loft);
    if (loft === 'full') {
      const note = s.notes.find((n) => n.startsWith('Loft hatch'));
      assert.match(note, /22-1\/2" x 30"/);
      const area = s.panels.filter((p) => p.kind === 'loft deck').reduce((t, p) => t + p.geom.profile[2][0] * p.geom.profile[2][1], 0);
      const full = buildShed({ ...PRESETS['10x10 barn'](), loft, rafterSpacing: 24, openings: [] });
      assert.ok(area < full.panels.filter((p) => p.kind === 'loft deck').reduce((t, p) => t + p.geom.profile[2][0] * p.geom.profile[2][1], 0) + 1);
    }
  }
  const tight = buildShed({ ...PRESETS['10x10 barn'](), loft: 'full', rafterSpacing: 16 });
  assert.ok(tight.warnings.some((w) => /IRC R807\.1/.test(w)));
});
const d = (s) => s.design;

test('wind uplift: the 0.6D + 0.6W case reverses the frame, and ties pushed into compression get a mid-span brace', () => {
  const at = (o) => buildShed({ ...PRESETS['10x10 barn'](), ...o });
  // At 10 psf the roof outweighs the wind's lift: no reversal, no brace.
  assert.equal(at({ loft: 'none', windLoad: 10 }).members.filter((m) => m.kind === 'chord brace').length, 0);
  for (const loft of ['none', 'half']) {
    const s = at({ loft, windLoad: 20 });
    assert.ok(s.members.some((m) => m.kind === 'chord brace'), loft);
    assert.ok(structuralChecks(s).ok, loft);
    const ii = integrity(s);
    assert.deepEqual([ii.floating, ii.clashes], [[], []], loft);
  }
  // A full loft's floor braces the joists: no brace.
  assert.equal(at({ loft: 'full', windLoad: 20 }).members.filter((m) => m.kind === 'chord brace').length, 0);
  // Without the brace the tie would be a 2x4 column 112" long about its 1-1/2" face: le/d 75, over NDS 3.7.1.4's 50.
  const g = gambrelAnalysis(normalize({ ...PRESETS['10x10 barn'](), loft: 'none', windLoad: 20 }));
  assert.equal(g.tieBrace, true);
  assert.ok(g.rows.find((r) => r.member === 'Truss ties').ratio <= 1);
});
