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
