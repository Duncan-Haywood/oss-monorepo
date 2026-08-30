// Pure quote arithmetic for a portable-sanitation (porta-potty) event rental.
// No network, no state: every rate, day, and mile is an input, so the result
// stays a transparent calculation the yard can check against their own truck
// tickets and pump-out invoices rather than a claim about what any event
// "should" cost or how many units a health department will require.
//
// The method is the one yards actually lose money on when they skip it: rent
// is charged for every day the box sits (Friday drop through Sunday pickup
// is three days, not one Saturday), pump-outs are a separate truck, and
// mileage is a round trip for delivery *and* a round trip for pickup. A
// "Saturday special" that multiplies headcount by a flat unit price cannot
// see any of those three lines.

// Common starting daily rents and per-service pump-out costs. These are
// ballpark figures to start from, NOT a published tariff, a health-code
// schedule, or a guarantee. Real yards replace them with their own book.
export const UNIT_PRESETS = Object.freeze([
  { id: 'standard', label: 'Standard portable restroom', rentPerDay: 18, serviceEach: 28 },
  { id: 'ada', label: 'Wheelchair-accessible unit', rentPerDay: 40, serviceEach: 38 },
  { id: 'deluxe', label: 'Deluxe / flush unit', rentPerDay: 55, serviceEach: 45 },
  { id: 'handwash', label: 'Handwash / sanitizer station', rentPerDay: 22, serviceEach: 22 },
  { id: 'trailer', label: 'Restroom trailer', rentPerDay: 280, serviceEach: 90 },
]);

