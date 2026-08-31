import { displayAreaName } from './area-name.mjs';

// Pure bid arithmetic for a commercial cleaning (janitorial) contract. No
// network, no state: every rate, wage, and production figure is an input, so
// the result stays a transparent calculation the contractor can check against
// their own payroll and supply invoices rather than a claim about what any
// building "should" cost.
//
// The method is the one the trade actually bids with: cleanable square feet
// divided by a production rate (square feet one cleaner covers per hour) gives
// labor hours, and every other cost is layered on top of those hours. That is
// what separates a defensible bid from a square-foot guess — a building that
// is 15% restrooms takes far more labor per square foot than one that is all
// open office, and a flat price-per-square-foot rule cannot see the difference.

// Weeks per month, averaged (52 / 12). Cleaning contracts are priced monthly
// but scheduled weekly, so the conversion has to be the average rather than a
// flat 4 — using 4 understates monthly hours by about 8%, which is more than
// the typical profit margin on a janitorial contract.
export const WEEKS_PER_MONTH = 52 / 12;

// Common starting points for production rates, in cleanable square feet per
// cleaner-hour, for a full service clean of that space type. These are
// ballpark figures to start from, NOT an industry standard or a guarantee:
// real rates depend on crew, equipment, layout, congestion, and how much is
// actually done on each visit. Contractors should replace them with rates
// timed from their own crews.
export const PRODUCTION_RATE_PRESETS = Object.freeze([
  { label: 'Open office / cubicles', rate: 4000 },
  { label: 'Private offices', rate: 3000 },
  { label: 'Lobby & corridors', rate: 5000 },
  { label: 'Restrooms (full clean)', rate: 1200 },
  { label: 'Break room / kitchen', rate: 2000 },
  { label: 'Classrooms', rate: 2500 },
  { label: 'Medical exam rooms', rate: 1000 },
  { label: 'Retail sales floor', rate: 5000 },
  { label: 'Warehouse (auto-scrub)', rate: 12000 },
  { label: 'Stairwells', rate: 1500 },
]);

// One-time project work that rides on the same bid — initial cleans, strip
// and wax, carpet extraction. Rates are ballpark starter figures in cleanable
// square feet per cleaner-hour, NOT a standard or a quote. "Passes" is coats
// of finish or extra machine passes; hours = square feet ÷ rate × passes.
export const PROJECT_RATE_PRESETS = Object.freeze([
  { label: 'Strip & wax (VCT)', rate: 250, passes: 2 },
  { label: 'Carpet extraction', rate: 300, passes: 1 },
  { label: 'Initial deep clean', rate: 1500, passes: 1 },
  { label: 'Post-construction clean', rate: 800, passes: 1 },
  { label: 'Hard-floor machine scrub', rate: 2000, passes: 1 },
]);

