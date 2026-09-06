// Pure quote arithmetic for an independent mobile photo booth rental
// operator (weddings, corporate parties, school dances — a booth, backdrop,
// and an attendant that travels to the venue, not a fixed studio and not a
// print shop). No network, no state: every rate, minute, and print count is
// an input, so the result stays a transparent calculation the operator can
// check against their own mileage log and print-supply invoices rather than
// a claim about what any event "should" cost.
//
// The method is the one operators lose money on when they skip it: a package
// price like "3 hours, $500" prices only the hours a guest sees the booth
// running. It usually leaves out setup and teardown (an hour or more each
// way that the attendant is on site but the booth isn't "open"), the drive
// to and from the venue, and — the sharpest one — unlimited-print packages,
// where paper and ink cost scales with how many guests actually use the
// booth, and a busy event can quietly erase the margin a quiet one would
// have kept.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export const DEFAULTS = {
  eventHours: 3,
  setupMinutes: 60,
  teardownMinutes: 45,
  driveMinutesRoundTrip: 40,
  milesRoundTrip: 24,
  mileageRate: 0.67,
  attendantCount: 1,
  attendantHourlyRate: 25,
  expectedPrints: 150,
  costPerPrint: 0.35,
  propsBackdropCost: 20,
  equipmentCostPerEvent: 35,
  weekendHolidayPremiumPct: 15,
  overheadRate: 10,
  targetMarginPct: 35,
  otherCost: 0,
};

/**
 * Price one photo booth event booking.
 *
 * @param {object} input
 * @param {number} input.eventHours          Hours the booth is booked to run
 *   (the number on the package the guest sees).
 * @param {number} input.setupMinutes        Minutes on site before the booth
 *   opens — unpacking, backdrop, lighting, test prints.
 * @param {number} input.teardownMinutes     Minutes on site after the booth
 *   closes — packing down and loading the vehicle.
 * @param {number} input.driveMinutesRoundTrip Round-trip drive time between
 *   base and the venue.
 * @param {number} input.milesRoundTrip      Round-trip vehicle miles.
 * @param {number} input.mileageRate         Reimbursement rate per mile for
 *   fuel and vehicle wear.
 * @param {number} input.attendantCount      Attendants staffing the booth
 *   for the full committed time (setup, event, teardown, travel). 0 for an
 *   unattended/self-serve booth with no labor cost.
 * @param {number} input.attendantHourlyRate Target hourly pay per attendant.
 * @param {number} input.expectedPrints      Prints you expect this event to
 *   produce — your best estimate for an unlimited-print package, or the
 *   package's print allotment for a capped one.
 * @param {number} input.costPerPrint        Your all-in cost per print:
 *   paper, ink/dye-sub ribbon, and any per-print consumable.
 * @param {number} input.propsBackdropCost   Flat cost for props, backdrop
 *   rental or wear, and any consumable decor for this event.
 * @param {number} input.equipmentCostPerEvent Booth, camera, printer, and
 *   vehicle wear amortized per event booked (replacement cost spread over
 *   its useful life and expected bookings).
 * @param {number} input.weekendHolidayPremiumPct Percent added to labor and
 *   travel cost for booking a peak day — how most operators price a
 *   Friday/Saturday/holiday date over a weeknight.
 * @param {number} input.overheadRate        Business overhead as a percent
 *   of direct cost (insurance, software, storage, marketing).
 * @param {number} input.targetMarginPct     Net profit as a percent of the
 *   final price. Must be below 100.
 * @param {number} input.otherCost           Any other flat cost — a venue
 *   fee, a second vehicle, a rush edit turnaround.
 * @param {number|null} [input.proposedPrice] A price already on the table,
 *   to check against the breakeven and margin this calculator finds.
 */
