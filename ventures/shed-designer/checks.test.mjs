import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { structuralChecks, postCheck, nailZ, heelJoint, skidOnBlocks, rafterUplift, racking, woodDensity, selfWeight, anchorage, anchorageText } from './checks.mjs';
import { buildInstructions } from './instructions.mjs';
import { estimate } from './estimate.mjs';
import { check, worst, roofCase, designValues } from './structure.mjs';

test('the starter passes every check at 30 psf snow and 20 psf wind, and names what it checked', () => {
  const r = structuralChecks(buildShed(defaultDesign()));
  assert.ok(r.ok);
  const names = r.rows.map((x) => x.member);
  for (const n of ['Floor joists', 'Rafters', 'Ridge beam', 'Ridge beam posts', 'Wall studs']) assert.ok(names.includes(n), n);
  assert.ok(names.some((n) => /Header over the front door/.test(n)));
});

test('the ridge beam check is the hand calculation', () => {
  // 2-ply 2x10, 137" clear + 3" bearing, half of each slope (48") at 5/12: w = (15/cos + 30) * 48/144 lb/in.
  const cos = 12 / 13;
  const L = 140;
  const w = (15 / cos + 30) * 48 / 144;
  const fb = (w * L * L / 8) / (3 * 9.25 ** 2 / 6);
  const Fb = 875 * 1.15 * 1.1;
  const r = check({ size: '2x10', plies: 2, spacingIn: 48, pitch: 5, repetitive: false, bearingIn: 3 }, 137 / 12, roofCase(30));
  assert.ok(Math.abs(r.bending - fb / Fb) < 1e-9);
});

test('heavy snow fails the beam, and a deeper beam fixes it', () => {
  const heavy = structuralChecks(buildShed({ ...defaultDesign(), snowLoad: 50 }));
  assert.ok(!heavy.rows.find((x) => x.member === 'Ridge beam').ok);
  const deeper = structuralChecks(buildShed({ ...defaultDesign(), snowLoad: 50, beamSize: '2x12' }));
  assert.ok(worst(check({ size: '2x12', plies: 2, spacingIn: 48, pitch: 5, repetitive: false, bearingIn: 3 }, 137 / 12, roofCase(50)))[1] < 1);
  assert.ok(deeper.rows.find((x) => x.member === 'Ridge beam').ok);
});

test('a ridge-board roof reports the board as tied, not as a beam', () => {
  const r = structuralChecks(buildShed(PRESETS['8x12 classic']()));
  assert.equal(r.rows.find((x) => x.member === 'Ridge board').governs, 'none');
});

test('a post fails when it is too slender for its load', () => {
  assert.ok(postCheck(2, '2x4', 14, 1000) < 1);
  assert.ok(postCheck(2, '2x4', 200, 6000) > 1);
});

// Under a ridge board the rafter pair and its tie are a truss and the board
// carries nothing, so each eave wall carries the whole half roof. The check
// once used half the rafter run (right only under a ridge beam), which put
// about 40% too little roof on the eave-wall headers and studs.
test('a ridge-board roof puts the whole half roof on each eave wall: the header is the hand calculation', () => {
  const s = buildShed(PRESETS['8x12 classic']()); // 8 ft wide, 6/12, 12" overhang, 30 psf snow
  const cos = 12 / Math.sqrt(12 ** 2 + 6 ** 2);
  const tribFt = (96 / 2 + 12) / 12; // ridge to eave tip, on plan
  const wPlf = (15 / cos) * tribFt + 30 * tribFt + 10;
  const row = structuralChecks(s).rows.find((x) => x.member === 'Header over the front door');
  assert.match(row.detail, new RegExp(`${Math.round(wPlf)} lb/ft`));
  // 2-ply 2x6 over the 38" door: shear governs, V = wL/2 at CD 1.15.
  const w = wPlf / 12;
  const V = (w * 38) / 2;
  const shear = (1.5 * V) / (3 * 5.5) / (135 * 1.15);
  const bending = (w * 38 ** 2) / 8 / ((3 * 5.5 ** 2) / 6) / (875 * 1.15 * 1.3);
  assert.ok(shear > bending);
  assert.ok(Math.abs(row.ratio - shear) < 1e-9, `${row.ratio} vs ${shear}`);
});

