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

test('a bad job-size figure is named the way the page labels the field', () => {
  // Regression: the message used to say "Batch size", a term that appears
  // nowhere on the page -- the visible label is "Bucket or job size". A
  // visitor debugging a rejected number has only the error text to go on.
  assert.throws(() => calculateDilution({ ...base, batchGallons: 0 }), /Bucket or job size/);
});

test('reports the concentrate and whole containers a job actually needs', () => {
  // 4 fl oz per batch makes 1 usable gallon (no waste), so a 5-gallon job
  // needs 20 fl oz of concentrate -- well inside one 128 fl oz container.
  const result = calculateDilution(base);
  assert.equal(result.concentrateNeededOz, 20);
  assert.equal(result.containersNeeded, 1);
  assert.equal(result.containerPurchaseCost, 32);
  assert.equal(result.leftoverConcentrateOz, 108);
});

test('waste shrinks the usable gallons a batch yields, so buying has to account for it too', () => {
  // 10% waste means one batch (4 fl oz into 1 gallon of water) only yields
  // 0.9 usable gallons, not 1 -- the same adjustment costPerGallon already
  // makes. A 5-usable-gallon job then needs 4 / 0.9 * 5 = 22.2̄ fl oz,
  // not the 20 fl oz a waste-blind calculation would say.
  const result = calculateDilution({ ...base, wasteRate: 10 });
  assert.equal(Number(result.concentrateNeededOz.toFixed(4)), 22.2222);
  assert.equal(result.containersNeeded, 1);
});

test('a job needing more concentrate than one container holds rounds up to whole containers', () => {
  // 4 fl oz per usable gallon, 40-gallon job = 160 fl oz needed, which does
  // not divide evenly into 128 fl oz containers. The tool must say "buy 2"
  // and the real dollar cost of that purchase, not a fractional container
  // an operator cannot actually order.
  const result = calculateDilution({ ...base, batchGallons: 40 });
  assert.equal(result.concentrateNeededOz, 160);
  assert.equal(result.containersNeeded, 2);
  assert.equal(result.containerPurchaseCost, 64);
  assert.equal(result.leftoverConcentrateOz, 96);
});

test('an exact multiple of a container needs no extra leftover', () => {
  // 32 fl oz needed exactly fills a quarter of one 128 fl oz container's
  // multiples cleanly -- rounding must not add a container that is not
  // actually required just because of floating-point noise.
  const result = calculateDilution({ ...base, batchGallons: 32 });
  assert.equal(result.concentrateNeededOz, 128);
  assert.equal(result.containersNeeded, 1);
  assert.equal(result.leftoverConcentrateOz, 0);
});
