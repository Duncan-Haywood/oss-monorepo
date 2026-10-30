// Site-built trusses: framing, checks against hand-worked numbers, and the outputs that carry them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, normalize, PRESETS, defaultDesign } from './model.mjs';
import { trussForces, trussChecks, nailZPanel, gussetNailZ, needsKingPost } from './truss.mjs';
import { nailZ, structuralChecks } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { estimate } from './estimate.mjs';
import { buildSheets, sheetSvg } from './drawings.mjs';
import { buildInstructions } from './instructions.mjs';
import { generateCandidates } from './candidates.mjs';

const classicTruss = () => normalize({ ...PRESETS['8x12 classic'](), roofType: 'truss' });

test('the panel nail equations reduce to the wood-to-wood ones when both members bear alike', () => {
  const Fe = 16600 * 0.42 ** 1.84;
  for (const [D, ls, lm] of [[0.162, 1.5, 2.0], [0.131, 1.5, 1.5], [0.148, 0.4375, 1.0625]]) {
    assert.ok(Math.abs(nailZPanel(D, ls, lm, Fe, Fe, 90000) - nailZ(D, ls, lm, 0.42, 90000)) < 1e-9);
  }
  // A 1-1/2" x 0.148" nail through 7/16" OSB (Fe 4,650) into SPF, 1-1/16" in, CD 1.15.
  assert.ok(Math.abs(gussetNailZ() - 92.5) < 0.1, String(gussetNailZ()));
});

test('truss forces on the 8x12 classic match the hand sum', () => {
  // 6/12, trusses at 24", 30 psf snow + 15 psf dead on the slope; 10 + 5 psf on the bottom chord.
  const f = trussForces(classicTruss(), { king: true });
  const cos = 1 / Math.sqrt(1.25);
  const w = (15 / cos + 30) * 2; // 93.54 lb/ft on plan
  assert.ok(Math.abs(f.w - w) < 1e-9);
  assert.equal(f.h, 24);
  // Roof: wL^2/8h = 7.795 lb/in x 96^2 / (8 x 24) = 374.2 lb. Ceiling: the king post holds 120 lb,
  // which pushes out (60 lb)(48")/(24") = 120 lb more.
  assert.ok(Math.abs(f.H - (374.16 + 120)) < 0.1, String(f.H));
  assert.ok(Math.abs(f.C - f.H / cos) < 1e-9);
  // Without a king post the ceiling load goes to the heels and adds no thrust.
  assert.ok(Math.abs(trussForces(classicTruss(), { king: false }).H - 374.16) < 0.1);
  // Storage on the chords doubles the attic live load (IRC Table R301.5: 10 to 20 psf).
  assert.ok(trussForces(normalize({ ...classicTruss(), atticStorage: true }), { king: true }).H > f.H);
});

test('a king post goes in only where the bottom chord needs it', () => {
  // 8 ft: a 2x4 chord spans wall to wall (10 psf attic, no storage). Storage at 20 psf, or a 12 ft span, needs the post.
  assert.equal(needsKingPost(classicTruss()), false);
  assert.equal(needsKingPost(normalize({ ...classicTruss(), atticStorage: true })), true);
  assert.equal(needsKingPost(normalize({ ...PRESETS['12x16'](), roofType: 'truss' })), true);
  const s = buildShed(classicTruss());
  assert.equal(s.members.filter((m) => m.kind === 'king post').length, 0);
  assert.ok(!trussChecks(s.design).rows.some((r) => /king post/.test(r.member)));
});

test('gusset nails are counted from the force and carry it', () => {
  const r = trussChecks(classicTruss());
  const z = gussetNailZ();
  assert.ok(r.nails.heelBottom * z >= r.forces.H);
  assert.ok(r.nails.heelTop * z >= r.forces.C);
  assert.ok(r.nails.heelBottom % 2 === 0 && r.nails.heelBottom >= 4, 'an even count, two a face at least');
  for (const row of r.rows) assert.ok(row.ok && Number.isFinite(row.ratio), row.member);
});

