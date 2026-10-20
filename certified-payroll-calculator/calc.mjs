// Certified payroll (Davis-Bacon / prevailing wage) arithmetic for one
// worker classification, one week. No network, no state.
//
// The one mistake this exists to catch: on a federal or federally-assisted
// construction contract, overtime is not simply 1.5x the base wage. Under
// the Contract Work Hours and Safety Standards Act (29 CFR 5.32) and the
// FLSA "regular rate" rule it borrows (29 CFR 778.7), any fringe benefit
// amount paid in cash — rather than contributed to a bona fide plan — counts
// toward the "regular rate" and must itself get the overtime premium.
// Fringe paid into a bona fide plan does not. Payroll software that applies
// time-and-a-half to the base rate only, and pays cash-in-lieu-of-fringe at
// straight time even during overtime hours, silently underpays every week it
// runs — a documented, recurring finding in DOL Davis-Bacon audits.
//
// This does not look up which wage determination applies, whether a
// contract is covered, or a worker's approved apprentice rate — those are
// facts from the contracting officer's wage determination and the
// contractor's own registered apprenticeship agreement, entered here, never
// inferred. It also does not know DOL rounding/reporting conventions used on
// the WH-347 form itself; treat every figure as the underlying math to check
// or carry into that form, not a filed report.

function number(value, name, { min = 0 } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  return result;
}

function optionalNumber(value, name, opts) {
  if (value === null || value === undefined || value === "") return null;
  return number(value, name, opts);
}

/**
 * @param {object} input
 * @param {number} input.requiredBaseRate     Basic hourly rate from the wage determination (or the worker's
 *   registered apprenticeship agreement if this row is an apprentice), $/hr.
 * @param {number} input.requiredFringeRate    Required fringe benefit rate from the same source, $/hr.
 * @param {number} input.actualBaseRate        Actual cash base hourly wage paid, $/hr.
 * @param {number} input.bonaFideFringePerHour Actual hourly-equivalent contribution paid to a bona fide
 *   fringe benefit plan (health, pension, etc.) — excluded from the overtime regular rate.
 * @param {number} input.cashFringePerHour     Fringe amount paid directly to the worker in cash instead of
 *   a plan — included in the overtime regular rate.
 * @param {number} input.straightHours         Hours worked at straight time this week.
 * @param {number} input.overtimeHours         Hours worked at time-and-a-half this week.
 * @param {number|null} input.approvedRatioApprentices Approved apprentice-to-journeyman ratio numerator (optional).
 * @param {number|null} input.approvedRatioJourneymen  Approved apprentice-to-journeyman ratio denominator (optional).
 * @param {number|null} input.journeymenOnSite  Journeymen in this classification on site this week (optional).
 * @param {number|null} input.apprenticesOnSite Apprentices in this classification on site this week (optional).
 * @param {number|null} input.fullJourneymanRate Full journeyman required total rate (base + fringe), used
 *   only to price the cost of any apprentices in excess of the approved ratio (optional).
 * @param {number|null} input.excessApprenticeHours Combined hours worked this week by apprentices in excess
 *   of the approved ratio, if any (optional).
 */
