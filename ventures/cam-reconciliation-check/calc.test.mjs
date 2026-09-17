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

test('a perfectly reconciled statement prints as break-even, not as a tiny loss', () => {
  // A landlord who bills the tenant to the exact cent of the modeled share
  // (the honest, common case) leaves `variance` as a sub-cent floating-point
  // residual rather than exactly 0 -- `share = tenantArea / rentableArea` is
  // rarely a terminating decimal. `summary()` must round that residual away
  // before printing a sign, or a perfect reconciliation reads as "you are
  // down money" (`(-0.002).toFixed(2)` is the literal string "-0.00").
  const annualExpenses = 187654.32;
  const rentableArea = 45000;
  const tenantArea = 1850;
  const modeledShare = annualExpenses * (tenantArea / rentableArea);
  const billedAmount = Math.round(modeledShare * 100) / 100; // billed to the cent
  const result = reconcile({ annualExpenses, rentableArea, tenantArea, billedAmount, credits: 0 });
  // The floating-point residual is real and non-zero -- this is the
  // regression fixture, not a tautology.
  assert.notEqual(result.variance, 0);
  assert.ok(Math.abs(result.variance) < 0.01, 'fixture must be a sub-cent residual');
  const text = summary(result);
  assert.match(text, /Variance \(modeled less billed\): \$0\.00/);
  assert.doesNotMatch(text, /\$-0\.00/);
  assert.match(text, /Monthly equivalent: \$0\.00/);
});

test('a genuine shortfall still prints its real negative sign', () => {
  // The fix must not swallow every negative -- only ones that round to zero
  // cents. A visitor actually owed money still needs to see "-$" and the
  // checklist wording that goes with it.
  const parsed = parseInputs({ annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '12500', credits: '0' });
  const result = reconcile(parsed.values);
  assert.equal(result.variance, -500);
  // Sign outside the currency symbol, per platform/ci/check_money_sign.py:
  // "-$500.00", never "$-500.00".
  assert.match(summary(result), /Variance \(modeled less billed\): -\$500\.00/);
  assert.doesNotMatch(summary(result), /\$-/);
  assert.match(reviewItems(result).at(-1), /Net billed is above the modeled share/);
});

test('rejects gross-up fields outside their valid ranges', () => {
  const base = { annualExpenses: '120000', rentableArea: '10000', tenantArea: '1000', billedAmount: '10000', credits: '500' };
  assert.equal(parseInputs({ ...base, variablePercent: '101' }).ok, false);
  assert.equal(parseInputs({ ...base, variablePercent: '-1' }).ok, false);
  assert.equal(parseInputs({ ...base, actualOccupancyPercent: '0' }).ok, false);
  assert.equal(parseInputs({ ...base, actualOccupancyPercent: '150' }).ok, false);
  assert.equal(parseInputs({ ...base, targetOccupancyPercent: '0' }).ok, false);
});
