export const INPUT_FIELDS = [
  'ratio',
  'staffCount',
  'roomCapacity',
  'occupancyRate',
  'currentTuitionPerChild',
  'hourlyWage',
  'hoursPerDay',
  'daysPerWeek',
  'payrollBurdenPercent',
  'monthlyOverhead',
  'targetMarginPercent',
];

const WEEKS_PER_MONTH = 52 / 12;

function number(value, name, { positive = false } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  if (positive && result <= 0) throw new Error(`${name} must be greater than 0`);
  return result;
}

/**
 * A licensed classroom's capacity is whichever is smaller: the child:staff
 * ratio times scheduled staff, or the room's own licensed square-footage
 * capacity. The ratio itself is never asserted here -- it is a number the
 * operator already has from their own license, because state ratios vary by
 * age group and jurisdiction and go stale the moment this file would try to
 * hold a table of them.
 */
export function calculateClassroom(input) {
  const ratio = number(input.ratio, 'Child:staff ratio', { positive: true });
  const staffCount = number(input.staffCount, 'Staff scheduled', { positive: true });
  const roomCapacity = number(input.roomCapacity ?? ratio * staffCount, "Room's licensed capacity", { positive: true });
  const occupancyRate = number(input.occupancyRate ?? 85, 'Occupancy rate');
  const currentTuitionPerChild = number(input.currentTuitionPerChild ?? 0, 'Current monthly tuition per child');
  const hourlyWage = number(input.hourlyWage, 'Staff hourly wage', { positive: true });
  const hoursPerDay = number(input.hoursPerDay, 'Hours open per day', { positive: true });
  const daysPerWeek = number(input.daysPerWeek, 'Days open per week', { positive: true });
  const payrollBurdenPercent = number(input.payrollBurdenPercent ?? 0, 'Payroll tax and benefits load');
  const monthlyOverhead = number(input.monthlyOverhead ?? 0, 'Monthly overhead');
  const targetMarginPercent = number(input.targetMarginPercent ?? 10, 'Target margin');

  if (occupancyRate > 100) throw new Error('Occupancy rate must be 100% or less');
  if (targetMarginPercent >= 100) throw new Error('Target margin must be less than 100%');

  const ratioCapacity = ratio * staffCount;
  const classroomCapacity = Math.min(ratioCapacity, roomCapacity);
  const bindingConstraint = ratioCapacity <= roomCapacity ? 'ratio' : 'room';
  const enrolledChildren = Math.round((classroomCapacity * occupancyRate) / 100);
  const emptySeats = Math.max(0, classroomCapacity - enrolledChildren);

  const weeklyLaborHours = staffCount * hoursPerDay * daysPerWeek;
  const weeklyWages = weeklyLaborHours * hourlyWage;
  const weeklyLaborCost = weeklyWages * (1 + payrollBurdenPercent / 100);
  const monthlyLaborCost = weeklyLaborCost * WEEKS_PER_MONTH;
  const monthlyCost = monthlyLaborCost + monthlyOverhead;

  const requiredMonthlyRevenue = monthlyCost / (1 - targetMarginPercent / 100);
  const requiredTuitionPerChild = enrolledChildren === 0 ? Infinity : requiredMonthlyRevenue / enrolledChildren;
  const breakEvenTuitionPerChild = enrolledChildren === 0 ? Infinity : monthlyCost / enrolledChildren;
  const monthlyChildHours = enrolledChildren * hoursPerDay * daysPerWeek * WEEKS_PER_MONTH;
  const costPerChildHour = monthlyChildHours === 0 ? Infinity : monthlyCost / monthlyChildHours;

  const currentMonthlyRevenue = enrolledChildren * currentTuitionPerChild;
  const currentMonthlyProfit = currentMonthlyRevenue - monthlyCost;
  const currentMarginPercent = currentMonthlyRevenue === 0 ? 0 : (currentMonthlyProfit / currentMonthlyRevenue) * 100;
  const emptySeatMonthlyRevenue = emptySeats * currentTuitionPerChild;
  const emptySeatAnnualRevenue = emptySeatMonthlyRevenue * 12;

  return {
    ratio,
    staffCount,
    roomCapacity,
    ratioCapacity,
    classroomCapacity,
    bindingConstraint,
    occupancyRate,
    enrolledChildren,
    emptySeats,
    monthlyLaborCost,
    monthlyOverhead,
    monthlyCost,
    requiredMonthlyRevenue,
    requiredTuitionPerChild,
    breakEvenTuitionPerChild,
    costPerChildHour,
    currentTuitionPerChild,
    currentMonthlyRevenue,
    currentMonthlyProfit,
    currentMarginPercent,
    emptySeatMonthlyRevenue,
    emptySeatAnnualRevenue,
  };
}

function numericInput(input) {
  return Object.fromEntries(INPUT_FIELDS.map((field) => [field, input[field]]));
}

const OCCUPANCY_LEVELS = [100, 90, 80, 70, 60, 50];

/**
 * Staffing and overhead do not change with one more or fewer enrolled child
 * -- a classroom is staffed to the ratio it is licensed for, not to the exact
 * headcount on a given day. That is what makes occupancy, not price, the
 * lever that actually swings a classroom from profitable to underwater: this
 * table holds cost fixed and shows what each occupancy level does to the
 * tuition needed and to profit at the rate already being charged.
 */
export function occupancyTable(input) {
  const base = numericInput(input);
  return OCCUPANCY_LEVELS.map((occupancyRate) => {
    const result = calculateClassroom({ ...base, occupancyRate });
    const revenueAtCurrent = result.enrolledChildren * result.currentTuitionPerChild;
    const profitAtCurrent = revenueAtCurrent - result.monthlyCost;
    return { occupancyRate, enrolledChildren: result.enrolledChildren, requiredTuitionPerChild: result.requiredTuitionPerChild, profitAtCurrent };
  });
}

const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

export function occupancySummary(input) {
  const result = calculateClassroom(input);
  if (result.emptySeats === 0) {
    return `The room is full at the stated occupancy rate -- no empty-seat revenue is being left on the table.`;
  }
  return `${result.emptySeats} empty seat${result.emptySeats === 1 ? '' : 's'} at your current tuition rate is ${money.format(result.emptySeatMonthlyRevenue)}/month (${money.format(result.emptySeatAnnualRevenue)}/year) not billed, before any change to price or staffing.`;
}
