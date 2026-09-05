// Pure compensation arithmetic for a stylist (or barber, nail tech, lash
// artist) deciding between a salon commission split and booth rent. No
// network, no state: every ticket, rent, and cost is an input, so the result
// stays a transparent calculation they can check against their own book and
// lease rather than a claim about what anyone "should" earn.
//
// The method is the one that actually flips the decision: compare take-home
// *and* take-home per hour. Booth rent keeps more of each ticket but adds
// rent, card fees, backbar, and unpaid laundry/booking hours the salon used
// to absorb. A bigger check that costs six extra hours a week is not always
// the better job.

import {
  DEFAULT_SOCIAL_SECURITY_WAGE_BASE,
  employeePayrollTax,
  selfEmploymentTax,
} from './payroll.mjs';

export const WEEKS_PER_MONTH = 52 / 12;

function number(value, name, { min = 0, allowZero = true, max = Infinity } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (result > max) throw new Error(`${name} must be at most ${max}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function rate(value, name) {
  return number(value, name, { max: 100 }) / 100;
}

/**
 * Convert a posted booth rent into a weekly figure. Salons quote both ways;
 * the rest of the model is weekly because that is how a book is counted.
 */
export function weeklyRent(amount, cadence) {
  const rent = number(amount, 'Booth rent');
  const period = String(cadence || 'weekly').toLowerCase();
  if (period === 'weekly') return rent;
  if (period === 'monthly') return rent / WEEKS_PER_MONTH;
  throw new Error('Booth rent cadence must be weekly or monthly');
}

function scaleTakeHome(side, weeksWorkedPerYear) {
  return {
    ...side,
    monthlyTakeHome: side.weeklyTakeHome * (weeksWorkedPerYear / 12),
    annualTakeHome: side.weeklyTakeHome * weeksWorkedPerYear,
  };
}

/**
 * Compare commission vs booth rent on the same client book.
 *
 * @param {object} input
 * @param {number} input.averageTicket
 * @param {number} input.clientsPerWeek
 * @param {number} input.retailPerWeek
 * @param {number} input.weeksWorkedPerYear  Paid working weeks (not 52 if they take vacation).
 * @param {number} input.commissionPercent   Service split the salon pays, 0–100.
 * @param {number} input.retailCommissionPercent
 * @param {number} input.boothRentAmount
 * @param {'weekly'|'monthly'} input.boothRentCadence
 * @param {number} input.cardFeePercent      Processing the booth renter pays.
 * @param {number} input.backbarPercent      Color/product used on clients, % of service.
 * @param {number} input.retailCostPercent   Wholesale cost of retail sold, % of retail.
 * @param {number} input.otherWeeklyCost     Insurance, towels, tools, extras.
 * @param {number} input.averageServiceMinutes
 * @param {number} input.unpaidHoursCommission  Laundry/booking the salon still covers.
 * @param {number} input.unpaidHoursBooth       Laundry/booking the renter now does.
 * @param {number|string|null} [input.offeredRentAmount]  A rent offer to score.
 * @param {'weekly'|'monthly'} [input.offeredRentCadence]
 * @param {number} [input.marginalIncomeTaxPercent]  Marginal income-tax bracket,
 *   used only to value the deductible half of self-employment tax. 0 (the
 *   default) ignores that offset entirely, which understates booth rent
 *   slightly rather than overstating it.
 * @param {number} [input.socialSecurityWageBase]  Override the annual Social
 *   Security cap; the default is `DEFAULT_SOCIAL_SECURITY_WAGE_BASE`.
 * @param {object} [options]
 * @param {boolean} [options.solveAfterTax=true]  Internal. The after-tax
 *   break-even and matching-rent figures are found by re-running this function
 *   against altered inputs, so the recursive calls set this false to stop at
 *   one level. Nothing outside this file needs to pass it.
 */
export function compareCompensation(input, { solveAfterTax = true } = {}) {
  const averageTicket = number(input.averageTicket ?? 0, 'Average ticket');
  const clientsPerWeek = number(input.clientsPerWeek ?? 0, 'Clients per week');
  const retailPerWeek = number(input.retailPerWeek ?? 0, 'Retail per week');
  const weeksWorkedPerYear = number(
    input.weeksWorkedPerYear ?? 50,
    'Weeks worked per year',
    { allowZero: false, max: 52 },
  );

  const commissionRate = rate(input.commissionPercent ?? 0, 'Service commission');
  const retailCommissionRate = rate(input.retailCommissionPercent ?? 0, 'Retail commission');
  const rentWeekly = weeklyRent(input.boothRentAmount ?? 0, input.boothRentCadence);
  const cardRate = rate(input.cardFeePercent ?? 0, 'Card fee');
  const backbarRate = rate(input.backbarPercent ?? 0, 'Backbar');
  const retailCostRate = rate(input.retailCostPercent ?? 0, 'Retail cost');
  const otherWeeklyCost = number(input.otherWeeklyCost ?? 0, 'Other weekly cost');

  const serviceMinutes = number(
    input.averageServiceMinutes ?? 60,
    'Average service minutes',
    { allowZero: false },
  );
  const unpaidCommission = number(input.unpaidHoursCommission ?? 0, 'Unpaid hours on commission');
  const unpaidBooth = number(input.unpaidHoursBooth ?? 0, 'Unpaid hours on booth rent');

  const serviceGross = averageTicket * clientsPerWeek;
  const retailGross = retailPerWeek;
  const weeklyGross = serviceGross + retailGross;
  const chairHours = clientsPerWeek * (serviceMinutes / 60);

  const commission = {
    serviceTakeHome: serviceGross * commissionRate,
    retailTakeHome: retailGross * retailCommissionRate,
    cardFees: 0,
    backbar: 0,
    retailCost: 0,
    rent: 0,
    other: 0,
    weeklyHours: chairHours + unpaidCommission,
  };
  commission.weeklyTakeHome = commission.serviceTakeHome + commission.retailTakeHome;
  commission.effectiveHourly = commission.weeklyHours === 0
    ? null
    : commission.weeklyTakeHome / commission.weeklyHours;

  const booth = {
    serviceTakeHome: serviceGross,
    retailTakeHome: retailGross,
    cardFees: weeklyGross * cardRate,
    backbar: serviceGross * backbarRate,
    retailCost: retailGross * retailCostRate,
    rent: rentWeekly,
    other: otherWeeklyCost,
    weeklyHours: chairHours + unpaidBooth,
  };
  booth.weeklyTakeHome = booth.serviceTakeHome + booth.retailTakeHome
    - booth.cardFees - booth.backbar - booth.retailCost - booth.rent - booth.other;
  booth.effectiveHourly = booth.weeklyHours === 0
    ? null
    : booth.weeklyTakeHome / booth.weeklyHours;

  const commissionScaled = scaleTakeHome(commission, weeksWorkedPerYear);
  const boothScaled = scaleTakeHome(booth, weeksWorkedPerYear);

  const weeklyDifference = booth.weeklyTakeHome - commission.weeklyTakeHome;
  const hourlyDifference = (booth.effectiveHourly ?? 0) - (commission.effectiveHourly ?? 0);

  const dollarWinner = weeklyDifference > 0.005
    ? 'booth'
    : weeklyDifference < -0.005
      ? 'commission'
      : 'tie';

  let hourlyWinner = 'tie';
  if (booth.effectiveHourly === null && commission.effectiveHourly !== null) {
    hourlyWinner = 'commission';
  } else if (commission.effectiveHourly === null && booth.effectiveHourly !== null) {
    hourlyWinner = 'booth';
  } else if (booth.effectiveHourly !== null && commission.effectiveHourly !== null) {
    if (hourlyDifference > 0.005) hourlyWinner = 'booth';
    else if (hourlyDifference < -0.005) hourlyWinner = 'commission';
  }

  // Extra chair clients, retail held constant: that is how a book actually
  // grows. A stylist adds appointments, not automatically more retail.
  //
  // booth(c) - commission(c)
  //   = c * ticket * (1 - card - backbar - commission)
  //     + retail * (1 - card - retailCost - retailCommission)
  //     - rent - other
  const keepAdvantage = 1 - cardRate - backbarRate - commissionRate;
  const retailAdvantage = retailGross * (1 - cardRate - retailCostRate - retailCommissionRate);
  // Marginal booth advantage per extra client. A $0 average ticket zeroes this
  // out just as surely as a non-positive keepAdvantage does — an extra client
  // worth nothing on the ticket cannot close a gap either, and the old check
  // (`averageTicket > 0 && keepAdvantage > 0` / `keepAdvantage <= 0`) had a gap
  // between its two branches at averageTicket === 0: neither branch ran, so a
  // book with a $0 average ticket got no break-even number and
  // boothNeverBeatsOnVolume stayed false, and the UI silently showed "n/a"
  // instead of "volume cannot close this gap".
  const marginalBoothAdvantage = averageTicket * keepAdvantage;
  let breakEvenClients = null;
  let boothNeverBeatsOnVolume = false;
  if (marginalBoothAdvantage > 0) {
    breakEvenClients = (rentWeekly + otherWeeklyCost - retailAdvantage) / marginalBoothAdvantage;
    if (breakEvenClients < 0) breakEvenClients = 0;
  } else {
    // Each extra client helps commission as much or more than booth (or is
    // worth nothing at all) — adding volume cannot close a booth-rent gap.
    boothNeverBeatsOnVolume = weeklyDifference <= 0;
  }

  const extraClientsNeeded = breakEvenClients === null
    ? null
    : Math.max(0, breakEvenClients - clientsPerWeek);

  // Rent at which booth take-home matches current commission take-home.
  const boothBeforeRent = weeklyGross - booth.cardFees - booth.backbar - booth.retailCost - booth.other;
  const maxWeeklyRentToMatch = boothBeforeRent - commission.weeklyTakeHome;

  let offered = null;
  const hasOffered = input.offeredRentAmount !== null
    && input.offeredRentAmount !== undefined
    && input.offeredRentAmount !== '';
  if (hasOffered) {
    const offeredWeekly = weeklyRent(
      input.offeredRentAmount,
      input.offeredRentCadence || input.boothRentCadence,
    );
    const offeredBoothWeekly = boothBeforeRent - offeredWeekly;
    offered = {
      weeklyRent: offeredWeekly,
      weeklyTakeHome: offeredBoothWeekly,
      monthlyTakeHome: offeredBoothWeekly * (weeksWorkedPerYear / 12),
      beatsCommission: offeredBoothWeekly - commission.weeklyTakeHome > 0.005,
      vsEnteredRent: offeredWeekly - rentWeekly,
    };
  }

  // ---------------------------------------------------------------------
  // Payroll tax: the one cost that is charged at a different rate depending
  // on which of these two deals the stylist takes.
  //
  // Everything above compares pre-tax dollars, which is the right frame for
  // "where does the money go" but the wrong one for "which check is bigger":
  // commission take-home is W-2 wages carrying the employee half of FICA
  // (7.65%), while booth take-home is self-employment income carrying both
  // halves (15.3% of 92.35% of it, an effective 14.1% — about 6.5 points
  // more). On a book where the two are within a few
  // percent — which is most books, because that is how salons price chairs —
  // the wedge decides it, and it decides it against booth rent.
  //
  // Annualised first, then divided back down, because both the Social Security
  // cap and the 92.35% base are annual concepts. Doing it weekly and
  // multiplying would apply the cap 50 times over.
  // `??` alone is not enough here: these two arrive from optional text inputs,
  // so "not filled in" reaches this function as `''`, which `Number('')`
  // happily turns into 0. For the wage base that silently means "no Social
  // Security cap at all" — a blank box would have zeroed 12.4 points of the
  // booth renter's tax, in the direction that flatters booth rent, which is
  // the exact class of error this whole section exists to remove.
  const given = (value, fallback) =>
    value === null || value === undefined || value === '' ? fallback : value;

  const marginalIncomeRate = rate(given(input.marginalIncomeTaxPercent, 0), 'Marginal income tax');
  const wageBase = number(
    given(input.socialSecurityWageBase, DEFAULT_SOCIAL_SECURITY_WAGE_BASE),
    'Social Security wage base',
    { allowZero: false },
  );

  const commissionFica = employeePayrollTax(commissionScaled.annualTakeHome, { wageBase });
  const boothSe = selfEmploymentTax(boothScaled.annualTakeHome, { wageBase });
  // Half of SE tax is deductible against income tax. Worth the user's marginal
  // rate on that half — and worth nothing here until they tell us the rate,
  // which is why this defaults to zero rather than to a guessed bracket.
  const seDeductionValue = boothSe.deductibleHalf * marginalIncomeRate;

  const commissionAfterTaxAnnual = commissionScaled.annualTakeHome - commissionFica.total;
  const boothAfterTaxAnnual = boothScaled.annualTakeHome - boothSe.total + seDeductionValue;

  const perWeek = (annual) => annual / weeksWorkedPerYear;
  const commissionAfterTax = {
    payrollTaxAnnual: commissionFica.total,
    annualTakeHome: commissionAfterTaxAnnual,
    monthlyTakeHome: commissionAfterTaxAnnual / 12,
    weeklyTakeHome: perWeek(commissionAfterTaxAnnual),
    effectiveHourly: commission.weeklyHours === 0
      ? null
      : perWeek(commissionAfterTaxAnnual) / commission.weeklyHours,
  };
  const boothAfterTax = {
    payrollTaxAnnual: boothSe.total,
    seDeductionValue,
    annualTakeHome: boothAfterTaxAnnual,
    monthlyTakeHome: boothAfterTaxAnnual / 12,
    weeklyTakeHome: perWeek(boothAfterTaxAnnual),
    effectiveHourly: booth.weeklyHours === 0
      ? null
      : perWeek(boothAfterTaxAnnual) / booth.weeklyHours,
  };

  const afterTaxWeeklyDifference = boothAfterTax.weeklyTakeHome - commissionAfterTax.weeklyTakeHome;
  const afterTaxWinner = afterTaxWeeklyDifference > 0.005
    ? 'booth'
    : afterTaxWeeklyDifference < -0.005
      ? 'commission'
      : 'tie';

  // The pre-tax break-even and matching rent above are closed-form because the
  // pre-tax difference is linear in clients and in rent. After tax it is not:
  // the 92.35% base and the wage-base cap both kink it. Rather than carry a
  // second, subtly different algebraic derivation that could drift from the
  // first, solve the same function numerically. `solveAfterTax` stops the
  // recursion at one level.
  const afterTaxDifferenceWith = (overrides) =>
    compareCompensation({ ...input, ...overrides }, { solveAfterTax: false })
      .afterTax.weeklyDifference;

  let afterTaxBreakEvenClients = null;
  let afterTaxExtraClientsNeeded = null;
  let afterTaxMaxWeeklyRentToMatch = null;
  let afterTaxNeverBeatsOnVolume = false;

  if (solveAfterTax) {
    afterTaxBreakEvenClients = solveCrossing(
      (clients) => afterTaxDifferenceWith({ clientsPerWeek: clients }),
      0,
      Math.max(200, clientsPerWeek * 10),
    );
    if (afterTaxBreakEvenClients === null) {
      afterTaxNeverBeatsOnVolume = afterTaxWeeklyDifference <= 0;
    } else {
      afterTaxExtraClientsNeeded = Math.max(0, afterTaxBreakEvenClients - clientsPerWeek);
    }

    // Rent runs the other way — more rent is worse — so the crossing is
    // searched on the negated difference. The upper bound is the booth
    // takings before rent: past that the deal cannot be positive at all.
    const rentCeiling = Math.max(boothBeforeRent, 0) + 1;
    afterTaxMaxWeeklyRentToMatch = solveCrossing(
      (weekly) => -afterTaxDifferenceWith({ boothRentAmount: weekly, boothRentCadence: 'weekly' }),
      0,
      rentCeiling,
    );
    // A negative crossing would mean the salon has to pay *her* to match, which
    // is not a rent anyone can be offered. Report it as "no rent matches".
    if (afterTaxMaxWeeklyRentToMatch !== null && afterTaxMaxWeeklyRentToMatch <= 0) {
      afterTaxMaxWeeklyRentToMatch = null;
    }
  }

  let offeredAfterTax = null;
  if (solveAfterTax === true && offered !== null) {
    const offeredResult = compareCompensation(
      { ...input, boothRentAmount: offered.weeklyRent, boothRentCadence: 'weekly' },
      { solveAfterTax: false },
    );
    offeredAfterTax = {
      weeklyTakeHome: offeredResult.afterTax.booth.weeklyTakeHome,
      monthlyTakeHome: offeredResult.afterTax.booth.monthlyTakeHome,
      beatsCommission: offeredResult.afterTax.weeklyDifference > 0.005,
    };
  }

  return {
    serviceGross,
    retailGross,
    weeklyGross,
    chairHours,
    weeksWorkedPerYear,
    rentWeekly,
    commission: commissionScaled,
    booth: boothScaled,
    weeklyDifference,
    monthlyDifference: boothScaled.monthlyTakeHome - commissionScaled.monthlyTakeHome,
    annualDifference: boothScaled.annualTakeHome - commissionScaled.annualTakeHome,
    dollarWinner,
    hourlyWinner,
    hourlyDifference,
    breakEvenClients,
    extraClientsNeeded,
    boothNeverBeatsOnVolume,
    maxWeeklyRentToMatch,
    maxMonthlyRentToMatch: maxWeeklyRentToMatch * WEEKS_PER_MONTH,
    offered,
    afterTax: {
      marginalIncomeTaxRate: marginalIncomeRate,
      socialSecurityWageBase: wageBase,
      commission: commissionAfterTax,
      booth: boothAfterTax,
      commissionDetail: commissionFica,
      boothDetail: boothSe,
      weeklyDifference: afterTaxWeeklyDifference,
      monthlyDifference: boothAfterTax.monthlyTakeHome - commissionAfterTax.monthlyTakeHome,
      annualDifference: boothAfterTaxAnnual - commissionAfterTaxAnnual,
      winner: afterTaxWinner,
      // How much of the pre-tax gap the tax wedge eats. Positive means the
      // booth side lost ground once both halves of FICA were charged to it,
      // which is the ordinary case and the whole point of this section.
      wedgeWeekly: weeklyDifference - afterTaxWeeklyDifference,
      breakEvenClients: afterTaxBreakEvenClients,
      extraClientsNeeded: afterTaxExtraClientsNeeded,
      neverBeatsOnVolume: afterTaxNeverBeatsOnVolume,
      maxWeeklyRentToMatch: afterTaxMaxWeeklyRentToMatch,
      maxMonthlyRentToMatch: afterTaxMaxWeeklyRentToMatch === null
        ? null
        : afterTaxMaxWeeklyRentToMatch * WEEKS_PER_MONTH,
      offered: offeredAfterTax,
    },
  };
}

/**
 * Smallest `x` in `[lo, hi]` where `f(x)` crosses from negative to
 * non-negative, or null if it never does within the bracket.
 *
 * Bisection rather than a formula because the after-tax difference is
 * piecewise-linear (the Social Security cap is a kink) and because deriving a
 * second closed form invites it drifting away from the first. Sixty halvings
 * put the answer well inside a rounding cent on any bracket this tool builds.
 */
function solveCrossing(f, lo, hi) {
  if (f(lo) >= 0) return lo;
  if (f(hi) < 0) return null;
  let low = lo;
  let high = hi;
  for (let i = 0; i < 60; i += 1) {
    const mid = (low + high) / 2;
    if (f(mid) < 0) low = mid;
    else high = mid;
  }
  return high;
}