test('every preset frames as trusses: complete, connected, checked and nothing floats', () => {
  for (const [name, mk] of Object.entries(PRESETS)) {
    if (mk().style === 'leanTo') continue; // one slope and no ridge: a lean-to is never trussed
    for (const extra of [{}, { overhang: 0 }]) {
      const s = buildShed(normalize({ ...mk(), ...extra, roofType: 'truss' }));
      const inner = s.dims.rafterCenters.length - 2;
      const of = (kind) => s.members.filter((m) => m.kind === kind).length;
      assert.equal(of('bottom chord'), inner, name);
      const king = needsKingPost(s.design);
      assert.equal(of('king post'), king ? inner : 0, name);
      assert.equal(of('heel block'), 4, name);
      assert.equal(of('ridge board') + of('ridge beam') + of('rafter tie') + of('ridge post') + of('beam post'), 0, name);
      assert.equal(s.panels.filter((p) => p.kind === 'truss gusset').length, inner * (king ? 8 : 6), `${name}: 2 heels, a peak and a king post's foot, both faces`);
      const ii = integrity(s);
      assert.deepEqual([ii.floating, ii.clashes], [[], []], name);
      assert.deepEqual(connectionChecks(s).rows.filter((r) => !r.ok), [], name);
      const sc = structuralChecks(s);
      assert.ok(sc.rows.some((r) => r.member === 'Truss bottom chords'));
      assert.ok(!sc.rows.some((r) => /Ridge|Rafter tie/.test(r.member)));
    }
  }
});

test('the truss connection check fails when a gusset or a bearing is missing', () => {
  const s = buildShed(classicTruss());
  const i = s.panels.findIndex((p) => p.kind === 'truss gusset' && /** @type {any} */ (p).where === 'heel');
  const noGusset = { ...s, panels: s.panels.filter((_, j) => j !== i) };
  assert.match(connectionChecks(noGusset).rows.find((r) => /Trusses/.test(r.check))?.detail ?? '', /heel gusset/);
  const noCap = { ...s, members: s.members.filter((m) => !(m.group === 'wall:front' && m.kind === 'cap plate')) };
  assert.match(connectionChecks(noCap).rows.find((r) => /Trusses/.test(r.check))?.detail ?? '', /bearing/);
});

test('trusses lift the roof by the bottom chord; the eave siding runs up to the soffit', () => {
  const board = buildShed(normalize({ ...PRESETS['8x12 classic'](), rafterSeat: 'connector' }));
  const tr = buildShed(classicTruss());
  // On a connector the rafter's underside meets the plate's outer edge; a truss's meets the chord's top.
  assert.ok(Math.abs(tr.dims.seatBase - tr.dims.plateTop - 3.5) < 1e-9);
  assert.ok(Math.abs((tr.dims.ridgeTop - board.dims.ridgeTop) - (3.5 + 0.75 * 0.5)) < 1e-6, 'chord depth, plus the half ridge board a truss does not stop short of');
  const eave = tr.panels.filter((p) => p.kind === 'siding' && p.wall === 'front');
  assert.ok(eave.every((p) => Math.abs(Math.max(...p.geom.profile.map((q) => q[1])) - tr.dims.seatBase) < 1e-9));
});

test('trusses need no board longer than the shed is wide; a ridge beam does', () => {
  const short = { lengths: [8, 10] };
  const tr = buildShed(normalize({ ...defaultDesign(), ...short, roofType: 'truss' }));
  const rb = buildShed(normalize({ ...defaultDesign(), ...short, roofType: 'ridgeBeam' }));
  assert.ok(!tr.warnings.some((w) => /ridge|Truss/.test(w)), tr.warnings.join('\n'));
  assert.ok(rb.warnings.some((w) => /ridge beam should be one piece/.test(w)));
  assert.ok(tr.members.filter((m) => m.group === 'roof' && m.kind !== 'sub-fascia').every((m) => m.length <= 96 + 1e-9));
});

