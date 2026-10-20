// Deterministic pricing arithmetic for an independent dog boarding and
// daycare facility (a home-based boarder or a small kennel/run building) --
// not a marketplace app that lists sitters, and not the route-pricing
// calculator for a mobile dog walker (see ../dog-walking-route-pricing).
// Two distinct calculations:
//
//   calculate(input)          -- price ONE reservation (an overnight boarding
//                                 stay or a daycare-only booking) from staff
//                                 time, supplies, allocated overhead, a
//                                 target margin, a long-stay discount past a
//                                 threshold night count, a multi-dog
//                                 discount for extra dogs on the same
//                                 reservation, optional add-ons (extra potty
//                                 breaks, a bath, daily medication), and an
//                                 optional payment-processing gross-up.
//   occupancyBreakeven(input) -- given the facility's fixed monthly costs,
//                                 kennel/run capacity, the variable cost per
//                                 occupied dog-day, and the blended rate it
//                                 actually realizes, find the occupancy
//                                 percentage that breaks even and the profit
//                                 or shortfall at a projected occupancy.

export const DEFAULTS = {
  dogCount: 1,
  boardingNights: 3,
  daycareDays: 1,
  staffMinutesPerDogDay: 30,
  staffWageRate: 18,
  suppliesCostPerDogDay: 4,
  overheadPerDogDay: 10,
  extraPottyBreaks: 0,
  extraPottyBreakFee: 5,
  bathAddOnFee: 0,
  medicationFeePerDay: 0,
  longStayThresholdNights: 7,
  longStayDiscountPct: 10,
  multiDogDiscountPct: 10,
  targetMarginPct: 25,
  paymentProcessingFeePct: 0,
  // Not read by calculate() itself -- these five feed occupancyBreakeven()
  // below. They live here anyway because DEFAULTS is also the one source
  // share.mjs and index.html derive their persisted/shareable field list
  // from, and these are ordinary numeric assumptions, so a shared or
  // restored link should carry them too.
  kennelRuns: 12,
  daysInMonth: 30,
  fixedMonthlyCosts: 6000,
  variableCostPerDogDay: 13,
  averageDailyRate: 45,
  projectedOccupancyPct: 65,
};

function number(value, label, { min = 0, max } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== undefined && parsed > max) {
    throw new Error(`${label} must be ${max} or less.`);
  }
  return parsed;
}

/**
 * Price one reservation: an overnight boarding stay, or a daycare-only
 * booking when `boardingNights` is zero.
 *
 * @param {object} input
 * @param {number} input.dogCount Number of dogs on this reservation (a
 *   family boarding two dogs together). Must be at least 1.
 * @param {number} input.boardingNights Overnight boarding nights. Zero means
 *   this is a daycare-only booking, priced from `daycareDays` instead.
 * @param {number} input.daycareDays Daycare (day-only, no overnight) days in
 *   this booking. Ignored when `boardingNights` is greater than zero.
 * @param {number} input.staffMinutesPerDogDay Staff minutes per dog per day:
 *   feeding, potty breaks, play/exercise time, and cleaning the run.
 * @param {number} input.staffWageRate Fully-loaded staff wage cost, $/hour.
 * @param {number} input.suppliesCostPerDogDay Food, bedding/litter, and
 *   cleaning supplies consumed per dog per day.
 * @param {number} input.overheadPerDogDay Facility overhead (rent, utilities,
 *   insurance, booking software) allocated to this one dog-day. See
 *   {@link occupancyBreakeven} for sizing this from a monthly total.
 * @param {number} input.extraPottyBreaks Count of extra potty/walk breaks
 *   beyond the standard schedule, for the whole reservation.
 * @param {number} input.extraPottyBreakFee Flat fee per extra potty break.
 * @param {number} input.bathAddOnFee Flat one-time fee for an exit bath,
 *   charged once per reservation regardless of length.
 * @param {number} input.medicationFeePerDay Flat fee per day for
 *   administering medication.
 * @param {number} input.longStayThresholdNights Nights (or daycare days)
 *   included at the full rate before the long-stay discount applies to the
 *   remainder.
 * @param {number} input.longStayDiscountPct Percentage discount on the daily
 *   rate for nights/days beyond the threshold.
 * @param {number} input.multiDogDiscountPct Percentage discount applied to
 *   each dog after the first on the same reservation.
 * @param {number} input.targetMarginPct Profit margin on top of true
 *   per-dog-day cost (labor + supplies + allocated overhead). Must be below
 *   100.
 * @param {number} input.paymentProcessingFeePct Percentage taken by a
 *   payment processor. The price is grossed up so the facility still nets
 *   the pre-fee total. Must be below 100.
 */
