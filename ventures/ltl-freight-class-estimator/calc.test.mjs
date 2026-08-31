import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateFreightClass } from './calc.mjs';

test('converts inches to shipment cube and computes density', () => {
  const result = estimateFreightClass({ length: 48, width: 40, height: 36, weight: 500 });
  assert.equal(result.totalCube, 40);
  assert.equal(result.density, 12.5);
  assert.equal(result.freightClass, 85);
});

test('scales weight and cube for multiple identical pieces', () => {
  const result = estimateFreightClass({ length: 24, width: 24, height: 24, weight: 100, pieces: 3 });
  assert.equal(result.totalCube, 24);
  assert.equal(result.totalWeight, 300);
  assert.equal(result.freightClass, 85);
});

test('uses the densest class band at an exact threshold', () => {
  const result = estimateFreightClass({ length: 12, width: 12, height: 12, weight: 6 });
  assert.equal(result.density, 6);
  assert.equal(result.freightClass, 150);
});

test('shows the density threshold for the next lower class', () => {
  const result = estimateFreightClass({ length: 48, width: 40, height: 36, weight: 500 });
  assert.equal(result.nextLowerClass, 77.5);
  assert.equal(result.nextLowerClassDensity, 13.5);
});

test('marks the densest class as having no higher band', () => {
  const result = estimateFreightClass({ length: 12, width: 12, height: 12, weight: 100 });
  assert.equal(result.freightClass, 50);
  assert.equal(result.nextLowerClass, null);
  assert.equal(result.nextLowerClassDensity, null);
});

test('states the next class down as a pallet height and a weight, not a density', () => {
  const result = estimateFreightClass({ length: 48, width: 40, height: 36, weight: 500 });
  const { cheaper } = result.levers;
  assert.equal(cheaper.freightClass, 77.5);
  // 500 lb on a 48x40 footprint hits 13.5 lb/ft³ at 1728*500/(48*40*13.5).
  assert.equal(cheaper.maxHeight.toFixed(2), '33.33');
  assert.equal(cheaper.heightReduction.toFixed(2), '2.67');
  // Or keep the 36" pallet and put 540 lb on it: 13.5 lb/ft³ x 40 ft³.
  assert.equal(cheaper.requiredWeight, 540);
  assert.equal(cheaper.weightIncrease, 40);
});

test('states the headroom before a remeasure drops the shipment a class', () => {
  const result = estimateFreightClass({ length: 48, width: 40, height: 36, weight: 500 });
  const { dearer } = result.levers;
  assert.equal(dearer.freightClass, 92.5);
  assert.equal(dearer.floorDensity, 12);
  // Below 12 lb/ft³ this pallet re-rates: 1728*500/(48*40*12) = 37.5".
  assert.equal(dearer.maxHeight, 37.5);
  assert.equal(dearer.heightHeadroom, 1.5);
  assert.equal(dearer.minWeight, 480);
  assert.equal(dearer.weightHeadroom, 20);
});

test('the levers hold on the shipment, not on one piece of it', () => {
  const one = estimateFreightClass({ length: 48, width: 40, height: 36, weight: 500, pieces: 1 });
  const four = estimateFreightClass({ length: 48, width: 40, height: 36, weight: 500, pieces: 4 });
  // Density is per cubic foot, so identical pallets do not move it — and
  // neither height lever may drift with the piece count.
  assert.equal(four.density, one.density);
  assert.equal(four.levers.cheaper.maxHeight, one.levers.cheaper.maxHeight);
  assert.equal(four.levers.dearer.maxHeight, one.levers.dearer.maxHeight);
  // The weight levers are per piece for the same reason the input is.
  assert.equal(four.levers.cheaper.requiredWeight, one.levers.cheaper.requiredWeight);
});

test('offers no cheaper lever in the densest band and no dearer one in the lightest', () => {
  const densest = estimateFreightClass({ length: 12, width: 12, height: 12, weight: 100 });
  assert.equal(densest.freightClass, 50);
  assert.equal(densest.levers.cheaper, null);
  assert.equal(densest.levers.dearer.freightClass, 55);

  // Class 500's band floor is zero density: nothing is cheaper to move by the
  // cubic foot, so there is no dearer class and no height that would reach one.
  const lightest = estimateFreightClass({ length: 48, width: 40, height: 60, weight: 15 });
  assert.equal(lightest.freightClass, 500);
  assert.equal(lightest.levers.dearer, null);
  assert.equal(lightest.levers.cheaper.freightClass, 400);
});

test('a height reduction larger than the pallet is reported, not hidden', () => {
  // 3 lb on a full 48x40 footprint reaches class 400 only at 5.4" — shorter
  // than the pallet itself. The number is still the honest answer to "what
  // height would it take", and the page is what decides how to say so.
  const result = estimateFreightClass({ length: 48, width: 40, height: 48, weight: 3 });
  assert.equal(result.freightClass, 500);
  assert.ok(result.levers.cheaper.maxHeight < result.height);
  assert.ok(result.levers.cheaper.heightReduction > 0);
});

test('rejects missing or fractional pieces', () => {
  assert.throws(() => estimateFreightClass({ length: 1, width: 1, height: 1, weight: 1, pieces: 0 }));
  assert.throws(() => estimateFreightClass({ length: 1, width: 1, height: 1, weight: 1, pieces: 1.5 }), /whole number/);
});

test('rejects unsafe piece counts and arithmetic overflow', () => {
  assert.throws(() => estimateFreightClass({ length: 1, width: 1, height: 1, weight: 1, pieces: Number.MAX_SAFE_INTEGER + 1 }), /whole number/);
  assert.throws(() => estimateFreightClass({ length: 1e308, width: 1e308, height: 1e308, weight: 1 }), /too large/);
});
