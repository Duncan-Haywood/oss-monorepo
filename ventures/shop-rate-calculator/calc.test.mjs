import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateShopRate, carryWarnings, notes, CARRY_LIMITS, CURRENT_RATE_MAX } from './calc.mjs';

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

// --- What you charge today ---------------------------------------------------
//
// The comparison is the half of the question the rest of the module does not
// answer. A contractor already has a rate; what they cannot work out is what it
// is earning and what would have to be true for it to be right.

test('a blank current rate is not an error and produces no comparison', () => {
  // Blank has to mean "did not say", not "charges nothing". A zero would make
  // the margin negative infinity and the required hours infinite, and the page
  // would show that to somebody who simply skipped an optional field.
  for (const blank of ['', null, undefined, '   ']) {
    const result = calculateShopRate({ ...BASE, currentRatePerHour: blank });
    assert.equal(result.ok, true);
    assert.equal(result.comparison, null);
  }
  assert.equal(calculateShopRate(BASE).comparison, null);
});

test('a current rate outside what the field accepts is reported, not dropped', () => {
  // Silently ignoring a bad value would make the comparison block disappear,
  // and a missing block reads as "no gap" — the opposite of the truth.
  for (const bad of [0, -5, CURRENT_RATE_MAX + 1]) {
    const result = calculateShopRate({ ...BASE, currentRatePerHour: bad });
    assert.equal(result.ok, false);
    assert.ok(result.errors.some(e => e.id === 'currentRatePerHour'), `${bad} should be reported`);
  }
});

test('a rate below break-even is called what it is, and sized over the year', () => {
  const target = calculateShopRate(BASE);
  const rate = target.breakEvenRatePerHour - 10;
  const { comparison } = calculateShopRate({ ...BASE, currentRatePerHour: rate });

  assert.equal(comparison.coversCost, false);
  assert.equal(comparison.meetsTarget, false);
  near(comparison.gapAtBreakEven, -10);
  assert.ok(comparison.marginAtCurrentRate < 0, 'below break-even the labour margin is negative');
  // The annual figure is over labour revenue only: `revenueNeeded` also covers
  // materials and subs, which are billed on top of the hours rather than
  // through the rate, so sizing the gap against it would overstate it.
  near(
    comparison.annualGap,
    comparison.gapPerHour * target.billableHoursPerYear * BASE.fieldCrewCount,
    0.01,
  );
  assert.match(comparison.messages[0], /below the break-even hour/);
});

test('a rate that covers cost but misses the target says so, in margin the contractor asked for', () => {
  const target = calculateShopRate(BASE);
  const rate = (target.breakEvenRatePerHour + target.billRatePerHour) / 2;
  const { comparison } = calculateShopRate({ ...BASE, currentRatePerHour: rate });

  assert.equal(comparison.coversCost, true);
  assert.equal(comparison.meetsTarget, false);
  assert.ok(comparison.marginAtCurrentRate > 0);
  assert.ok(comparison.marginAtCurrentRate < BASE.targetMargin);
  assert.match(comparison.messages[0], /covers cost and overhead/);
});

test('the target rate compares exactly equal to itself', () => {
  // The obvious identity, and the one that catches a drift between the rate the
  // page prints and the rate the comparison measures against.
  const target = calculateShopRate(BASE);
  const { comparison } = calculateShopRate({ ...BASE, currentRatePerHour: target.billRatePerHour });

  near(comparison.gapPerHour, 0, 1e-9);
  near(comparison.marginAtCurrentRate, BASE.targetMargin, 1e-9);
  near(comparison.annualGap, 0, 1e-6);
  near(comparison.requiredBillableHours, target.billableHoursPerYear, 1e-6);
  assert.equal(comparison.meetsTarget, true);
});

test('the billable hours a rate would need are exact, not an estimate', () => {
  // The inversion is only sound because the billable share moves neither the
  // annual cost of employing somebody nor the overhead rate (whose denominator
  // is annual direct cost, not hours). Feeding the answer back through the
  // whole calculation is what proves that assumption still holds.
  const target = calculateShopRate(BASE);
  const rate = target.billRatePerHour * 0.9;
  const { comparison } = calculateShopRate({ ...BASE, currentRatePerHour: rate });

  assert.equal(comparison.reachable, true);
  const nonBillablePercent = 100 - (comparison.requiredBillableHours / target.workedHours) * 100;
  const replayed = calculateShopRate({ ...BASE, nonBillablePercent });
  near(replayed.billRatePerHour, rate, 1e-6);

  near(comparison.requiredUtilization, (comparison.requiredBillableHours / target.paidHoursPerYear) * 100, 1e-9);
  assert.match(comparison.messages[1], /would be the right rate if each person billed/);
});

test('a rate no schedule can rescue says the gap is in the rate', () => {
  // Required hours above the hours actually worked is not a low-utilisation
  // problem, and offering a utilisation target that exceeds the working year
  // would be advice nobody can act on.
  const target = calculateShopRate(BASE);
  const { comparison } = calculateShopRate({ ...BASE, currentRatePerHour: target.billRatePerHour / 3 });

  assert.equal(comparison.reachable, false);
  assert.ok(comparison.requiredBillableHours > target.workedHours);
  assert.match(comparison.messages[1], /No billable share makes/);
});

test('a rate above the target is stated as a surplus rather than a shortfall', () => {
  const target = calculateShopRate(BASE);
  const { comparison } = calculateShopRate({ ...BASE, currentRatePerHour: target.billRatePerHour * 1.2 });

  assert.equal(comparison.meetsTarget, true);
  assert.ok(comparison.gapPerHour > 0);
  assert.ok(comparison.annualGap > 0);
  assert.ok(comparison.marginAtCurrentRate > BASE.targetMargin);
  assert.match(comparison.messages[0], /above the rate your/);
  // Nothing about hours to chase when the rate already clears the target.
  assert.equal(comparison.messages.length, 1);
});

test('the year the gap is measured over counts the whole crew, and says so', () => {
  const one = calculateShopRate({ ...BASE, fieldCrewCount: 1, currentRatePerHour: 60 });
  const five = calculateShopRate({ ...BASE, fieldCrewCount: 5, currentRatePerHour: 60 });

  // Crew size is not a scale factor on the gap. A fifth person spreads the same
  // overhead over more direct cost, so the required rate itself falls and the
  // per-hour shortfall shrinks — while the annual figure still grows, because it
  // is that smaller shortfall taken across five people's billable hours.
  assert.ok(Math.abs(five.comparison.gapPerHour) < Math.abs(one.comparison.gapPerHour));
  assert.ok(Math.abs(five.comparison.annualGap) > Math.abs(one.comparison.annualGap));
  for (const [n, r] of [[1, one], [5, five]]) {
    near(r.comparison.annualGap, r.comparison.gapPerHour * r.billableHoursPerYear * n, 1e-6);
  }
  assert.match(five.comparison.messages[0], /5 field crew bill/);
  assert.match(one.comparison.messages[0], /the hours you bill/);
});

test('the comparison never changes the rates the bid calculators are handed', () => {
  // It is a reading of the answer, not an input to it. If typing a current rate
  // moved the carried burden or overhead, every bid on the site would depend on
  // a field the contractor thought was informational.
  const without = calculateShopRate(BASE);
  const with_ = calculateShopRate({ ...BASE, currentRatePerHour: 42 });

  assert.deepEqual(with_.carry, without.carry);
  near(with_.billRatePerHour, without.billRatePerHour, 1e-12);
  assert.deepEqual(with_.notes, without.notes);
  assert.deepEqual(with_.carryWarnings, without.carryWarnings);
});
