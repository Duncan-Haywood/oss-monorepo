import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, splitRun, PRESETS, minWallFor } from './model.mjs';
import { estimate } from './estimate.mjs';

const classic = () => PRESETS['8x12 classic']();

const of = (shed, group, kind) => shed.members.filter((m) => m.group === group && m.kind === kind);

test('the 8x12 starter: door on a 12 ft eave wall, two windows opposite, gable vents', () => {
  const d = classic();
  assert.equal(d.length, 144);
  assert.equal(d.width, 96);
  assert.deepEqual(d.openings.map((o) => [o.kind, o.wall]), [['door', 'front'], ['window', 'back'], ['window', 'back']]);
  const s = buildShed(d);
  assert.deepEqual(s.warnings, []);
  assert.deepEqual(Object.keys(s.vents), ['left', 'right']);
});

test('front wall framing around a 38 x 82 door, counted by hand', () => {
  const s = buildShed(classic());
  // 96" wall: stud = 96 - three 1-1/2" plates.
  assert.equal(s.dims.studLen, 91.5);
  // Ends (2) plus layout studs at 16, 32, 48, 96, 112, 128 (64 and 80 fall in the door).
  assert.equal(of(s, 'wall:front', 'stud').length, 8);
  assert.equal(of(s, 'wall:front', 'corner stud').length, 2);
  assert.equal(of(s, 'wall:front', 'king stud').length, 2);
  const jacks = of(s, 'wall:front', 'jack stud');
  assert.deepEqual(jacks.map((m) => m.length), [80.5, 80.5]);
  const headers = of(s, 'wall:front', 'header');
  assert.equal(headers.length, 2);
  // Sized to the load (headerFor): two 2x4s carry the 38" door's strip of roof.
  assert.equal(headers[0].material, '2x4');
  assert.equal(headers[0].length, 41); // 38 + two jacks
  // Header top 82 + 3-1/2 = 85-1/2; underside of top plates 93: cripples 7-1/2 at 64 and 80.
  assert.deepEqual(of(s, 'wall:front', 'top cripple').map((m) => m.length), [7.5, 7.5]);
  // Bottom plate is cut out at the door: 53 and 144 - 91 = 53.
  assert.deepEqual(of(s, 'wall:front', 'bottom plate').map((m) => m.length), [53, 53]);
});

test('gable ends frame between the eave walls and windows get sills and cripples', () => {
  const s = buildShed(classic());
  assert.equal(s.walls.left.len, 96 - 7);
  const sills = of(s, 'wall:back', 'rough sill');
  assert.equal(sills.length, 2);
  assert.ok(sills.every((m) => m.length === 24));
  // Sill at 36: cripples from the plate (1-1/2) to under the rough sill (34-1/2) = 33.
  assert.ok(of(s, 'wall:back', 'bottom cripple').every((m) => m.length === 33));
});

test('roof: rafter length, ridge one size up and deep enough for the plumb cut', () => {
  const s = buildShed(classic());
  // run to the ridge face 47-1/4 + 12 overhang = 59-1/4 horizontal at 6/12, plus the plumb cut's slant.
  const slope = Math.sqrt(1 + 0.25);
  assert.equal(s.dims.rafterCut, Math.ceil((59.25 * slope + 5.5 * 0.5) * 16) / 16);
  assert.equal(s.dims.rafterCut, 69);
  assert.equal(s.dims.ridgeSize, '2x8');
  // 24" o.c. over 144": centres 0.75, 24 ... 120, 143.25 -> 7 pairs.
  assert.equal(s.members.filter((m) => m.kind === 'rafter').length, 14);
  assert.equal(s.members.filter((m) => m.kind === 'rafter tie').length, 5);
  const steep = buildShed({ ...classic(), pitch: 12 });
  assert.equal(steep.dims.ridgeSize, '2x10');
  assert.ok(steep.warnings.some((w) => /birdsmouth/.test(w)));
});

test('a gable vent is framed with trimmers, header and sill, and refused when it cannot fit', () => {
  const s = buildShed(classic());
  const g = s.members.filter((m) => m.group === 'gable:left');
  assert.equal(g.filter((m) => m.kind === 'vent trimmer').length, 2);
  assert.equal(g.filter((m) => m.kind === 'vent header').length, 1);
  assert.equal(g.filter((m) => m.kind === 'vent sill').length, 1);
  // No gable stud passes through the vent opening (42..54).
  assert.ok(g.filter((m) => m.kind === 'gable stud').every((m) => m.local.s1 <= 40.5 || m.local.s0 >= 55.5));
  const flat = buildShed({ ...classic(), pitch: 2, ventHeight: 24 });
  assert.ok(flat.warnings.some((w) => /gable vent/.test(w)));
  assert.equal(Object.keys(flat.vents).length, 0);
});

