// Pure bid arithmetic for a recurring pest-control account. No network, no
// state: every minute, wage, chemical, and station cost is an input, so the
// result stays a transparent calculation the operator can check against their
// own payroll and invoices rather than a claim about what any house "should"
// cost.
//
// The method is the one the route actually pays: on-site minutes plus the
// drive, then chemicals and station materials, then overhead and margin. That
// is what separates a defensible stop price from a house-size guess — eight
// rodent stations and a 22-minute drive are a different job from an
// exterior-only spray next door, and a flat "quarterly $80" quote cannot see
// the difference.

export const VISITS_PER_YEAR = Object.freeze({
  monthly: 12,
  bimonthly: 6,
  quarterly: 4,
  semiannual: 2,
});

export const FREQUENCY_LABELS = Object.freeze({
  monthly: 'monthly',
  bimonthly: 'every other month',
  quarterly: 'quarterly',
  semiannual: 'twice a year',
});

// Common starting points for stop times, in technician-minutes. These are
// ballpark figures to start from, NOT an industry standard or a guarantee:
// real times depend on access, infestation pressure, product, and how much
// is actually done on the stop. Operators should replace them with times
// clocked from their own routes.
export const SERVICE_PRESETS = Object.freeze([
  { label: 'Exterior perimeter spray', minutes: 18, everyVisit: true, materialPerUnit: 4.5, unit: false },
  { label: 'Interior crack & crevice', minutes: 22, everyVisit: true, materialPerUnit: 3.25, unit: false },
  { label: 'Rodent bait station check', minutes: 4, everyVisit: true, materialPerUnit: 1.75, unit: true },
  { label: 'Insect bait station check', minutes: 3, everyVisit: true, materialPerUnit: 1.1, unit: true },
  { label: 'Garage / outbuilding spray', minutes: 12, everyVisit: true, materialPerUnit: 2, unit: false },
  { label: 'Yard / perimeter granule', minutes: 15, everyVisit: true, materialPerUnit: 3.5, unit: false },
  { label: 'Initial knockdown spray', minutes: 35, everyVisit: false, materialPerUnit: 8, unit: false },
  { label: 'Station install (each)', minutes: 12, everyVisit: false, materialPerUnit: 12, unit: true },
  { label: 'Exclusion / sealing', minutes: 60, everyVisit: false, materialPerUnit: 18, unit: false },
  { label: 'Attic / crawl inspection', minutes: 25, everyVisit: false, materialPerUnit: 0, unit: false },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function priceFromCost(cost, targetMargin) {
  return cost / (1 - targetMargin / 100);
}

function scoreProposed(price, cost, hours) {
  return {
    price,
    profit: price - cost,
    margin: price === 0 ? 0 : (price - cost) / price * 100,
    hourlyRate: hours === 0 ? null : price / hours,
    belowBreakEven: price < cost,
  };
}

/**
 * Price a pest-control account from its stop work, drive, and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, minutes: number, quantity?: number, everyVisit?: boolean, materialPerUnit?: number}>} input.services
 *   One row per work item. Splitting stations from spray is the whole point:
 *   a house-size quote hides the station route that sinks underpriced stops.
 * @param {number} input.oneWayMinutes     Drive one way, in minutes.
 * @param {string} input.frequency         monthly | bimonthly | quarterly | semiannual
 * @param {number} input.hourlyWage        What the technician is paid per hour.
 * @param {number} input.burdenRate        Payroll burden as a % on top of wage.
 * @param {number} input.vehicleCostPerVisit  Fuel, wear, and truck allocated to this stop.
 * @param {number} input.otherPerVisit     Anything else billed to this stop each visit.
 * @param {number} input.overheadRate      Business overhead as a % on direct cost.
 * @param {number} input.targetMargin      Net profit as a % of the invoice.
 * @param {number|null} input.proposedRecurring  Optional recurring price already on the table.
 * @param {boolean} input.waiveInitial     If true, first-visit cost is recovered from later stops.
 */
export function calculateBid(input) {
  const servicesInput = Array.isArray(input.services) ? input.services : [];
  if (servicesInput.length === 0) throw new Error('Add at least one service to price');

  const frequency = String(input.frequency ?? 'quarterly');
  const visitsPerYear = VISITS_PER_YEAR[frequency];
  if (!visitsPerYear) {
    throw new Error('Frequency must be monthly, bimonthly, quarterly, or semiannual');
  }

  const oneWayMinutes = number(input.oneWayMinutes ?? 0, 'One-way drive');
  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const vehicleCostPerVisit = number(input.vehicleCostPerVisit ?? 0, 'Vehicle cost per visit');
  const otherPerVisit = number(input.otherPerVisit ?? 0, 'Other cost per visit');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);
  const driveHours = (oneWayMinutes * 2) / 60;

  const services = servicesInput.map((service, index) => {
    const label = service.name?.trim() || `Service ${index + 1}`;
    const minutes = number(service.minutes ?? 0, `${label}: minutes`);
    const quantity = number(service.quantity ?? 1, `${label}: quantity`, { min: 0 });
    const materialPerUnit = number(service.materialPerUnit ?? 0, `${label}: material`);
    const everyVisit = service.everyVisit !== false && service.everyVisit !== 'false';
    const totalMinutes = minutes * quantity;
    const hours = totalMinutes / 60;
    const material = materialPerUnit * quantity;
    return {
      name: label,
      minutes,
      quantity,
      everyVisit,
      materialPerUnit,
      totalMinutes,
      hours,
      material,
    };
  });

  const recurringOnSiteHours = services
    .filter(service => service.everyVisit)
    .reduce((sum, service) => sum + service.hours, 0);
  const initialOnlyHours = services
    .filter(service => !service.everyVisit)
    .reduce((sum, service) => sum + service.hours, 0);
  const recurringMaterials = services
    .filter(service => service.everyVisit)
    .reduce((sum, service) => sum + service.material, 0);
  const initialOnlyMaterials = services
    .filter(service => !service.everyVisit)
    .reduce((sum, service) => sum + service.material, 0);

  const recurringVisitHours = recurringOnSiteHours + driveHours;
  const initialOnSiteHours = recurringOnSiteHours + initialOnlyHours;
  const initialVisitHours = initialOnSiteHours + driveHours;

  const recurringLabor = recurringVisitHours * loadedWage;
  const initialLabor = initialVisitHours * loadedWage;
  const initialMaterials = recurringMaterials + initialOnlyMaterials;

  const recurringDirect = recurringLabor + recurringMaterials + vehicleCostPerVisit + otherPerVisit;
  const initialDirect = initialLabor + initialMaterials + vehicleCostPerVisit + otherPerVisit;
  const recurringOverhead = recurringDirect * overheadRate / 100;
  const initialOverhead = initialDirect * overheadRate / 100;
  const recurringCost = recurringDirect + recurringOverhead;
  const initialCost = initialDirect + initialOverhead;

  const recurringPrice = priceFromCost(recurringCost, targetMargin);
  const initialPrice = priceFromCost(initialCost, targetMargin);
  const recurringProfit = recurringPrice - recurringCost;
  const initialProfit = initialPrice - initialCost;

  // Year one bills the initial as its own invoice, then the full year's
  // recurring stops. Operators who fold the first stop into the initial
  // should treat the annual figure as an upper bound and subtract one
  // recurring invoice.
  const annualPrice = initialPrice + recurringPrice * visitsPerYear;
  const annualRecurring = recurringPrice * visitsPerYear;

  const hasProposed = input.proposedRecurring !== null
    && input.proposedRecurring !== undefined
    && input.proposedRecurring !== '';
  const proposedRecurring = hasProposed
    ? number(input.proposedRecurring, 'Recurring price you are considering')
    : null;

  const waiveInitial = Boolean(input.waiveInitial);
  const profitPerVisit = recurringProfit;
  const visitsToRecover = waiveInitial && profitPerVisit > 0
    ? Math.ceil(initialCost / profitPerVisit)
    : null;
  const monthsToRecover = visitsToRecover === null
    ? null
    : visitsToRecover * (12 / visitsPerYear);

  const totalRecurringHours = recurringVisitHours;
  const hoursShare = (hours) => (totalRecurringHours === 0 ? 0 : hours / totalRecurringHours * 100);

  return {
    frequency,
    frequencyLabel: FREQUENCY_LABELS[frequency],
    visitsPerYear,
    loadedWage,
    driveHours,
    driveMinutesRoundTrip: oneWayMinutes * 2,
    services: services.map(service => ({
      ...service,
      hoursShare: hoursShare(service.everyVisit ? service.hours : 0),
    })),
    recurringOnSiteHours,
    initialOnlyHours,
    initialOnSiteHours,
    recurringVisitHours,
    initialVisitHours,
    recurringMaterials,
    initialMaterials,
    vehicleCostPerVisit,
    otherPerVisit,
    recurringLabor,
    initialLabor,
    recurringOverhead,
    initialOverhead,
    recurringCost,
    initialCost,
    recurringPrice,
    initialPrice,
    recurringProfit,
    initialProfit,
    annualPrice,
    annualRecurring,
    // The number that surprises operators: revenue per hour once the drive
    // is inside the stop, not just the minutes they spend on the lot.
    effectiveHourlyWithDrive: recurringVisitHours === 0 ? null : recurringPrice / recurringVisitHours,
    effectiveHourlyOnSite: recurringOnSiteHours === 0 ? null : recurringPrice / recurringOnSiteHours,
    driveShare: hoursShare(driveHours),
    onSiteShare: hoursShare(recurringOnSiteHours),
    breakEvenRecurring: recurringCost,
    breakEvenInitial: initialCost,
    waiveInitial,
    visitsToRecover,
    monthsToRecover,
    proposed: proposedRecurring === null
      ? null
      : scoreProposed(proposedRecurring, recurringCost, recurringVisitHours),
  };
}