test('a ridge beam takes the upper half of the rafters off the eave walls', () => {
  const load = (roofType) => Number(/(\d+) lb\/ft/.exec(structuralChecks(buildShed({ ...PRESETS['8x12 classic'](), roofType })).rows.find((x) => x.member === 'Header over the front door').detail)[1]);
  // Beam: 43-1/4" run / 2 + 3-1/2" wall + 12" overhang = 37-1/8"; board: 48 + 12 = 60".
  assert.ok(load('ridgeBeam') < load('ridgeBoard'));
  const cos = 12 / Math.sqrt(180);
  assert.equal(load('ridgeBeam'), Math.round((15 / cos + 30) * ((96 / 2 - 1.5 - 3.5) / 2 + 3.5 + 12) / 12 + 10));
});

test('the eave-wall stud check is the hand calculation (NDS 3.9-3, D + 0.6W governs)', () => {
  // 8x12 classic: 2x4 at 16", 91-1/2" studs, ridge board, 6/12, 12" overhang, 30 psf snow, 20 psf wind.
  const s = buildShed(PRESETS['8x12 classic']());
  const row = structuralChecks(s).rows.find((x) => x.member === 'Wall studs');
  const cos = 12 / Math.sqrt(180);
  const deadPlf = (15 / cos) * 5; // 5 ft of roof on plan, ridge to eave tip
  const A = 1.5 * 3.5, S = (1.5 * 3.5 ** 2) / 6;
  const FcE = (0.822 * 510e3) / (91.5 / 3.5) ** 2;
  const CD = 1.6;
  const FcStar = 1150 * CD * 1.15;
  const a = FcE / FcStar, b = (1 + a) / 1.6;
  const Cp = b - Math.sqrt(b * b - a / 0.8);
  const fc = (deadPlf * 16) / 12 / A;
  const fb = ((0.6 * 20 * 16) / 144) * 91.5 ** 2 / 8 / S;
  const Fb1 = 875 * CD * 1.5 * 1.15;
  const hand = (fc / (FcStar * Cp)) ** 2 + fb / (Fb1 * (1 - fc / FcE));
  assert.ok(Math.abs(row.ratio - hand) < 1e-9, `${row.ratio} vs ${hand}`);
  assert.ok(hand > 0.19 && hand < 0.2);
});

test('the floor joist and rafter checks are the hand calculation', () => {
  const s = buildShed(PRESETS['8x12 classic']());
  const rows = structuralChecks(s).rows;
  // Floor: treated 2x6 at 16", 42-3/4" clear between 4x6 skids + 3-1/2" bearing, 50 psf, CD 1.0, Cr 1.15;
  // Southern pine No. 2, whose 2x6 Fb of 1,000 psi has its size factor in (SPIB 2013, Table 1).
  const Lf = 42.75 + 3.5;
  const wf = (50 * 16) / 144;
  const floor = (wf * Lf ** 2) / 8 / ((1.5 * 5.5 ** 2) / 6) / (1000 * 1.15);
  assert.ok(Math.abs(rows.find((x) => x.member === 'Floor joists').ratio - floor) < 1e-9);
  // Rafter: 2x6 at 24", run 48 - 3/4 - 3-1/2 = 43-3/4" + 3-1/2" seat, 6/12; dead on slope, snow on plan; CD 1.15.
  const cos = 12 / Math.sqrt(180);
  const Lr = 43.75 + 3.5;
  const wr = ((15 / cos + 30) * 24) / 144;
  const rafter = (wr * Lr ** 2) / 8 / ((1.5 * 5.5 ** 2) / 6) / (875 * 1.15 * 1.3 * 1.15);
  assert.ok(Math.abs(rows.find((x) => x.member === 'Rafters').ratio - rafter) < 1e-9);
});

// The instructions said three 16d per rafter at every rafter tie, whatever
// the span. The heel joint holds the pair's outward thrust, wL^2/8h, and wider
// sheds need more nails.
test('16d common in SPF: the NDS yield limit is mode IV, worked by hand', () => {
  const Fe = 16600 * 0.42 ** 1.84;
  const modeIV = (0.162 ** 2 / 2.2) * Math.sqrt((2 * Fe * 90000) / 6);
  assert.ok(Math.abs(nailZ(0.162, 1.5, 2.0) - modeIV) < 1e-9);
  assert.ok(modeIV > 119 && modeIV < 121);
});