test('openings that do not fit are left out with a reason', () => {
  const d = classic();
  const s = buildShed({ ...d, openings: [{ id: 'x', kind: 'door', wall: 'front', offset: 0, width: 38, height: 82 }] });
  assert.ok(s.warnings[0].includes('too close to a corner'));
  const t = buildShed({ ...d, openings: [{ id: 'x', kind: 'door', wall: 'front', offset: 50, width: 38, height: 92 }] });
  assert.ok(t.warnings[0].includes('needs'));
});

test('long walls splice plates on studs, with the cap plate joints kept 4 ft from the top plate joints', () => {
  const s = buildShed({ ...classic(), length: 240, openings: [] });
  const top = of(s, 'wall:back', 'top plate');
  const cap = of(s, 'wall:back', 'cap plate');
  assert.ok(top.length > 1 && cap.length > 1);
  const studCentres = of(s, 'wall:back', 'stud').concat(of(s, 'wall:back', 'corner stud')).map((m) => m.local.s0 + 0.75);
  const topJoints = top.slice(1).map((m) => m.local.s0);
  const capJoints = cap.slice(1).map((m) => m.local.s0);
  for (const j of [...topJoints, ...capJoints]) assert.ok(studCentres.includes(j), `joint ${j} on a stud`);
  for (const c of capJoints) for (const t of topJoints) assert.ok(Math.abs(c - t) >= 48);
  assert.ok([...top, ...cap].every((m) => m.length <= 192));
});

test('splitRun falls back to a forced joint when no framing is in reach', () => {
  const r = splitRun(0, 300, 192, []);
  assert.equal(r.forced, true);
  assert.deepEqual(r.runs, [[0, 192], [192, 300]]);
});

test('normalize clamps nonsense and every preset builds without errors', () => {
  const n = normalize({ length: -5, pitch: 40, studSize: '2x9', openings: [{ kind: 'garage', wall: 'roof' }] });
  assert.equal(n.length, 48);
  assert.equal(n.pitch, 14);
  assert.equal(n.studSize, '2x4');
  assert.equal(n.openings[0].kind, 'door');
  assert.equal(n.openings[0].wall, 'front');
  for (const [name, make] of Object.entries(PRESETS)) {
    const s = buildShed(make());
    assert.ok(s.members.length > 50, name);
    for (const m of s.members) assert.ok(m.length > 0 && Number.isFinite(m.length), `${name} ${m.kind}`);
  }
});

test('the starter is the spec as asked: 8x12, 6\'6" door on a 12 ft side, two windows opposite, vents, ridge beam', () => {
  const d = defaultDesign();
  assert.equal(d.length, 144);
  assert.equal(d.width, 96);
  assert.deepEqual(d.openings.map((o) => [o.kind, o.wall, o.height]), [['door', 'front', 78], ['window', 'back', 21.25], ['window', 'back', 21.25]]);
  assert.equal(d.studSize, '2x4');
  assert.equal(d.studSpacing, 16);
  assert.equal(d.roofType, 'ridgeBeam');
  assert.equal(d.maxPeak, 96);
});

test('auto walls: 78" door + 3-1/2" header of two 2x4s + three plates = 84-1/2"', () => {
  assert.equal(minWallFor(defaultDesign()), 84.5);
  const s = buildShed(defaultDesign());
  assert.equal(s.design.wallHeight, 84.5);
  assert.equal(s.dims.studLen, 80);
  assert.ok(s.design.autoWall && s.design.autoPitch);
});

