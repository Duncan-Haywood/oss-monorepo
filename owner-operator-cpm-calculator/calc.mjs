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
 * @param {number} input.taxReservePercent Share of profit the operator sets aside for
 *   self-employment and income tax. Their number, not ours — see taxReserve below.
 * @param {number|null} input.targetWeeklyTakeHome Optional: solve for the loaded rate that
 *   leaves this much after costs, factoring, and the tax reserve.
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

  // An owner-operator is self-employed, so nothing withholds for them: the
  // profit this page computes is pre-tax, and the operator owes
  // self-employment tax plus income tax out of it. Left implicit, "target
  // weekly take-home" solved for a rate that hits the target *before* any of
  // that -- the one number on the page an operator actually quotes from,
  // short by their whole tax bill.
  //
  // The percentage is theirs, never ours. Rates depend on filing status,
  // state, deductions and the per-diem election, none of which this page
  // asks for or should; and a default here would read as a claim about what
  // they owe. 0 keeps the old behaviour exactly, which is what every caller
  // that predates this gets.
  const taxReservePercent = number(input.taxReservePercent ?? 0, "Tax reserve");
  if (taxReservePercent >= 100) throw new Error("Tax reserve must be less than 100%");

  const detentionHours = number(input.detentionHours ?? 0, "Detention hours");
  const detentionPayPerHour = number(input.detentionPayPerHour ?? 0, "Detention pay per hour");
  const layoverPay = number(input.layoverPay ?? 0, "Layover pay");
  const lumperPaid = number(input.lumperPaid ?? 0, "Lumper paid");
  const lumperReimbursed = number(input.lumperReimbursed ?? 0, "Lumper reimbursed");
  const factorAccessorials = input.factorAccessorials !== false && input.factorAccessorials !== "false";

  const totalMiles = loadedMiles + emptyMiles;
  const fuelGallons = totalMiles / mpg;
  const fuelCost = fuelGallons * dieselPrice;
  const variablePerMile = maintenancePerMile + tiresPerMile + otherVariablePerMile;
  const reservesCost = totalMiles * variablePerMile;
  const variableCost = fuelCost + reservesCost;

  const monthlyFixed = truckPayment + insurance + permits + otherFixed;
  const weeklyFixed = monthlyFixed / WEEKS_PER_MONTH;
  const detentionGross = detentionHours * detentionPayPerHour;
  const accessorialGross = detentionGross + layoverPay;
  const lumperUnreimbursed = Math.max(0, lumperPaid - lumperReimbursed);
  const weeklyOperatingCost = variableCost + weeklyFixed;
  const weeklyCost = weeklyOperatingCost + lumperUnreimbursed;

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
  const accessorialNet = factorAccessorials
    ? accessorialGross * factoringMultiplier
    : accessorialGross;
  const offered = offeredLoadedRate === null
    ? null
    : scoreOffer({
      loadedMiles,
      totalMiles,
      offeredLoadedRate,
      factoringMultiplier,
      weeklyCost,
      breakEvenLoadedRate,
      accessorialNet,
      taxReservePercent,
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
      // A big accessorial week (long detention, a real layover) can net
      // accessorialNet above weeklyCost + targetWeeklyTakeHome on its own,
      // same as the loadedMilesToBreakEven case below. Left unclamped, the
      // numerator goes negative and this divides through to a negative
      // $/mile — "rate for target take-home: -$0.30/mi" printed as though
      // it were a quote to post, not the "you already cleared the target
      // without a single loaded mile" result it actually is. Floor at 0:
      // any non-negative rate already meets the target in that case.
      //
      // The target is what the operator wants to *keep*, so it is grossed up
      // through the tax reserve before it becomes profit the rate has to
      // earn: keeping $1,000 at a 25% reserve means clearing $1,333 pre-tax,
      // not $1,000. With no reserve set the divisor is 1 and this is the
      // arithmetic it always was.
      const profitNeeded = targetWeeklyTakeHome / (1 - taxReservePercent / 100);
      rateForTarget = Math.max(0, weeklyCost - accessorialNet + profitNeeded) / loadedMiles / factoringMultiplier;
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
    taxReservePercent,
    targetWeeklyTakeHome,
    rateForTarget,
    detentionHours,
    detentionPayPerHour,
    layoverPay,
    lumperPaid,
    lumperReimbursed,
    lumperUnreimbursed,
    detentionGross,
    accessorialGross,
    accessorialNet,
    factorAccessorials,
    weeklyOperatingCost,
    // Miles the truck must run loaded, at the offered rate after factoring,
    // to cover the week's cost. Null when there is no offer or the net rate
    // is zero; floored at 0 when accessorial income alone already covers
    // the week (see offerMilesToCover). Accessorial net is already inside
    // offered.weeklyProfit, so the miles figure still uses the settled
    // loaded rate against weeklyCost.
    loadedMilesToBreakEven: offerMilesToCover(offered, weeklyCost - accessorialNet),
  };
}

