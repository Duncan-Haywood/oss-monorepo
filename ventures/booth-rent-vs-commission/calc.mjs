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
 */
export function compareCompensation(input) {
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
  let breakEvenClients = null;
  let boothNeverBeatsOnVolume = false;
  if (averageTicket > 0 && keepAdvantage > 0) {
    breakEvenClients = (rentWeekly + otherWeeklyCost - retailAdvantage) / (averageTicket * keepAdvantage);
    if (breakEvenClients < 0) breakEvenClients = 0;
  } else if (keepAdvantage <= 0) {
    // Each extra client helps commission as much or more than booth — adding
    // volume cannot close a booth-rent gap.
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
  };
}
