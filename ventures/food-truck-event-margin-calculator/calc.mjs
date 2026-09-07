// Pure quote arithmetic for an independent mobile food truck or trailer
// operator pricing a one-off private event, corporate catering booking, or
// festival slot — not a regular daily service-window stop with walk-up
// sales. No network, no state: every rate, hour, and guest count is an
// input, so the result stays a transparent calculation the operator can
// check against their own commissary invoice, fuel receipts, and food cost
// sheet rather than a claim about what any event "should" cost.
//
// The method is the one operators lose money on when they skip it: a quote
// like "$8/head, 100-guest minimum" prices the food but usually leaves out
// commissary prep time, the drive to the venue, propane/generator fuel, the
// one-off special-event health permit many jurisdictions require on top of
// the truck's standing license, and — the sharpest one — that food cost
// scales with actual turnout while a flat per-event price does not, so a
// better-attended event than expected can quietly erase the margin a
// smaller one would have kept.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export const DEFAULTS = {
  expectedGuests: 100,
  foodCostPerGuest: 4.5,
  prepHours: 3,
  serviceHours: 4,
  breakdownHours: 1,
  driveMinutesRoundTrip: 40,
  milesRoundTrip: 30,
  mileageRate: 0.67,
  staffCount: 2,
  staffHourlyRate: 22,
  fuelPropaneCost: 25,
  commissaryFeeCost: 30,
  truckEquipmentCostPerEvent: 40,
  permitFeeCost: 25,
  weekendHolidayPremiumPct: 10,
  overheadRate: 8,
  targetMarginPct: 30,
  otherCost: 0,
};

/**
 * Price one food truck event, catering, or festival booking.
 *
 * @param {object} input
 * @param {number} input.expectedGuests      Guests you expect to serve, or
 *   the guaranteed minimum a flat-price quote is built around.
 * @param {number} input.foodCostPerGuest    Your all-in ingredient and
 *   packaging cost per guest served.
 * @param {number} input.prepHours           Commissary prep time before
 *   the truck leaves for the venue.
 * @param {number} input.serviceHours        Hours the truck actually
 *   serves at the event.
 * @param {number} input.breakdownHours      Cleanup and breakdown time
 *   after service ends, before the truck leaves the venue.
 * @param {number} input.driveMinutesRoundTrip Round-trip drive time
 *   between commissary/base and the venue.
 * @param {number} input.milesRoundTrip      Round-trip vehicle miles.
 * @param {number} input.mileageRate         Reimbursement rate per mile
 *   for fuel and vehicle wear on the drive.
 * @param {number} input.staffCount          Staff working the event
 *   (prep, service, and breakdown), including the owner-operator if they
 *   are one of the working hours.
 * @param {number} input.staffHourlyRate     Target hourly pay per staff
 *   member.
 * @param {number} input.fuelPropaneCost     Flat propane/generator fuel
 *   cost for running the truck's equipment at this event.
 * @param {number} input.commissaryFeeCost   Commissary or licensed
 *   prep-kitchen fee attributable to this event.
 * @param {number} input.truckEquipmentCostPerEvent Truck and equipment
 *   wear amortized per event booked (replacement cost spread over its
 *   useful life and expected bookings).
 * @param {number} input.permitFeeCost       One-off special-event or
 *   temporary health permit fee this booking requires, on top of the
 *   truck's standing license.
 * @param {number} input.weekendHolidayPremiumPct Percent added to labor
 *   and travel cost for booking a peak day.
 * @param {number} input.overheadRate        Business overhead as a
 *   percent of direct cost (insurance, commissary rent share, software).
 * @param {number} input.targetMarginPct     Net profit as a percent of
 *   the final price. Must be below 100.
 * @param {number} input.otherCost           Any other flat cost — a
 *   festival vendor fee, a rental generator, a second vehicle.
 * @param {number|null} [input.proposedPrice] A price already on the
 *   table, to check against the breakeven and margin this calculator
 *   finds.
 */