test('the estimate buys gusset OSB and nails, the plans show the truss, the steps build it', () => {
  const s = buildShed(classicTruss());
  const est = estimate(s);
  const gus = est.shopping.find((r) => /for truss gussets/.test(r.name));
  assert.ok(gus && gus.qty >= 2 && gus.qty <= 4, String(gus?.qty));
  const base = estimate(buildShed(normalize(PRESETS['8x12 classic']())));
  const nails = (e) => e.shopping.find((r) => r.source?.key === 'connectorNails')?.qty ?? 0;
  assert.ok(nails(est) > nails(base));
  assert.ok(!est.shopping.some((r) => r.source?.key === 'rafterHanger' || r.source?.key === 'pitchConnector'));
  const sheets = buildSheets(s);
  const truss = sheets.find((x) => x.id === 'truss');
  assert.ok(truss);
  assert.match(sheetSvg(truss), /^<svg[\s\S]*<\/svg>\s*$/);
  assert.match(sheets.find((x) => x.id === 'cover')?.items.map((i) => /** @type {any} */ (i).text ?? '').join(' ') ?? '', /site-built trusses/);
  assert.ok(!sheets.some((x) => x.id === 'rafter'), 'the truss detail replaces the rafter detail');
  const steps = buildInstructions(s, est);
  const titles = steps.map((x) => x.title);
  assert.ok(titles.includes('Build the trusses') && titles.includes('Stand the trusses'));
  assert.ok(!titles.includes('Rafters') && !titles.includes('Ridge board'));
  assert.doesNotMatch(JSON.stringify(steps), /NaN|undefined/);
});

test('the options made for you offer each other roof structure', () => {
  const c = generateCandidates(defaultDesign());
  const types = new Set(c.map((x) => x.design.roofType));
  assert.ok(types.has('truss') && types.has('ridgeBoard') && types.has('ridgeBeam'));
});

test('attic storage decks the inside trusses where a 12" tote fits, and checks the chords for 20 psf', () => {
  const base = normalize({ ...PRESETS['8x12 classic'](), roofType: 'truss', pitch: 6 });
  const plain = buildShed(base);
  const st = buildShed(normalize({ ...base, atticStorage: true }));
  assert.equal(plain.panels.filter((p) => p.kind === 'attic deck').length, 0);
  const deck = st.panels.filter((p) => p.kind === 'attic deck');
  assert.ok(deck.length >= 2, 'a strip each side of the king posts');
  assert.ok(st.members.some((m) => m.kind === 'king post'), 'storage needs the king post');
  // 6/12 on 8 ft: 12-3/4" of clear height is 25-1/2" in from each wall, so two strips of 22-3/4".
  for (const p of deck) {
    assert.ok(Math.abs(p.geom.profile[2][1] - (48 - 25.5 - 1.75)) < 1e-9, String(p.geom.profile[2][1]));
    assert.ok(Math.abs(p.geom.origin[2] - st.dims.seatBase) < 1e-9, 'on the bottom chords');
  }
  // It spans the inside trusses only, with its ends on truss centres or the outer trusses' faces.
  const xs = deck.flatMap((p) => [p.geom.origin[0], p.geom.origin[0] + p.geom.profile[2][0]]);
  const c = st.dims.rafterCenters;
  assert.ok(Math.min(...xs) >= c[1] - 0.75 - 1e-9 && Math.max(...xs) <= c[c.length - 2] + 0.75 + 1e-9);
  assert.ok(xs.every((x) => c.some((cc) => Math.abs(cc - x) < 0.76)));
  const ii = integrity(st);
  assert.deepEqual([ii.floating, ii.clashes], [[], []]);
  const row = structuralChecks(st).rows.find((r) => r.member === 'Truss bottom chords');
  assert.match(row?.detail ?? '', /20 psf/);
  assert.ok(row?.ok);
  const est = estimate(st);
  assert.ok(est.shopping.some((r) => /attic storage deck/.test(r.name)));
  assert.ok(est.total > estimate(plain).total);
  assert.match(JSON.stringify(buildInstructions(st, est)), /Attic storage: once the roof is sheathed/);
  // Too flat for a tote: no deck, and it says so.
  const flat = buildShed(normalize({ ...base, pitch: 2, atticStorage: true }));
  assert.equal(flat.panels.filter((p) => p.kind === 'attic deck').length, 0);
  assert.ok(flat.warnings.some((w) => /too low for 12/.test(w)));
});
