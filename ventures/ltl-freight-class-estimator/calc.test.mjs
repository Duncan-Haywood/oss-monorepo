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

test('rejects missing or fractional pieces', () => {
  assert.throws(() => estimateFreightClass({ length: 1, width: 1, height: 1, weight: 1, pieces: 0 }));
  assert.throws(() => estimateFreightClass({ length: 1, width: 1, height: 1, weight: 1, pieces: 1.5 }), /whole number/);
});
