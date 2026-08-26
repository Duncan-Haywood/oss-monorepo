// Pure owner-operator cost-per-mile arithmetic. No network, no state.
//
// The method is the one that actually decides whether a load pays: add every
// mile the truck moves (loaded and empty), stack fuel, per-mile reserves, and
// the weekly share of truck / insurance / permits, then convert that all-in
// cost back into a rate per *loaded* mile. Quoting or accepting a rate per
// loaded mile without that conversion is how a $2.00 offer looks fine and
// still loses money after deadhead and factoring.
//
// Every figure is an input. The result is transparent arithmetic the operator
// can check against fuel receipts and the truck note — not a claim about what
// any lane "should" pay.

export const WEEKS_PER_MONTH = 52 / 12;

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/**
 * Cost a week of owner-operator running and, optionally, score an offered
 * loaded rate against the same cost base.
 *
 * @param {object} input
 * @param {number} input.loadedMiles        Paid miles this week.
 * @param {number} input.emptyMiles         Deadhead / bobtail / empty miles this week.
 * @param {number} input.mpg                Average miles per gallon, all miles.
 * @param {number} input.dieselPrice        Dollars per gallon.
 * @param {number} input.truckPayment       Truck (and trailer) note, per month.
 * @param {number} input.insurance          Physical damage + liability, per month.
 * @param {number} input.permits            IFTA, plates, ELD, permits, per month.
 * @param {number} input.otherFixed         Everything else that does not move with miles.
 * @param {number} input.maintenancePerMile Reserve for shop work, per total mile.
 * @param {number} input.tiresPerMile       Tire reserve, per total mile.
 * @param {number} input.otherVariablePerMile Tolls, scales, DEF, parking, per total mile.
 * @param {number} input.factoringRate      Percent taken off the settlement (0 if paid direct).
 * @param {number|null} input.offeredLoadedRate Optional broker / shipper rate per loaded mile.
 * @param {number|null} input.targetWeeklyTakeHome Optional: solve for the loaded rate that
 *   leaves this much after costs and factoring.
 */
