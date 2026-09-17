import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateSession } from './calc.mjs';

const session = () => ({
  grossPay: 180,
  milesDriven: 90,
  hoursActive: 6,
  mpg: 28,
  gasPrice: 3.5,
  maintenancePerMile: 0.06,
  insuranceMonthly: 140,
  otherFixedMonthly: 20,
  monthlyMiles: 1200,
  taxReservePercent: 0,
});

function close(actual, expected, digits = 9) {
  assert.ok(
    Math.abs(actual - expected) < 10 ** -digits,
    `expected ${expected}, got ${actual}`,
  );
}

test('fuel, maintenance, and the prorated share of monthly fixed cost add up to vehicle cost', () => {
  const result = calculateSession(session());
  close(result.fuelCostPerMile, 3.5 / 28);
  close(result.variableCostPerMile, 3.5 / 28 + 0.06);
  close(result.variableCost, 90 * (3.5 / 28 + 0.06));
  assert.equal(result.monthlyFixed, 160);
  close(result.fixedCostPerMile, 160 / 1200);
  close(result.fixedCost, 90 * (160 / 1200));
  close(result.vehicleCost, result.variableCost + result.fixedCost);
  close(result.allInCostPerMile, result.variableCostPerMile + result.fixedCostPerMile);
});

test('gross pay looks fine on its own; net pay is what is left after the car', () => {
  const result = calculateSession(session());
  close(result.grossPerHour, 180 / 6);
  assert.ok(result.netPerHour < result.grossPerHour, 'vehicle cost must lower the per-hour figure');
  close(result.netProfit, result.grossPay - result.vehicleCost);
  close(result.netPerMile, result.netProfit / 90);
  close(result.netPerHour, result.netProfit / 6);
});

test('zero miles allocates no fixed cost to this session and reports no per-mile figures', () => {
  const result = calculateSession({ ...session(), milesDriven: 0 });
  assert.equal(result.variableCost, 0);
  assert.equal(result.fixedCost, 0);
  assert.equal(result.vehicleCost, 0);
  assert.equal(result.grossPerMile, null);
  assert.equal(result.netPerMile, null);
  assert.equal(result.takeHomePerMile, null);
  close(result.netProfit, result.grossPay);
});

test('zero hours reports no per-hour figures but still costs the miles', () => {
  const result = calculateSession({ ...session(), hoursActive: 0 });
  assert.equal(result.grossPerHour, null);
  assert.equal(result.netPerHour, null);
  assert.equal(result.takeHomePerHour, null);
  assert.ok(result.vehicleCost > 0);
});

test('no tax reserve set leaves take-home equal to net profit', () => {
  const result = calculateSession(session());
  assert.equal(result.taxReservePercent, 0);
  assert.equal(result.taxReserve, 0);
  close(result.takeHome, result.netProfit);
  close(result.takeHomePerHour, result.netPerHour);
  close(result.takeHomePerMile, result.netPerMile);
});

test('the tax reserve comes out of profit, not out of gross pay or vehicle cost', () => {
  const base = calculateSession(session());
  const reserved = calculateSession({ ...session(), taxReservePercent: 25 });
  assert.ok(base.netProfit > 0, 'fixture must be a profitable session');
  close(reserved.vehicleCost, base.vehicleCost);
  close(reserved.netProfit, base.netProfit);
  close(reserved.taxReserve, base.netProfit * 0.25);
  close(reserved.takeHome, base.netProfit * 0.75);
});

test('a losing session reserves nothing and does not invent a refund', () => {
  const result = calculateSession({ ...session(), grossPay: 10, taxReservePercent: 30 });
  assert.ok(result.netProfit < 0);
  assert.equal(result.taxReserve, 0);
  close(result.takeHome, result.netProfit);
});

test('a tax reserve of 100% or more is refused rather than dividing by zero', () => {
  assert.throws(() => calculateSession({ ...session(), taxReservePercent: 100 }), /less than 100/);
  assert.throws(() => calculateSession({ ...session(), taxReservePercent: 150 }), /less than 100/);
  assert.throws(() => calculateSession({ ...session(), taxReservePercent: -1 }), /at least 0/);
});

test('no comparison wage means no comparison', () => {
  assert.equal(calculateSession({ ...session(), comparisonHourlyWage: '' }).comparison, null);
  assert.equal(calculateSession({ ...session(), comparisonHourlyWage: null }).comparison, null);
  assert.equal(calculateSession(session()).comparison, null);
});

test('the comparison reports the gap before income tax, on the same basis as the wage', () => {
  const result = calculateSession({ ...session(), comparisonHourlyWage: 16 });
  close(result.comparison.gapPerHour, result.netPerHour - 16);
  assert.equal(result.comparison.clears, result.netPerHour >= 16);
});

test('a session that nets less than the comparison wage does not clear it', () => {
  const result = calculateSession({ ...session(), grossPay: 60, comparisonHourlyWage: 16 });
  assert.ok(result.netPerHour < 16);
  assert.equal(result.comparison.clears, false);
  assert.ok(result.comparison.gapPerHour < 0);
});

test('no target take-home means no target result', () => {
  assert.equal(calculateSession(session()).target, null);
  assert.equal(calculateSession({ ...session(), targetHourlyTakeHome: '' }).target, null);
});

test('target take-home solves for the gross pay that reaches it, grossed up through the reserve', () => {
  const result = calculateSession({ ...session(), targetHourlyTakeHome: 20, taxReservePercent: 25 });
  const neededProfit = (20 * 6) / 0.75;
  close(result.target.grossPayNeeded, result.vehicleCost + neededProfit);
  close(result.target.grossPerHourNeeded, result.target.grossPayNeeded / 6);
  close(result.target.grossPerMileNeeded, result.target.grossPayNeeded / 90);

  const atTarget = calculateSession({
    ...session(),
    grossPay: result.target.grossPayNeeded,
    targetHourlyTakeHome: 20,
    taxReservePercent: 25,
  });
  close(atTarget.takeHomePerHour, 20);
});

test('target take-home is unavailable with zero hours logged', () => {
  const result = calculateSession({ ...session(), hoursActive: 0, targetHourlyTakeHome: 20 });
  assert.equal(result.target, null);
});

test('target gross pay never goes negative when vehicle cost alone would overshoot a tiny target', () => {
  const result = calculateSession({ ...session(), targetHourlyTakeHome: 0.01, taxReservePercent: 90 });
  assert.ok(result.target.grossPayNeeded >= 0);
});

test('inputs that would silently produce a nonsense session are rejected', () => {
  assert.throws(() => calculateSession({ ...session(), mpg: 0 }), /Miles per gallon must be greater than zero/);
  assert.throws(() => calculateSession({ ...session(), monthlyMiles: 0 }), /Monthly miles must be greater than zero/);
  assert.throws(() => calculateSession({ ...session(), milesDriven: -1 }), /Miles driven must be at least 0/);
  assert.throws(() => calculateSession({ ...session(), gasPrice: 'abc' }), /Gas price must be a number/);
  assert.throws(() => calculateSession({ ...session(), insuranceMonthly: -1 }), /Insurance must be at least 0/);
});

test('more deadhead-style miles for the same gross pay lowers net per mile and net per hour', () => {
  const fewerMiles = calculateSession({ ...session(), milesDriven: 60 });
  const moreMiles = calculateSession({ ...session(), milesDriven: 120 });
  assert.ok(moreMiles.vehicleCost > fewerMiles.vehicleCost);
  assert.ok(moreMiles.netProfit < fewerMiles.netProfit);
  assert.ok(moreMiles.netPerHour < fewerMiles.netPerHour);
});
