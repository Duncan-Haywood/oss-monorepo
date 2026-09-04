// Pure bid arithmetic for a snow-removal winter. No network, no state: every
// minute, wage, truck rate, and event count is an input, so the result stays
// a transparent calculation the contractor can check against last season's
// fuel receipts rather than a claim about what any driveway "should" cost.
//
// The method is the one that actually decides whether a winter makes money:
// minutes on the route (plow + sidewalk + deadhead) priced at a loaded
// operator-and-truck hourly, plus salt, then stacked across expected snow
// and ice events. That is what separates a defensible bid from a driveway
// guess — a $350 seasonal that looked fine at eight storms is underwater
// at fourteen, and a cheap "unlimited ice" clause is how the season dies.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

// Common starting minutes and salt bags for one push of that site type.
// Ballpark figures to start from, NOT a standard or a guarantee: real times
// depend on equipment, depth, packing, and how far the next stop is.
export const SITE_PRESETS = Object.freeze([
  { label: 'Single-car driveway', minutesPerPush: 8, sidewalkMinutes: 6, saltBags: 1 },
  { label: 'Two-car driveway', minutesPerPush: 12, sidewalkMinutes: 8, saltBags: 1.5 },
  { label: 'Long / circular driveway', minutesPerPush: 20, sidewalkMinutes: 10, saltBags: 2 },
  { label: 'Townhouse / shared drive', minutesPerPush: 15, sidewalkMinutes: 8, saltBags: 1.5 },
  { label: 'Small lot (10–20 cars)', minutesPerPush: 35, sidewalkMinutes: 15, saltBags: 4 },
  { label: 'Medium lot (20–50 cars)', minutesPerPush: 55, sidewalkMinutes: 20, saltBags: 8 },
  { label: 'Large commercial lot', minutesPerPush: 90, sidewalkMinutes: 30, saltBags: 16 },
  { label: 'Sidewalks / walkways only', minutesPerPush: 4, sidewalkMinutes: 18, saltBags: 1 },
  { label: 'HOA street + drives', minutesPerPush: 120, sidewalkMinutes: 40, saltBags: 20 },
]);

// Ice events are usually salt-and-sidewalk work, not a full plow. These
// factors only seed the ice-minute and ice-salt fields; both stay editable.
export const ICE_MINUTE_FACTOR = 0.65;
export const ICE_SALT_FACTOR = 1.2;

/**
 * Price a winter snow-removal route from its sites and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, minutesPerPush: number, sidewalkMinutes?: number, saltBags?: number, iceMinutes?: number, iceSaltBags?: number}>} input.sites
 *   One row per stop. Splitting the route this way is the point: a two-car
 *   driveway and a commercial lot are not the same job, and a flat "per
 *   driveway" seasonal cannot see the difference.
 * @param {number} input.operatorWage     What the driver is paid per hour.
 * @param {number} input.burdenRate       Payroll burden as a % on top of wage.
 * @param {number} input.truckHourly      Truck, plow, and working fuel per hour.
 * @param {number} input.deadheadMinutesPerSite  Drive time amortized onto each stop.
 * @param {number} input.saltCostPerBag   Material cost of one bag (or bag-equivalent).
 * @param {number} input.overheadRate     Business overhead as a % on direct cost.
 * @param {number} input.targetMargin     Net profit as a % of the final price.
 * @param {number} input.expectedSnowEvents  Storms that trigger a plow visit.
 * @param {number} input.expectedIceEvents   Ice / salt-only visits.
 * @param {number} [input.passesPerSnowEvent] Extra passes on a long storm (1 = one pass).
 * @param {number|null} [input.proposedSeasonal] Optional seasonal already on the table.
 * @param {number|null} [input.proposedPerPush] Optional per-push already on the table.
 */
