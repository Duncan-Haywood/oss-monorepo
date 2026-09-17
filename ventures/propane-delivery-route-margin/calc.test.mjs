import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, incomeGap, DEFAULTS } from './calc.mjs';

function close(actual, expected, eps = 0.01) {
  assert.ok(Math.abs(actual - expected) < eps, `expected ${actual} to be close to ${expected}`);
}

test('calculate() matches hand-computed arithmetic on the default inputs', () => {
  const r = calculate(DEFAULTS);
  const deliveries = DEFAULTS.annualGallons / DEFAULTS.avgGallonsPerFill;
  close(r.deliveriesPerYear, deliveries);
  close(r.marginPerGallon, 0.94);
  close(r.fuelMarginRevenue, DEFAULTS.annualGallons * 0.94);
  assert.equal(r.minimumFeeApplies, false, 'the default fill (150 gal) is above the 100 gal minimum');
  close(r.minimumFeeRevenue, 0);
  close(r.mileageCost, DEFAULTS.milesPerDelivery * DEFAULTS.truckCostPerMile * deliveries);
  close(r.laborHours, (DEFAULTS.stopMinutes + DEFAULTS.driveMinutesPerDelivery) * deliveries / 60);
  close(r.tankCost, DEFAULTS.tankRentalMonthlyCost * 12);
  close(r.hazmatCost, DEFAULTS.hazmatComplianceMonthlyCost * 12);
  close(r.netProfitAnnual, 489.03, 0.02);
  close(r.netProfit, 489.03 / 12, 0.01);
  assert.ok(r.netProfitAnnual > 0, 'the default customer should be profitable');
});

test('a customer with zero annual gallons still pays tank rental and hazmat cost', () => {
  const r = calculate({ ...DEFAULTS, annualGallons: 0 });
  assert.equal(r.fuelMarginRevenue, 0);
  assert.equal(r.mileageCost, 0);
  assert.equal(r.laborCost, 0);
  close(r.annualCost, DEFAULTS.tankRentalMonthlyCost * 12 + DEFAULTS.hazmatComplianceMonthlyCost * 12);
  assert.ok(r.netProfitAnnual < 0, 'fixed monthly costs still apply with zero gallons delivered');
});

test('rejects a zero average fill size instead of dividing by zero', () => {
  assert.throws(() => calculate({ ...DEFAULTS, avgGallonsPerFill: 0 }), /average gallons per fill/i);
});

test('a small average fill below the minimum triggers the minimum-delivery fee', () => {
  const r = calculate({ ...DEFAULTS, avgGallonsPerFill: 80, minimumDeliveryGallons: 100, minimumDeliveryFee: 45 });
  assert.equal(r.minimumFeeApplies, true);
  const deliveries = DEFAULTS.annualGallons / 80;
  close(r.minimumFeeRevenue, 45 * deliveries);
});

test('a fill exactly at the minimum threshold does not trigger the fee (a strict "below", not "at or below")', () => {
  const r = calculate({ ...DEFAULTS, avgGallonsPerFill: 100, minimumDeliveryGallons: 100 });
  assert.equal(r.minimumFeeApplies, false);
  assert.equal(r.minimumFeeRevenue, 0);
});

test('a wider retail/wholesale spread raises annual revenue by exactly the extra margin times the gallons', () => {
  const low = calculate({ ...DEFAULTS, retailPricePerGallon: 2.49 });
  const high = calculate({ ...DEFAULTS, retailPricePerGallon: 2.99 });
  close(high.netProfitAnnual - low.netProfitAnnual, DEFAULTS.annualGallons * 0.5);
});

test('a smaller average fill size increases deliveries per year and therefore mileage and labor cost', () => {
  const bigFill = calculate({ ...DEFAULTS, avgGallonsPerFill: 300 });
  const smallFill = calculate({ ...DEFAULTS, avgGallonsPerFill: 75 });
  assert.ok(smallFill.deliveriesPerYear > bigFill.deliveriesPerYear);
  assert.ok(smallFill.mileageCost > bigFill.mileageCost);
  assert.ok(smallFill.laborCost > bigFill.laborCost);
});

test('tank rental cost applies even when the customer takes zero deliveries worth of margin', () => {
  const r = calculate({ ...DEFAULTS, retailPricePerGallon: DEFAULTS.wholesaleCostPerGallon, tankRentalMonthlyCost: 5 });
  close(r.tankCost, 60);
  assert.ok(r.netProfitAnnual < 0, 'zero fuel margin still carries tank and hazmat cost');
});

test('rejects a negative annual gallons figure', () => {
  assert.throws(() => calculate({ ...DEFAULTS, annualGallons: -1 }), /annual gallons/i);
});

test('rejects a non-numeric input', () => {
  assert.throws(() => calculate({ ...DEFAULTS, retailPricePerGallon: 'cheap' }), /retail price per gallon/i);
});

test('profitPerGallon and effectiveHourlyRate are null-safe when there is nothing to divide by', () => {
  const r = calculate({ ...DEFAULTS, annualGallons: 0, stopMinutes: 0, driveMinutesPerDelivery: 0 });
  assert.equal(r.profitPerGallon, null);
  assert.equal(r.effectiveHourlyRate, null);
});

test('computeRouteProfit sums monthly profit across customers and averages it', () => {
  const route = computeRouteProfit([{ monthlyProfit: 60 }, { monthlyProfit: 25 }, { monthlyProfit: -10 }]);
  assert.equal(route.totalMonthlyProfit, 75);
  assert.equal(route.customerCount, 3);
  close(route.averageProfitPerCustomer, 75 / 3);
});

test('computeRouteProfit on an empty route returns zero without dividing by zero', () => {
  const route = computeRouteProfit([]);
  assert.equal(route.totalMonthlyProfit, 0);
  assert.equal(route.customerCount, 0);
  assert.equal(route.averageProfitPerCustomer, 0);
});

test('incomeGap reports the shortfall and customers needed to close it', () => {
  const gap = incomeGap(3000, 2000, 100);
  assert.equal(gap.gap, 1000);
  assert.equal(gap.additionalCustomersNeeded, 10);
  assert.equal(gap.meetsTarget, false);
});

test('incomeGap reports goal met with zero customers needed once profit clears the target', () => {
  const gap = incomeGap(1000, 1200, 100);
  assert.equal(gap.gap, 0);
  assert.equal(gap.additionalCustomersNeeded, 0);
  assert.equal(gap.meetsTarget, true);
});

test('incomeGap cannot compute additional customers needed when the average profit per customer is zero or negative', () => {
  const gap = incomeGap(1000, 0, 0);
  assert.equal(gap.additionalCustomersNeeded, null);
  assert.equal(gap.meetsTarget, false);
});
