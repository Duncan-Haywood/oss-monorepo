import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { structuralChecks, postCheck, nailZ, heelJoint, skidOnBlocks } from './checks.mjs';
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

test('the subfloor is checked against its APA span rating: 23/32" T&G spans 24" joists, not wider', async () => {
  const { subfloorCheck } = await import('./levers.mjs');
  const row = (d) => structuralChecks(buildShed(d)).rows.find((x) => x.member === 'Subfloor');
  assert.equal(row(defaultDesign()).ratio, 16 / 24);
  assert.ok(row({ ...defaultDesign(), joistSpacing: 24 }).ok);
  assert.equal(subfloorCheck({ floorPanel: 'OSB', joistSpacing: 24 }).ratio, 1);
  assert.ok(subfloorCheck({ floorPanel: 'plywood', joistSpacing: 32 }).ratio > 1);
});