// People per restroom as a *starting estimate* for event planning, by how
// long the event runs. Longer events and alcohol raise usage; the yard still
// decides what they send. This is not a code table and is not a determination
// that an event is or is not adequately served.
export const PEOPLE_PER_UNIT_BY_HOURS = Object.freeze([
  { maxHours: 4, peoplePerUnit: 50 },
  { maxHours: 6, peoplePerUnit: 40 },
  { maxHours: 8, peoplePerUnit: 30 },
  { maxHours: 10, peoplePerUnit: 25 },
  { maxHours: 12, peoplePerUnit: 20 },
  { maxHours: Infinity, peoplePerUnit: 16 },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Starting people-per-restroom figure for a given event length.
 * Alcohol shortens the figure by 20% (more units), which is a common
 * planning adjustment — not a health-department rule.
 */
export function peoplePerUnit({ eventHours, alcohol = false } = {}) {
  const hours = number(eventHours ?? 0, 'Event hours');
  const row = PEOPLE_PER_UNIT_BY_HOURS.find(entry => hours <= entry.maxHours);
  const base = row.peoplePerUnit;
  return alcohol ? base * 0.8 : base;
}

/**
 * A starting fleet the yard can accept or override. Accessible units are
 * suggested as at least one whenever any restrooms go out, and at least 5%
 * of the restroom count — a common planning split, not an ADA determination.
 * Handwash stations are suggested only when the event serves food.
 */
export function suggestFleet({ attendees, eventHours, alcohol = false, foodService = false } = {}) {
  const heads = number(attendees ?? 0, 'Attendees');
  const ppu = peoplePerUnit({ eventHours, alcohol });
  if (heads === 0) {
    return { peoplePerUnit: ppu, restroomUnits: 0, standard: 0, ada: 0, handwash: 0 };
  }
  if (ppu === 0) throw new Error('People per unit must be greater than zero');
  let restroomUnits = Math.ceil(heads / ppu);
  const ada = restroomUnits === 0 ? 0 : Math.max(1, Math.ceil(restroomUnits * 0.05));
  const standard = Math.max(0, restroomUnits - ada);
  const handwash = foodService ? Math.max(1, Math.ceil(restroomUnits / 4)) : 0;
  return { peoplePerUnit: ppu, restroomUnits, standard, ada, handwash };
}

/**
 * Price a portable-restroom event rental from the fleet and the days it sits.
 *
 * @param {object} input
 * @param {Array<{name?: string, quantity: number, rentPerDay: number, serviceEach: number}>} input.units
 * @param {number} input.daysOnSite          Calendar days the boxes sit, including
 *   drop day and pickup day. Friday-to-Sunday is 3, not 1.
 * @param {number} input.serviceVisits       Extra pump-out trips while on site
 *   (delivery already leaves them clean; pickup hauls them dirty).
 * @param {number} input.deliveryFee         Flat drop charge.
 * @param {number} input.pickupFee           Flat pickup charge.
 * @param {number} input.milesOneWay         Yard to site, one way.
 * @param {number} input.ratePerMile         Loaded truck rate per mile.
 * @param {number} input.weekendPremiumPct   Percent on haul only (drop, pickup,
 *   and mileage) — how yards surcharge a Saturday or holiday drop.
 * @param {number} input.consumablesPerUnit  Paper, sanitizer, deodorizer per unit.
 * @param {number} input.otherCost           Permits, after-hours, damage waiver, etc.
 * @param {number} input.overheadRate        Business overhead as a % on direct cost.
 * @param {number} input.targetMargin        Net profit as a % of the final price.
 * @param {number|null} input.proposedPrice  Optional price already on the table.
 * @param {number} [input.attendees]
 * @param {number} [input.eventHours]
 * @param {boolean} [input.alcohol]
 * @param {boolean} [input.foodService]
 */
export function calculateQuote(input) {
  const unitsInput = Array.isArray(input.units) ? input.units : [];
  if (unitsInput.length === 0) throw new Error('Add at least one unit type to price');

  const daysOnSite = number(input.daysOnSite ?? 0, 'Days on site');
  const serviceVisits = number(input.serviceVisits ?? 0, 'Service visits');
  const deliveryFee = number(input.deliveryFee ?? 0, 'Delivery fee');
  const pickupFee = number(input.pickupFee ?? 0, 'Pickup fee');
  const milesOneWay = number(input.milesOneWay ?? 0, 'Miles one way');
  const ratePerMile = number(input.ratePerMile ?? 0, 'Rate per mile');
  const weekendPremiumPct = number(input.weekendPremiumPct ?? 0, 'Weekend premium');
  const consumablesPerUnit = number(input.consumablesPerUnit ?? 0, 'Consumables per unit');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const units = unitsInput.map((unit, index) => {
    const label = unit.name?.trim() || `Unit type ${index + 1}`;
    const quantity = number(unit.quantity ?? 0, `${label}: quantity`);
    const rentPerDay = number(unit.rentPerDay ?? 0, `${label}: rent per day`);
    const serviceEach = number(unit.serviceEach ?? 0, `${label}: service each`);
    const rental = quantity * rentPerDay * daysOnSite;
    const service = quantity * serviceEach * serviceVisits;
    return {
      name: label,
      quantity,
      rentPerDay,
      serviceEach,
      rental,
      service,
      lineTotal: rental + service,
    };
  });

  const totalUnits = units.reduce((sum, unit) => sum + unit.quantity, 0);
  const rentalCost = units.reduce((sum, unit) => sum + unit.rental, 0);
  const serviceCost = units.reduce((sum, unit) => sum + unit.service, 0);

  // Two round trips: one to drop, one to pick up. That is 4 × one-way miles.
  // A Saturday-special quote that prices only the event day never sees this.
  const mileageCost = 4 * milesOneWay * ratePerMile;
  const haulBase = deliveryFee + pickupFee + mileageCost;
  const weekendPremium = haulBase * weekendPremiumPct / 100;
  const haulCost = haulBase + weekendPremium;
  const consumables = totalUnits * consumablesPerUnit;

  const directCost = rentalCost + serviceCost + haulCost + consumables + otherCost;
  const overhead = directCost * overheadRate / 100;
  const totalCost = directCost + overhead;
  const price = totalCost / (1 - targetMargin / 100);
  const profit = price - totalCost;
  const unitDays = totalUnits * daysOnSite;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const hasAttendance = input.attendees !== null && input.attendees !== undefined && input.attendees !== '';
  const suggestion = hasAttendance
    ? suggestFleet({
        attendees: input.attendees,
        eventHours: input.eventHours ?? 0,
        alcohol: Boolean(input.alcohol),
        foodService: Boolean(input.foodService),
      })
    : null;

  const quotedRestrooms = units
    .filter(unit => !/handwash|sanitizer|trailer/i.test(unit.name))
    .reduce((sum, unit) => sum + unit.quantity, 0);

  return {
    units: units.map(unit => ({
      ...unit,
      costShare: directCost === 0 ? 0 : unit.lineTotal / directCost * 100,
    })),
    totalUnits,
    unitDays,
    // Returned because they are the two terms the *customer* is agreeing to —
    // how long the units stay and how often they are serviced — so the
    // proposal can put them in the scope. Everything else derived from them
    // here is a cost, and the customer's copy never carries costs.
    daysOnSite,
    serviceVisits,
    rentalCost,
    serviceCost,
    mileageCost,
    weekendPremium,
    haulCost,
    consumables,
    otherCost,
    overhead,
    directCost,
    totalCost,
    price,
    profit,
    // The two sanity numbers a yard checks before the quote goes out.
    pricePerUnitDay: unitDays === 0 ? null : price / unitDays,
    pricePerAttendee: suggestion && Number(input.attendees) > 0
      ? price / Number(input.attendees)
      : null,
    breakEvenPrice: totalCost,
    suggestion,
    quotedRestrooms,
    restroomsLookLight: suggestion
      ? quotedRestrooms < suggestion.restroomUnits
      : false,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - totalCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
      belowBreakEven: proposedPrice < totalCost,
    },
  };
}
