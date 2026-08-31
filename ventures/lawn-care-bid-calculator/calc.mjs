// Pure bid arithmetic for a residential or small-commercial lawn-care route.
// No network, no state: every rate, wage, and production figure is an input,
// so the result stays a transparent calculation the operator can check against
// their own fuel receipts and time cards rather than a claim about what any
// yard "should" cost.
//
// The method is the one a crew actually runs a property with: each service
// line (turf, beds, edging, hedges) divided by its own production rate gives
// on-property hours, then travel, fuel, and dump are layered on. That is what
// separates a defensible bid from a lot-size guess — a 10,000 sq ft lawn that
// is mostly open turf is a 30-minute mow, but the same lot with 350 sq ft of
// beds and an 18-minute drive each way is a two-hour stop. A flat "price per
// acre" rule cannot see either the beds or the windshield time.

export const WEEKS_PER_MONTH = 52 / 12;
export const SQFT_PER_ACRE = 43560;

// Common starting points for production rates. Quantity-per-hour, in the unit
// named on the row. These are ballpark figures to start from, NOT an industry
// standard or a guarantee: real rates depend on crew, equipment, obstacles,
// slope, wet grass, and how much is actually done on each visit. Operators
// should replace them with rates timed from their own crews.
export const SERVICE_PRESETS = Object.freeze([
  { label: 'Turf mowing', unit: 'sqft', rate: 20000 },
  { label: 'Edging & blowing', unit: 'minutes', rate: 60 },
  { label: 'Bed weeding / detail', unit: 'sqft', rate: 400 },
  { label: 'Hedge / shrub trim', unit: 'linear_ft', rate: 80 },
  { label: 'Leaf cleanup', unit: 'sqft', rate: 2500 },
  { label: 'Hardscape blow-off', unit: 'sqft', rate: 8000 },
]);

export const UNIT_LABELS = Object.freeze({
  sqft: 'sq ft',
  acres: 'acres',
  minutes: 'minutes',
  linear_ft: 'linear ft',
});

