// Pure pricing arithmetic for a maker selling 3D-printed parts (Etsy,
// Shopify, a craft fair table) rather than running a print farm at scale.
// No network, no state: every rate, gram, and hour is an input, so the
// result stays a transparent calculation the seller can check against their
// own filament spool and power bill instead of a rule of thumb like
// "3x the filament cost."
//
// Two costs are easy to leave out of that rule of thumb, and both are
// modeled here rather than assumed away:
//
//   1. Failed prints. A spaghetti print at hour six of an eight-hour job
//      still burned filament, electricity, and printer hours before it was
//      scrapped — and the successful reprint has to earn that back, not
//      just its own material. `failureRatePercent` inflates material,
//      electricity, and machine wear by how often an attempt fails, on the
//      logic that 1/(1 - failure rate) attempts are needed, on average, to
//      land one sellable part.
//   2. Marketplace fees are a percentage of the *selling price*, not the
//      cost — so they cannot simply be added as a flat cost line. Solving
//      for a price that leaves the target margin after the fee is taken
//      needs the fee and margin folded into the same denominator (mirrors
//      the fee-solved-into-price pattern in this portfolio's other
//      marketplace-fee calculators).

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

export const DEFAULTS = {
  filamentUsedGrams: 45,
  filamentCostPerKg: 22,
  printTimeHours: 3,
  printerWattage: 120,
  electricityCostPerKwh: 0.16,
  printerCost: 250,
  printerLifetimeHours: 3000,
  failureRatePercent: 8,
  postProcessingMinutes: 10,
  laborRatePerHour: 20,
  packagingCost: 0.75,
  marketplaceFeePercent: 8.5,
  targetMarginPercent: 35,
  otherFixedCost: 0,
};

/**
 * Price one 3D-printed part.
 *
 * @param {object} input
 * @param {number} input.filamentUsedGrams     Filament consumed by one
 *   successful print, from the slicer's estimate.
 * @param {number} input.filamentCostPerKg     What you paid per kilogram
 *   of filament, including shipping.
 * @param {number} input.printTimeHours        Slicer-estimated print time
 *   for one successful attempt.
 * @param {number} input.printerWattage        Printer's power draw while
 *   printing, in watts (a spec-sheet figure or a plug-in meter reading).
 * @param {number} input.electricityCostPerKwh Your electricity rate.
 * @param {number} input.printerCost           What the printer cost you.
 * @param {number} input.printerLifetimeHours  Hours you expect the printer
 *   to run before it needs replacing — the depreciation horizon.
 * @param {number} input.failureRatePercent    Share of print attempts that
 *   fail and have to be redone (0-99). Inflates material, electricity, and
 *   machine-wear cost, since a failed attempt still spent all three before
 *   the eventual successful print did.
 * @param {number} input.postProcessingMinutes Manual time per sellable
 *   part: support removal, sanding, gluing, assembly.
 * @param {number} input.laborRatePerHour      What you value your own time
 *   at.
 * @param {number} input.packagingCost         Box, bag, or insert cost per
 *   unit shipped.
 * @param {number} input.marketplaceFeePercent Combined marketplace and
 *   payment-processing fee, as a percent of the selling price (0-99).
 * @param {number} input.targetMarginPercent   Desired net profit as a
 *   percent of the selling price, after the marketplace fee (0-99, and
 *   `targetMarginPercent + marketplaceFeePercent` must be below 100).
 * @param {number} input.otherFixedCost        Any other flat cost per part
 *   — a design-time amortization, a specialty additive.
 * @param {number|null} [input.actualSellingPrice] A price you are actually
 *   charging (or considering), to check its real profit and margin instead
 *   of the suggested price.
 */