/**
 * Same week twice: miles and the note only, versus detention / layover /
 * lumper on the settlement. The question is whether unpaid wait and a
 * dock lumper flip a week that already looked fine — or save one that
 * did not.
 */
export function compareAccessorials(input) {
  const withThem = calculateWeek(input);
  const milesOnly = calculateWeek({
    ...input,
    detentionHours: 0,
    detentionPayPerHour: withThem.detentionPayPerHour,
    layoverPay: 0,
    lumperPaid: 0,
    lumperReimbursed: 0,
  });
  const withProfit = withThem.offered?.weeklyProfit ?? null;
  const milesProfit = milesOnly.offered?.weeklyProfit ?? null;
  const deltaProfit = withProfit === null || milesProfit === null
    ? null
    : withProfit - milesProfit;

  const netPerDetentionHour = withThem.detentionPayPerHour === 0
    ? null
    : withThem.detentionPayPerHour * (withThem.factorAccessorials ? (1 - withThem.factoringRate / 100) : 1);
  let detentionHoursToCover = null;
  if (milesProfit !== null && milesProfit < 0 && netPerDetentionHour > 0) {
    detentionHoursToCover = (-milesProfit) / netPerDetentionHour;
  }

  return {
    milesOnly,
    withAccessorials: withThem,
    deltaProfit,
    detentionHoursToCover,
    netPerDetentionHour,
  };
}

function scoreOffer({
  loadedMiles,
  totalMiles,
  offeredLoadedRate,
  factoringMultiplier,
  weeklyCost,
  breakEvenLoadedRate,
  accessorialNet = 0,
  taxReservePercent = 0,
}) {
  const grossRevenue = loadedMiles * offeredLoadedRate;
  const factoringFee = grossRevenue * (1 - factoringMultiplier);
  const mileNetRevenue = grossRevenue - factoringFee;
  const netRevenue = mileNetRevenue + accessorialNet;
  const profit = netRevenue - weeklyCost;
  const effectiveLoadedRate = offeredLoadedRate * factoringMultiplier;
  // Only a profitable week owes anything. A losing week is floored at zero
  // rather than generating a negative reserve that would read as a refund
  // this page is in no position to promise -- a loss may carry back or
  // forward or offset other income, which is exactly the judgement the page
  // does not make. So takeHome equals weeklyProfit on a losing week.
  const taxReserve = Math.max(0, profit) * (taxReservePercent / 100);
  const takeHome = profit - taxReserve;
  return {
    offeredLoadedRate,
    effectiveLoadedRate,
    grossRevenue,
    factoringFee,
    netRevenue,
    weeklyProfit: profit,
    annualProfit: profit * 52,
    taxReservePercent,
    taxReserve,
    weeklyTakeHome: takeHome,
    annualTakeHome: takeHome * 52,
    profitPerTotalMile: totalMiles === 0 ? null : profit / totalMiles,
    profitPerLoadedMile: loadedMiles === 0 ? null : profit / loadedMiles,
    // A rate at or above break-even before factoring can still lose money
    // after the factor takes its cut. Compare the *settled* rate.
    accessorialNet,
    mileNetRevenue,
    belowBreakEven: profit < 0,
  };
}

function offerMilesToCover(offered, netWeeklyCost) {
  if (!offered || offered.effectiveLoadedRate <= 0) return null;
  // Detention, layover, and unreimbursed lumper are netted out of cost before
  // this runs. A big accessorial week (long detention, a real layover) can
  // net that figure below zero on its own — the load's revenue isn't even
  // needed to cover the week. Floor at 0 miles rather than reporting a
  // negative "miles needed", which read as a broken result on an otherwise
  // profitable week (accessorial income can offset cost even when the
  // week's overall weeklyProfit is positive, since profit and this figure
  // net accessorials against different bases).
  return Math.max(0, netWeeklyCost) / offered.effectiveLoadedRate;
}
