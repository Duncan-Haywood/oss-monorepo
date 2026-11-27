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

// PSAI Special Event Chart, Extended Breakdown: restrooms required when no
// pumping service is provided, 50/50 mix of men and women, one unit taking
// about 200 uses with 4 hours between uses. Rows are average crowd size;
// columns are average hours at the event, 1 to 10. Source: Portable
// Sanitation Association International (independent study by the Center of
// Business and Industrial Studies, University of Missouri-St. Louis), copy at
// https://www.henniker.org/sites/g/files/vyhlif5391/f/uploads/portable_sanitation_chart.pdf
// Transcribed verbatim; calc.test.mjs pins every row. It is an industry
// planning chart, not a health-code table: local rules and venues may require
// more, and the yard still decides what it sends.
export const PSAI_SPECIAL_EVENT_CHART = Object.freeze([
  [500, [2, 4, 4, 5, 6, 7, 9, 9, 10, 12]],
  [1000, [4, 6, 8, 8, 9, 9, 11, 12, 13, 13]],
  [2000, [5, 6, 9, 12, 14, 16, 18, 20, 23, 25]],
  [3000, [6, 9, 12, 16, 20, 24, 26, 30, 34, 38]],
  [4000, [8, 13, 16, 22, 25, 30, 35, 40, 45, 50]],
  [5000, [12, 15, 20, 25, 31, 38, 44, 50, 56, 63]],
  [10000, [15, 25, 38, 50, 63, 75, 88, 100, 113, 125]],
  [15000, [20, 38, 56, 75, 94, 113, 131, 150, 169, 188]],
  [20000, [25, 50, 75, 100, 125, 150, 175, 200, 225, 250]],
  [25000, [38, 69, 99, 130, 160, 191, 221, 252, 282, 313]],
  [30000, [46, 82, 119, 156, 192, 229, 266, 302, 339, 376]],
  [35000, [53, 96, 139, 181, 224, 267, 310, 352, 395, 438]],
  [40000, [61, 109, 158, 207, 256, 305, 354, 403, 452, 501]],
  [45000, [68, 123, 178, 233, 288, 343, 398, 453, 508, 563]],
  [50000, [76, 137, 198, 259, 320, 381, 442, 503, 564, 626]],
  [55000, [83, 150, 217, 285, 352, 419, 486, 554, 621, 688]],
  [60000, [91, 164, 237, 311, 384, 457, 531, 604, 677, 751]],
  [65000, [98, 177, 257, 336, 416, 495, 575, 654, 734, 813]],
  [70000, [106, 191, 277, 362, 448, 533, 619, 704, 790, 876]],
  [75000, [113, 205, 296, 388, 480, 571, 663, 755, 846, 938]],
  [80000, [121, 218, 316, 414, 512, 609, 707, 805, 903, 1001]],
  [85000, [128, 232, 336, 440, 544, 647, 751, 855, 959, 1063]],
  [90000, [136, 246, 356, 466, 576, 686, 796, 906, 1016, 1126]],
  [95000, [143, 259, 375, 491, 607, 724, 840, 956, 1072, 1188]],
  [100000, [151, 273, 395, 517, 639, 762, 884, 1006, 1128, 1251]],
].map(([crowd, units]) => Object.freeze({ crowd, units: Object.freeze(units) })));

// PSAI's public brochure: "If you are serving alcohol at your event, add
// 10-20 percent more units." The tool takes the top of that range.
export const ALCOHOL_UPLIFT = 0.2;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Restrooms from the PSAI Special Event Chart for a crowd and event length.
 *
 * Hours round up to a whole column (a 4.5-hour event reads the 5-hour
 * column); under one hour reads the 1-hour column. A crowd between two chart
 * rows is interpolated linearly between them; below 500 or above 100,000, the
 * nearest row is scaled in proportion to the crowd; past 10 hours, the
 * 10-hour column is scaled by hours / 10 (the chart stops at 10 hours, and an
 * event that long usually gets a service visit instead). Those three cases
 * are outside the chart and are reported as `withinChart: false`. Alcohol
 * adds ALCOHOL_UPLIFT. The result rounds up, with a floor of one unit.
 */
export function psaiRestrooms({ attendees, eventHours, alcohol = false } = {}) {
  const heads = number(attendees ?? 0, 'Attendees');
  const hours = number(eventHours ?? 0, 'Event hours');
  if (heads === 0) return { restroomUnits: 0, withinChart: true };
  const column = Math.min(10, Math.max(1, Math.ceil(hours)));
  const at = row => row.units[column - 1];
  const rows = PSAI_SPECIAL_EVENT_CHART;
  const first = rows[0];
  const last = rows[rows.length - 1];
  let units;
  let withinChart = hours <= 10;
  if (heads <= first.crowd) {
    units = at(first) * heads / first.crowd;
    if (heads < first.crowd) withinChart = false;
  } else if (heads >= last.crowd) {
    units = at(last) * heads / last.crowd;
    if (heads > last.crowd) withinChart = false;
  } else {
    const upper = rows.findIndex(row => row.crowd >= heads);
    const lo = rows[upper - 1];
    const hi = rows[upper];
    units = at(lo) + (at(hi) - at(lo)) * (heads - lo.crowd) / (hi.crowd - lo.crowd);
  }
  if (hours > 10) units *= hours / 10;
  if (alcohol) units *= 1 + ALCOHOL_UPLIFT;
  // Round away float noise before the ceiling: 9 * 1.2 must stay 10.8 -> 11,
  // and 5 * 200 / 500 must stay exactly 2.
  const restroomUnits = Math.max(1, Math.ceil(Math.round(units * 1e9) / 1e9));
  return { restroomUnits, withinChart };
}

/**
 * A starting fleet the yard can accept or override, sized from the PSAI
 * Special Event Chart. Accessible units are suggested as at least one whenever
 * any restrooms go out, and at least 5% of the restroom count (the ADA rule is
 * 5%, not less than one, *per cluster*: a site with several clusters needs
 * more) — a planning split, not an ADA determination. Handwash stations are
 * suggested only when the event serves food.
 */
export function suggestFleet({ attendees, eventHours, alcohol = false, foodService = false } = {}) {
  const heads = number(attendees ?? 0, 'Attendees');
  const { restroomUnits, withinChart } = psaiRestrooms({ attendees: heads, eventHours, alcohol });
  if (restroomUnits === 0) {
    return { peoplePerUnit: null, restroomUnits: 0, standard: 0, ada: 0, handwash: 0, withinChart, source: 'PSAI Special Event Chart' };
  }
  const ada = Math.max(1, Math.ceil(restroomUnits * 0.05));
  const standard = Math.max(0, restroomUnits - ada);
  const handwash = foodService ? Math.max(1, Math.ceil(restroomUnits / 4)) : 0;
  const peoplePerUnit = Math.round(heads / restroomUnits);
  return { peoplePerUnit, restroomUnits, standard, ada, handwash, withinChart, source: 'PSAI Special Event Chart' };
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

  const hasProposed = String(input.proposedPrice ?? '').trim() !== '';
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
