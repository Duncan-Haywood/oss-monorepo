import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { structuralChecks } from './checks.mjs';
import { utilisation, marginReport, heatById, bandOf, BANDS } from './utilisation.mjs';

const close = (a, b, tol = 1e-9) => assert.ok(Math.abs(a - b) < tol, `${a} vs ${b}`);

// The owner saw "most members at about 15%". These two hand calculations
// are written from the NDS formulas and the default 8x12's geometry, not from
// the code, to show that the 15% is real arithmetic and what drives it.

test('hand calculation: the default floor joist is at 15% in bending', () => {
  const u = utilisation(buildShed(defaultDesign())).find((x) => x.member === 'Floor joists');
  // Skids at 1-3/4", 48" and 94-1/4" across the 96" floor: 46-1/4" centre to
  // centre, 42-3/4" clear of the 3-1/2" skids. Span = clear + bearing = 46.25".
  const L = 42.75 + 3.5;
  // 10 dead + 40 live psf on a 16" strip: 50 x 16 / 144 = 5.556 lb/in.
  const w = (50 * 16) / 144;
  const M = (w * L * L) / 8; // 1,485 lb-in
  const S = (1.5 * 5.5 ** 2) / 6; // 7.5625 in^3
  // SPF No. 2: Fb 875 psi x CD 1.0 x CF 1.3 (2x6) x Cr 1.15 (repetitive) = 1,308 psi.
  const ratio = M / S / (875 * 1.3 * 1.15);
  close(ratio, 0.15016, 1e-4);
  close(u.ratio, ratio);
  assert.equal(u.governs, 'bending');
  assert.equal(Math.round(u.ratio * 100), 15);
});

test('hand calculation: the default wall stud is at 15%, and wind on the siding governs, not the roof', () => {
  const s = buildShed(defaultDesign());
  const u = utilisation(s).find((x) => x.member === 'Wall studs');
  // Ridge beam roof at 4/12, 6" overhang: the eave wall takes the lower half
  // of the 43" rafter run, the 3-1/2" wall and the overhang = 31" = 2.583 ft.
  assert.equal(s.design.pitch, 4);
  assert.equal(s.design.overhang, 6);
  const trib = (43 / 2 + 3.5 + 6) / 12;
  const cos = 1 / Math.sqrt(1 + (4 / 12) ** 2);
  const deadPlf = (15 / cos) * trib; // 40.8 lb/ft
  // D + 0.6W, CD 1.6: axial = dead only, on a 16" strip.
  const P = (deadPlf * 16) / 12; // 54.5 lb
  const fc = P / (1.5 * 3.5);
  const le = 82; // stud length
  const FcStar = 1150 * 1.6 * 1.15;
  const FcE = (0.822 * 510000) / (le / 3.5) ** 2;
  const a = FcE / FcStar;
  const b = (1 + a) / 1.6;
  const Cp = b - Math.sqrt(b * b - a / 0.8);
  // 0.6 x 20 psf wind on a 16" strip, simple span over the stud.
  const wLat = (0.6 * 20 * 16) / 144;
  const fb = (wLat * le * le) / 8 / ((1.5 * 3.5 ** 2) / 6); // 366 psi
  const Fb = 875 * 1.6 * 1.5 * 1.15; // 2,415 psi
  const ratio = (fc / (FcStar * Cp)) ** 2 + fb / (Fb * (1 - fc / FcE));
  close(u.ratio, ratio);
  assert.equal(Math.round(ratio * 100), 15);
  assert.equal(u.governs, 'dead + 0.6 wind');
  // The roof alone (D + S) uses under 5% of the stud.
  assert.ok(u.parts.find((p) => p.name === 'dead + snow').ratio < 0.05);
});

test('every preset: each member breakdown reproduces the Structure tab, sorted highest first', () => {
  for (const [name, make] of Object.entries(PRESETS)) {
    const shed = buildShed(make());
    const sc = structuralChecks(shed);
    const uses = utilisation(shed, sc);
    assert.equal(uses.length, sc.rows.length, name);
    for (let i = 1; i < uses.length; i++) assert.ok(uses[i - 1].ratio >= uses[i].ratio, name);
    for (const u of uses) {
      assert.ok(u.verified, `${name}: ${u.key}`);
      assert.ok(u.ids.length > 0, `${name}: ${u.key} has members to colour`);
      if (u.governs !== 'none') {
        assert.ok(u.parts.length > 0, `${name}: ${u.key}`);
        for (const p of u.parts) assert.match(p.words, /\d/);
      }
    }
  }
});

