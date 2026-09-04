import test from 'node:test';
import assert from 'node:assert/strict';
import { parseInputs, reconcile, reviewItems, reviewRecord, summary } from './calc.mjs';

test('models tenant share and billed variance', () => {
  const parsed = parseInputs({ annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '10000', credits: '500' });
  assert.equal(parsed.ok, true);
  const result = reconcile(parsed.values);
  assert.equal(result.share, 0.1);
  assert.equal(result.modeledShare, 12000);
  assert.equal(result.netBilled, 9500);
  assert.equal(result.variance, 2500);
  assert.equal(result.monthlyVariance, 2500 / 12);
  assert.match(reviewItems(result).at(-1), /above net billed/);
  assert.match(summary(result), /Tenant area share: 10.00%/);
  assert.match(summary(result), /not a lease interpretation/);
});

test('rejects zero rentable area and tenant area above the building', () => {
  assert.equal(parseInputs({ annualExpenses: '5', rentableArea: '0', tenantArea: '1', billedAmount: '2', credits: '0' }).ok, false);
  assert.equal(parseInputs({ annualExpenses: '5', rentableArea: '10', tenantArea: '11', billedAmount: '2', credits: '0' }).ok, false);
});

test('blank gross-up fields are a complete no-op through parseInputs', () => {
  const parsed = parseInputs({ annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '10000', credits: '500' });
  assert.equal(parsed.ok, true);
  assert.deepEqual(
    { variablePercent: parsed.values.variablePercent, actualOccupancyPercent: parsed.values.actualOccupancyPercent, targetOccupancyPercent: parsed.values.targetOccupancyPercent },
    { variablePercent: 0, actualOccupancyPercent: 100, targetOccupancyPercent: 100 },
  );
  const result = reconcile(parsed.values);
  assert.equal(result.grossUpApplied, false);
  assert.equal(result.modeledShare, 12000);
});

test('gross-up raises the variable share of expenses when actual occupancy trails the lease target', () => {
  const parsed = parseInputs({
    annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '10000', credits: '500',
    variablePercent: '40', actualOccupancyPercent: '80', targetOccupancyPercent: '95',
  });
  assert.equal(parsed.ok, true);
  const result = reconcile(parsed.values);
  // variable = 120000 * 0.40 = 48000, fixed = 72000
  // factor = 95 / 80 = 1.1875, grossed-up variable = 48000 * 1.1875 = 57000
  // effective expenses = 72000 + 57000 = 129000, adjustment = +9000
  assert.equal(result.variableExpenses, 48000);
  assert.equal(result.fixedExpenses, 72000);
  assert.ok(Math.abs(result.grossUpFactor - 1.1875) < 1e-9);
  assert.ok(Math.abs(result.effectiveExpenses - 129000) < 1e-6);
  assert.ok(Math.abs(result.grossUpAdjustment - 9000) < 1e-6);
  assert.equal(result.grossUpApplied, true);
  // modeled share = 129000 * 0.1 = 12900, variance = 12900 - 9500
  assert.ok(Math.abs(result.modeledShare - 12900) < 1e-6);
  assert.ok(Math.abs(result.variance - 3400) < 1e-6);
  assert.match(reviewItems(result).join('\n'), /gross-up/i);
  assert.match(summary(result), /Gross-up applied/);
  assert.equal(reviewRecord(result).grossUp.applied, true);
  assert.ok(Math.abs(reviewRecord(result).grossUp.adjustment - 9000) < 1e-6);
});

test('gross-up never fires, and never shrinks the pool, once actual occupancy already meets the target', () => {
  const parsed = parseInputs({
    annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '10000', credits: '500',
    variablePercent: '40', actualOccupancyPercent: '100', targetOccupancyPercent: '95',
  });
  assert.equal(parsed.ok, true);
  const result = reconcile(parsed.values);
  assert.equal(result.grossUpFactor, 1);
  assert.equal(result.grossUpApplied, false);
  assert.equal(result.effectiveExpenses, 120000);
  assert.equal(result.modeledShare, 12000);
});

test('rejects gross-up fields outside their valid ranges', () => {
  const base = { annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '10000', credits: '500' };
  assert.equal(parseInputs({ ...base, variablePercent: '101' }).ok, false);
  assert.equal(parseInputs({ ...base, variablePercent: '-1' }).ok, false);
  assert.equal(parseInputs({ ...base, actualOccupancyPercent: '0' }).ok, false);
  assert.equal(parseInputs({ ...base, actualOccupancyPercent: '150' }).ok, false);
  assert.equal(parseInputs({ ...base, targetOccupancyPercent: '0' }).ok, false);
});
