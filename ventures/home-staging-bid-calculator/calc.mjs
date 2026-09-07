// Pure pricing arithmetic for an independent home stager (one or a few
// furniture packages, not a franchise with a warehouse team) who delivers a
// full furniture package into a vacant listing, leaves it for an initial
// term, and picks it back up once the home sells or the listing is
// withdrawn. No network, no state: every rate, hour, and month is an input,
// so the result stays a transparent calculation the stager can check
// against their own invoices and mileage log rather than a claim about what
// any job "should" cost.
//
// The trap this models: install and de-install are a fixed cost paid once,
// on delivery day and pickup day, regardless of how long the furniture ends
// up sitting in the house — the crew, the truck, and the arranging time cost
// the same whether the listing sells in two weeks or sits for four months.
// The *initial term* price is built to cover that fixed cost plus the
// furniture's own carrying cost (storage, insurance, wear) for a standard
// included term. Two failure modes follow from what happens after that term,
// and both are modeled here rather than assumed away:
//
//   1. The furniture carrying cost used to price the included term can be
//      set too low for what the package actually costs to keep off the
//      market (storage, insurance, depreciation) — so a job that finishes
//      exactly on schedule still under-recovers the true cost of tying up
//      that inventory.
//   2. The per-month extension fee charged when a listing runs long can be
//      set below the stager's own furniture carrying cost per month — so the
//      fee meant to compensate for inventory sitting idle instead loses
//      money on every extra month, and the loss grows without limit the
//      longer the listing takes to sell.

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export const DEFAULTS = {
  roomsStaged: 4,
  includedTermMonths: 2,
  expectedTermMonths: 3,
  furnitureCarryingCostPerMonth: 220,
  extensionFeePerMonth: 250,
  crewHours: 6,
  crewHourlyRate: 30,
  roundTripMiles: 25,
  mileageRate: 0.67,
  equipmentCostPerJob: 40,
  consultFlatFee: 150,
  overheadRate: 10,
  targetMargin: 30,
  otherCost: 0,
};

/**
 * Price one vacant-home staging job: furniture package delivered on install
 * day, held for an included term, then either picked up when the home sells
 * or extended month to month while it keeps sitting on the market.
 *
 * @param {object} input
 * @param {number} input.roomsStaged   Rooms furnished — descriptive only; it
 *   does not drive the arithmetic (the furniture package's own carrying cost
 *   below is what the money runs on, not a per-room count).
 * @param {number} input.includedTermMonths   Months included in the quoted
 *   staging price before an extension fee applies.
 * @param {number} input.expectedTermMonths   Your best estimate of how long
 *   this specific listing will actually take to sell.
 * @param {number} input.furnitureCarryingCostPerMonth   What it actually
 *   costs you to keep this furniture package off the market for a month —
 *   warehouse storage, insurance, and wear amortized per month, whether or
 *   not you charge for it.
 * @param {number} input.extensionFeePerMonth   What you charge the seller or
 *   agent per month beyond the included term if the listing runs long.
 * @param {number} input.crewHours   Combined crew time for delivery, staging
 *   the rooms, and the pickup once the job ends.
 * @param {number} input.crewHourlyRate   Target hourly pay for crew time.
 * @param {number} input.roundTripMiles   Combined vehicle miles for delivery
 *   and pickup.
 * @param {number} input.mileageRate   Reimbursement rate per mile for fuel
 *   and vehicle wear.
 * @param {number} input.equipmentCostPerJob   Dollies, blankets, truck rental,
 *   and other per-job equipment wear.
 * @param {number} input.consultFlatFee   Flat design-consultation fee billed
 *   with the job — pure revenue, no added carrying cost of its own.
 * @param {number} input.overheadRate   Business overhead as a percent of
 *   direct cost (insurance, software, marketing) — charged on your own labor
 *   and equipment cost, not on the furniture's carrying cost, which already
 *   is a real pass-through cost of holding inventory.
 * @param {number} input.targetMargin   Net profit as a percent of the price
 *   at the included term. Must be below 100.
 * @param {number} input.otherCost   Any other flat cost — a permit, an extra
 *   accent piece rental, a rush surcharge.
 * @param {number|null} [input.actualTermMonths]   How long the listing
 *   actually took to sell (days on market divided by 30), to check the real
 *   profit against this quote instead of the estimate.
 */