export function calculateWeek(input) {
  const loadedMiles = number(input.loadedMiles ?? 0, "Loaded miles");
  const emptyMiles = number(input.emptyMiles ?? 0, "Empty miles");
  const mpg = number(input.mpg ?? 0, "Miles per gallon", { allowZero: false });
  const dieselPrice = number(input.dieselPrice ?? 0, "Diesel price");
  const truckPayment = number(input.truckPayment ?? 0, "Truck payment");
  const insurance = number(input.insurance ?? 0, "Insurance");
  const permits = number(input.permits ?? 0, "Permits");
  const otherFixed = number(input.otherFixed ?? 0, "Other fixed cost");
  const maintenancePerMile = number(input.maintenancePerMile ?? 0, "Maintenance per mile");
  const tiresPerMile = number(input.tiresPerMile ?? 0, "Tires per mile");
  const otherVariablePerMile = number(
    input.otherVariablePerMile ?? 0,
    "Other variable cost per mile",
  );
  const factoringRate = number(input.factoringRate ?? 0, "Factoring rate");
  if (factoringRate >= 100) throw new Error("Factoring rate must be less than 100%");

  const totalMiles = loadedMiles + emptyMiles;
  const fuelGallons = totalMiles / mpg;
  const fuelCost = fuelGallons * dieselPrice;
  const variablePerMile = maintenancePerMile + tiresPerMile + otherVariablePerMile;
  const reservesCost = totalMiles * variablePerMile;
  const variableCost = fuelCost + reservesCost;

  const monthlyFixed = truckPayment + insurance + permits + otherFixed;
  const weeklyFixed = monthlyFixed / WEEKS_PER_MONTH;
  const weeklyCost = variableCost + weeklyFixed;

  const allInCpm = totalMiles === 0 ? null : weeklyCost / totalMiles;
  const variableCpm = totalMiles === 0 ? null : variableCost / totalMiles;
  const fixedCpm = totalMiles === 0 ? null : weeklyFixed / totalMiles;
  const deadheadShare = totalMiles === 0 ? 0 : (emptyMiles / totalMiles) * 100;

  // The number an operator actually quotes and accepts. All-in cost lives on
  // every mile; revenue lives only on loaded miles, so the loaded rate has to
  // cover the empty ones.
  const breakEvenLoadedRate = loadedMiles === 0 ? null : weeklyCost / loadedMiles;

  const hasOffered =
    input.offeredLoadedRate !== null &&
    input.offeredLoadedRate !== undefined &&
    input.offeredLoadedRate !== "";
  const offeredLoadedRate = hasOffered
    ? number(input.offeredLoadedRate, "Offered loaded rate")
    : null;

  const factoringMultiplier = 1 - factoringRate / 100;
  const offered = offeredLoadedRate === null
    ? null
    : scoreOffer({
      loadedMiles,
      totalMiles,
      offeredLoadedRate,
      factoringMultiplier,
      weeklyCost,
      breakEvenLoadedRate,
    });

  const hasTarget =
    input.targetWeeklyTakeHome !== null &&
    input.targetWeeklyTakeHome !== undefined &&
    input.targetWeeklyTakeHome !== "";
  const targetWeeklyTakeHome = hasTarget
    ? number(input.targetWeeklyTakeHome, "Target weekly take-home")
    : null;

  let rateForTarget = null;
  if (targetWeeklyTakeHome !== null) {
    if (loadedMiles === 0) {
      rateForTarget = null;
    } else if (factoringMultiplier === 0) {
      rateForTarget = null;
    } else {
      rateForTarget = (weeklyCost + targetWeeklyTakeHome) / loadedMiles / factoringMultiplier;
    }
  }

  return {
    loadedMiles,
    emptyMiles,
    totalMiles,
    mpg,
    dieselPrice,
    fuelGallons,
    fuelCost,
    reservesCost,
    variableCost,
    variablePerMile,
    monthlyFixed,
    weeklyFixed,
    weeklyCost,
    annualCost: weeklyCost * 52,
    allInCpm,
    variableCpm,
    fixedCpm,
    deadheadShare,
    breakEvenLoadedRate,
    factoringRate,
    offered,
    targetWeeklyTakeHome,
    rateForTarget,
    // Miles the truck must run loaded, at the offered rate after factoring,
    // to cover the week's cost. Null when there is no offer or the net rate
    // is zero.
    loadedMilesToBreakEven: offerMilesToCover(offered, weeklyCost),
  };
}

function scoreOffer({
  loadedMiles,
  totalMiles,
  offeredLoadedRate,
  factoringMultiplier,
  weeklyCost,
  breakEvenLoadedRate,
}) {
  const grossRevenue = loadedMiles * offeredLoadedRate;
  const factoringFee = grossRevenue * (1 - factoringMultiplier);
  const netRevenue = grossRevenue - factoringFee;
  const profit = netRevenue - weeklyCost;
  const effectiveLoadedRate = offeredLoadedRate * factoringMultiplier;
  return {
    offeredLoadedRate,
    effectiveLoadedRate,
    grossRevenue,
    factoringFee,
    netRevenue,
    weeklyProfit: profit,
    annualProfit: profit * 52,
    profitPerTotalMile: totalMiles === 0 ? null : profit / totalMiles,
    profitPerLoadedMile: loadedMiles === 0 ? null : profit / loadedMiles,
    // A rate at or above break-even before factoring can still lose money
    // after the factor takes its cut. Compare the *settled* rate.
    belowBreakEven:
      breakEvenLoadedRate === null
        ? netRevenue < weeklyCost
        : effectiveLoadedRate < breakEvenLoadedRate,
  };
}

function offerMilesToCover(offered, weeklyCost) {
  if (!offered || offered.effectiveLoadedRate <= 0) return null;
  return weeklyCost / offered.effectiveLoadedRate;
}
