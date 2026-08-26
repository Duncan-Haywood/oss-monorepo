import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateDilution } from './calc.mjs';

const base = { concentrateOz: 4, waterGallons: 1, containerCost: 32, containerOz: 128, batchGallons: 5, laborMinutes: 0, laborRate: 20, wasteRate: 0 };

test('calculates concentrate, gallon, and bucket cost', () => {
  const result = calculateDilution(base);
  assert.equal(result.concentrateCostPerOz, 0.25);
  assert.equal(result.chemicalCost, 1);
  assert.equal(result.costPerGallon, 1);
  assert.equal(result.costPerBucket, 5);
});

test('includes mixing labor and waste allowance', () => {
  const result = calculateDilution({ ...base, laborMinutes: 6, wasteRate: 10 });
  assert.equal(result.laborCost, 2);
  assert.equal(result.batchCost, 3 / 0.9);
});

test('rejects unsafe or unusable inputs', () => {
  assert.throws(() => calculateDilution({ ...base, waterGallons: 0 }), /Water volume/);
  assert.throws(() => calculateDilution({ ...base, wasteRate: 100 }), /less than 100/);
});
