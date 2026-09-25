import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateWaterfall } from './calc.mjs';

test('the default worked example: negative net churn masking real gross churn', () => {
  const r = calculateWaterfall({
    startingMrr: 10000,
    newMrr: 1200,
    expansionMrr: 1500,
    reactivationMrr: 100,
    contractionMrr: 400,
    churnedMrr: 600,
  });
  assert.equal(r.netNewMrr, 1800);
  assert.equal(r.endingMrr, 11800);
  assert.equal(r.grossChurnRate, 6);
  assert.equal(r.netChurnRate, -6);
  assert.equal(r.grossRevenueRetention, 90);
  assert.equal(r.netRevenueRetention, 106);
  assert.equal(r.quickRatio, 2.8);
});

test('net revenue retention and net churn rate are always complementary (sum to 100)', () => {
  const cases = [
    { startingMrr: 10000, newMrr: 1200, expansionMrr: 1500, reactivationMrr: 100, contractionMrr: 400, churnedMrr: 600 },
    { startingMrr: 5000, newMrr: 0, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 200, churnedMrr: 300 },
    { startingMrr: 2500, newMrr: 900, expansionMrr: 50, reactivationMrr: 0, contractionMrr: 0, churnedMrr: 0 },
  ];
  for (const input of cases) {
    const r = calculateWaterfall(input);
    assert.equal(Math.round((r.netRevenueRetention + r.netChurnRate) * 1e8) / 1e8, 100);
  }
});

test('gross revenue retention never counts new, expansion, or reactivation', () => {
  const withGrowth = calculateWaterfall({
    startingMrr: 10000, newMrr: 5000, expansionMrr: 5000, reactivationMrr: 5000, contractionMrr: 400, churnedMrr: 600,
  });
  const withoutGrowth = calculateWaterfall({
    startingMrr: 10000, newMrr: 0, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 400, churnedMrr: 600,
  });
  assert.equal(withGrowth.grossRevenueRetention, withoutGrowth.grossRevenueRetention);
  assert.equal(withGrowth.grossRevenueRetention, 90);
});

test('gross revenue retention is capped at 100% even with zero churn and contraction', () => {
  const r = calculateWaterfall({
    startingMrr: 10000, newMrr: 500, expansionMrr: 500, reactivationMrr: 0, contractionMrr: 0, churnedMrr: 0,
  });
  assert.equal(r.grossRevenueRetention, 100);
  assert.equal(r.netRevenueRetention, 105);
});

test('a starting MRR of zero reports 100% retention rather than dividing by zero', () => {
  const r = calculateWaterfall({
    startingMrr: 0, newMrr: 500, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 0, churnedMrr: 0,
  });
  assert.equal(r.grossRevenueRetention, 100);
  assert.equal(r.netRevenueRetention, 100);
  assert.equal(r.grossChurnRate, 0);
  assert.equal(r.netChurnRate, 0);
  assert.equal(r.endingMrr, 500);
});

test('quick ratio is Infinity with growth and no loss, and null with neither', () => {
  const allGrowth = calculateWaterfall({
    startingMrr: 10000, newMrr: 500, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 0, churnedMrr: 0,
  });
  assert.equal(allGrowth.quickRatio, Infinity);

  const flat = calculateWaterfall({
    startingMrr: 10000, newMrr: 0, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 0, churnedMrr: 0,
  });
  assert.equal(flat.quickRatio, null);
  assert.equal(flat.endingMrr, 10000);
});

test('quick ratio below 1 flags more MRR lost than won', () => {
  const r = calculateWaterfall({
    startingMrr: 10000, newMrr: 100, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 300, churnedMrr: 700,
  });
  assert.equal(r.quickRatio, 0.1);
  assert.ok(r.quickRatio < 1);
});

test('rejects a negative input rather than silently taking its absolute value', () => {
  assert.throws(
    () => calculateWaterfall({ startingMrr: -1, newMrr: 0, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 0, churnedMrr: 0 }),
    /Starting MRR must be a non-negative number/,
  );
  assert.throws(
    () => calculateWaterfall({ startingMrr: 10000, newMrr: 0, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 0, churnedMrr: -5 }),
    /Churned MRR must be a non-negative number/,
  );
});

test('rejects a non-numeric input', () => {
  assert.throws(
    () => calculateWaterfall({ startingMrr: 'a lot', newMrr: 0, expansionMrr: 0, reactivationMrr: 0, contractionMrr: 0, churnedMrr: 0 }),
    /Starting MRR must be a non-negative number/,
  );
});