export function calculate(input) {
  const dogCount = number(input.dogCount, 'Number of dogs', { min: 1 });
  const boardingNights = number(input.boardingNights ?? 0, 'Boarding nights');
  const isBoarding = boardingNights > 0;
  const daycareDays = number(input.daycareDays ?? 0, 'Daycare days');
  const totalDays = isBoarding ? boardingNights : daycareDays;
  if (totalDays <= 0) {
    throw new Error('Enter at least one boarding night or daycare day.');
  }

  const staffMinutesPerDogDay = number(input.staffMinutesPerDogDay, 'Staff minutes per dog per day');
  const staffWageRate = number(input.staffWageRate, 'Staff wage rate');
  const suppliesCostPerDogDay = number(input.suppliesCostPerDogDay, 'Supplies cost per dog per day');
  const overheadPerDogDay = number(input.overheadPerDogDay, 'Overhead per dog per day');
  const extraPottyBreaks = number(input.extraPottyBreaks, 'Extra potty breaks');
  const extraPottyBreakFee = number(input.extraPottyBreakFee, 'Extra potty break fee');
  const bathAddOnFee = number(input.bathAddOnFee, 'Bath add-on fee');
  const medicationFeePerDay = number(input.medicationFeePerDay, 'Medication fee per day');
  const longStayThresholdNights = number(input.longStayThresholdNights, 'Long-stay threshold', { min: 1 });
  const longStayDiscountPct = number(input.longStayDiscountPct, 'Long-stay discount', { max: 100 });
  const multiDogDiscountPct = number(input.multiDogDiscountPct, 'Multi-dog discount', { max: 100 });
  const targetMarginPct = number(input.targetMarginPct, 'Target margin', { max: 99.999 });
  const paymentProcessingFeePct = number(input.paymentProcessingFeePct, 'Payment processing fee', { max: 99.999 });

  const laborCostPerDogDay = (staffMinutesPerDogDay / 60) * staffWageRate;
  const baseCostPerDogDay = laborCostPerDogDay + suppliesCostPerDogDay + overheadPerDogDay;
  const marginPerDogDay = baseCostPerDogDay * (targetMarginPct / 100);
  const dailyRate = baseCostPerDogDay + marginPerDogDay;

  const standardDays = Math.min(totalDays, longStayThresholdNights);
  const discountedDays = Math.max(0, totalDays - longStayThresholdNights);
  const longStayDiscountAmount = dailyRate * (longStayDiscountPct / 100) * discountedDays;
  const perDogSubtotal = dailyRate * standardDays + dailyRate * (1 - longStayDiscountPct / 100) * discountedDays;

  const extraDogs = Math.max(0, dogCount - 1);
  const multiDogDiscountAmount = extraDogs * perDogSubtotal * (multiDogDiscountPct / 100);
  const multiDogSubtotal = perDogSubtotal + extraDogs * perDogSubtotal - multiDogDiscountAmount;

  const pottyCost = extraPottyBreaks * extraPottyBreakFee;
  const medicationCost = medicationFeePerDay * totalDays;
  const addOnsTotal = pottyCost + bathAddOnFee + medicationCost;

  const preProcessing = multiDogSubtotal + addOnsTotal;
  const finalPrice = preProcessing / (1 - paymentProcessingFeePct / 100);
  const processingFeeAmount = finalPrice - preProcessing;

  const effectiveDailyRatePerDog = totalDays > 0 && dogCount > 0 ? finalPrice / (totalDays * dogCount) : null;

  return {
    isBoarding, totalDays, dogCount,
    laborCostPerDogDay, baseCostPerDogDay, marginPerDogDay, dailyRate,
    standardDays, discountedDays, longStayDiscountAmount, perDogSubtotal,
    extraDogs, multiDogDiscountAmount, multiDogSubtotal,
    pottyCost, bathAddOnFee, medicationCost, addOnsTotal,
    processingFeeAmount, finalPrice, effectiveDailyRatePerDog,
    targetMarginPct, longStayDiscountPct, multiDogDiscountPct, paymentProcessingFeePct,
  };
}

