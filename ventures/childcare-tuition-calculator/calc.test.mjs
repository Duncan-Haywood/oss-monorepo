import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateClassroom, occupancyTable, occupancySummary } from './calc.mjs';

const defaults = {
  ratio: 10,
  staffCount: 2,
  roomCapacity: 20,
  occupancyRate: 85,
  currentTuitionPerChild: 900,
  hourlyWage: 18,
  hoursPerDay: 10,
  daysPerWeek: 5,
  payrollBurdenPercent: 12,
  monthlyOverhead: 1500,
  targetMarginPercent: 10,
};

test('prices a classroom from ratio, staffing, and overhead, not from an asserted legal ratio', () => {
  const result = calculateClassroom(defaults);
  assert.equal(result.ratioCapacity, 20);
  assert.equal(result.classroomCapacity, 20);
  assert.equal(result.enrolledChildren, 17);
  assert.equal(result.emptySeats, 3);
  assert.equal(result.monthlyLaborCost, 8736);
  assert.equal(result.monthlyCost, 10236);
  assert.equal(result.requiredTuitionPerChild, 10236 / 0.9 / 17);
  assert.equal(result.breakEvenTuitionPerChild, 10236 / 17);
});

test('the room, not the ratio, can be the binding constraint', () => {
  const result = calculateClassroom({ ...defaults, roomCapacity: 12 });
  assert.equal(result.bindingConstraint, 'room');
  assert.equal(result.classroomCapacity, 12);
  assert.equal(result.enrolledChildren, 10); // round(12 * 0.85)
});

test('current tuition rate reports profit and the revenue left on empty seats', () => {
  const result = calculateClassroom(defaults);
  assert.equal(result.currentMonthlyRevenue, 15300);
  assert.equal(result.currentMonthlyProfit, 5064);
  assert.equal(result.emptySeatMonthlyRevenue, 2700);
  assert.equal(result.emptySeatAnnualRevenue, 32400);
});

test('a full room reports zero empty-seat revenue', () => {
  const result = calculateClassroom({ ...defaults, occupancyRate: 100 });
  assert.equal(result.emptySeats, 0);
  assert.equal(result.emptySeatMonthlyRevenue, 0);
  assert.match(occupancySummary({ ...defaults, occupancyRate: 100 }), /room is full/);
});

test('rejects an occupancy rate above 100%', () => {
  assert.throws(() => calculateClassroom({ ...defaults, occupancyRate: 101 }), /100%/);
});

test('rejects a target margin at or above 100%', () => {
  assert.throws(() => calculateClassroom({ ...defaults, targetMarginPercent: 100 }), /100%/);
});

test('rejects a zero ratio rather than dividing by it', () => {
  assert.throws(() => calculateClassroom({ ...defaults, ratio: 0 }), /greater than 0/);
});

test('occupancy table holds cost fixed and shows tuition needed rising as occupancy falls', () => {
  const rows = occupancyTable(defaults);
  const byRate = Object.fromEntries(rows.map((row) => [row.occupancyRate, row]));
  assert.equal(byRate[100].enrolledChildren, 20);
  assert.equal(byRate[100].requiredTuitionPerChild, 10236 / 0.9 / 20);
  assert.equal(byRate[50].enrolledChildren, 10);
  // Required tuition per child rises monotonically as occupancy falls, because
  // the same fixed monthly cost is divided across fewer children.
  for (let i = 1; i < rows.length; i++) assert.ok(rows[i].requiredTuitionPerChild > rows[i - 1].requiredTuitionPerChild);
  assert.equal(byRate[50].profitAtCurrent, 10 * 900 - 10236);
  assert.ok(byRate[50].profitAtCurrent < 0, 'half-empty room should show a loss at the current tuition rate');
});

test('occupancy summary names the dollar figure left on the table', () => {
  const text = occupancySummary(defaults);
  assert.match(text, /3 empty seats/);
  assert.match(text, /\$2,700\/month/);
  assert.match(text, /\$32,400\/year/);
});
