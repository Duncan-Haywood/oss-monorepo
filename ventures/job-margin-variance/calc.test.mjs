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