function number(value, name, { min = 0, allowZero = true, max = Infinity } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (result > max) throw new Error(`${name} must be at most ${max}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function quantityInRateUnits(quantity, unit) {
  // Acres are accepted as a convenience for large lots; the production-rate
  // presets are in square feet, so convert once and keep the rest of the
  // arithmetic on a single unit.
  if (unit === 'acres') return quantity * SQFT_PER_ACRE;
  return quantity;
}

function rateUnitFor(unit) {
  return unit === 'acres' ? 'sqft' : unit;
}

/**
 * Price a recurring lawn-care stop from its services, travel, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, quantity: number, productionRate: number, unit?: string}>} input.services
 *   One row per service done on the visit. Splitting turf from beds is the
 *   whole point: a single lot-size rate hides the detail work that sinks
 *   underpriced routes.
 * @param {number} input.visitsPerWeek      How often the crew hits this stop.
 * @param {number} input.serviceWeeksPerYear Weeks billed in a year (growing
 *   season). Annual is this times the per-visit price, not monthly × 12.
 * @param {number} input.oneWayMinutes      Drive time one way. Round-trip is
 *   applied to every visit — windshield time is labor.
 * @param {number} input.crewSize           People on the stop. Labor hours stay
 *   person-hours; this only reports clock time on site.
 * @param {number} input.hourlyWage
 * @param {number} input.burdenRate         Payroll burden as a % on top of wage.
 * @param {number} input.fuelPerVisit
 * @param {number} input.dumpPerVisit       Dump / disposal / bagging cost per visit.
 * @param {number} input.equipmentMonthly   This property's share of mower, trailer, and shop.
 * @param {number} input.otherMonthly
 * @param {number} input.overheadRate       Business overhead as a % on direct cost.
 * @param {number} input.targetMargin       Net profit as a % of the final price.
 * @param {number|null} input.proposedPrice Optional in-season monthly price already on the table.
 */
export function calculateBid(input) {
  const servicesInput = Array.isArray(input.services) ? input.services : [];
  if (servicesInput.length === 0) throw new Error('Add at least one service to price');

  const visitsPerWeek = number(input.visitsPerWeek ?? 0, 'Visits per week');
  const serviceWeeksPerYear = number(input.serviceWeeksPerYear ?? 0, 'Service weeks per year', { max: 52 });
  const oneWayMinutes = number(input.oneWayMinutes ?? 0, 'One-way travel');
  const crewSize = number(input.crewSize ?? 1, 'Crew size', { min: 1, allowZero: false });
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const fuelPerVisit = number(input.fuelPerVisit ?? 0, 'Fuel per visit');
  const dumpPerVisit = number(input.dumpPerVisit ?? 0, 'Dump fee per visit');
  const equipmentMonthly = number(input.equipmentMonthly ?? 0, 'Equipment cost');
  const otherMonthly = number(input.otherMonthly ?? 0, 'Other monthly cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const travelHoursPerVisit = (oneWayMinutes * 2) / 60;

  const services = servicesInput.map((service, index) => {
    const label = service.name?.trim() || `Service ${index + 1}`;
    const unit = service.unit && UNIT_LABELS[service.unit] ? service.unit : 'sqft';
    const quantity = number(service.quantity ?? 0, `${label}: quantity`);
    const productionRate = number(
      service.productionRate ?? 0,
      `${label}: production rate`,
      { allowZero: false },
    );
    const workQuantity = quantityInRateUnits(quantity, unit);
    const hoursPerVisit = workQuantity / productionRate;
    return {
      name: label,
      unit: rateUnitFor(unit),
      enteredUnit: unit,
      quantity,
      workQuantity,
      productionRate,
      hoursPerVisit,
    };
  });

  const onPropertyHoursPerVisit = services.reduce((sum, row) => sum + row.hoursPerVisit, 0);
  const hoursPerVisit = onPropertyHoursPerVisit + travelHoursPerVisit;
  const clockHoursOnSite = onPropertyHoursPerVisit / crewSize;
  const inSeasonMonthlyVisits = visitsPerWeek * WEEKS_PER_MONTH;
  const inSeasonMonthlyHours = hoursPerVisit * inSeasonMonthlyVisits;
  const annualVisits = visitsPerWeek * serviceWeeksPerYear;
  const annualHours = hoursPerVisit * annualVisits;

  const monthlyLaborCost = inSeasonMonthlyHours * loadedWage;
  const monthlyFuel = fuelPerVisit * inSeasonMonthlyVisits;
  const monthlyDump = dumpPerVisit * inSeasonMonthlyVisits;
  const directCost = monthlyLaborCost + monthlyFuel + monthlyDump + equipmentMonthly + otherMonthly;
  const monthlyOverhead = directCost * overheadRate / 100;
  const monthlyCost = directCost + monthlyOverhead;
  const monthlyPrice = monthlyCost / (1 - targetMargin / 100);
  const monthlyProfit = monthlyPrice - monthlyCost;
  const pricePerVisit = inSeasonMonthlyVisits === 0 ? null : monthlyPrice / inSeasonMonthlyVisits;
  const annualPrice = pricePerVisit === null ? 0 : pricePerVisit * annualVisits;
  const smoothedMonthly = annualPrice / 12;

  const turf = services.find(row => /turf|mow/i.test(row.name) && row.workQuantity > 0);
  const turfAcres = turf ? turf.workQuantity / SQFT_PER_ACRE : null;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  return {
    services: services.map(row => ({
      ...row,
      hoursShare: hoursPerVisit === 0 ? 0 : row.hoursPerVisit / hoursPerVisit * 100,
    })),
    travelHoursPerVisit,
    travelHoursShare: hoursPerVisit === 0 ? 0 : travelHoursPerVisit / hoursPerVisit * 100,
    onPropertyHoursPerVisit,
    hoursPerVisit,
    clockHoursOnSite,
    crewSize,
    loadedWage,
    visitsPerWeek,
    serviceWeeksPerYear,
    inSeasonMonthlyVisits,
    inSeasonMonthlyHours,
    annualVisits,
    annualHours,
    monthlyLaborCost,
    monthlyFuel,
    monthlyDump,
    equipmentMonthly,
    otherMonthly,
    monthlyOverhead,
    monthlyCost,
    monthlyPrice,
    monthlyProfit,
    pricePerVisit,
    annualPrice,
    smoothedMonthly,
    turfAcres,
    pricePerAcreMonth: turfAcres && turfAcres > 0 ? monthlyPrice / turfAcres : null,
    effectiveHourlyRate: inSeasonMonthlyHours === 0 ? null : monthlyPrice / inSeasonMonthlyHours,
    breakEvenMonthlyPrice: monthlyCost,
    breakEvenPerVisit: inSeasonMonthlyVisits === 0 ? null : monthlyCost / inSeasonMonthlyVisits,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - monthlyCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - monthlyCost) / proposedPrice * 100,
      hourlyRate: inSeasonMonthlyHours === 0 ? null : proposedPrice / inSeasonMonthlyHours,
      belowBreakEven: proposedPrice < monthlyCost,
    },
  };
}