test('the heat map colours every checked member, and nothing else', () => {
  const shed = buildShed(defaultDesign());
  const uses = utilisation(shed);
  const heat = heatById(uses);
  const ids = new Set(shed.members.map((m) => m.id));
  for (const id of heat.keys()) assert.ok(ids.has(id));
  assert.equal(heat.get(shed.members.find((m) => m.kind === 'ridge beam').id).member, 'Ridge beam');
  assert.ok(!heat.has(shed.members.find((m) => m.kind === 'top plate').id));
  assert.equal(BANDS[bandOf(0.15)].label, 'under 25%');
  assert.equal(BANDS[bandOf(0.79)].label, '70 to 90%');
  assert.equal(BANDS[bandOf(1.2)].label, 'over capacity');
});

test('margin report on the default: the beam is above a 70% target; joists and rafters are simply oversized', () => {
  const shed = buildShed(defaultDesign());
  const r = marginReport(shed, 0.7);
  assert.deepEqual(r.above.map((u) => u.member), ['Ridge beam']);
  const far = Object.fromEntries(r.far.map((f) => [f.use.member, f]));
  assert.equal(far['Floor joists'].reason, 'oversized');
  assert.equal(far['Floor joists'].option.label, '2x4 joists at 16"');
  assert.equal(far.Rafters.reason, 'oversized');
  // T1-11 is rated for studs at 16": the studs are held there by the siding.
  assert.equal(far['Wall studs'].reason, 'code');
  assert.ok(r.far.filter((f) => /^Header/.test(f.use.member)).every((f) => f.reason === 'minimum'));
  // A looser target moves the beam out of "above".
  assert.equal(marginReport(shed, 0.85).above.length, 0);
});

test('a lighter option is only offered when it is built and passes every check', () => {
  const shed = buildShed({ ...defaultDesign(), sidingType: 'LP SmartSide 7/16' });
  const studs = marginReport(shed, 0.7).far.find((f) => f.use.member === 'Wall studs');
  assert.equal(studs.reason, 'oversized');
  assert.equal(studs.option.label, '2x4 studs at 24"');
  const alt = structuralChecks(buildShed({ ...shed.design, studSpacing: 24 }));
  close(alt.rows.find((x) => x.member === 'Wall studs').ratio, studs.option.ratio);
});

test('a row this module does not know keeps its ratio and says it has no breakdown', () => {
  const shed = buildShed(defaultDesign());
  const sc = structuralChecks(shed);
  sc.rows.push({ member: 'Something new', size: '-', detail: '-', ratio: 0.5, governs: 'bending', ok: true });
  const u = utilisation(shed, sc).find((x) => x.member === 'Something new');
  assert.equal(u.ratio, 0.5);
  assert.equal(u.verified, false);
  assert.equal(u.parts.length, 0);
});

test('the breakdown reproduces the check across roofs, sizes, spacings, loads and openings', () => {
  let n = 0;
  for (const roofType of ['ridgeBeam', 'ridgeBoard']) for (const width of [72, 96, 120, 144]) for (const studSize of ['2x4', '2x6'])
    for (const [rafterSize, rafterSpacing] of [['2x4', 16], ['2x6', 24], ['2x8', 12]]) for (const snowLoad of [0, 30, 70]) {
      const shed = buildShed({ ...defaultDesign(), roofType, width, studSize, rafterSize, rafterSpacing, snowLoad, windLoad: 35, joistSize: '2x8', joistSpacing: 24, autoPitch: false, pitch: 6,
        openings: [...defaultDesign().openings, { id: 'w9', kind: 'window', wall: 'left', offset: 12, width: 30, height: 24, sill: 40 }] });
      for (const u of utilisation(shed)) { assert.ok(u.verified, `${roofType} ${width} ${studSize} ${rafterSize}: ${u.key}`); n++; }
    }
  assert.ok(n > 1000);
});
