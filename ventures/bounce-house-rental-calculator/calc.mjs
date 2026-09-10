// Pure pricing arithmetic for a bounce-house / inflatable party rental
// booking. No network, no state: every rate, mile, and minute is an input,
// so the result stays a transparent calculation the operator can check
// against their own truck log and insurance bill rather than a claim about
// what any event "should" cost or whether a site meets code.
//
// The costs a flat "per unit per day" rental rate cannot see, and the ones
// this exists to put back in:
//   - Delivery is a round trip and pickup is a second round trip, even for a
//     same-day booking, because the truck makes the drive twice.
//   - Setup and teardown are paid crew minutes, not included in the rental
//     rate by default.
//   - A generator is a real line item at a site with no outlet in extension-
//     cord reach, which describes most parks and fields.
//   - A water slide or dunk tank commonly needs an attendant on duty for the
//     whole rental window under the operator's own liability policy -- a
//     labor cost with nothing to do with delivery or setup.
//   - General-liability coverage for inflatables is usually priced against
//     the replacement value of the equipment on site, not against the quote,
//     so it scales with the fleet, not the day.

// Common starting daily rates and replacement values by unit type. These are
// ballpark figures to start from, NOT a published tariff, an insurance
// schedule, or a guarantee. Real operators replace them with their own book.
export const UNIT_PRESETS = Object.freeze([
  { id: 'bounce-standard', label: 'Standard bounce house', dailyRate: 150, replacementValue: 1800, wet: false },
  { id: 'bounce-combo', label: 'Bounce house + slide combo', dailyRate: 225, replacementValue: 3200, wet: false },
  { id: 'water-slide', label: 'Water slide', dailyRate: 275, replacementValue: 3800, wet: true },
  { id: 'obstacle-course', label: 'Obstacle course', dailyRate: 350, replacementValue: 5200, wet: false },
  { id: 'dunk-tank', label: 'Dunk tank', dailyRate: 180, replacementValue: 2400, wet: true },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a bounce-house / inflatable rental booking from the units deployed,
 * the crew time to run them, and the truck's two round trips.
 *
 * @param {object} input
 * @param {Array<{name?: string, quantity: number, dailyRate: number, replacementValue: number, wet?: boolean}>} input.units
 * @param {number} input.eventDays           Calendar days the unit is out.
 *   An overnight rental Friday to Saturday morning is still 1 if it comes
 *   back the next day; a full weekend hold is 2 or more.
 * @param {number} input.setupMinutesPerUnit
 * @param {number} input.teardownMinutesPerUnit
 * @param {number} input.crewSize
 * @param {number} input.laborRate            Per crew member, per hour.
 * @param {number} input.deliveryFee          Flat drop charge.
 * @param {number} input.pickupFee            Flat pickup charge.
 * @param {number} input.milesOneWay          Yard/warehouse to site, one way.
 * @param {number} input.ratePerMile          Loaded truck rate per mile.
 * @param {boolean} input.generatorNeeded     No outlet in extension-cord reach.
 * @param {number} input.generatorFee
 * @param {number} input.attendantHours       Hours a wet-unit attendant is on
 *   duty. Only billed against units flagged `wet`.
 * @param {number} input.attendantRate        Per hour, per wet unit.
 * @param {number} input.insuranceRatePct     General-liability cost as a % of
 *   the deployed fleet's total replacement value, charged per event.
 * @param {number} input.consumablesPerUnit   Stakes, sandbags, tarps, extension cords, blower fuel.
 * @param {number} input.otherCost            Permits, extra staff, cleaning.
 * @param {number} input.overheadRate         Business overhead as a % on direct cost.
 * @param {number} input.targetMargin         Net profit as a % of the final price.
 * @param {number|null} input.proposedPrice   Optional price already on the table.
 */
export function calculateQuote(input) {
  const unitsInput = Array.isArray(input.units) ? input.units : [];
  if (unitsInput.length === 0) throw new Error('Add at least one unit to price');

  const eventDays = number(input.eventDays ?? 0, 'Event days', { min: 0, allowZero: false });
  const setupMinutesPerUnit = number(input.setupMinutesPerUnit ?? 0, 'Setup minutes per unit');
  const teardownMinutesPerUnit = number(input.teardownMinutesPerUnit ?? 0, 'Teardown minutes per unit');
  const crewSize = number(input.crewSize ?? 0, 'Crew size');
  const laborRate = number(input.laborRate ?? 0, 'Labor rate');
  const deliveryFee = number(input.deliveryFee ?? 0, 'Delivery fee');
  const pickupFee = number(input.pickupFee ?? 0, 'Pickup fee');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const ratePerMile = number(input.ratePerMile ?? 0, 'Rate per mile');
  const generatorNeeded = Boolean(input.generatorNeeded);
  const generatorFee = number(input.generatorFee ?? 0, 'Generator fee');
  const attendantHours = number(input.attendantHours ?? 0, 'Attendant hours');
  const attendantRate = number(input.attendantRate ?? 0, 'Attendant rate');
  const insuranceRatePct = number(input.insuranceRatePct ?? 0, 'Insurance rate');
  const consumablesPerUnit = number(input.consumablesPerUnit ?? 0, 'Consumables per unit');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const units = unitsInput.map((unit, index) => {
    const label = unit.name?.trim() || `Unit ${index + 1}`;
    const quantity = number(unit.quantity ?? 0, `${label}: quantity`);
    const dailyRate = number(unit.dailyRate ?? 0, `${label}: daily rate`);
    const replacementValue = number(unit.replacementValue ?? 0, `${label}: replacement value`);
    const wet = Boolean(unit.wet);
    const rental = quantity * dailyRate * eventDays;
    return { name: label, quantity, dailyRate, replacementValue, wet, rental };
  });

  const totalUnits = units.reduce((sum, unit) => sum + unit.quantity, 0);
  const wetUnits = units.reduce((sum, unit) => sum + (unit.wet ? unit.quantity : 0), 0);
  const rentalCost = units.reduce((sum, unit) => sum + unit.rental, 0);
  const totalReplacementValue = units.reduce((sum, unit) => sum + unit.quantity * unit.replacementValue, 0);

  const setupMinutes = totalUnits * setupMinutesPerUnit;
  const teardownMinutes = totalUnits * teardownMinutesPerUnit;
  const laborHours = crewSize * (setupMinutes + teardownMinutes) / 60;
  const laborCost = laborHours * laborRate;

  // Two round trips: one to deliver, one to pick up, even for a same-day
  // booking. A quote that only prices the miles once never sees the return
  // drive for either leg.
  const mileageCost = 4 * milesOneWay * ratePerMile;
  const haulCost = deliveryFee + pickupFee + mileageCost;

  const generatorCost = generatorNeeded ? generatorFee : 0;
  const attendantCost = wetUnits > 0 ? wetUnits * attendantHours * attendantRate : 0;
  const insuranceCost = totalReplacementValue * insuranceRatePct / 100;
  const consumables = totalUnits * consumablesPerUnit;

  const directCost = rentalCost + laborCost + haulCost + generatorCost + attendantCost + insuranceCost + consumables + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    units: units.map(unit => ({
      ...unit,
      costShare: directCost === 0 ? 0 : unit.rental / directCost * 100,
    })),
    totalUnits,
    wetUnits,
    eventDays,
    rentalCost,
    laborHours,
    laborCost,
    mileageCost,
    haulCost,
    generatorCost,
    attendantCost,
    insuranceCost,
    totalReplacementValue,
    consumables,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    pricePerUnit: totalUnits === 0 ? null : price / totalUnits,
    breakEvenPrice: totalCost,
    // A wet unit is quoted but no attendant time is budgeted -- a common gap
    // between what the fleet includes and what the labor line actually pays
    // for. This is a flag to check against the operator's own policy, not a
    // determination that an attendant is legally required.
    wetUnitsMissingAttendant: wetUnits > 0 && attendantHours * attendantRate === 0,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
