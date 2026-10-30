// Shed framing sized by the checks rather than by house rules of thumb:
// headers from the load, windows inside a stud bay with no header, and the
// search moves that slide an opening so its framing shrinks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, normalize, PRESETS, headerFor, headerLoadPlf, wallFaceLength } from './model.mjs';
import { headerCheck } from './structure.mjs';
import { structuralChecks, bayPlates } from './checks.mjs';
import { connectionChecks } from './connections.mjs';
import { integrity } from './integrity.mjs';
import { estimate } from './estimate.mjs';
import { buildInstructions, instructionsMarkdown } from './instructions.mjs';
import { openingMoves } from './framing-moves.mjs';
import { budget } from './simplify.mjs';

test('each header is the shallowest two-ply size that carries its wall', () => {
  const sizes = ['2x4', '2x6', '2x8', '2x10', '2x12'];
  for (const [snowLoad, width, wall, want] of [[30, 38.5, 'front', '2x4'], [50, 72, 'front', '2x6'], [50, 96, 'front', '2x8'], [30, 72, 'left', '2x4'], [70, 120, 'front', '2x10']]) {
    const d = { ...defaultDesign(), snowLoad };
    const op = /** @type {any} */ ({ wall, width, kind: 'door' });
    const got = headerFor(d, op);
    assert.equal(got, want, `${snowLoad} psf, ${width}" in the ${wall} wall`);
    const w = headerLoadPlf(d, wall);
    assert.ok(headerCheck(got, width, w, 2, 1, d.studSize) <= 1);
    const i = sizes.indexOf(got);
    if (i > 0) assert.ok(headerCheck(sizes[i - 1], width, w, 2, 1, d.studSize) > 1, 'one size shallower fails');
  }
  // A header asked for is kept.
  assert.equal(headerFor(defaultDesign(), /** @type {any} */ ({ wall: 'front', width: 38.5, kind: 'door', header: '2x8' })), '2x8');
});

// The starter's back windows are 14-1/4" wide; a 16" bay is 14-1/2" clear.
const inBay = () => {
  const d0 = defaultDesign();
  const face = wallFaceLength(d0, 'back');
  // back wall: offsets run from the far corner; 96-7/8" from the near end puts it in the 96"-112" bay.
  return { ...d0, openings: d0.openings.map((o) => (o.id === 'o2' ? { ...o, offset: face - 96.875 - o.width } : o)) };
};

test('a window inside a stud bay has no king, jack or header, and its plates are checked by hand', () => {
  const s = buildShed(inBay());
  const p = s.walls.back.openings.find((x) => x.op.id === 'o2');
  assert.deepEqual(p.bay, [96.75, 111.25]);
  const near = (x) => s.walls.back.members.filter((m) => m.local.s0 < 113 && m.local.s1 > 95);
  const kinds = near().map((m) => m.kind);
  for (const k of ['king stud', 'jack stud', 'header', 'top cripple', 'bottom cripple', 'rough sill']) assert.ok(!kinds.includes(k), k);
  assert.deepEqual(kinds.filter((k) => k.endsWith('block')).sort(), ['head block', 'sill block']);
  // The double top plate spans the bay as it spans every bay. A rafter can land
  // mid-bay: P = 2 ft of rafter spacing x the eave wall's roof load (the header
  // load less its 10 lb/ft of wall), M = PL/4 over the 16" stud centres; two flat 2x4 plies, S = 2 x 3.5 x 1.5^2 / 6;
  // Fb' = 875 x CF 1.5 x Cfu 1.1 x CD 1.15.
  const P = (headerLoadPlf(s.design, 'back') - 10) * 2;
  const hand = (P * 16) / 4 / (2 * 3.5 * 1.5 ** 2 / 6) / (875 * 1.5 * 1.1 * 1.15);
  assert.ok(Math.abs(bayPlates(s, 'back', p).ratio - hand) < 1e-9);
  const row = structuralChecks(s).rows.find((r) => r.member === 'Plates over the back window (no header)');
  assert.ok(row && Math.abs(row.ratio - hand) < 1e-9 && row.ok, row?.detail);
  assert.ok(connectionChecks(s).ok);
  assert.ok(connectionChecks(s).rows.find((r) => r.check === 'back wall: window blocks fit between studs').ok);
  const ig = integrity(s);
  assert.deepEqual([ig.floating.length, ig.clashes.length], [0, 0]);
  const md = instructionsMarkdown(buildInstructions(s, estimate(s)), 'x');
  assert.match(md, /it cuts no stud, so no king, jack or header/);
  // Cheaper than the same window framed with kings, jacks and a header.
  assert.ok(estimate(s).total < estimate(buildShed(defaultDesign())).total - 8);
});

test('a door is never framed in a bay, nor a window that asks for a header', () => {
  const d = inBay();
  const s = buildShed({ ...d, openings: d.openings.map((o) => (o.id === 'o2' ? { ...o, header: '2x6' } : o)) });
  assert.ok(!s.walls.back.openings.find((x) => x.op.id === 'o2').bay);
  assert.ok(buildShed(defaultDesign()).walls.front.openings.every((x) => !x.bay));
});

test('sliding moves are offered with their saving, and the budget search takes them', () => {
  const d = normalize(defaultDesign());
  const mv = [];
  openingMoves(d, (label, change, group) => mv.push({ label, change, group }));
  const bay = mv.filter((m) => /into a stud bay/.test(m.label));
  assert.equal(bay.length, 2);
  for (const m of bay) {
    const s = buildShed(normalize({ ...d, ...m.change }));
    assert.ok(structuralChecks(s).ok && connectionChecks(s).ok, m.label);
    assert.ok(s.walls.back.openings.some((x) => x.bay), m.label);
  }
  assert.ok(mv.some((m) => /door o1 .* \(a king stud on a layout line\)/.test(m.label)));
  const r = budget(defaultDesign());
  const labels = r.best.steps.map((x) => x.label);
  assert.ok(labels.filter((l) => /into a stud bay/.test(l)).length === 2, labels.join('; '));
  assert.ok(r.best.ok);
});