export function calculateQuote(input) {
  const roomsStaged = number(input.roomsStaged, 'Rooms staged', { allowZero: false });
  const includedTermMonths = number(input.includedTermMonths, 'Included term months', { allowZero: false });
  const expectedTermMonths = number(input.expectedTermMonths, 'Expected term months', { allowZero: false });
  const furnitureCarryingCostPerMonth = number(input.furnitureCarryingCostPerMonth, 'Furniture carrying cost per month');
  const extensionFeePerMonth = number(input.extensionFeePerMonth, 'Extension fee per month');
  const crewHours = number(input.crewHours, 'Crew hours');
  const crewHourlyRate = number(input.crewHourlyRate, 'Crew hourly rate');
  const roundTripMiles = number(input.roundTripMiles, 'Round-trip miles');
  const mileageRate = number(input.mileageRate, 'Mileage rate');
  const equipmentCostPerJob = number(input.equipmentCostPerJob, 'Equipment cost per job');
  const consultFlatFee = number(input.consultFlatFee, 'Design consultation fee');
  const overheadRate = number(input.overheadRate, 'Overhead rate');
  const targetMargin = number(input.targetMargin, 'Target margin');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  const otherCost = number(input.otherCost, 'Other cost');

  const laborCost = crewHours * crewHourlyRate;
  const mileageCost = roundTripMiles * mileageRate;
  const nonFurnitureDirectCost = laborCost + mileageCost + equipmentCostPerJob + otherCost;
  // Overhead is charged on the business's own labor and equipment, not on
  // the furniture's carrying cost — that cost is already real money paid to
  // a warehouse or insurer, not something overhead should mark up again.
  const overhead = nonFurnitureDirectCost * (overheadRate / 100);

  // The staging price you quote is built to cover the INCLUDED term, not
  // your estimate of how long the listing will actually take — anything
  // beyond the included term is billed separately as an extension, which is
  // why the two are computed from different month counts below.
  const furnitureCostAtIncludedTerm = includedTermMonths * furnitureCarryingCostPerMonth;
  const totalCostAtIncludedTerm = nonFurnitureDirectCost + overhead + furnitureCostAtIncludedTerm;
  // The consult fee needs no cost recovery of its own, so it is added on top
  // of the cost-plus-margin price rather than marked up a second time.
  const priceAtIncludedTerm = totalCostAtIncludedTerm / (1 - targetMargin / 100);
  const basePrice = priceAtIncludedTerm + consultFlatFee;
  const baseProfit = priceAtIncludedTerm - totalCostAtIncludedTerm + consultFlatFee;
  const baseMarginPct = priceAtIncludedTerm > 0 ? ((priceAtIncludedTerm - totalCostAtIncludedTerm) / priceAtIncludedTerm) * 100 : null;

  // The sharpest risk in this business: does the extension fee even cover
  // what an extra month costs you to keep this package off the market? If
  // not, every extension month loses money regardless of how well the
  // included term was priced, and maxExtensionMonthsBeforeLoss says how many
  // such months erase this job's entire built-in profit.
  const profitPerExtensionMonth = extensionFeePerMonth - furnitureCarryingCostPerMonth;
  const extensionFeeCoversCarryingCost = profitPerExtensionMonth >= 0;
  const maxExtensionMonthsBeforeLoss = extensionFeeCoversCarryingCost
    ? null
    : (priceAtIncludedTerm - totalCostAtIncludedTerm) / (furnitureCarryingCostPerMonth - extensionFeePerMonth);

  const expectedExtensionMonths = Math.max(0, expectedTermMonths - includedTermMonths);
  const expectedExtensionRevenue = expectedExtensionMonths * extensionFeePerMonth;
  const expectedExtensionCarryingCost = expectedExtensionMonths * furnitureCarryingCostPerMonth;
  const expectedExtensionProfit = expectedExtensionRevenue - expectedExtensionCarryingCost;

  const expectedFurnitureCost = expectedTermMonths * furnitureCarryingCostPerMonth;
  const expectedTotalRevenue = basePrice + expectedExtensionRevenue;
  const expectedTotalCost = nonFurnitureDirectCost + overhead + expectedFurnitureCost;
  const expectedProfit = expectedTotalRevenue - expectedTotalCost;
  const expectedMarginPct = expectedTotalRevenue > 0 ? (expectedProfit / expectedTotalRevenue) * 100 : null;

  // Flag the job, not just the pricing structure: the extension fee is
  // mispriced AND this specific listing is actually expected to run past the
  // included term, so the mispricing is about to be realized rather than
  // theoretical.
  const termRiskTight = !extensionFeeCoversCarryingCost && expectedExtensionMonths > 0;

  const hasActualTerm = input.actualTermMonths !== null && input.actualTermMonths !== undefined && input.actualTermMonths !== '';
  let actual = null;
  if (hasActualTerm) {
    const actualTermMonths = number(input.actualTermMonths, 'Actual term months');

    const actualExtensionMonths = Math.max(0, actualTermMonths - includedTermMonths);
    const actualExtensionRevenue = actualExtensionMonths * extensionFeePerMonth;
    const actualFurnitureCost = actualTermMonths * furnitureCarryingCostPerMonth;
    const actualTotalRevenue = basePrice + actualExtensionRevenue;
    const actualTotalCost = nonFurnitureDirectCost + overhead + actualFurnitureCost;
    const actualProfit = actualTotalRevenue - actualTotalCost;

    actual = {
      extensionMonths: actualExtensionMonths,
      extensionRevenue: actualExtensionRevenue,
      furnitureCost: actualFurnitureCost,
      totalRevenue: actualTotalRevenue,
      totalCost: actualTotalCost,
      profit: actualProfit,
      marginPct: actualTotalRevenue > 0 ? (actualProfit / actualTotalRevenue) * 100 : null,
      belowBreakEven: actualProfit < 0,
    };
  }

  return {
    roomsStaged,
    includedTermMonths,
    extensionFeePerMonth,
    laborCost,
    mileageCost,
    equipmentCostPerJob,
    otherCost,
    consultFlatFee,
    nonFurnitureDirectCost,
    overhead,
    furnitureCostAtIncludedTerm,
    totalCostAtIncludedTerm,
    basePrice,
    baseProfit,
    baseMarginPct,
    breakEvenPrice: totalCostAtIncludedTerm,
    profitPerExtensionMonth,
    extensionFeeCoversCarryingCost,
    maxExtensionMonthsBeforeLoss,
    expectedExtensionMonths,
    expectedExtensionRevenue,
    expectedExtensionCarryingCost,
    expectedExtensionProfit,
    expectedFurnitureCost,
    expectedTotalRevenue,
    expectedTotalCost,
    expectedProfit,
    expectedMarginPct,
    termRiskTight,
    actual,
  };
}
