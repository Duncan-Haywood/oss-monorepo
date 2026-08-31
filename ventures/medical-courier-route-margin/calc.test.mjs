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

// The scenario the page ships with and the guide page works through.
const DEFAULTS = { stops: 6, miles: 35, routeHours: 2.5, waitMinutes: 45, graceMinutes: 15, loadedLaborRate: 28, vehicleCostPerMile: .72, consumablePerStop: 1.5, overheadRate: 10, revenue: 300 };

test('the fields added for quoting are neutral at their defaults', () => {
  // Nothing in is-this-medical-courier-route-worth-it.html may move: it states
  // $84.00 labor, $25.20 vehicle, $9.00 consumables, $30.00 overhead,
  // $148.20 direct cost and $151.80 margin at exactly these inputs.
  const result = calculateRoute({ ...DEFAULTS, deadheadMiles: 0, deadheadMinutes: 0 });
  assert.equal(result.labor, 84);
  assert.equal(result.vehicle, 25.2);
  assert.equal(result.directCost, 148.2);
  assert.equal(result.margin, 151.8);
  assert.equal(result.deadheadCost, 0);
});

test('deadhead burns the same fuel and the same hours as the route', () => {
  const result = calculateRoute({ ...DEFAULTS, deadheadMiles: 40, deadheadMinutes: 70 });
  assert.equal(result.totalMiles, 75);
  assert.equal(result.hours, 3 + 70 / 60, 'deadhead minutes occupy the vehicle');
  assert.equal(Number(result.deadheadCost.toFixed(2)), 61.47);
  assert.equal(Number(result.margin.toFixed(2)), 90.33, '40% of the margin was in the unpaid drive');
});

test('break-even solves the fixed point, not the sum of costs', () => {
  const result = calculateRoute(DEFAULTS);
  // Labor + vehicle + consumables is $118.20, but overhead is a share of
  // revenue, so the price has to carry overhead on itself.
  assert.equal(Number(result.breakEvenRevenue.toFixed(2)), 131.33);
  assert.equal(Number(result.breakEvenPerStop.toFixed(2)), 21.89);
  const check = calculateRoute({ ...DEFAULTS, revenue: result.breakEvenRevenue });
  assert.ok(Math.abs(check.margin) < 1e-9, `charging break-even should land on zero margin, got ${check.margin}`);
});

test('the target-margin quote actually delivers the target margin', () => {
  const result = calculateRoute({ ...DEFAULTS, targetMarginRate: 20 });
  assert.equal(Number(result.targetPerStop.toFixed(2)), 28.14);
  const check = calculateRoute({ ...DEFAULTS, revenue: result.targetRevenue });
  assert.equal(Number(check.marginRate.toFixed(6)), 20);
});

test('a target the price cannot carry reports nothing rather than a number', () => {
  // 85% overhead plus a 20% target claims 105% of the price.
  const result = calculateRoute({ ...DEFAULTS, overheadRate: 85, targetMarginRate: 20 });
  assert.equal(result.targetRevenue, null);
  assert.equal(result.targetPerStop, null);
  assert.ok(result.breakEvenRevenue > 0, 'break-even alone is still reachable at 85% overhead');
});

test('break-even cost per mile says how far fuel can move', () => {
  const result = calculateRoute(DEFAULTS);
  assert.equal(Number(result.breakEvenCostPerMile.toFixed(2)), 5.06);
  const check = calculateRoute({ ...DEFAULTS, vehicleCostPerMile: result.breakEvenCostPerMile });
  assert.ok(Math.abs(check.margin) < 1e-9, `driving at break-even cost should land on zero margin, got ${check.margin}`);

  // A route that loses money at a vehicle cost of nothing is a pricing
  // problem; floor it at zero rather than reporting a negative cost per mile.
  const underwater = calculateRoute({ ...DEFAULTS, revenue: 60 });
  assert.equal(underwater.breakEvenCostPerMile, 0);
});

test('the copied summary carries the quote, and mentions deadhead only when there is some', () => {
  assert.doesNotMatch(summary(calculateRoute(DEFAULTS)), /Deadhead included/);
  const text = summary(calculateRoute({ ...DEFAULTS, deadheadMiles: 40, deadheadMinutes: 70, targetMarginRate: 20 }), 'STAT');
  assert.match(text, /Break-even: \$199\.63 for the route \(\$33\.27\/stop\)/);
  assert.match(text, /For 20% margin: \$256\.67 for the route \(\$42\.78\/stop\)/);
  assert.match(text, /Deadhead included: 40 mi \/ 70 min, costing \$61\.47/);
});