export function calculateCertifiedPayroll(input) {
  const requiredBaseRate = number(input.requiredBaseRate ?? 0, "Required base rate");
  const requiredFringeRate = number(input.requiredFringeRate ?? 0, "Required fringe rate");
  const actualBaseRate = number(input.actualBaseRate ?? 0, "Actual base rate");
  const bonaFideFringePerHour = number(input.bonaFideFringePerHour ?? 0, "Bona fide fringe per hour");
  const cashFringePerHour = number(input.cashFringePerHour ?? 0, "Cash fringe per hour");
  const straightHours = number(input.straightHours ?? 0, "Straight-time hours");
  const overtimeHours = number(input.overtimeHours ?? 0, "Overtime hours");

  const totalHours = straightHours + overtimeHours;

  const requiredTotalRate = requiredBaseRate + requiredFringeRate;
  const actualTotalRate = actualBaseRate + bonaFideFringePerHour + cashFringePerHour;
  const shortfallPerHour = Math.max(0, requiredTotalRate - actualTotalRate);

  // Correct: the overtime premium applies to the base cash rate plus any
  // cash-in-lieu-of-fringe, never to a bona fide plan contribution.
  const straightRatePerHour = actualBaseRate + cashFringePerHour;
  const otRatePerHour = straightRatePerHour * 1.5;
  const totalCashWagesPaid = straightHours * straightRatePerHour + overtimeHours * otRatePerHour;
  const totalBonaFideFringeDue = totalHours * bonaFideFringePerHour;
  const totalCompensationPaid = totalCashWagesPaid + totalBonaFideFringeDue;

  // The common payroll-system error: time-and-a-half on the base rate only,
  // with cash-in-lieu-of-fringe paid at straight time even on overtime
  // hours. Zero when there is no cash fringe to mishandle.
  const otRatePerHourIfFringeExcluded = actualBaseRate * 1.5 + cashFringePerHour;
  const totalCashWagesIfFringeExcludedFromOt =
    straightHours * straightRatePerHour + overtimeHours * otRatePerHourIfFringeExcluded;
  const otUnderpaymentIfCashFringeExcluded = totalCashWagesPaid - totalCashWagesIfFringeExcludedFromOt;

  const requiredGrossAtPrevailingWage =
    requiredBaseRate * straightHours + requiredBaseRate * 1.5 * overtimeHours + requiredFringeRate * totalHours;
  const underpaymentTotal = Math.max(0, requiredGrossAtPrevailingWage - totalCompensationPaid);

  // `shortfallPerHour === 0` is NOT enough to call a week compliant: it
  // compares a flat combined rate that treats fringe as fungible with base
  // pay, but overtime premium is only ever owed on base pay plus cash
  // fringe (never a bona fide plan contribution). A week can pay a
  // combined rate that matches the wage determination exactly and still
  // shortchange the worker once overtime hours are worked, if enough of
  // the required rate is delivered as bona fide fringe instead of base pay
  // -- fringe never earns the overtime premium, so shifting pay from base
  // into fringe silently erases part of the premium a compliant week owes.
  // `underpaymentTotal` already accounts for hours and the OT premium
  // correctly, so it is the only reliable compliance signal.
  const compliant = underpaymentTotal === 0;

  const approvedRatioApprentices = optionalNumber(input.approvedRatioApprentices, "Approved ratio (apprentices)", { min: 0 });
  const approvedRatioJourneymen = optionalNumber(input.approvedRatioJourneymen, "Approved ratio (journeymen)", { min: 0 });
  const journeymenOnSite = optionalNumber(input.journeymenOnSite, "Journeymen on site", { min: 0 });
  const apprenticesOnSite = optionalNumber(input.apprenticesOnSite, "Apprentices on site", { min: 0 });

  let ratio = null;
  if (
    approvedRatioApprentices !== null &&
    approvedRatioJourneymen !== null &&
    journeymenOnSite !== null &&
    apprenticesOnSite !== null
  ) {
    if (approvedRatioJourneymen === 0) throw new Error("Approved ratio (journeymen) must be greater than 0");
    const fullJourneymanRate = optionalNumber(input.fullJourneymanRate, "Full journeyman rate");
    const excessApprenticeHours = optionalNumber(input.excessApprenticeHours, "Excess apprentice hours");

    const allowed = Math.floor(journeymenOnSite * (approvedRatioApprentices / approvedRatioJourneymen));
    const excess = Math.max(0, apprenticesOnSite - allowed);
    const exceeded = excess > 0;
    const shortfallPerHour2 =
      fullJourneymanRate === null ? null : Math.max(0, fullJourneymanRate - actualTotalRate);
    const shortfallTotal =
      shortfallPerHour2 === null || excessApprenticeHours === null ? null : shortfallPerHour2 * excessApprenticeHours;

    ratio = { allowed, excess, exceeded, shortfallPerHour: shortfallPerHour2, shortfallTotal };
  }

  return {
    requiredTotalRate,
    actualTotalRate,
    shortfallPerHour,
    compliant,
    straightRatePerHour,
    otRatePerHour,
    totalCashWagesPaid,
    totalBonaFideFringeDue,
    totalCompensationPaid,
    otUnderpaymentIfCashFringeExcluded,
    requiredGrossAtPrevailingWage,
    underpaymentTotal,
    totalHours,
    ratio,
  };
}