test('auto pitch: an 8 ft peak cannot be met with a 6\'6" door, so the lowest pitch that keeps the vents is used and the miss is stated', () => {
  const s = buildShed(defaultDesign());
  // The lowest pitch at which both gables' vents fit (4/12 on connectors, 5/12 notched).
  assert.equal(Object.keys(s.vents).length, 2);
  assert.equal(Object.keys(buildShed({ ...defaultDesign(), autoPitch: false, pitch: s.design.pitch - 1 }).vents).length, 0);
  assert.equal(buildShed({ ...defaultDesign(), rafterSeat: 'birdsmouth' }).design.pitch, 5);
  assert.ok(s.dims.peak > 96);
  const w = s.warnings.find((x) => /over your 8' 0" limit/.test(x));
  assert.ok(w, 'peak warning');
  assert.match(w, /3\/12/);
  assert.match(s.notes[0], /Set for you/);
  // With no limit the steepest offered pitch is used; with a generous one, the steepest under it.
  assert.equal(buildShed({ ...defaultDesign(), maxPeak: 0 }).design.pitch, 12);
  const roomy = buildShed({ ...defaultDesign(), maxPeak: 132 });
  assert.ok(roomy.dims.peak <= 132);
  assert.ok(buildShed({ ...defaultDesign(), maxPeak: 132, autoPitch: false, pitch: roomy.design.pitch + 1 }).dims.peak > 132);
});

test('ridge beam: two plies on two-ply posts over post studs, no rafter ties, vents flank the post', () => {
  const s = buildShed(defaultDesign());
  assert.deepEqual(s.members.filter((m) => m.kind === 'ridge beam').map((m) => [m.material, m.length]), [['2x10', 144], ['2x10', 144]]);
  assert.equal(s.members.filter((m) => m.kind === 'rafter tie').length, 0);
  assert.equal(s.members.filter((m) => m.kind === 'beam post').length, 4);
  assert.equal(s.members.filter((m) => m.kind === 'post stud').length, 4);
  for (const name of ['left', 'right']) {
    assert.equal(s.vents[name].length, 2);
    const [a, b] = s.vents[name];
    assert.ok(a.s1 <= 48 - 1.5 && b.s0 >= 48 + 1.5);
  }
  // Rafters stop at the beam's face, 1-1/2" from the centre.
  const ridgeFace = Math.max(...s.members.find((m) => m.kind === 'rafter').geom.profile.map((p) => p[0]));
  assert.equal(ridgeFace, 48 - 1.5);
});

test('picking a catalogue product sets the rough opening to the maker\'s and lists the unit', async () => {
  const { estimate } = await import('./estimate.mjs');
  const d = defaultDesign();
  assert.equal(d.openings[0].product, 'site-built');
  const s = buildShed({ ...d, openings: d.openings.map((o) => (o.kind === 'window' ? { ...o, product: 'swm-1823', width: 99, height: 99 } : o)) });
  const win = s.design.openings.find((o) => o.kind === 'window');
  assert.equal(win.width, 18.25);
  assert.equal(win.height, 23.25);
  const est = estimate(s);
  const row = est.shopping.find((r) => r.section === 'Doors and windows' && /18 x 23/.test(r.name));
  assert.equal(row.qty, 2);
  assert.match(row.source.url, /lowes\.com/);
  // A door product on a window is ignored, not misapplied.
  const bad = buildShed({ ...d, openings: [{ ...d.openings[1], product: 'sr-36x76' }] });
  assert.equal(bad.design.openings[0].product, undefined);
});

test('auto overhang: the longest from 6" to 18" within the allowance of the cheapest whole order', () => {
  const totals = (d) => {
    const base = buildShed(d).design;
    const out = new Map();
    for (let oh = 6; oh <= 18; oh++) out.set(oh, estimate(buildShed(normalize({ ...base, autoWall: false, autoPitch: false, autoOverhang: false, overhang: oh }))).total);
    return out;
  };
  const t = totals(defaultDesign());
  const min = Math.min(...t.values());
  for (const budget of [0, 25, 60, 500]) {
    const s = buildShed({ ...defaultDesign(), overhangBudget: budget });
    const within = [...t.entries()].filter(([, c]) => c <= min + budget + 0.005).map(([oh]) => oh);
    assert.equal(s.design.overhang, Math.max(...within), `$${budget}`);
    assert.equal(s.overhangChoice.budget, budget);
    assert.ok(Math.abs(s.overhangChoice.adds - (t.get(s.design.overhang) - min)) < 0.005);
    assert.match(s.notes[0], new RegExp(`overhang ${s.design.overhang}"`));
  }
  assert.equal(buildShed({ ...defaultDesign(), overhangBudget: 500 }).overhangChoice.next, null);
  assert.equal(normalize({ ...defaultDesign(), overhangBudget: -5 }).overhangBudget, 0);
  assert.equal(normalize({ ...defaultDesign(), overhangBudget: 'x' }).overhangBudget, 25);
});
