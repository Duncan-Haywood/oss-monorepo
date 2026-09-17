import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSplit, allocateCents, resolvePoolTotalCents, DEFAULTS } from './calc.mjs';

function sumTenantCents(result) {
  return result.tenants.reduce((s, t) => s + t.totalCents, 0);
}

test('allocateCents splits $1000 three equal ways with no cent unaccounted for', () => {
  const cents = allocateCents(100000, [1 / 3, 1 / 3, 1 / 3]);
  assert.deepEqual(cents.reduce((a, b) => a + b, 0), 100000);
  // 33333.33... rounds to 33333 for each -- one of the three must pick up
  // the leftover cent.
  assert.deepEqual([...cents].sort((a, b) => a - b), [33333, 33333, 33334]);
});

test('allocateCents handles an uneven weighted split exactly', () => {
  const cents = allocateCents(9999, [0.5, 0.3, 0.2]);
  assert.equal(cents.reduce((a, b) => a + b, 0), 9999);
});

test('allocateCents handles a negative total (base fees exceeding the pool)', () => {
  const cents = allocateCents(-1001, [1 / 3, 1 / 3, 1 / 3]);
  assert.equal(cents.reduce((a, b) => a + b, 0), -1001);
});

test('allocateCents on zero total gives every tenant zero', () => {
  const cents = allocateCents(0, [0.5, 0.5]);
  assert.deepEqual(cents, [0, 0]);
});

test('allocateCents on an empty weight list returns an empty array', () => {
  assert.deepEqual(allocateCents(500, []), []);
});

test('resolvePoolTotalCents sums itemized cost rows in cents', () => {
  const cents = resolvePoolTotalCents({ costItems: [{ label: 'Rent', amount: 100.1 }, { label: 'Trash', amount: 20.05 }] });
  assert.equal(cents, 12015);
});

test('resolvePoolTotalCents ignores itemized rows and uses a manual override total when one is given', () => {
  const cents = resolvePoolTotalCents({
    costItems: [{ label: 'Rent', amount: 3000 }],
    manualPoolTotal: 5000,
  });
  assert.equal(cents, 500000);
});

test('resolvePoolTotalCents drops blank-labeled cost rows', () => {
  const cents = resolvePoolTotalCents({ costItems: [{ label: '', amount: 999 }, { label: 'Rent', amount: 100 }] });
  assert.equal(cents, 10000);
});

test('computeSplit: DEFAULTS produce a result whose tenant totals sum exactly to the pool total', () => {
  const result = computeSplit(DEFAULTS);
  assert.equal(sumTenantCents(result), result.poolTotalCents);
  assert.equal(result.total, result.poolTotal);
});