export function calculatePrice(input) {
  const filamentUsedGrams = number(input.filamentUsedGrams, 'Filament used');
  const filamentCostPerKg = number(input.filamentCostPerKg, 'Filament cost per kg');
  const printTimeHours = number(input.printTimeHours, 'Print time', { allowZero: false });
  const printerWattage = number(input.printerWattage, 'Printer wattage');
  const electricityCostPerKwh = number(input.electricityCostPerKwh, 'Electricity cost');
  const printerCost = number(input.printerCost, 'Printer cost');
  const printerLifetimeHours = number(input.printerLifetimeHours, 'Printer lifetime hours', { allowZero: false });
  const failureRatePercent = number(input.failureRatePercent, 'Failure rate');
  if (failureRatePercent >= 100) throw new Error('Failure rate must be less than 100%');
  const postProcessingMinutes = number(input.postProcessingMinutes, 'Post-processing time');
  const laborRatePerHour = number(input.laborRatePerHour, 'Labor rate');
  const packagingCost = number(input.packagingCost, 'Packaging cost');
  const marketplaceFeePercent = number(input.marketplaceFeePercent, 'Marketplace fee');
  const targetMarginPercent = number(input.targetMarginPercent, 'Target margin');
  const otherFixedCost = number(input.otherFixedCost, 'Other fixed cost');
  if (marketplaceFeePercent + targetMarginPercent >= 100) {
    throw new Error('Marketplace fee and target margin together must be less than 100%');
  }

  const materialCost = (filamentUsedGrams / 1000) * filamentCostPerKg;
  const electricityCost = printTimeHours * (printerWattage / 1000) * electricityCostPerKwh;
  const depreciationCost = (printerCost / printerLifetimeHours) * printTimeHours;
  const perAttemptCost = materialCost + electricityCost + depreciationCost;

  // On average, 1/(1 - failure rate) attempts are needed to land one
  // sellable part, so the per-attempt cost (material, electricity, machine
  // wear only — not the one-time post-processing and packaging that only
  // ever touch the successful part) is inflated by that factor.
  const failureMultiplier = 1 / (1 - failureRatePercent / 100);
  const adjustedPerAttemptCost = perAttemptCost * failureMultiplier;
  const failureBufferCost = adjustedPerAttemptCost - perAttemptCost;

  const laborCost = (postProcessingMinutes / 60) * laborRatePerHour;
  const totalCost = adjustedPerAttemptCost + laborCost + packagingCost + otherFixedCost;

  // price*(1 - fee%) - totalCost = price*(margin%) solved for price.
  const suggestedPrice = totalCost / (1 - marketplaceFeePercent / 100 - targetMarginPercent / 100);
  const suggestedFeeAmount = suggestedPrice * (marketplaceFeePercent / 100);
  const suggestedProfit = suggestedPrice - suggestedFeeAmount - totalCost;
  const breakEvenPrice = totalCost / (1 - marketplaceFeePercent / 100);

  const hasActualPrice = input.actualSellingPrice !== null && input.actualSellingPrice !== undefined && input.actualSellingPrice !== '';
  let actual = null;
  if (hasActualPrice) {
    const actualSellingPrice = number(input.actualSellingPrice, 'Selling price', { allowZero: false });
    const actualFeeAmount = actualSellingPrice * (marketplaceFeePercent / 100);
    const actualNetRevenue = actualSellingPrice - actualFeeAmount;
    const actualProfit = actualNetRevenue - totalCost;
    actual = {
      feeAmount: actualFeeAmount,
      netRevenue: actualNetRevenue,
      profit: actualProfit,
      marginPct: actualSellingPrice > 0 ? (actualProfit / actualSellingPrice) * 100 : null,
      belowBreakEven: actualProfit < 0,
    };
  }

  return {
    materialCost,
    electricityCost,
    depreciationCost,
    perAttemptCost,
    failureMultiplier,
    failureBufferCost,
    adjustedPerAttemptCost,
    laborCost,
    packagingCost,
    otherFixedCost,
    totalCost,
    suggestedPrice,
    suggestedFeeAmount,
    suggestedProfit,
    breakEvenPrice,
    actual,
  };
}