test('rafter-tie nails follow the thrust: 3 on the 8x12 classic, 4 on the 10x12, 5 on the 12x16', () => {
  const thrust = (W, pitch) => {
    const w = (15 * Math.sqrt(1 + (pitch / 12) ** 2) + 30) * 2; // lb/ft per pair at 24"
    return (w * (W / 12) ** 2) / (8 * (W / 24) * (pitch / 12));
  };
  for (const [name, W, pitch, nails] of [['8x12 classic', 96, 6, 3], ['10x12', 120, 6, 4], ['12x16', 144, 5, 5]]) {
    const s = buildShed(PRESETS[name]());
    const h = heelJoint(s);
    assert.ok(Math.abs(h.thrust - thrust(W, pitch)) < 1e-9, name);
    assert.equal(h.nails, nails, name);
    const row = structuralChecks(s).rows.find((x) => x.member === 'Rafter tie nailing (heel joint)');
    assert.ok(row.ok && row.ratio <= 1, name);
    const text = JSON.stringify(buildInstructions(s, estimate(s)));
    assert.match(text, new RegExp(`${nails} 16d commons into each rafter`), name);
  }
  assert.equal(heelJoint(buildShed(defaultDesign())), null); // ridge beam: no ties
});

test('the nailing schedule and the nail count carry the heel-joint nails', async () => {
  const { buildSheets } = await import('./drawings.mjs');
  const s = buildShed(PRESETS['12x16']());
  assert.match(JSON.stringify(buildSheets(s)), /Rafter tie to rafter, each end.{0,120}"5-16d common/);
  assert.doesNotMatch(JSON.stringify(buildSheets(buildShed(defaultDesign()))), /Rafter tie to rafter/);
});

// Gable-wall headers were given a flat 40 lb/ft for the gable framing, with
// nothing for the end rafter, which bears on the gable studs all along the slope.
test('a gable-wall header carries the end rafter\'s strip of roof as well as the gable framing', () => {
  const s = buildShed(PRESETS['12x16']()); // 72" door in the left gable wall, 5/12, rafters at 24"
  const row = structuralChecks(s).rows.find((x) => x.member === 'Header over the left door');
  const cos = 12 / 13;
  const wPlf = 40 + (15 / cos + 30) * (12 / 12);
  assert.match(row.detail, new RegExp(`${Math.round(wPlf)} lb/ft`));
  assert.ok(row.ok);
});

// Southern pine No. 2 (SPIB 2013 Use Guide, Table 1) and the wet-service
// factors of its Table A-2: Fb x 0.85 only when Fb (with CF) is over 1,150 psi,
// Fv x 0.97, Fc-perp x 0.67, Fc x 0.8 over 750 psi, E and Emin x 0.9.
test('Southern pine and wet-service design values are the published ones', () => {
  assert.deepEqual(designValues('2x6', 'SYP'), { Fb: 1000, Fv: 175, Fc_perp: 565, Fc: 1400, E: 1.4e6, Emin: 510e3 });
  const w = designValues('4x4', 'SYP', true);
  assert.equal(w.Fb, 1100); // 1,100 <= 1,150: CM = 1.0
  assert.ok(Math.abs(w.Fv - 175 * 0.97) < 1e-9 && Math.abs(w.Fc_perp - 565 * 0.67) < 1e-9 && Math.abs(w.Fc - 1450 * 0.8) < 1e-9 && Math.abs(w.E - 1.26e6) < 1e-6);
  assert.ok(Math.abs(designValues('2x4', 'SPF', true).Fb - 875 * 1.5 * 0.85) < 1e-9); // 1,312.5 > 1,150
  // A treated floor is checked as Southern pine: 13% more bending ratio on a 2x6 than SPF.
  const spf = check({ size: '2x6', spacingIn: 16 }, 4, roofCase(30)).bending;
  const syp = check({ size: '2x6', spacingIn: 16, species: 'SYP' }, 4, roofCase(30)).bending;
  assert.ok(Math.abs(syp / spf - (875 * 1.3) / 1000) < 1e-9);
});

// Skids on blocks span block to block. 8x12 classic on solid 4x8x16 blocks,
// paver-base beds: three PT 4x6 skids at 1-3/4", 48" and 94-1/4"; four blocks
// a skid, centres 42-2/3" apart (three spans). The outer skid carries its strip
// of floor, the eave wall and the roof down to it.
test('the skid-on-blocks and soil checks are the hand calculation', () => {
  const s = buildShed({ ...PRESETS['8x12 classic'](), foundation: 'blocks', pad: 'under blocks' });
  const sk = skidOnBlocks(s);
  assert.equal(sk.skid, 0);
  const L = (144 - 16) / 3;
  assert.ok(Math.abs(sk.L - L) < 1e-9);
  const cos = 12 / Math.sqrt(180);
  const trib = (1.75 + 48) / 2 / 12; // ft of floor, edge to midway to the next skid
  const roofDead = (15 / cos) * 5, roofSnow = 30 * 5; // lb/ft: 48" half width + 12" overhang
  const D = (10 * trib + 10 * 8 + roofDead) / 12; // 10 psf on the 8 ft wall
  const Lv = (40 * trib) / 12, S = roofSnow / 12;
  const b = 3.5, h = 5.5;
  const Fb = 1000, Fv = 175 * 0.97, Fcp = 565 * 0.67; // SYP No. 2 4x6, wet
  const combos = [[D + Lv, 1.0], [D + S, 1.15], [D + 0.75 * Lv + 0.75 * S, 1.15]];
  const bending = Math.max(...combos.map(([w, CD]) => (w * L * L) / 8 / ((b * h * h) / 6) / (Fb * CD)));
  const shear = Math.max(...combos.map(([w, CD]) => (1.5 * 0.625 * w * L) / (b * h) / (Fv * CD)));
  assert.ok(Math.abs(sk.ratios.bending - bending) < 1e-9, `${sk.ratios.bending} vs ${bending}`);
  assert.ok(Math.abs(sk.ratios.shear - shear) < 1e-9);
  // Reactions: 1.143wL inside (three or four spans), or at the end 0.4wL plus
  // the gable wall (40 lb/ft + the end rafter's 12" strip of roof) over the skid's strip.
  const gable = 40 + (15 / cos + 30) * 1;
  const R = Math.max(...combos.map(([w]) => Math.max(1.143 * w * L, 0.4 * w * L + gable * trib)));
  assert.ok(Math.abs(sk.R - R) < 1e-9);
  assert.ok(Math.abs(sk.ratios.bearing - R / (b * 16) / Fcp) < 1e-9);
  // The bed is 2" wider than the 16" x 8" block all round: 20" x 12" on the soil.
  const soil = (R + 50) / ((20 * 12) / 144) / 1500;
  assert.ok(Math.abs(sk.soil - soil) < 1e-9);
  assert.ok(R > 1400 && R < 1500 && soil > 0.6 && soil < 0.65, `${R} ${soil}`);
  const rows = structuralChecks(s).rows;
  assert.ok(Math.abs(rows.find((x) => x.member === 'Skids on blocks').ratio - Math.max(bending, shear, sk.ratios.deflection, sk.ratios.bearing)) < 1e-9);
  assert.ok(Math.abs(rows.find((x) => x.member === 'Blocks on the soil').ratio - soil) < 1e-9);
  // On gravel the skid bears along its length: no rows.
  assert.equal(skidOnBlocks(buildShed(PRESETS['8x12 classic']())), null);
});

// The starter once set its blocks straight on the ground: about 1,970 psf on
// clay or silt, where the IRC presumes 1,500. It now starts on paver-base beds.
test('blocks straight on soft ground fail the soil check; the starter has a bed under each', () => {
  const bare = structuralChecks(buildShed({ ...defaultDesign(), pad: 'none' })).rows.find((x) => x.member === 'Blocks on the soil');
  assert.ok(!bare.ok && bare.ratio > 1.25 && bare.ratio < 1.4, String(bare.ratio));
  assert.match(bare.detail, /straight on the soil.*paver base under each block/);
  const start = structuralChecks(buildShed(defaultDesign()));
  assert.equal(defaultDesign().pad, 'under blocks');
  assert.ok(start.ok && start.rows.find((x) => x.member === 'Blocks on the soil').ratio < 0.75);
});

// Wind uplift at the rafter-to-plate tie, ASD 0.6D + 0.6W. 12x16 preset: ridge
// board, 5/12, rafters at 24", 12" overhang, 20 psf wind, H2.5A ties (615 lb
// uplift in SPF/HF, Simpson C-C-2024).
test('the rafter-tie uplift check is the hand calculation', () => {
  const s = buildShed(PRESETS['12x16']());
  const cos = 12 / 13;
  const strip = 2 * (72 + 12) / 12; // 2 ft of rafter spacing x (half of 144" + overhang) on plan, sq ft
  const soffit = 2 * 1; // under the 12" overhang
  const up = 0.6 * 20 * (strip + soffit);
  const dead = 0.6 * (15 / cos) * strip;
  const u = rafterUplift(s);
  assert.ok(Math.abs(u.net - (up - dead)) < 1e-9, `${u.net} vs ${up - dead}`);
  assert.equal(u.tie.uplift, 615);
  assert.ok(Math.abs(u.holdsPsf - (615 + dead) / (0.6 * (strip + soffit))) < 1e-9);
  assert.ok(u.net > 50 && u.net < 60 && u.holdsPsf > 78 && u.holdsPsf < 79);
  const row = structuralChecks(s).rows.find((x) => x.member === 'Rafter-to-plate ties (uplift)');
  assert.ok(Math.abs(row.ratio - (up - dead) / 615) < 1e-9);
  assert.match(row.detail, /holds to 78 psf/);
  // A VPA2 connector seat holds less (220 lb): the starter holds to 72 psf, so 80 psf fails it.
  assert.equal(rafterUplift(buildShed(defaultDesign())).tie.model, 'Simpson VPA2');
  assert.ok(!structuralChecks(buildShed({ ...defaultDesign(), windLoad: 80 })).rows.find((x) => x.member === 'Rafter-to-plate ties (uplift)').ok);
  // With no wind there is nothing to hold down.
  assert.equal(structuralChecks(buildShed({ ...defaultDesign(), windLoad: 0 })).rows.find((x) => x.member === 'Rafter-to-plate ties (uplift)').ratio, 0);
});

// Racking, SDPWS 2015 Table 4.3A: T1-11 is plywood siding (3/8" row, 8d
// galvanized casing at 6" edges), vw 450 plf nominal; ASD divides by 2.0 and
// SPF framing (G 0.42) multiplies by 1 - (0.5 - 0.42) = 0.92: 207 plf.
test('the racking check is the hand calculation', () => {
  const cap = (450 / 2) * 0.92;
  // 12x16: 96" walls, the left gable wall has a 72" door at 36", leaving two
  // 36" panels; h/b = 96/36 = 2.67 > 2, so each counts at 1.25 - 0.125 x 2.67.
  const s = buildShed(PRESETS['12x16']());
  const rise = (s.dims.ridgeTop - s.dims.plateTop) / 12;
  const F = 0.6 * 20 * 16 * (4 + rise); // wind on the 16 ft eave face, mid-wall to ridge
  const eff = (2 * 36 * (1.25 - 0.125 * (96 / 36))) / 12;
  assert.ok(Math.abs(eff - 5.5) < 1e-9);
  const r = racking(s);
  assert.equal(r.wall, 'left');
  assert.ok(Math.abs(r.ratio - F / 2 / eff / cap) < 1e-9, `${r.ratio} vs ${F / 2 / eff / cap}`);
  assert.ok(r.ratio > 0.5 && r.ratio < 0.65);
  assert.ok(Math.abs(structuralChecks(s).rows.find((x) => x.member === 'Wall bracing (racking)').ratio - r.ratio) < 1e-9);
  // Over 7/16" OSB (lap siding): the 7/16" sheathing row with 8d, vw 670.
  assert.ok(Math.abs(racking(buildShed({ ...PRESETS['12x16'](), sidingType: 'vinyl' })).ratio - F / 2 / eff / ((670 / 2) * 0.92)) < 1e-9);
});

// The 8x8 lean's 52" door leaves 22" panels on an 84" wall (h/b 3.8 > 3.5):
// that wall braces nothing. Its roof cantilevers 8 ft over 8 ft (1:1), so
// SDPWS 4.2.5.2.1 lets the roof carry the twist: the right wall takes the
// whole force, and the eave walls the couple F x 4 ft / 8 ft.
test('an open-front wall hands its share to the opposite wall, within SDPWS 1:1', () => {
  const s = buildShed(PRESETS['8x8 lean']());
  const cap = (450 / 2) * 0.92;
  const rise = (s.dims.ridgeTop - s.dims.plateTop) / 12;
  const F = 0.6 * 20 * 8 * (84 / 24 + rise);
  const r = racking(s);
  assert.equal(r.wall, 'right');
  assert.ok(Math.abs(r.ratio - F / 8 / cap) < 1e-9, `${r.ratio} vs ${F / 8 / cap}`);
  assert.match(r.why, /all of it, as the left wall braces nothing/);
  // The same door in a 12 ft long shed: 12 ft over 8 ft is past 1:1, so it fails.
  const long = racking(buildShed({ ...PRESETS['8x8 lean'](), length: 144 }));
  assert.ok(long.ratio > 1);
  assert.match(long.why, /past the 1:1 SDPWS allows/);
  // No siding: nothing braces the walls. LP SmartSide: rated in LP's own report, not checked here.
  assert.ok(!structuralChecks(buildShed({ ...defaultDesign(), siding: false })).rows.find((x) => x.member === 'Wall bracing (racking)').ok);
  assert.equal(structuralChecks(buildShed({ ...defaultDesign(), sidingType: 'LP SmartSide' })).rows.find((x) => x.member === 'Wall bracing (racking)'), undefined);
});

// Weight of wood (NDS Supplement 3.1.3): 62.4 G (1 + m/100) / (1 + 0.009 G m).
test('self-weight is the drawn volume at the NDS density', () => {
  const spf = (62.4 * 0.42 * 1.12) / (1 + 0.009 * 0.42 * 12);
  assert.ok(Math.abs(woodDensity(0.42, 12) - spf) < 1e-9 && spf > 28 && spf < 28.2);
  const s = buildShed(PRESETS['8x12 classic']());
  const one = { ...s, members: [s.members.find((m) => m.kind === 'stud')], panels: [] };
  const stud = one.members[0];
  // A stud is 1-1/2" x 3-1/2" by its drawn length.
  assert.ok(Math.abs(selfWeight(one).lb - (1.5 * 3.5 * (stud.local.z1 - stud.local.z0) / 1728) * spf) < 1e-9);
  const w = selfWeight(s).lb;
  assert.ok(w > 1800 && w < 2200, String(w)); // an 8x12 without its shingles, door or windows
});

// An unanchored shed against the wind, ASD 0.6D + 0.6W. 8x12 classic on a
// gravel pad (skid bottoms at 0), 20 psf: wind on the 12 ft side over the
// walls and the roof's rise, uplift over the roof plan (8 ft + two 12"
// overhangs), about the leeward skid; the weight acts half the skid spread in.
test('the anchorage check is the hand calculation, and an unanchored shed tips', () => {
  const s = buildShed(PRESETS['8x12 classic']());
  const k = s.dims;
  const wall = k.plateTop / 12, rise = (k.ridgeTop - k.plateTop) / 12;
  const M = 20 * 12 * (wall * wall / 2 + rise * (wall + rise / 2));
  const U = 20 * 12 * (8 + 2);
  const arm = (94.25 - 1.75) / 2 / 12;
  const Wt = selfWeight(s).lb;
  const over = 0.6 * (M + U * arm), resist = 0.6 * Wt * arm;
  const a = anchorage(s);
  assert.equal(a.dir, 'on the long side');
  assert.ok(Math.abs(a.ratio - over / resist) < 1e-9, `${a.ratio} vs ${over / resist}`);
  assert.ok(Math.abs(a.holdDown - (over - resist) / (2 * arm) / 2) < 1e-9);
  assert.ok(a.ratio > 3 && a.ratio < 3.5 && a.holdDown > 600 && a.holdDown < 700);
  assert.ok(Math.abs(a.tipsAtPsf - 20 / a.ratio) < 1e-9);
  assert.match(anchorageText(s), /needs anchors: ground anchors or straps that hold about \d+ lb at each windward corner/);
  // At 5 psf the weight holds it; the build steps only ask for anchors when they are needed.
  const calm = buildShed({ ...PRESETS['8x12 classic'](), windLoad: 5 });
  assert.ok(anchorage(calm).ratio < 1);
  assert.match(anchorageText(calm), /holds it down with \d+% to spare/);
  const steps = (sh) => JSON.stringify(buildInstructions(sh, estimate(sh)));
  assert.match(steps(s), /Anchor it\./);
  assert.doesNotMatch(steps(calm), /Anchor it\./);
});
