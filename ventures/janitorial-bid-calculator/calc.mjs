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
  };
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
  const money = value => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const pct = comparison.reductionFactor * 100;
  const marginPct = Number.isFinite(targetMargin) ? targetMargin : 20;
  const direction = comparison.proposedWeekly < comparison.currentWeekly ? 'cut' : 'change';
  const naiveLine = comparison.naiveBelowBreakEven
    ? `Accepting ${pct.toFixed(0)}% of the ${comparison.currentWeekly}× price (${money(comparison.naiveLinearPrice)}) would lose ${money(Math.abs(comparison.naiveProfit))} a month against the ${comparison.proposedWeekly}× cost base. Walk-away on the reduced schedule is ${money(comparison.walkAwayAtReduced)}.`
    : `A linear ${pct.toFixed(0)}% of the ${comparison.currentWeekly}× price is ${money(comparison.naiveLinearPrice)}, which leaves a ${comparison.naiveMargin.toFixed(1)}% margin at ${comparison.proposedWeekly}× — ${money(Math.abs(comparison.leftOnTable))} a month ${comparison.leftOnTable > 0 ? 'below' : 'above'} the price that holds a ${marginPct}% target.`;
  return [
    `At ${comparison.proposedWeekly}×/week the monthly price that still holds a ${marginPct}% margin is ${money(comparison.priceToHoldTargetMargin)}, not a linear ${direction} of the ${comparison.currentWeekly}× price (${money(comparison.baseline.monthlyPrice)}).`,
    `Labor drops with the visits (${comparison.baseline.monthlyHours.toFixed(1)} h → ${comparison.reduced.monthlyHours.toFixed(1)} h). Supplies, equipment, and travel stay on the job (${money(comparison.unscaledMonthly)}/month in this bid).`,
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
  const money = value => `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
