import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShed, defaultDesign, PRESETS } from './model.mjs';
import { structuralChecks, postCheck } from './checks.mjs';
import { check, worst, roofCase } from './structure.mjs';

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