export function calculateQuote(input) {
  const expectedGuests = number(input.expectedGuests, 'Expected guests', { allowZero: false });
  const foodCostPerGuest = number(input.foodCostPerGuest, 'Food cost per guest');
  const prepHours = number(input.prepHours, 'Prep hours');
  const serviceHours = number(input.serviceHours, 'Service hours');
  const breakdownHours = number(input.breakdownHours, 'Breakdown hours');
  const driveMinutesRoundTrip = number(input.driveMinutesRoundTrip, 'Round-trip drive minutes');
  const milesRoundTrip = number(input.milesRoundTrip, 'Round-trip miles');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const staffCount = number(input.staffCount, 'Staff count');
  const staffHourlyRate = number(input.staffHourlyRate, 'Staff hourly rate');
  const fuelPropaneCost = number(input.fuelPropaneCost, 'Fuel & propane cost');
  const commissaryFeeCost = number(input.commissaryFeeCost, 'Commissary fee cost');
  const truckEquipmentCostPerEvent = number(input.truckEquipmentCostPerEvent, 'Truck & equipment cost per event');
  const permitFeeCost = number(input.permitFeeCost, 'Permit fee cost');
  const weekendHolidayPremiumPct = number(input.weekendHolidayPremiumPct, 'Weekend/holiday premium');
  const overheadRate = number(input.overheadRate, 'Overhead rate');
  const targetMarginPct = number(input.targetMarginPct, 'Target margin');
  if (targetMarginPct >= 100) throw new Error('Target margin must be less than 100%');
  const otherCost = number(input.otherCost, 'Other cost');

  const onSiteHours = prepHours + serviceHours + breakdownHours;
  const committedHoursPerStaff = onSiteHours + driveMinutesRoundTrip / 60;

  const laborCost = committedHoursPerStaff * staffHourlyRate * staffCount;
  const mileageCost = milesRoundTrip * mileageRate;
  const peakBase = laborCost + mileageCost;
  const peakPremium = peakBase * (weekendHolidayPremiumPct / 100);
  const foodCost = expectedGuests * foodCostPerGuest;

  // Overhead (insurance, commissary rent share, software) is charged on the
  // business's own costs, not on food that scales with how many guests turn
  // up — so it is computed before food cost is added in, and does not
  // inflate every time the headcount estimate changes.
  const nonFoodDirectCost = laborCost + mileageCost + peakPremium
    + fuelPropaneCost + commissaryFeeCost + truckEquipmentCostPerEvent + permitFeeCost + otherCost;
  const overhead = nonFoodDirectCost * (overheadRate / 100);
  const directCost = nonFoodDirectCost + foodCost;
  const nonFoodCost = nonFoodDirectCost + overhead;
  const totalCost = nonFoodCost + foodCost;
  const price = totalCost / (1 - targetMarginPct / 100);
  const profit = price - totalCost;

  const pricePerGuest = expectedGuests > 0 ? price / expectedGuests : null;
  const profitPerCommittedHour = committedHoursPerStaff > 0
    ? profit / committedHoursPerStaff
    : null;
  const foodCostPerGuestEffective = expectedGuests > 0 ? foodCost / expectedGuests : null;

  // What one more guest beyond the guaranteed count costs to actually
  // serve, marked up the same way as the rest of the quote — the number to
  // charge per head over the minimum, rather than guessing a round figure
  // when a planner asks to add ten seats the week before.
  const extraGuestFoodCostWithOverhead = foodCostPerGuest * (1 + overheadRate / 100);
  const recommendedExtraGuestRate = extraGuestFoodCostWithOverhead / (1 - targetMarginPct / 100);

  // The turnout risk a flat per-event price hides. Two numbers: the actual
  // guest count (not just the estimate) at which this quote's margin hits
  // zero — holding this quote's own price and non-food cost fixed, since
  // the price is already agreed once the quote is sent — and food cost's
  // share of the price, which is the more comparable number across quotes
  // of different sizes and the one the tight flag reads. A better-attended
  // wedding or a festival with a longer line can produce far more served
  // guests than a corporate lunch headcount, and this is what says whether
  // that risk is small or large.
  const maxGuestsAtBreakeven = foodCostPerGuest > 0
    ? Math.max(0, Math.floor((price - nonFoodCost) / foodCostPerGuest))
    : null;
  const guestBudgetRemaining = maxGuestsAtBreakeven === null
    ? null
    : maxGuestsAtBreakeven - expectedGuests;
  const foodCostSharePct = price > 0 ? (foodCost / price) * 100 : null;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    onSiteHours,
    committedHoursPerStaff,
    laborCost,
    mileageCost,
    peakPremium,
    foodCost,
    fuelPropaneCost,
    commissaryFeeCost,
    truckEquipmentCostPerEvent,
    permitFeeCost,
    otherCost,
    directCost,
    overhead,
    totalCost,
    price,
    profit,
    profitMarginPct: price > 0 ? (profit / price) * 100 : null,
    pricePerGuest,
    profitPerCommittedHour,
    foodCostPerGuestEffective,
    recommendedExtraGuestRate,
    maxGuestsAtBreakeven,
    guestBudgetRemaining,
    foodCostSharePct,
    foodBudgetTight: foodCostSharePct !== null && foodCostSharePct > 35,
    breakEvenPrice: totalCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : ((proposedPrice - totalCost) / proposedPrice) * 100,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