// Common day-porter / attendant roles. These are priced as scheduled shifts,
// not production rates — the customer is buying a person on site during
// business hours, not a cleaned square-foot count.
export const SHIFT_ROLE_PRESETS = Object.freeze([
  { label: 'Day porter / lobby attendant' },
  { label: 'Restroom attendant' },
  { label: 'Floor walker / floater' },
  { label: 'After-hours supervisor' },
  { label: 'Mailroom / dock attendant' },
]);

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Price a recurring janitorial contract from its areas and cost structure.
 *
 * @param {object} input
 * @param {Array<{name?: string, squareFeet: number, productionRate: number, cleaningsPerWeek: number}>} input.areas
 *   One row per distinct space type. Splitting the building this way is the
 *   whole point: a single blended rate hides the restroom labor that sinks
 *   underpriced bids. May be empty when the contract is shift-only.
 * @param {Array<{name?: string, people: number, hoursPerShift: number, shiftsPerWeek: number, hourlyWage?: number|string}>} [input.shifts]
 *   Optional day-porter / attendant rows. Priced as scheduled headcount, not
 *   square feet: people × hours × shifts/week × 52/12. An omitted hourly
 *   wage uses the contract cleaner wage.
 * @param {number} [input.crewSize]         Cleaners available on each night-clean visit.
 * @param {number} [input.shiftHours]       Hours available per cleaner on that visit.
 * @param {number} [input.availableHoursPerCleaner] Alias for shiftHours used by the form.
 * @param {number} input.hourlyWage         What the cleaner is paid per hour.
 * @param {number} input.burdenRate         Payroll burden as a % on top of wage
 *   (employer taxes, workers' compensation, insurance, paid time off).
 * @param {number} input.suppliesPerSqFtMonth  Consumables and chemicals, per
 *   cleanable square foot per month.
 * @param {number} input.equipmentMonthly   Equipment, vehicle, and travel cost per month.
 * @param {number} input.otherMonthly       Anything else billed to this job monthly.
 * @param {number} input.overheadRate       Business overhead as a % on direct cost.
 * @param {number} input.targetMargin       Net profit as a % of the final price.
 * @param {number|null} [input.minimumMonthlyPrice] Optional floor for small or
 *   inconvenient accounts. The target-margin price is used when it is higher.
 * @param {Array<{name?: string, squareFeet: number, productionRate: number, passes?: number, materials?: number}>} [input.projects]
 *   Optional one-time work (strip and wax, extraction, initial clean). Priced
 *   with the same loaded wage, overhead, and margin as the monthly contract,
 *   but invoiced once — not rolled into the recurring price.
 * @param {Array<{name?: string, costPerOccurrence: number, occurrencesPerYear: number}>} [input.periodicServices]
 *   Recurring lump work (quarterly floor care, twice-yearly extraction)
 *   priced as cost × visits/year, then averaged into the monthly contract.
 *   Distinct from `projects`, which are production-rate jobs invoiced once.
 * @param {number|null} input.proposedPrice Optional: a price already on the
 *   table, so the contractor can see the margin it actually leaves.
 */
export function calculateBid(input) {
  const areasInput = Array.isArray(input.areas) ? input.areas : [];
  const shiftsInput = Array.isArray(input.shifts) ? input.shifts : [];
  if (areasInput.length === 0 && shiftsInput.length === 0) {
    throw new Error('Add at least one area or day-porter shift to price');
  }

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const suppliesPerSqFtMonth = number(input.suppliesPerSqFtMonth ?? 0, 'Supplies per sq ft');
  const equipmentMonthly = number(input.equipmentMonthly ?? 0, 'Equipment cost');
  const otherMonthly = number(input.otherMonthly ?? 0, 'Other monthly cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  const crewSize = number(input.crewSize ?? 1, 'Crew size', { allowZero: false });
  const shiftHours = number(
    input.availableHoursPerCleaner ?? input.shiftHours ?? 4,
    'Available hours per cleaner',
    { allowZero: false },
  );
  if (!Number.isInteger(crewSize)) throw new Error('Crew size must be a whole number');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const hasMinimumPrice = input.minimumMonthlyPrice !== null
    && input.minimumMonthlyPrice !== undefined
    && input.minimumMonthlyPrice !== '';
  const minimumMonthlyPrice = hasMinimumPrice
    ? number(input.minimumMonthlyPrice, 'Minimum monthly price')
    : null;

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const areas = areasInput.map((area, index) => {
    const label = displayAreaName('', area.name, index);
    const squareFeet = number(area.squareFeet ?? 0, `${label}: cleanable square feet`);
    // A zero production rate would divide by zero and report a free clean, so
    // it is rejected rather than defaulted — the contractor has to state how
    // fast the space actually cleans.
    const productionRate = number(area.productionRate ?? 0, `${label}: production rate`, { allowZero: false });
    const cleaningsPerWeek = number(area.cleaningsPerWeek ?? 0, `${label}: cleanings per week`);
    const hoursPerCleaning = squareFeet / productionRate;
    const monthlyHours = hoursPerCleaning * cleaningsPerWeek * WEEKS_PER_MONTH;
    return {
      name: label,
      squareFeet,
      productionRate,
      cleaningsPerWeek,
      hoursPerCleaning,
      monthlyHours,
      monthlyLaborCost: monthlyHours * loadedWage,
    };
  });

  const shifts = shiftsInput.map((shift, index) => {
    const label = shift.name?.trim() || `Shift ${index + 1}`;
    const people = number(shift.people ?? 0, `${label}: people`);
    const hoursPerShift = number(shift.hoursPerShift ?? 0, `${label}: hours per shift`);
    const shiftsPerWeek = number(shift.shiftsPerWeek ?? 0, `${label}: shifts per week`);
    const hasOwnWage = shift.hourlyWage !== null && shift.hourlyWage !== undefined && shift.hourlyWage !== '';
    const shiftWage = hasOwnWage ? number(shift.hourlyWage, `${label}: hourly wage`) : hourlyWage;
    const shiftLoadedWage = shiftWage * (1 + burdenRate / 100);
    // The customer is buying coverage, not a production rate: one person on
    // an 8-hour weekday shift is 8 × 5 × 52/12 hours a month, whether they
    // spend that time on restrooms, trash, or standing in the lobby.
    const monthlyHours = people * hoursPerShift * shiftsPerWeek * WEEKS_PER_MONTH;
    return {
      name: label,
      people,
      hoursPerShift,
      shiftsPerWeek,
      hourlyWage: shiftWage,
      loadedWage: shiftLoadedWage,
      monthlyHours,
      monthlyLaborCost: monthlyHours * shiftLoadedWage,
    };
  });

  const totalSquareFeet = areas.reduce((sum, a) => sum + a.squareFeet, 0);
  const areaMonthlyHours = areas.reduce((sum, a) => sum + a.monthlyHours, 0);
  const shiftMonthlyHours = shifts.reduce((sum, s) => sum + s.monthlyHours, 0);
  const monthlyHours = areaMonthlyHours + shiftMonthlyHours;
  const areaMonthlyLaborCost = areaMonthlyHours * loadedWage;
  const shiftMonthlyLaborCost = shifts.reduce((sum, s) => sum + s.monthlyLaborCost, 0);
  const monthlyLaborCost = areaMonthlyLaborCost + shiftMonthlyLaborCost;
  const monthlySupplies = totalSquareFeet * suppliesPerSqFtMonth;

  const periodicServices = (Array.isArray(input.periodicServices) ? input.periodicServices : []).map((service, index) => {
    const name = service.name?.trim() || `Periodic service ${index + 1}`;
    const costPerOccurrence = number(service.costPerOccurrence ?? 0, `${name}: cost per occurrence`);
    const occurrencesPerYear = number(service.occurrencesPerYear ?? 0, `${name}: occurrences per year`);
    return {
      name,
      costPerOccurrence,
      occurrencesPerYear,
      annualCost: costPerOccurrence * occurrencesPerYear,
    };
  });
  const annualPeriodicCost = periodicServices.reduce((sum, service) => sum + service.annualCost, 0);
  const monthlyPeriodicCost = annualPeriodicCost / 12;

  // Overhead is a markup on the direct cost of servicing this job, which is
  // how a small contractor recovers office, admin, and sales cost. It is
  // deliberately not applied to itself or to profit.
  const directCost = monthlyLaborCost + monthlySupplies + equipmentMonthly + otherMonthly + monthlyPeriodicCost;
  const monthlyOverhead = directCost * overheadRate / 100;
  const monthlyCost = directCost + monthlyOverhead;

  // Margin is a share of price, not a markup on cost, because that is how the
  // customer's number is quoted and how the contractor's P&L reads it.
  const targetMarginPrice = monthlyCost / (1 - targetMargin / 100);
  const monthlyPrice = minimumMonthlyPrice === null
    ? targetMarginPrice
    : Math.max(targetMarginPrice, minimumMonthlyPrice);
  const monthlyProfit = monthlyPrice - monthlyCost;

  const hasProposed = input.proposedPrice !== null && input.proposedPrice !== undefined && input.proposedPrice !== '';
  const proposedPrice = hasProposed ? number(input.proposedPrice, 'Price you are considering') : null;

  const projectsInput = Array.isArray(input.projects) ? input.projects : [];
  const projects = projectsInput.map((project, index) => {
    const label = project.name?.trim() || `Project ${index + 1}`;
    const squareFeet = number(project.squareFeet ?? 0, `${label}: project square feet`);
    const productionRate = number(project.productionRate ?? 0, `${label}: project production rate`, { allowZero: false });
    const passes = number(project.passes ?? 1, `${label}: passes`, { min: 0 });
    const materials = number(project.materials ?? 0, `${label}: project materials`);
    const hours = productionRate === 0 ? 0 : (squareFeet / productionRate) * passes;
    const laborCost = hours * loadedWage;
    const directCost = laborCost + materials;
    const overhead = directCost * overheadRate / 100;
    const cost = directCost + overhead;
    const price = cost / (1 - targetMargin / 100);
    return {
      name: label,
      squareFeet,
      productionRate,
      passes,
      hours,
      laborCost,
      materials,
      overhead,
      cost,
      price,
      profit: price - cost,
    };
  });

  const projectHours = projects.reduce((sum, project) => sum + project.hours, 0);
  const projectLaborCost = projects.reduce((sum, project) => sum + project.laborCost, 0);
  const projectMaterials = projects.reduce((sum, project) => sum + project.materials, 0);
  const projectOverhead = projects.reduce((sum, project) => sum + project.overhead, 0);
  const projectCost = projects.reduce((sum, project) => sum + project.cost, 0);
  const projectPrice = projects.reduce((sum, project) => sum + project.price, 0);
  const projectProfit = projectPrice - projectCost;
  const share = hours => (monthlyHours === 0 ? 0 : hours / monthlyHours * 100);
  const hoursPerVisitTotal = areas.reduce((sum, a) => sum + (a.cleaningsPerWeek > 0 ? a.hoursPerCleaning : 0), 0);
  const visitCapacityHours = crewSize * shiftHours;
  const visitUtilization = hoursPerVisitTotal === 0 || visitCapacityHours === 0
    ? 0
    : hoursPerVisitTotal / visitCapacityHours * 100;

  return {
    areas: areas.map(area => ({
      ...area,
      // Share of total labor hours (production + shifts). This is the line
      // that shows a contractor that 8% of the floor area is eating 30% of
      // the labor — and that a day porter can dwarf both.
      hoursShare: share(area.monthlyHours),
    })),
    shifts: shifts.map(shift => ({
      ...shift,
      hoursShare: share(shift.monthlyHours),
    })),
    totalSquareFeet,
    loadedWage,
    hoursPerVisitTotal,
    crewSize,
    shiftHours,
    visitCapacityHours,
    visitUtilization,
    visitOverCapacity: hoursPerVisitTotal > visitCapacityHours,
    areaMonthlyHours,
    shiftMonthlyHours,
    monthlyHours,
    areaMonthlyLaborCost,
    shiftMonthlyLaborCost,
    monthlyLaborCost,
    monthlySupplies,
    equipmentMonthly,
    otherMonthly,
    monthlyOverhead,
    monthlyCost,
    targetMarginPrice,
    minimumMonthlyPrice,
    minimumPriceApplied: minimumMonthlyPrice !== null && minimumMonthlyPrice > targetMarginPrice,
    monthlyPrice,
    monthlyProfit,
    annualPrice: monthlyPrice * 12,
    // The two sanity numbers a contractor checks a bid against before sending
    // it: what it works out to per square foot, and what they are effectively
    // billing per labor hour.
    pricePerSqFtMonth: totalSquareFeet === 0 ? null : monthlyPrice / totalSquareFeet,
    effectiveHourlyRate: monthlyHours === 0 ? null : monthlyPrice / monthlyHours,
    // Price at which the job stops making money — the walk-away number to hold
    // in mind when a prospect asks them to sharpen their pencil.
    breakEvenMonthlyPrice: monthlyCost,
    proposed: proposedPrice === null ? null : {
      price: proposedPrice,
      profit: proposedPrice - monthlyCost,
      margin: proposedPrice === 0 ? 0 : (proposedPrice - monthlyCost) / proposedPrice * 100,
      hourlyRate: monthlyHours === 0 ? null : proposedPrice / monthlyHours,
      // A bid below break-even is the failure this tool exists to catch.
      belowBreakEven: proposedPrice < monthlyCost,
    },
    periodicServices,
    monthlyPeriodicCost,
    annualPeriodicCost,
    hasPeriodicWork: annualPeriodicCost > 0,
    projects,
    projectHours,
    projectLaborCost,
    projectMaterials,
    projectOverhead,
    projectCost,
    projectPrice,
    projectProfit,
    // One-time work is invoiced with the first month, not amortized into the
    // recurring price — mixing them is how a contractor underprices the
    // contract for the remaining eleven months.
    firstMonthInvoice: monthlyPrice + projectPrice,
    breakEvenFirstMonth: monthlyCost + projectCost,
    hasProjectWork: projectHours > 0 || projectMaterials > 0,
  };
}

function money(value) {
  const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Plain-text bid draft a contractor can paste into a proposal. One-time
 * project work is listed separately from the monthly contract so the first
 * invoice is not mistaken for the recurring price.
 */
export function formatBidSummary(result) {
  const spaces = result.areas
    .filter(area => area.squareFeet > 0 && area.cleaningsPerWeek > 0)
    .map(area => `- ${area.name}: ${area.squareFeet.toLocaleString('en-US')} sq ft, ${area.cleaningsPerWeek}x/week`)
    .join('\n');
  const porterLines = (result.shifts || [])
    .filter(shift => shift.monthlyHours > 0)
    .map(shift => `- ${shift.name}: ${shift.people} × ${shift.hoursPerShift} h × ${shift.shiftsPerWeek}/week (${shift.monthlyHours.toFixed(1)} h/month)`)
    .join('\n');
  const porterBlock = porterLines
    ? [
        '',
        'DAY PORTER / SCHEDULED SHIFTS',
        porterLines,
        `Day-porter hours per month: ${result.shiftMonthlyHours.toFixed(1)}`,
      ]
    : [];
  const projectLines = (result.projects || [])
    .filter(project => project.squareFeet > 0 || project.materials > 0)
    .map(project => `- ${project.name}: ${project.squareFeet.toLocaleString('en-US')} sq ft, ${project.passes} pass${project.passes === 1 ? '' : 'es'}, ${project.hours.toFixed(1)} h — ${money(project.price)}`)
    .join('\n');
  const projectBlock = result.hasProjectWork
    ? [
        '',
        'ONE-TIME PROJECT WORK',
        projectLines || '- No project rows entered',
        `One-time project total: ${money(result.projectPrice)}`,
        `First-month invoice (monthly + project): ${money(result.firstMonthInvoice)}`,
      ]
    : [];
  const periodicLines = (result.periodicServices || [])
    .filter(service => service.annualCost > 0)
    .map(service => `- ${service.name}: ${money(service.costPerOccurrence)} × ${service.occurrencesPerYear}/year (${money(service.annualCost / 12)}/month)`)
    .join('\n');
  const periodicBlock = result.hasPeriodicWork
    ? [
        '',
        'PERIODIC SERVICES (MONTHLY AVERAGE)',
        periodicLines || '- No periodic rows entered',
        `Periodic work in the monthly: ${money(result.monthlyPeriodicCost)}`,
      ]
    : [];
  return [
    'COMMERCIAL CLEANING BID',
    '',
    `Proposed monthly service: ${money(result.monthlyPrice)}`,
    ...(result.minimumPriceApplied ? [`Minimum charge floor applied: ${money(result.minimumMonthlyPrice)}`] : []),
    `Annual contract value: ${money(result.annualPrice)}`,
    `Service labor: ${result.monthlyHours.toFixed(1)} hours/month`,
    `Price per square foot: $${result.pricePerSqFtMonth === null ? 'n/a' : result.pricePerSqFtMonth.toFixed(3)}/sq ft/month`,
    ...porterBlock,
    ...projectBlock,
    ...periodicBlock,
    '',
    'SERVICE AREAS',
    spaces || '- No service areas entered',
    '',
    `Scope basis: ${result.hoursPerVisitTotal.toFixed(2)} labor hours per visit at the entered frequencies.`,
    `Crew capacity: ${result.crewSize} cleaner(s) × ${result.shiftHours.toFixed(2)} hours = ${result.visitCapacityHours.toFixed(2)} hours per visit (${result.visitUtilization.toFixed(0)}% used).`,
    'This is a draft for review. Confirm scope, schedule, insurance, taxes, and all pricing before sending.',
  ].join('\n');
}

/**
 * Compare a building-wide frequency cut (or increase) against a linear
 * discount of the current monthly price.
 *
 * Prospects routinely ask for 3×/week instead of 5× and offer 60% of the
 * current price. Labor hours do scale with visits. In this model, supplies
 * are a monthly-per-square-foot line, and equipment/travel stay on the job
 * regardless of how many days you show up — so a 40% cut in days is not a
 * 40% cut in cost. Accepting the linear number silently eats the margin
 * the original bid was built on.
 *
 * Each area's own weekly frequency is scaled so a mixed schedule (restrooms
 * 5×, offices 3×) stays proportional. The building-level currentWeekly is
 * the cadence the comparison is about: if the area rows still say 3× while
 * the contractor typed 5× as today's building week, baseline labor follows
 * the 5× cut, not a mix of the two.
 *
 * @param {object} input                 Same shape as calculateBid.
 * @param {object} options
 * @param {number} options.currentWeekly How many days a week the building is
 *   currently cleaned — the number the contractor quotes, not a per-area max.
 * @param {number} options.proposedWeekly The schedule the prospect is asking for.
 * @param {number|string|null} [options.clientOfferMonthly] Optional price they
 *   put on the reduced schedule, scored against the reduced cost base.
 */
export function compareFrequencyReduction(input, options = {}) {
  const currentWeekly = number(options.currentWeekly ?? 0, 'Current cleanings per week', { allowZero: false });
  const proposedWeekly = number(options.proposedWeekly ?? 0, 'Proposed cleanings per week');
  const factor = proposedWeekly / currentWeekly;

  const areas = Array.isArray(input.areas) ? input.areas : [];
  const areaFreqs = areas.map((area, index) => {
    const label = area.name?.trim() || `Area ${index + 1}`;
    return number(area.cleaningsPerWeek ?? 0, `${label}: cleanings per week`);
  });
  // Highest scheduled area is the building week the rows already encode.
  // Rebase onto currentWeekly when that disagrees, so a 5→3 comparison is
  // actually priced at 5 days then 3 days rather than 3 days then 1.8.
  const typicalAreaWeek = Math.max(0, ...areaFreqs);
  const alignFactor = typicalAreaWeek > 0 ? currentWeekly / typicalAreaWeek : 1;

  const alignedAreas = areas.map((area, index) => ({
    ...area,
    cleaningsPerWeek: areaFreqs[index] * alignFactor,
  }));
  const scaledAreas = alignedAreas.map((area, index) => ({
    ...area,
    cleaningsPerWeek: areaFreqs[index] * alignFactor * factor,
  }));

  const baseline = calculateBid({ ...input, areas: alignedAreas, proposedPrice: undefined });
  const reduced = calculateBid({
    ...input,
    areas: scaledAreas,
    proposedPrice: options.clientOfferMonthly,
  });

  const naiveLinearPrice = baseline.monthlyPrice * factor;
  const naiveProfit = naiveLinearPrice - reduced.monthlyCost;
  const naiveMargin = naiveLinearPrice === 0 ? 0 : naiveProfit / naiveLinearPrice * 100;
  const leftOnTable = reduced.monthlyPrice - naiveLinearPrice;

  return {
    currentWeekly,
    proposedWeekly,
    reductionFactor: factor,
    baseline,
    reduced,
    naiveLinearPrice,
    naiveProfit,
    naiveMargin,
    naiveBelowBreakEven: naiveLinearPrice < reduced.monthlyCost,
    priceToHoldTargetMargin: reduced.monthlyPrice,
    walkAwayAtReduced: reduced.breakEvenMonthlyPrice,
    leftOnTable,
    laborHoursDropped: baseline.monthlyHours - reduced.monthlyHours,
    laborCostDropped: baseline.monthlyLaborCost - reduced.monthlyLaborCost,
    unscaledMonthly: baseline.monthlySupplies + baseline.equipmentMonthly + baseline.otherMonthly,
    // A day porter is scheduled against the building's own week, not against
    // the cleaning cadence, so their wages are the largest thing that does
    // *not* fall when visits are cut — often several times the supplies and
    // equipment combined. Reported separately so the page can say so rather
    // than leaving it inside a labour figure the reader takes for scaling.
    unscaledShiftLabor: baseline.shiftMonthlyLaborCost,
    suppliesUnchanged: Math.abs(reduced.monthlySupplies - baseline.monthlySupplies) < 1e-9,
    equipmentUnchanged: Math.abs(reduced.equipmentMonthly - baseline.equipmentMonthly) < 1e-9,
    clientOffer: reduced.proposed,
  };
}

/**
 * One paragraph a contractor can paste into a renewal reply. Arithmetic only —
 * it does not tell them to accept or refuse.
 */
export function frequencyReductionNote(comparison, { targetMargin } = {}) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const pct = comparison.reductionFactor * 100;
  const marginPct = Number.isFinite(targetMargin) ? targetMargin : 20;
  const direction = comparison.proposedWeekly < comparison.currentWeekly ? 'cut' : 'change';
  const naiveLine = comparison.naiveBelowBreakEven
    ? `Accepting ${pct.toFixed(0)}% of the ${comparison.currentWeekly}× price (${money(comparison.naiveLinearPrice)}) would lose ${money(Math.abs(comparison.naiveProfit))} a month against the ${comparison.proposedWeekly}× cost base. Walk-away on the reduced schedule is ${money(comparison.walkAwayAtReduced)}.`
    : `A linear ${pct.toFixed(0)}% of the ${comparison.currentWeekly}× price is ${money(comparison.naiveLinearPrice)}, which leaves a ${comparison.naiveMargin.toFixed(1)}% margin at ${comparison.proposedWeekly}× — ${money(Math.abs(comparison.leftOnTable))} a month ${comparison.leftOnTable > 0 ? 'below' : 'above'} the price that holds a ${marginPct}% target.`;
  return [
    `At ${comparison.proposedWeekly}×/week the monthly price that still holds a ${marginPct}% margin is ${money(comparison.priceToHoldTargetMargin)}, not a linear ${direction} of the ${comparison.currentWeekly}× price (${money(comparison.baseline.monthlyPrice)}).`,
    `Labor drops with the visits (${comparison.baseline.monthlyHours.toFixed(1)} h → ${comparison.reduced.monthlyHours.toFixed(1)} h). Supplies, equipment, and travel stay on the job (${money(comparison.unscaledMonthly)}/month in this bid).${comparison.unscaledShiftLabor > 0 ? ` Scheduled shift labor stays too — ${money(comparison.unscaledShiftLabor)}/month of day-porter wages are not part of that drop.` : ''}`,
    naiveLine,
  ].join(' ');
}

/**
 * Compare who buys restroom paper, soap, and liners.
 *
 * Prospects routinely say "we'll buy the paper if you drop the supplies
 * line." Restroom stock is only a share of that line — chemicals, finish,
 * and glass stay yours. Dropping the whole line from today's price silently
 * eats the chemicals and the markup on them. And if they run out, the
 * emergency fill you still make is less efficient than stocking it yourself,
 * so the price that holds your margin can land *above* the you-supply bid.
 *
 * Labor, equipment, and travel do not change. Only the supplies (and the
 * optional emergency-fill) line moves, then overhead and margin are reapplied.
 *
 * @param {object} input  Same shape as calculateBid.
 * @param {object} options
 * @param {number} [options.restroomSharePercent=65] Share of the monthly
 *   supplies line that is paper, soap, liners, and seat covers.
 * @param {number} [options.emergencyFillMonthly=0] Extra monthly cost when
 *   they "buy it" but you still restock after they run out.
 * @param {number|string|null} [options.clientOfferMonthly] Optional price
 *   they put on the labor-only / drop-supplies ask, scored against each
 *   reduced cost base.
 */
export function compareSupplyResponsibility(input, options = {}) {
  const restroomSharePercent = number(
    options.restroomSharePercent ?? 65,
    'Restroom stock share of supplies',
  );
  if (restroomSharePercent > 100) {
    throw new Error('Restroom stock share of supplies must be at most 100');
  }
  const emergencyFillMonthly = number(
    options.emergencyFillMonthly ?? 0,
    'Emergency fill when they run out',
  );
  const suppliesRate = number(input.suppliesPerSqFtMonth ?? 0, 'Supplies per sq ft');
  const otherMonthly = number(input.otherMonthly ?? 0, 'Other monthly cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const restroomShare = restroomSharePercent / 100;
  const chemicalRate = suppliesRate * (1 - restroomShare);
  const bidInput = { ...input, proposedPrice: undefined };

  const youSupply = calculateBid(bidInput);
  const theyBuyRestroom = calculateBid({
    ...bidInput,
    suppliesPerSqFtMonth: chemicalRate,
    proposedPrice: options.clientOfferMonthly,
  });
  const theyBuyAll = calculateBid({
    ...bidInput,
    suppliesPerSqFtMonth: 0,
    proposedPrice: options.clientOfferMonthly,
  });
  const theyBuyButYouFill = calculateBid({
    ...bidInput,
    suppliesPerSqFtMonth: chemicalRate,
    otherMonthly: otherMonthly + emergencyFillMonthly,
    proposedPrice: options.clientOfferMonthly,
  });

  // The verbal ask is "take the supplies off the bid" — today's price minus
  // the fully marked-up supplies line, as if chemicals vanished too.
  const suppliesInPrice = youSupply.monthlySupplies * (1 + overheadRate / 100) / (1 - targetMargin / 100);
  const naiveDropPrice = youSupply.monthlyPrice - suppliesInPrice;
  const naiveProfitAtRestroom = naiveDropPrice - theyBuyRestroom.monthlyCost;
  const naiveMarginAtRestroom = naiveDropPrice === 0 ? 0 : naiveProfitAtRestroom / naiveDropPrice * 100;
  const naiveProfitAtFill = naiveDropPrice - theyBuyButYouFill.monthlyCost;
  const naiveMarginAtFill = naiveDropPrice === 0 ? 0 : naiveProfitAtFill / naiveDropPrice * 100;

  return {
    restroomSharePercent,
    emergencyFillMonthly,
    restroomSuppliesMonthly: youSupply.monthlySupplies * restroomShare,
    chemicalSuppliesMonthly: youSupply.monthlySupplies * (1 - restroomShare),
    youSupply,
    theyBuyRestroom,
    theyBuyAll,
    theyBuyButYouFill,
    suppliesInPrice,
    naiveDropPrice,
    naiveProfitAtRestroom,
    naiveMarginAtRestroom,
    naiveBelowBreakEvenAtRestroom: naiveDropPrice < theyBuyRestroom.monthlyCost,
    naiveProfitAtFill,
    naiveMarginAtFill,
    naiveBelowBreakEvenAtFill: naiveDropPrice < theyBuyButYouFill.monthlyCost,
    leftoverIfTheyBuyRestroom: youSupply.monthlyPrice - theyBuyRestroom.monthlyPrice,
    leftoverIfTheyBuyAll: youSupply.monthlyPrice - theyBuyAll.monthlyPrice,
    fillPremiumVsYouSupply: theyBuyButYouFill.monthlyPrice - youSupply.monthlyPrice,
    fillCostsMoreThanYouSupply: theyBuyButYouFill.monthlyPrice > youSupply.monthlyPrice,
    clientOfferRestroom: theyBuyRestroom.proposed,
    clientOfferAll: theyBuyAll.proposed,
    clientOfferFill: theyBuyButYouFill.proposed,
  };
}

/**
 * One paragraph a contractor can paste into a "we'll buy the paper" reply.
 * Arithmetic only — it does not tell them to accept or refuse.
 */
export function supplyResponsibilityNote(comparison, { targetMargin } = {}) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const marginPct = Number.isFinite(targetMargin) ? targetMargin : 20;
  const restroomLine = `Restroom paper, soap, and liners are ${comparison.restroomSharePercent.toFixed(0)}% of this supplies line (${money(comparison.restroomSuppliesMonthly)}); chemicals, finish, and glass stay yours (${money(comparison.chemicalSuppliesMonthly)}).`;
  const honestLine = `If they take only the restroom stock, the monthly price that still holds a ${marginPct}% margin is ${money(comparison.theyBuyRestroom.monthlyPrice)}, not today's ${money(comparison.youSupply.monthlyPrice)} minus the whole supplies line (${money(comparison.naiveDropPrice)}).`;
  const fillLine = comparison.emergencyFillMonthly > 0
    ? (comparison.fillCostsMoreThanYouSupply
      ? `If you still emergency-fill when they run out (${money(comparison.emergencyFillMonthly)}/month), the price that holds the margin is ${money(comparison.theyBuyButYouFill.monthlyPrice)} — ${money(comparison.fillPremiumVsYouSupply)} a month above you-supplying.`
      : `If you still emergency-fill when they run out (${money(comparison.emergencyFillMonthly)}/month), the price that holds the margin is ${money(comparison.theyBuyButYouFill.monthlyPrice)}.`)
    : `Labor, equipment, and travel do not move when they take the paper.`;
  const naiveLine = comparison.naiveBelowBreakEvenAtFill || comparison.naiveBelowBreakEvenAtRestroom
    ? `Dropping the whole supplies line from today's price (${money(comparison.naiveDropPrice)}) would lose ${money(Math.abs(comparison.naiveBelowBreakEvenAtFill ? comparison.naiveProfitAtFill : comparison.naiveProfitAtRestroom))} a month against the cost you still carry.`
    : `Dropping the whole supplies line from today's price leaves a ${comparison.naiveMarginAtRestroom.toFixed(1)}% margin if they actually take the restroom stock, versus the ${marginPct}% the original bid was built on.`;
  return [restroomLine, honestLine, fillLine, naiveLine].join(' ');
}

/**
 * Compare quoting the takeover / initial clean as a one-time line versus
 * throwing it into month 1 at today's monthly.
 *
 * A neglected or vacant building's first visit is several regular cleans of
 * labor plus extra chemicals. Prospects ask to "just include it." Month 1
 * then carries a project on a periodic price. If they cancel after 30 days,
 * that giveaway is the whole relationship. This is not strip-and-wax (a
 * recurring floor-finish project) and not a second address — it is the
 * one-time deep clean that wins the monthly.
 *
 * Overhead and margin are applied to the initial the same way they are
 * applied to the month, so the one-time number is the price that still
 * holds the target, not the raw crew cost.
 *
 * @param {object} input  Same shape as calculateBid.
 * @param {object} options
 * @param {number} [options.visitMultiplier=5] How many regular visits the
 *   initial is worth. 2–3× is a maintained building; 5× is a typical
 *   takeover of a neglected floor.
 * @param {number} [options.extraSupplies=80] Extra chemicals, liners, and
 *   dumpster cost on that first visit only.
 * @param {number} [options.amortizeMonths=12] Months over which to recover
 *   the initial if it is baked into the monthly instead of invoiced once.
 * @param {number} [options.cancelAfterMonths=1] Tenure used for the
 *   cancel-early cash comparison (default: they leave after 30 days).
 * @param {number|string|null} [options.clientOfferMonthly] Optional monthly
 *   they offered that already "includes" the initial, scored against the
 *   month-1 cost that still carries the project.
 */
export function compareInitialClean(input, options = {}) {
  const visitMultiplier = number(
    options.visitMultiplier ?? 5,
    'Initial-clean visit multiplier',
    { allowZero: false },
  );
  const extraSupplies = number(options.extraSupplies ?? 80, 'Extra initial-clean supplies');
  const amortizeMonths = number(
    options.amortizeMonths ?? 12,
    'Months to recover the initial',
    { allowZero: false },
  );
  const cancelAfterMonths = number(
    options.cancelAfterMonths ?? 1,
    'If they cancel after this many months',
    { allowZero: false },
  );
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const monthly = calculateBid({ ...input, proposedPrice: undefined });
  const hoursPerVisit = monthly.hoursPerVisitTotal;
  const initialHours = hoursPerVisit * visitMultiplier;
  const initialLabor = initialHours * monthly.loadedWage;
  const initialDirect = initialLabor + extraSupplies;
  const initialOverhead = initialDirect * overheadRate / 100;
  const initialCost = initialDirect + initialOverhead;
  const initialPrice = initialCost / (1 - targetMargin / 100);
  const initialProfit = initialPrice - initialCost;

  const amortizedMonthlyCost = monthly.monthlyCost + initialCost / amortizeMonths;
  const amortizedMonthlyPrice = amortizedMonthlyCost / (1 - targetMargin / 100);
  const amortizedAddOn = amortizedMonthlyPrice - monthly.monthlyPrice;

  const thrownInMonth1Cost = monthly.monthlyCost + initialCost;
  const thrownInMonth1Profit = monthly.monthlyPrice - thrownInMonth1Cost;
  const thrownInMonth1Margin = monthly.monthlyPrice === 0
    ? 0
    : thrownInMonth1Profit / monthly.monthlyPrice * 100;
  const thrownInBelowBreakEven = monthly.monthlyPrice < thrownInMonth1Cost;

  // How many months of ordinary profit equal the giveaway. Null when the
  // monthly itself does not make money — there is then no recovery path.
  const monthsOfProfitToCoverGiveaway = monthly.monthlyProfit <= 0
    ? null
    : initialCost / monthly.monthlyProfit;

  // Quoted separately they pay the one-time and the month. Thrown in they
  // pay only the month, so month 1 still carries the project cost.
  const quotedSeparatelyCashIfCancel =
    cancelAfterMonths * monthly.monthlyProfit + initialProfit;
  const thrownInCashIfCancel =
    cancelAfterMonths * monthly.monthlyProfit - initialCost;
  const giveawayVsQuotedIfCancel = thrownInCashIfCancel - quotedSeparatelyCashIfCancel;

  const hasOffer = options.clientOfferMonthly !== null
    && options.clientOfferMonthly !== undefined
    && options.clientOfferMonthly !== '';
  const offerPrice = hasOffer
    ? number(options.clientOfferMonthly, 'Monthly they offered including the initial')
    : null;
  const clientOffer = offerPrice === null ? null : {
    price: offerPrice,
    month1Profit: offerPrice - thrownInMonth1Cost,
    month1Margin: offerPrice === 0 ? 0 : (offerPrice - thrownInMonth1Cost) / offerPrice * 100,
    belowBreakEvenMonth1: offerPrice < thrownInMonth1Cost,
    laterProfit: offerPrice - monthly.monthlyCost,
    laterBelowBreakEven: offerPrice < monthly.monthlyCost,
  };

  return {
    visitMultiplier,
    extraSupplies,
    amortizeMonths,
    cancelAfterMonths,
    hoursPerVisit,
    initialHours,
    initialLabor,
    initialDirect,
    initialOverhead,
    initialCost,
    initialPrice,
    initialProfit,
    monthly,
    amortizedMonthlyCost,
    amortizedMonthlyPrice,
    amortizedAddOn,
    thrownInMonth1Cost,
    thrownInMonth1Profit,
    thrownInMonth1Margin,
    thrownInBelowBreakEven,
    monthsOfProfitToCoverGiveaway,
    quotedSeparatelyCashIfCancel,
    thrownInCashIfCancel,
    giveawayVsQuotedIfCancel,
    walkAwayMonth1: thrownInMonth1Cost,
    clientOffer,
  };
}

/**
 * One paragraph a contractor can paste into a "just include the initial"
 * reply. Arithmetic only — it does not tell them to accept or refuse.
 */
export function initialCleanNote(comparison, { targetMargin } = {}) {
  const money = (value) => {
    const format = (value) => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const marginPct = Number.isFinite(targetMargin) ? targetMargin : 20;
  const oneTime = `A ${comparison.visitMultiplier.toFixed(1)}× takeover clean (${comparison.initialHours.toFixed(1)} h plus ${money(comparison.extraSupplies)} of extra supplies) is a ${money(comparison.initialPrice)} one-time line if it still holds a ${marginPct}% margin — not a free extra on the ${money(comparison.monthly.monthlyPrice)} monthly.`;
  const thrown = comparison.thrownInBelowBreakEven
    ? `Throwing it in at today's monthly loses ${money(Math.abs(comparison.thrownInMonth1Profit))} in month 1 against a ${money(comparison.walkAwayMonth1)} walk-away.`
    : `Throwing it in at today's monthly leaves ${money(comparison.thrownInMonth1Profit)} in month 1 (${comparison.thrownInMonth1Margin.toFixed(1)}% margin), not the ${marginPct}% the monthly was built on.`;
  const amortize = `Baking it into the monthly over ${comparison.amortizeMonths} months is ${money(comparison.amortizedMonthlyPrice)} (${money(comparison.amortizedAddOn)} above today's monthly).`;
  const cancel = comparison.thrownInCashIfCancel < 0
    ? `If they cancel after ${comparison.cancelAfterMonths} month${comparison.cancelAfterMonths === 1 ? '' : 's'}, the giveaway finishes ${money(Math.abs(comparison.thrownInCashIfCancel))} under water versus ${money(comparison.quotedSeparatelyCashIfCancel)} if the initial was invoiced.`
    : `If they cancel after ${comparison.cancelAfterMonths} month${comparison.cancelAfterMonths === 1 ? '' : 's'}, throwing it in keeps ${money(comparison.thrownInCashIfCancel)} versus ${money(comparison.quotedSeparatelyCashIfCancel)} if the initial was invoiced.`;
  return [oneTime, thrown, amortize, cancel].join(' ');
}
