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
 *   underpriced bids.
 * @param {number} input.hourlyWage         What the cleaner is paid per hour.
 * @param {number} input.burdenRate         Payroll burden as a % on top of wage
 *   (employer taxes, workers' compensation, insurance, paid time off).
 * @param {number} input.suppliesPerSqFtMonth  Consumables and chemicals, per
 *   cleanable square foot per month.
 * @param {number} input.equipmentMonthly   Equipment, vehicle, and travel cost per month.
 * @param {number} input.otherMonthly       Anything else billed to this job monthly.
 * @param {number} input.overheadRate       Business overhead as a % on direct cost.
 * @param {number} input.targetMargin       Net profit as a % of the final price.
 * @param {Array<{name?: string, squareFeet: number, productionRate: number, passes?: number, materials?: number}>} [input.projects]
 *   Optional one-time work (strip and wax, extraction, initial clean). Priced
 *   with the same loaded wage, overhead, and margin as the monthly contract,
 *   but invoiced once — not rolled into the recurring price.
 * @param {number|null} input.proposedPrice Optional: a price already on the
 *   table, so the contractor can see the margin it actually leaves.
 */
export function calculateBid(input) {
  const areasInput = Array.isArray(input.areas) ? input.areas : [];
  if (areasInput.length === 0) throw new Error('Add at least one area to price');

  const hourlyWage = number(input.hourlyWage ?? 0, 'Hourly wage');
  const burdenRate = number(input.burdenRate ?? 0, 'Payroll burden');
  const suppliesPerSqFtMonth = number(input.suppliesPerSqFtMonth ?? 0, 'Supplies per sq ft');
  const equipmentMonthly = number(input.equipmentMonthly ?? 0, 'Equipment cost');
  const otherMonthly = number(input.otherMonthly ?? 0, 'Other monthly cost');
  const overheadRate = number(input.overheadRate ?? 0, 'Overhead');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

  const loadedWage = hourlyWage * (1 + burdenRate / 100);

  const areas = areasInput.map((area, index) => {
    const label = area.name?.trim() || `Area ${index + 1}`;
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

  const totalSquareFeet = areas.reduce((sum, a) => sum + a.squareFeet, 0);
  const monthlyHours = areas.reduce((sum, a) => sum + a.monthlyHours, 0);
  const monthlyLaborCost = monthlyHours * loadedWage;
  const monthlySupplies = totalSquareFeet * suppliesPerSqFtMonth;

  // Overhead is a markup on the direct cost of servicing this job, which is
  // how a small contractor recovers office, admin, and sales cost. It is
  // deliberately not applied to itself or to profit.
  const directCost = monthlyLaborCost + monthlySupplies + equipmentMonthly + otherMonthly;
  const monthlyOverhead = directCost * overheadRate / 100;
  const monthlyCost = directCost + monthlyOverhead;

  // Margin is a share of price, not a markup on cost, because that is how the
  // customer's number is quoted and how the contractor's P&L reads it.
  const monthlyPrice = monthlyCost / (1 - targetMargin / 100);
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

  return {
    areas: areas.map(area => ({
      ...area,
      // Share of total labor hours. This is the line that shows a contractor
      // that 8% of the floor area is eating 30% of the labor.
      hoursShare: monthlyHours === 0 ? 0 : area.monthlyHours / monthlyHours * 100,
    })),
    totalSquareFeet,
    loadedWage,
    hoursPerVisitTotal: areas.reduce((sum, a) => sum + (a.cleaningsPerWeek > 0 ? a.hoursPerCleaning : 0), 0),
    monthlyHours,
    monthlyLaborCost,
    monthlySupplies,
    equipmentMonthly,
    otherMonthly,
    monthlyOverhead,
    monthlyCost,
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
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  return [
    'COMMERCIAL CLEANING BID',
    '',
    `Proposed monthly service: ${money(result.monthlyPrice)}`,
    `Annual contract value: ${money(result.annualPrice)}`,
    `Service labor: ${result.monthlyHours.toFixed(1)} hours/month`,
    `Price per square foot: $${result.pricePerSqFtMonth === null ? 'n/a' : result.pricePerSqFtMonth.toFixed(3)}/sq ft/month`,
    ...projectBlock,
    '',
    'SERVICE AREAS',
    spaces || '- No service areas entered',
    '',
    `Scope basis: ${result.hoursPerVisitTotal.toFixed(2)} labor hours per visit at the entered frequencies.`,
    'This is a draft for review. Confirm scope, schedule, insurance, taxes, and all pricing before sending.',
  ].join('\n');
}