test('computeSplit: hours split gives a tenant with 0 hours and 0 storage only their base fee', () => {
  const result = computeSplit({
    manualPoolTotal: 900,
    splitMethod: 'hours',
    tenants: [
      { name: 'A', hoursBooked: 30, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
      { name: 'B', hoursBooked: 0, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 50 },
    ],
  });
  const b = result.tenants.find((t) => t.name === 'B');
  assert.equal(b.proportionalShare, 0);
  assert.equal(b.total, 50);
  assert.equal(sumTenantCents(result), result.poolTotalCents);
});

test('computeSplit: storage split gives a tenant with 0 storage units only their base fee', () => {
  const result = computeSplit({
    manualPoolTotal: 600,
    splitMethod: 'storage',
    tenants: [
      { name: 'A', hoursBooked: 10, dryStorageUnits: 3, refrigeratedUnits: 1, freezerUnits: 0, baseFee: 0 },
      { name: 'B', hoursBooked: 10, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
    ],
  });
  const b = result.tenants.find((t) => t.name === 'B');
  assert.equal(b.proportionalShare, 0);
  assert.equal(sumTenantCents(result), result.poolTotalCents);
});

test('computeSplit: identical usage across all tenants produces an equal split under hours, storage, and blend', () => {
  const tenants = [
    { name: 'A', hoursBooked: 20, dryStorageUnits: 1, refrigeratedUnits: 1, freezerUnits: 1, baseFee: 0 },
    { name: 'B', hoursBooked: 20, dryStorageUnits: 1, refrigeratedUnits: 1, freezerUnits: 1, baseFee: 0 },
    { name: 'C', hoursBooked: 20, dryStorageUnits: 1, refrigeratedUnits: 1, freezerUnits: 1, baseFee: 0 },
  ];
  for (const splitMethod of ['hours', 'storage', 'blend']) {
    const result = computeSplit({ manualPoolTotal: 300, splitMethod, tenants, blendWeights: { hours: 0.7, storage: 0.3 } });
    const totals = result.tenants.map((t) => t.total).sort((a, b) => a - b);
    assert.deepEqual(totals, [100, 100, 100]);
  }
});

test('computeSplit: equal split ignores usage entirely, even when usage is wildly uneven', () => {
  const result = computeSplit({
    manualPoolTotal: 300,
    splitMethod: 'equal',
    tenants: [
      { name: 'Heavy', hoursBooked: 100, dryStorageUnits: 10, refrigeratedUnits: 5, freezerUnits: 5, baseFee: 0 },
      { name: 'Light', hoursBooked: 1, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
      { name: 'None', hoursBooked: 0, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
    ],
  });
  const totals = result.tenants.map((t) => t.total).sort((a, b) => a - b);
  assert.deepEqual(totals, [100, 100, 100]);
});

test('computeSplit: a single tenant gets the whole remaining pool', () => {
  const result = computeSplit({
    manualPoolTotal: 500,
    splitMethod: 'hours',
    tenants: [{ name: 'Solo', hoursBooked: 10, dryStorageUnits: 1, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 40 }],
  });
  assert.equal(result.tenants.length, 1);
  assert.equal(result.tenants[0].total, 500);
});

test('computeSplit: a zero total pool with no base fees gives every tenant $0', () => {
  const result = computeSplit({
    manualPoolTotal: 0,
    splitMethod: 'blend',
    tenants: [
      { name: 'A', hoursBooked: 10, dryStorageUnits: 1, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
      { name: 'B', hoursBooked: 5, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
    ],
  });
  assert.deepEqual(result.tenants.map((t) => t.total), [0, 0]);
  assert.equal(result.total, 0);
});

test('computeSplit: base fees that exceed the pool total still sum exactly, with a negative proportional share', () => {
  const result = computeSplit({
    manualPoolTotal: 100,
    splitMethod: 'equal',
    tenants: [
      { name: 'A', hoursBooked: 10, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 80 },
      { name: 'B', hoursBooked: 10, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 80 },
    ],
  });
  assert.ok(result.remainingPool < 0);
  assert.equal(sumTenantCents(result), result.poolTotalCents);
  assert.equal(result.total, 100);
});

test('computeSplit: dividing $1000 three ways by equal split produces a recurring decimal that still sums exactly', () => {
  const result = computeSplit({
    manualPoolTotal: 1000,
    splitMethod: 'equal',
    tenants: [
      { name: 'A', hoursBooked: 1, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
      { name: 'B', hoursBooked: 1, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
      { name: 'C', hoursBooked: 1, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
    ],
  });
  assert.equal(sumTenantCents(result), 100000);
  const totals = result.tenants.map((t) => t.total).sort((a, b) => a - b);
  assert.deepEqual(totals, [333.33, 333.33, 333.34]);
});

test('computeSplit: the default 70/30 blend weights favor hours over storage', () => {
  const result = computeSplit({
    manualPoolTotal: 1000,
    splitMethod: 'blend',
    blendWeights: { hours: 0.7, storage: 0.3 },
    tenants: [
      { name: 'MostlyHours', hoursBooked: 100, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
      { name: 'MostlyStorage', hoursBooked: 0, dryStorageUnits: 10, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 },
    ],
  });
  const hoursTenant = result.tenants.find((t) => t.name === 'MostlyHours');
  const storageTenant = result.tenants.find((t) => t.name === 'MostlyStorage');
  assert.equal(hoursTenant.total, 700);
  assert.equal(storageTenant.total, 300);
});

test('computeSplit rejects a negative hours value', () => {
  assert.throws(() => computeSplit({
    manualPoolTotal: 100,
    splitMethod: 'hours',
    tenants: [{ name: 'A', hoursBooked: -5, dryStorageUnits: 0, refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 }],
  }), /hours booked must be zero or greater/);
});

test('computeSplit rejects a non-numeric storage value', () => {
  assert.throws(() => computeSplit({
    manualPoolTotal: 100,
    splitMethod: 'storage',
    tenants: [{ name: 'A', hoursBooked: 5, dryStorageUnits: 'lots', refrigeratedUnits: 0, freezerUnits: 0, baseFee: 0 }],
  }), /dry storage units must be a number/);
});

test('computeSplit rejects an empty tenant list', () => {
  assert.throws(() => computeSplit({ manualPoolTotal: 100, splitMethod: 'equal', tenants: [] }), /at least one tenant/);
});

test('computeSplit rejects an unknown split method', () => {
  assert.throws(() => computeSplit({ manualPoolTotal: 100, splitMethod: 'random', tenants: DEFAULTS.tenants }), /Unknown split method/);
});

test('computeSplit rejects a negative manual pool total', () => {
  assert.throws(() => computeSplit({ manualPoolTotal: -50, splitMethod: 'equal', tenants: DEFAULTS.tenants }), /zero or greater/);
});