export function calculateQuote(input) {
  const eventHours = number(input.eventHours, 'Event hours', { allowZero: false });
  const setupMinutes = number(input.setupMinutes, 'Setup minutes');
  const teardownMinutes = number(input.teardownMinutes, 'Teardown minutes');
  const driveMinutesRoundTrip = number(input.driveMinutesRoundTrip, 'Round-trip drive minutes');
  const milesRoundTrip = number(input.milesRoundTrip, 'Round-trip miles');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const attendantCount = number(input.attendantCount, 'Attendant count');
  const attendantHourlyRate = number(input.attendantHourlyRate, 'Attendant hourly rate');
  const expectedPrints = number(input.expectedPrints, 'Expected prints');
  const costPerPrint = number(input.costPerPrint, 'Cost per print');
  const propsBackdropCost = number(input.propsBackdropCost, 'Props & backdrop cost');
  const equipmentCostPerEvent = number(input.equipmentCostPerEvent, 'Equipment cost per event');
  const weekendHolidayPremiumPct = number(input.weekendHolidayPremiumPct, 'Weekend/holiday premium');
  const overheadRate = number(input.overheadRate, 'Overhead rate');
  const targetMarginPct = number(input.targetMarginPct, 'Target margin');
  if (targetMarginPct >= 100) throw new Error('Target margin must be less than 100%');
  const otherCost = number(input.otherCost, 'Other cost');

  const onSiteHours = eventHours + (setupMinutes + teardownMinutes) / 60;
  const committedHoursPerAttendant = onSiteHours + driveMinutesRoundTrip / 60;

  const laborCost = committedHoursPerAttendant * attendantHourlyRate * attendantCount;
  const mileageCost = milesRoundTrip * mileageRate;
  const peakBase = laborCost + mileageCost;
  const peakPremium = peakBase * (weekendHolidayPremiumPct / 100);
  const printCost = expectedPrints * costPerPrint;

  // Overhead (insurance, software, storage, marketing) is charged on the
  // business's own costs, not on the paper and ink that scale with how many
  // guests use the booth — so it is computed before prints are added in,
  // and does not inflate every time the print estimate changes.
  const nonPrintDirectCost = laborCost + mileageCost + peakPremium
    + propsBackdropCost + equipmentCostPerEvent + otherCost;
  const overhead = nonPrintDirectCost * (overheadRate / 100);
  const directCost = nonPrintDirectCost + printCost;
  const nonPrintCost = nonPrintDirectCost + overhead;
  const totalCost = nonPrintCost + printCost;
  const price = totalCost / (1 - targetMarginPct / 100);
  const profit = price - totalCost;

  const pricePerBookedHour = eventHours > 0 ? price / eventHours : null;
  const profitPerCommittedHour = committedHoursPerAttendant > 0
    ? profit / committedHoursPerAttendant
    : null;
  const costPerPrintEffective = expectedPrints > 0 ? printCost / expectedPrints : null;

  // What one more hour on site costs, marked up the same way as the rest of
  // the quote — the number to actually charge for running long, rather than
  // guessing a round figure when a couple asks to extend at the reception.
  const extraHourLaborCost = attendantHourlyRate * attendantCount;
  const extraHourWithOverhead = extraHourLaborCost * (1 + overheadRate / 100);
  const recommendedOvertimeRate = extraHourWithOverhead / (1 - targetMarginPct / 100);

  // The print-volume risk a flat "unlimited prints" package hides. Two
  // numbers: the actual print count (not just the estimate) at which this
  // quote's margin hits zero — holding this quote's own price and non-print
  // cost fixed, since the price is already agreed once the quote is sent —
  // and print cost's share of the price, which is the more comparable
  // number across quotes of different sizes and the one the tight flag
  // reads. A busy open bar can produce far more strips than a seated
  // dinner, and this is what says whether that risk is small or large.
  const maxPrintsAtBreakeven = costPerPrint > 0
    ? Math.max(0, Math.floor((price - nonPrintCost) / costPerPrint))
    : null;
  const printBudgetRemaining = maxPrintsAtBreakeven === null
    ? null
    : maxPrintsAtBreakeven - expectedPrints;
  const printCostSharePct = price > 0 ? (printCost / price) * 100 : null;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    onSiteHours,
    committedHoursPerAttendant,
    laborCost,
    mileageCost,
    peakPremium,
    printCost,
    propsBackdropCost,
    equipmentCostPerEvent,
    otherCost,
    directCost,
    overhead,
    totalCost,
    price,
    profit,
    profitMarginPct: price > 0 ? (profit / price) * 100 : null,
    pricePerBookedHour,
    profitPerCommittedHour,
    costPerPrintEffective,
    recommendedOvertimeRate,
    maxPrintsAtBreakeven,
    printBudgetRemaining,
    printCostSharePct,
    printBudgetTight: printCostSharePct !== null && printCostSharePct > 20,
    breakEvenPrice: totalCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : ((proposedPrice - totalCost) / proposedPrice) * 100,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
