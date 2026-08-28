import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateShopRate, carryWarnings, notes, CARRY_LIMITS } from './calc.mjs';

/** The values the page ships with, so the tests price the same shop a visitor sees. */
const BASE = {
  hourlyWage: 28,
  fieldCrewCount: 3,
  paidHoursPerWeek: 40,
  paidWeeksPerYear: 52,
  paidDaysOffPerYear: 15,
  nonBillablePercent: 20,
  payrollTaxPercent: 10,
  workersCompPercent: 8,
  liabilityInsurancePercent: 2,
  benefitsPerYear: 4800,
  vehicleToolsPerYear: 9600,
  ownerAdminSalary: 65000,
  officeRentUtilities: 9000,
  softwareAccountingLegal: 4800,
  marketingAndLeads: 7200,
  insuranceLicensesOther: 6000,
  annualMaterialAndSubCost: 180000,
  targetMargin: 12,
};

const near = (actual, expected, tolerance = 0.01) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} is not within ${tolerance} of ${expected}`);

test('the paid year, the days off, and the hours actually left to bill', () => {
  const result = calculateShopRate(BASE);
  assert.equal(result.ok, true);
  assert.equal(result.paidHoursPerYear, 2080);
  // 15 days at an eight-hour day, derived from the 40-hour week entered.
  assert.equal(result.paidTimeOffHours, 120);
  // (2080 - 120) worked, less the 20% that is drive time, estimating and rework.
  assert.equal(result.billableHoursPerYear, 1568);
  near(result.utilization, 75.38);
});

test('a shorter paid week shortens the paid day, so days off are not overcounted', () => {
  // 32 paid hours a week is a 6.4-hour day. Ten days off is 64 hours, not 80:
  // reading a day as a fixed eight hours would take a full extra week off a
  // four-day shop and inflate every rate below it.
  const result = calculateShopRate({ ...BASE, paidHoursPerWeek: 32, paidDaysOffPerYear: 10 });
  assert.equal(result.ok, true);
  assert.equal(result.paidTimeOffHours, 64);
});

test('burden is the whole annual cost of a person spread over the hours that get sold', () => {
  const result = calculateShopRate(BASE);
  // Wages are paid on all 2,080 hours, holidays included.
  assert.equal(result.wagesPerYear, 28 * 2080);
  // 20% of wages in taxes, comp and liability, plus the two per-person figures.
  near(result.burdenCost, 58240 * 0.2 + 4800 + 9600);
  near(result.annualCostPerPerson, 58240 + 58240 * 0.2 + 14400);
  near(result.costPerBillableHour, (58240 * 1.2 + 14400) / 1568);
  near(result.burdenRate, (result.costPerBillableHour / 28 - 1) * 100);
});

test('the burden rate is far above the 20% a contractor would have typed', () => {
  // This is the whole point of the tool. The textbook "taxes and insurance"
  // burden on these inputs is 20%; the rate that actually recovers a person is
  // 92%, because a $28 wage costs $53.76 for every hour that gets sold. A
  // contractor who typed 20% into a bid calculator would price labour at $33.60.
  const result = calculateShopRate(BASE);
  assert.ok(result.burdenRate > 85, `burden rate was ${result.burdenRate}`);
  assert.ok(result.burdenRate < 100, `burden rate was ${result.burdenRate}`);
  near(result.costPerBillableHour, 53.76, 0.01);
});

test('overhead is a percentage of direct cost, not of revenue', () => {
  const result = calculateShopRate(BASE);
  assert.equal(result.annualOverhead, 65000 + 9000 + 4800 + 7200 + 6000);
  near(result.annualDirectLabor, result.annualCostPerPerson * 3);
  near(result.annualDirectCost, result.annualDirectLabor + 180000);
  near(result.overheadRate, (result.annualOverhead / result.annualDirectCost) * 100);
  // The same shop over revenue would read materially lower; that difference is
  // the under-recovery this tool exists to stop.
  const overRevenue = (result.annualOverhead / result.revenueNeeded) * 100;
  assert.ok(result.overheadRate > overRevenue + 5, 'the two denominators should not be interchangeable');
});

test('the bill rate carries cost, then overhead, then margin — in that order', () => {
  const result = calculateShopRate(BASE);
  near(result.loadedHourWithOverhead, result.costPerBillableHour * (1 + result.overheadRate / 100));
  near(result.billRatePerHour, result.loadedHourWithOverhead / 0.88);
  // Break-even is the same hour without the margin, which is the number a
  // contractor needs when a customer asks them to sharpen a price.
  near(result.breakEvenRatePerHour, result.loadedHourWithOverhead);
  assert.ok(result.billRatePerHour > result.breakEvenRatePerHour);
});

test('margin is taken on revenue, so the annual figures close', () => {
  const result = calculateShopRate(BASE);
  const totalCost = result.annualDirectCost + result.annualOverhead;
  near(result.revenueNeeded, totalCost / 0.88, 0.5);
  near(result.profitAtTarget, result.revenueNeeded - totalCost, 0.5);
  // A 12% target margin means profit is 12% of revenue, not 12% of cost.
  near((result.profitAtTarget / result.revenueNeeded) * 100, 12, 0.001);
});

test('a zero target margin makes the bill rate the break-even rate exactly', () => {
  const result = calculateShopRate({ ...BASE, targetMargin: 0 });
  assert.equal(result.ok, true);
  near(result.billRatePerHour, result.breakEvenRatePerHour);
  near(result.profitAtTarget, 0, 0.5);
});

test('the four carried rates are rounded to what storage keeps', () => {
  const result = calculateShopRate(BASE);
  assert.equal(result.carry.hourlyWage, 28);
  assert.equal(result.carry.targetMargin, 12);
  assert.equal(result.carry.burdenRate, Math.round(result.burdenRate * 100) / 100);
  assert.equal(result.carry.overheadRate, Math.round(result.overheadRate * 100) / 100);
});

test('a blank field is an error, never a zero', () => {
  // Number('') is 0. A blank wage that became $0 would divide into an infinite
  // burden rate and a bill rate of nothing, both of which look like answers.
  const result = calculateShopRate({ ...BASE, hourlyWage: '' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'hourlyWage');
  assert.match(result.errors[0].message, /needed/);
});

test('a non-numeric entry is refused rather than coerced', () => {
  const result = calculateShopRate({ ...BASE, benefitsPerYear: 'about six grand' });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'benefitsPerYear');
});

test('every error is reported at once, so the form is fixed in one pass', () => {
  const result = calculateShopRate({ ...BASE, hourlyWage: '', targetMargin: '', fieldCrewCount: '' });
  assert.equal(result.ok, false);
  assert.deepEqual(
    result.errors.map(e => e.id).sort(),
    ['fieldCrewCount', 'hourlyWage', 'targetMargin'],
  );
});

test('a target margin of 100% is refused rather than dividing by zero', () => {
  const result = calculateShopRate({ ...BASE, targetMargin: 100 });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'targetMargin');
});

test('days off that consume the paid year are a contradiction, not a rate', () => {
  // 30 paid weeks is 150 working days; 200 days off cannot come out of it.
  const result = calculateShopRate({ ...BASE, paidWeeksPerYear: 30, paidDaysOffPerYear: 200 });
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].id, 'paidDaysOffPerYear');
  assert.match(result.errors[0].message, /no hours left|whole paid year/i);
});

test('a 99% non-billable share still computes; 100% is out of range', () => {
  const high = calculateShopRate({ ...BASE, nonBillablePercent: 99 });
  assert.equal(high.ok, true);
  assert.ok(high.billableHoursPerYear > 0);
  const impossible = calculateShopRate({ ...BASE, nonBillablePercent: 100 });
  assert.equal(impossible.ok, false);
  assert.equal(impossible.errors[0].id, 'nonBillablePercent');
});

test('a rate too high for the bid calculators is reported, never clamped', () => {
  // A one-person shop billing a handful of hours produces an arithmetically real
  // burden rate the receiving forms would drop. Clamping it would hand every
  // calculator a number this page never computed.
  const result = calculateShopRate({ ...BASE, nonBillablePercent: 99, hourlyWage: 1 });
  assert.equal(result.ok, true);
  assert.ok(result.carry.burdenRate > CARRY_LIMITS.burdenRate);
  assert.equal(result.carryWarnings.length >= 1, true);
  assert.match(result.carryWarnings.join(' '), /cannot be carried/);
});

test('rates inside the limits raise no carry warning', () => {
  const result = calculateShopRate(BASE);
  assert.ok(result.carry.burdenRate <= CARRY_LIMITS.burdenRate);
  assert.ok(result.carry.overheadRate <= CARRY_LIMITS.overheadRate);
  assert.deepEqual(result.carryWarnings, []);
});

test('carryWarnings names each rate that will not travel', () => {
  const both = carryWarnings({ burdenRate: 900, overheadRate: 900, hourlyWage: 28, targetMargin: 12 });
  assert.equal(both.length, 2);
  assert.match(both[0], /payroll burden/i);
  assert.match(both[1], /overhead/i);
});

test('the notes point at the input doing the damage', () => {
  const low = notes({ utilization: 48, burdenRate: 90, overheadRate: 30, targetMargin: 12 });
  assert.match(low.join(' '), /48% of the hours you pay for are billable/);
  assert.match(low.join(' '), /not the 20–30% usually quoted/);
  const zero = notes({ utilization: 80, burdenRate: 40, overheadRate: 30, targetMargin: 0 });
  assert.match(zero.join(' '), /break-even/);
});

test('a healthy shop is not lectured', () => {
  assert.deepEqual(notes({ utilization: 82, burdenRate: 45, overheadRate: 28, targetMargin: 12 }), []);
});

test('nothing is returned for a missing input object', () => {
  const result = calculateShopRate();
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});