/**
 * Find the occupancy that breaks even, and the profit or shortfall at a
 * projected occupancy, for a facility with fixed monthly costs, a fixed
 * number of kennel/run spots, a variable cost per occupied dog-day, and a
 * blended average daily rate it actually realizes (after its own discounts).
 *
 * @param {object} input
 * @param {number} input.kennelRuns Number of kennel runs / boarding spots
 *   the facility operates.
 * @param {number} input.daysInMonth Days in the month being planned for.
 * @param {number} input.fixedMonthlyCosts Rent, utilities, insurance,
 *   software, and any staffing that does not scale with how many dogs are
 *   actually there.
 * @param {number} input.variableCostPerDogDay Labor and supplies cost that
 *   scales with each occupied dog-day (leave allocated overhead out of this
 *   figure -- it is already counted in `fixedMonthlyCosts`).
 * @param {number} input.averageDailyRate The blended revenue per occupied
 *   dog-day the facility expects to realize, after its own multi-dog and
 *   long-stay discounts.
 * @param {number} input.projectedOccupancyPct The occupancy percentage
 *   (0-100) to project profit or shortfall at.
 */
export function occupancyBreakeven(input) {
  const kennelRuns = number(input.kennelRuns, 'Kennel runs', { min: 1 });
  const daysInMonth = number(input.daysInMonth, 'Days in month', { min: 1 });
  const fixedMonthlyCosts = number(input.fixedMonthlyCosts, 'Fixed monthly costs');
  const variableCostPerDogDay = number(input.variableCostPerDogDay, 'Variable cost per dog-day');
  const averageDailyRate = number(input.averageDailyRate, 'Average daily rate');
  const projectedOccupancyPct = number(input.projectedOccupancyPct, 'Projected occupancy', { max: 100 });

  const totalDogDayCapacity = kennelRuns * daysInMonth;
  const contributionMarginPerDogDay = averageDailyRate - variableCostPerDogDay;
  const canBreakEven = contributionMarginPerDogDay > 0;
  const breakEvenDogDays = canBreakEven ? fixedMonthlyCosts / contributionMarginPerDogDay : null;
  const breakEvenOccupancyPct = canBreakEven && totalDogDayCapacity > 0
    ? (breakEvenDogDays / totalDogDayCapacity) * 100
    : null;

  const projectedDogDays = totalDogDayCapacity * (projectedOccupancyPct / 100);
  const projectedRevenue = projectedDogDays * averageDailyRate;
  const projectedVariableCost = projectedDogDays * variableCostPerDogDay;
  const projectedProfit = projectedRevenue - projectedVariableCost - fixedMonthlyCosts;

  const meetsBreakeven = breakEvenOccupancyPct === null ? false : projectedOccupancyPct >= breakEvenOccupancyPct;
  const occupancyGapPct = breakEvenOccupancyPct === null ? null : Math.max(0, breakEvenOccupancyPct - projectedOccupancyPct);

  return {
    totalDogDayCapacity, contributionMarginPerDogDay, canBreakEven,
    breakEvenDogDays, breakEvenOccupancyPct, projectedDogDays,
    projectedRevenue, projectedVariableCost, projectedProfit,
    meetsBreakeven, occupancyGapPct,
  };
}