export function calculateSeason(input) {
  const sitesInput = Array.isArray(input.sites) ? input.sites : [];
  if (sitesInput.length === 0) throw new Error('Add at least one site to price');

  const operatorWage = number(input.operatorWage ?? 0, 'Operator wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const truckHourly = number(input.truckHourly ?? 0, 'Truck hourly');
  const deadheadMinutesPerSite = number(input.deadheadMinutesPerSite ?? 0, 'Deadhead minutes');
  const saltCostPerBag = number(input.saltCostPerBag ?? 0, 'Salt cost per bag');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const expectedSnowEvents = number(input.expectedSnowEvents ?? 0, 'Expected snow events');
  const expectedIceEvents = number(input.expectedIceEvents ?? 0, 'Expected ice events');
  const passesPerSnowEvent = number(input.passesPerSnowEvent ?? 1, 'Passes per snow event', {
    min: 0,
    allowZero: false,
  });

  const loadedHourly = operatorWage * (1 + burdenRate / 100) + truckHourly;

  const sites = sitesInput.map((site, index) => {
    const label = site.name?.trim() || `Site ${index + 1}`;
    const minutesPerPush = number(site.minutesPerPush ?? 0, `${label}: plow minutes`);
    const sidewalkMinutes = number(site.sidewalkMinutes ?? 0, `${label}: sidewalk minutes`);
    const saltBags = number(site.saltBags ?? 0, `${label}: salt bags`);
    const defaultIceMinutes = (minutesPerPush + sidewalkMinutes) * ICE_MINUTE_FACTOR;
    const iceMinutes = number(
      site.iceMinutes === undefined || site.iceMinutes === '' ? defaultIceMinutes : site.iceMinutes,
      `${label}: ice minutes`,
    );
    const defaultIceSalt = saltBags * ICE_SALT_FACTOR;
    const iceSaltBags = number(
      site.iceSaltBags === undefined || site.iceSaltBags === '' ? defaultIceSalt : site.iceSaltBags,
      `${label}: ice salt bags`,
    );
    const onSiteMinutes = minutesPerPush + sidewalkMinutes;
    const visitMinutes = onSiteMinutes + deadheadMinutesPerSite;
    return {
      name: label,
      minutesPerPush,
      sidewalkMinutes,
      saltBags,
      iceMinutes,
      iceSaltBags,
      onSiteMinutes,
      visitMinutes,
      iceVisitMinutes: iceMinutes + deadheadMinutesPerSite,
    };
  });

  const plowMinutesPerPass = sites.reduce((sum, site) => sum + site.visitMinutes, 0);
  const iceMinutesPerEvent = sites.reduce((sum, site) => sum + site.iceVisitMinutes, 0);
  const saltBagsPerPass = sites.reduce((sum, site) => sum + site.saltBags, 0);
  const iceSaltBagsPerEvent = sites.reduce((sum, site) => sum + site.iceSaltBags, 0);

  const plowHoursPerPass = plowMinutesPerPass / 60;
  const iceHoursPerEvent = iceMinutesPerEvent / 60;
  const snowHoursPerEvent = plowHoursPerPass * passesPerSnowEvent;

  const laborEquipPerPass = plowHoursPerPass * loadedHourly;
  const saltPerPass = saltBagsPerPass * saltCostPerBag;
  const directPerPass = laborEquipPerPass + saltPerPass;
  const overheadPerPass = directPerPass * overheadRate / 100;
  const costPerPass = directPerPass + overheadPerPass;
  const costPerSnowEvent = costPerPass * passesPerSnowEvent;

  const laborEquipPerIce = iceHoursPerEvent * loadedHourly;
  const saltPerIce = iceSaltBagsPerEvent * saltCostPerBag;
  const directPerIce = laborEquipPerIce + saltPerIce;
  const overheadPerIce = directPerIce * overheadRate / 100;
  const costPerIceEvent = directPerIce + overheadPerIce;

  const seasonalCost = expectedSnowEvents * costPerSnowEvent + expectedIceEvents * costPerIceEvent;
  const seasonalPrice = seasonalCost / (1 - targetMargin / 100);
  const seasonalProfit = seasonalPrice - seasonalCost;
  const pricePerPush = costPerSnowEvent / (1 - targetMargin / 100);
  const pricePerIce = costPerIceEvent / (1 - targetMargin / 100);

  const siteCount = sites.length;
  const pricePerSiteSeasonal = siteCount === 0 ? null : seasonalPrice / siteCount;
  const pricePerSitePerPush = siteCount === 0 ? null : pricePerPush / siteCount;

  const hasProposedSeasonal = input.proposedSeasonal !== null
    && input.proposedSeasonal !== undefined
    && input.proposedSeasonal !== '';
  const proposedSeasonal = hasProposedSeasonal
    ? number(input.proposedSeasonal, 'Seasonal you are considering')
    : null;

  const hasProposedPerPush = input.proposedPerPush !== null
    && input.proposedPerPush !== undefined
    && input.proposedPerPush !== '';
  const proposedPerPush = hasProposedPerPush
    ? number(input.proposedPerPush, 'Per-push you are considering')
    : null;

  // How many snow events the seasonal budget can absorb after ice has
  // already been paid for. A cheap seasonal dies on this number — not
  // on driveway size. Negative means ice alone already exceeds the budget.
  const seasonalBudget = proposedSeasonal === null ? seasonalPrice : proposedSeasonal;
  const breakEvenSnowEvents = costPerSnowEvent === 0
    ? null
    : (seasonalBudget - expectedIceEvents * costPerIceEvent) / costPerSnowEvent;

  const proposedSeasonalView = proposedSeasonal === null ? null : {
    price: proposedSeasonal,
    profit: proposedSeasonal - seasonalCost,
    margin: proposedSeasonal === 0 ? 0 : (proposedSeasonal - seasonalCost) / proposedSeasonal * 100,
    belowBreakEven: proposedSeasonal < seasonalCost,
    breakEvenSnowEvents: costPerSnowEvent === 0 ? null : (proposedSeasonal - expectedIceEvents * costPerIceEvent) / costPerSnowEvent,
  };

  const proposedPerPushView = proposedPerPush === null ? null : {
    price: proposedPerPush,
    profit: proposedPerPush - costPerSnowEvent,
    margin: proposedPerPush === 0 ? 0 : (proposedPerPush - costPerSnowEvent) / proposedPerPush * 100,
    belowBreakEven: proposedPerPush < costPerSnowEvent,
  };

  const billedHours = snowHoursPerEvent * expectedSnowEvents + iceHoursPerEvent * expectedIceEvents;

  return {
    sites: sites.map((site) => ({
      ...site,
      minutesShare: plowMinutesPerPass === 0 ? 0 : site.visitMinutes / plowMinutesPerPass * 100,
    })),
    siteCount,
    loadedHourly,
    plowMinutesPerPass,
    iceMinutesPerEvent,
    plowHoursPerPass,
    snowHoursPerEvent,
    iceHoursPerEvent,
    saltBagsPerPass,
    iceSaltBagsPerEvent,
    laborEquipPerPass,
    saltPerPass,
    overheadPerPass,
    costPerPass,
    costPerSnowEvent,
    costPerIceEvent,
    pricePerPush,
    pricePerIce,
    seasonalCost,
    seasonalPrice,
    seasonalProfit,
    pricePerSiteSeasonal,
    pricePerSitePerPush,
    expectedSnowEvents,
    expectedIceEvents,
    passesPerSnowEvent,
    billedHours,
    effectiveHourlyRate: billedHours === 0 ? null : seasonalPrice / billedHours,
    breakEvenSnowEvents,
    // Walk-away seasonal is total winter cost — below this the route makes nothing.
    walkAwaySeasonal: seasonalCost,
    walkAwayPerPush: costPerSnowEvent,
    proposedSeasonal: proposedSeasonalView,
    proposedPerPush: proposedPerPushView,
  };
}
