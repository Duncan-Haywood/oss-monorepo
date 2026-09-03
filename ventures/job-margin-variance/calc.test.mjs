import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, reportText } from './calc.mjs';
import { recordUsage } from './usage.mjs';

test('calculates variances and identifies the largest movement', () => {
  const result = calculate({
    estimatedHours: 16,
    actualHours: 20,
    estimatedMaterials: 420,
    actualMaterials: 465,
    estimatedOther: 80,
    actualOther: 95,
  });
  assert.equal(result.costVariance, 60);
  assert.equal(result.laborVariance, 4);
  assert.equal(result.largest.label, 'Materials');
  assert.match(reportText(result), /Largest movement to review: Materials/);
});

test('rejects missing and negative values', () => {
  assert.throws(
    () => calculate({
      estimatedHours: -1,
      actualHours: 2,
      estimatedMaterials: 1,
      actualMaterials: 1,
      estimatedOther: 0,
      actualOther: 0,
    }),
    /non-negative/,
  );
});

test('without a labor rate, "largest movement" still ranks a raw hours count against raw dollars', () => {
  // Documents the pre-existing behavior the labor-rate field is meant to fix:
  // with no rate to convert hours to dollars, the ranking falls back to
  // comparing the numbers as typed, so a 20-hour overrun loses to a $50
  // materials swing purely because 20 < 50, not because it is cheaper.
  const result = calculate({
    estimatedHours: 10,
    actualHours: 30,
    estimatedMaterials: 500,
    actualMaterials: 550,
    estimatedOther: 0,
    actualOther: 0,
  });
  assert.equal(result.laborVariance, 20);
  assert.equal(result.costVariance, 50);
  assert.equal(result.largest.label, 'Materials');
});

test('a labor rate converts the hours row to dollars so "largest movement" compares like units', () => {
  // Same inputs as above plus a $75/hr rate: the 20-hour labor overrun is
  // actually $1,500, which dwarfs the $50 materials swing. The ranking now
  // reflects that instead of comparing "20" to "50" as bare numbers.
  const result = calculate({
    estimatedHours: 10,
    actualHours: 30,
    estimatedMaterials: 500,
    actualMaterials: 550,
    estimatedOther: 0,
    actualOther: 0,
    hourlyRate: 75,
  });
  assert.equal(result.laborCostVariance, 1500);
  assert.equal(result.largest.label, 'Labor hours');
  assert.equal(result.largest.variance, 20);
  assert.equal(result.largest.unit, 'hours');
  assert.equal(result.totalEstimatedCost, 1250);
  assert.equal(result.totalActualCost, 2800);
  assert.equal(result.totalCostVariance, 1550);
});

test('a blank labor rate leaves every result identical to the original six-field worksheet', () => {
  const base = {
    estimatedHours: 16, actualHours: 20,
    estimatedMaterials: 420, actualMaterials: 465,
    estimatedOther: 80, actualOther: 95,
  };
  const withoutRate = calculate(base);
  const withBlankRate = calculate({ ...base, hourlyRate: '' });
  assert.deepEqual(withBlankRate, withoutRate);
});

test('a job price without a labor rate is rejected rather than silently ignored', () => {
  assert.throws(
    () => calculate({
      estimatedHours: 10, actualHours: 10,
      estimatedMaterials: 100, actualMaterials: 100,
      estimatedOther: 0, actualOther: 0,
      bidPrice: 1000,
    }),
    /labor rate is needed/,
  );
});

test('a job price and labor rate compute estimated vs actual margin', () => {
  const result = calculate({
    estimatedHours: 16, actualHours: 20,
    estimatedMaterials: 420, actualMaterials: 465,
    estimatedOther: 80, actualOther: 95,
    hourlyRate: 50,
    bidPrice: 2000,
  });
  // Estimated cost: 16*50 + 420 + 80 = 1300 -> profit 700 -> margin 35%
  // Actual cost: 20*50 + 465 + 95 = 1560 -> profit 440 -> margin 22%
  assert.equal(result.margin.estimatedMarginPct, 35);
  assert.ok(Math.abs(result.margin.actualMarginPct - 22) < 1e-9);
  assert.ok(Math.abs(result.margin.marginPointsVariance - -13) < 1e-9);
  assert.equal(result.margin.profitVariance, -260);
  assert.match(reportText(result), /Margin change: -13\.00 points, -\$260\.00 profit/);
});

test('a non-positive job price is rejected', () => {
  assert.throws(
    () => calculate({
      estimatedHours: 10, actualHours: 10,
      estimatedMaterials: 100, actualMaterials: 100,
      estimatedOther: 0, actualOther: 0,
      hourlyRate: 40,
      bidPrice: 0,
    }),
    /greater than zero/,
  );
});

test('usage is aggregate, local, and opt-out', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  recordUsage(storage, false);
  recordUsage(storage, true);
  assert.deepEqual(JSON.parse(data.get('job-margin-variance-usage')), { report_generated: 1 });
});

test('usage stays off when Do Not Track is set', () => {
  const data = new Map();
  const storage = {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => data.set(key, value),
  };
  recordUsage(storage, false, { doNotTrack: '1' });
  assert.equal(data.get('job-margin-variance-usage'), undefined);
});
