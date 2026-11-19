import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_RADIUS, SIZES, massPerMetre, bendDeduction90, rightAngleLength, cutLength, SHAPES } from './shapes.mjs';

test('minimum scheduling radii are the BS 8666 table: 2d to 16 mm, 3.5d (rounded) from 20 mm', () => {
  assert.deepEqual(SIZES.map(d => MIN_RADIUS[d]), [12, 16, 20, 24, 32, 70, 87, 112, 140, 175]);
  for (const d of SIZES) {
    const rule = d <= 16 ? 2 * d : 3.5 * d;
    assert.ok(Math.abs(MIN_RADIUS[d] - rule) <= 0.5, `${d} mm`);
  }
});

test('mass per metre is within 0.001 kg/m of the 0.222 ... 15.413 kg/m table in BS 4449', () => {
  const table = { 6: 0.222, 8: 0.395, 10: 0.617, 12: 0.888, 16: 1.579, 20: 2.466, 25: 3.854, 32: 6.313, 40: 9.864, 50: 15.413 };
  for (const d of SIZES) assert.ok(Math.abs(massPerMetre(d) - table[d]) <= 0.001, `${d} mm`);
});

test('a 90 degree bend from first principles, by hand', () => {
  // 16 mm bar, r = 32: legs stop r + d = 48 short of each corner (96 in all);
  // the centreline arc is pi/2 x (32 + 8) = 62.83. Deduction 33.17 mm.
  assert.ok(Math.abs(bendDeduction90(16, 32) - (96 - Math.PI / 2 * 40)) < 1e-9);
  assert.ok(Math.abs(bendDeduction90(16, 32) - 33.168) < 1e-3);
  assert.ok(Math.abs(rightAngleLength([1000, 500], 16, 32) - (1500 - 33.168)) < 1e-3);
});

test('chart formulas for shapes 11 and 21 agree with the bend geometry within 0.1d at every standard size', () => {
  for (const d of SIZES) {
    const r = MIN_RADIUS[d];
    for (const code of ['11', '21']) {
      const s = SHAPES[code];
      const dims = { A: 1200, B: 800, C: 600 };
      const chart = s.length(dims, d, r);
      const geom = rightAngleLength(s.legs(dims), d, r);
      assert.ok(Math.abs(chart - geom) <= 0.1 * d * (code === '21' ? 2 : 1), `${code} at ${d} mm: ${chart} vs ${geom}`);
    }
  }
});

test('worked examples by hand: shape 11, 21 and 51, rounded up to 25 mm', () => {
  // 11: H12, A 1800, B 450: 1800 + 450 - 0.5 x 24 - 12 = 2226 -> 2250.
  assert.deepEqual(cutLength('11', { A: 1800, B: 450 }, 12), { exact: 2226, cut: 2250, r: 24 });
  // 21: H16, 900 / 2400 / 900: 4200 - 32 - 32 = 4136 -> 4150.
  assert.equal(cutLength('21', { A: 900, B: 2400, C: 900 }, 16).cut, 4150);
  // 51: H10 link 350 x 550, hooks 100: 2 x 1000 - 2.5 x 20 - 5 x 10 = 1900.
  assert.equal(cutLength('51', { A: 350, B: 550, C: 100 }, 10).exact, 1900);
  // 25 mm bars use the 3.5d radius: 11 with A 2000, B 500: 2500 - 43.5 - 25 = 2431.5 -> 2450.
  assert.equal(cutLength('11', { A: 2000, B: 500 }, 25).exact, 2431.5);
  assert.equal(cutLength('11', { A: 2000, B: 500 }, 25).cut, 2450);
  assert.equal(cutLength('11', { A: 2000, B: 500 }, 25, { round: 1 }).cut, 2432);
});

test('shape R takes any number of 90 degree legs', () => {
  const r = cutLength('R', { A: 500, B: 1000, C: 500, D: 300 }, 12, { round: 1 });
  assert.ok(Math.abs(r.exact - (2300 - 3 * bendDeduction90(12, 24))) < 1e-9);
});

test('missing dimensions and unknown shapes are refused', () => {
  assert.throws(() => cutLength('21', { A: 900, B: 2400 }, 16), /needs dimension C/);
  assert.throws(() => cutLength('99', { A: 1 }, 16), /not supported/);
  assert.throws(() => cutLength('11', { A: 1, B: 1 }, 14), /No minimum radius/);
});
