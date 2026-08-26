import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRoute, summary } from './calc.mjs';

test('includes paid wait after the grace period in labor cost', () => {
  const result = calculateRoute({ stops: 6, miles: 35, routeHours: 2.5, waitMinutes: 45, graceMinutes: 15, loadedLaborRate: 28, vehicleCostPerMile: .72, consumablePerStop: 1.5, overheadRate: 10, revenue: 300 });
  assert.equal(result.billableWaitMinutes, 30);
  assert.equal(result.labor, 84);
  assert.equal(result.margin, 151.8);
});

test('surfaces a loss rather than disguising it as a route recommendation', () => {
  const result = calculateRoute({ stops: 4, miles: 80, routeHours: 5, waitMinutes: 0, graceMinutes: 15, loadedLaborRate: 30, vehicleCostPerMile: 1, consumablePerStop: 2, overheadRate: 10, revenue: 200 });
  assert.equal(result.margin, -58);
  assert.match(summary(result), /negative contribution margin/);
});

test('empty or invalid inputs do not produce NaN', () => {
  const result = calculateRoute({ revenue: 'nope', miles: -4 });
  assert.equal(result.directCost, 0);
  assert.equal(result.margin, 0);
});
