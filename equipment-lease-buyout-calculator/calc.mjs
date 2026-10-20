// Equipment lease buyout vs. return-and-replace.
//
// At the end of (or partway through) an equipment lease, the lessor quotes a
// buyout price and the lessee has to decide: pay it and keep the equipment,
// or return it and replace it some other way. The buyout price alone answers
// nothing — a $9,000 buyout on equipment worth $6,000 is a bad deal even
// though $9,000 sounds reasonable for a forklift, and a $9,000 buyout on
// equipment that would cost $30,000 to replace is a good one even though the
// number looks identical. The two numbers that make it comparable are the
// equipment's remaining useful life and what a replacement actually costs —
// neither of which is on the lessor's payoff letter.
//
// Both "useful life" figures are the lessee's own estimate, not a lookup.
// This tool cannot know how hard a compressor has been run, and it says so
// rather than implying otherwise.

function toNumber(value, label, { min = 0, max = Infinity } = {}) {
  if (value === '' || value === null || value === undefined) {
    throw new Error(`Enter ${label}.`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new Error(`${label} must be a number.`);
  }
  if (number < min) {
    throw new Error(`${label} cannot be below ${min}.`);
  }
  if (number > max) {
    throw new Error(`${label} cannot be above ${max}.`);
  }
  return number;
}

/**
 * Compare a lease buyout against returning the equipment and replacing it.
 *
 * Every input arrives as a string from a form field, so each is coerced and
 * range-checked here rather than at the call site.
 */
export function compareBuyout(input = {}) {
  const buyoutPrice = toNumber(input.buyoutPrice, 'the buyout price');
  const fairMarketValue = toNumber(input.fairMarketValue, "the equipment's estimated fair market value");
  const usefulLifeMonths = toNumber(input.usefulLifeMonths, 'the remaining useful life if you keep it', {
    min: 1,
  });
  const replacementCost = toNumber(input.replacementCost, 'the cost of a replacement');
  const replacementLifeMonths = toNumber(
    input.replacementLifeMonths,
    "the replacement's expected useful life",
    { min: 1 },
  );
  const removalCost = toNumber(input.removalCost ?? 0, 'the removal or return cost');
  const downtimeDays = toNumber(input.downtimeDays ?? 0, 'the expected downtime');
  const dailyDowntimeCost = toNumber(input.dailyDowntimeCost ?? 0, 'the daily cost of downtime');

  const downtimeCost = downtimeDays * dailyDowntimeCost;
  const totalReplacementCost = replacementCost + removalCost + downtimeCost;

  const costPerMonthBuyout = buyoutPrice / usefulLifeMonths;
  const costPerMonthReplace = totalReplacementCost / replacementLifeMonths;

  // The buyout price at which the two options cost exactly the same per
  // month of use. Above this, walking away is the cheaper path; below it,
  // buying out is. Reported so the reader can see how much room the actual
  // quote has on either side rather than only a yes/no verdict.
  const breakEvenBuyoutPrice = costPerMonthReplace * usefulLifeMonths;

  const premiumOverFairMarketValue = buyoutPrice - fairMarketValue;
  const premiumOverFairMarketValuePercent =
    fairMarketValue > 0 ? (premiumOverFairMarketValue / fairMarketValue) * 100 : null;

  const monthlySavings = costPerMonthReplace - costPerMonthBuyout;
  const totalSavingsOverUsefulLife = monthlySavings * usefulLifeMonths;

  return {
    buyoutPrice,
    fairMarketValue,
    usefulLifeMonths,
    replacementCost,
    replacementLifeMonths,
    removalCost,
    downtimeDays,
    dailyDowntimeCost,
    downtimeCost,
    totalReplacementCost,
    costPerMonthBuyout,
    costPerMonthReplace,
    breakEvenBuyoutPrice,
    premiumOverFairMarketValue,
    premiumOverFairMarketValuePercent,
    monthlySavings,
    totalSavingsOverUsefulLife,
    buyoutWins: costPerMonthBuyout <= costPerMonthReplace,
  };
}

export function formatMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function formatPercent(value, digits = 0) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${number.toFixed(digits)}%`;
}

/**
 * The headline sentence. Phrased as what the numbers show, not as the
 * decision made for the reader — factors like downtime risk, cashflow, and
 * whether the replacement is actually available on short notice are the
 * reader's to weigh, not this tool's.
 */
export function verdictMessage(result) {
  const perMonthBuyout = formatMoney(result.costPerMonthBuyout);
  const perMonthReplace = formatMoney(result.costPerMonthReplace);
  if (result.buyoutWins) {
    return (
      `Buying out costs about ${perMonthBuyout} per month of use over the ${result.usefulLifeMonths}-month ` +
      `life you entered, against about ${perMonthReplace} per month to return and replace it. Buying out ` +
      `is the cheaper path by this estimate — by roughly ${formatMoney(result.totalSavingsOverUsefulLife)} ` +
      `over that life, at ${formatMoney(result.monthlySavings)} a month.`
    );
  }
  return (
    `Buying out costs about ${perMonthBuyout} per month of use over the ${result.usefulLifeMonths}-month life ` +
    `you entered, against about ${perMonthReplace} per month to return and replace it. Returning it is the ` +
    `cheaper path by this estimate — buying out would cost roughly ` +
    `${formatMoney(Math.abs(result.totalSavingsOverUsefulLife))} more over that life, at ` +
    `${formatMoney(Math.abs(result.monthlySavings))} a month.`
  );
}

/**
 * Two to four observations tied to this comparison's own shape.
 */
export function verdictNotes(result) {
  const notes = [];

  notes.push(
    `The buyout price would need to be at or below ${formatMoney(result.breakEvenBuyoutPrice)} to match the ` +
      `per-month cost of replacing — that is the number to negotiate against, not the payoff letter's number.`,
  );

  if (result.premiumOverFairMarketValuePercent !== null) {
    if (result.premiumOverFairMarketValue > 0) {
      notes.push(
        `The buyout price is ${formatMoney(result.premiumOverFairMarketValue)} ` +
          `(${formatPercent(result.premiumOverFairMarketValuePercent)}) above the fair market value you entered. ` +
          `A lease that is supposed to settle at fair market value but is not doing so is worth a second look at ` +
          `the contract before you pay it.`,
      );
    } else if (result.premiumOverFairMarketValue < 0) {
      notes.push(
        `The buyout price is ${formatMoney(Math.abs(result.premiumOverFairMarketValue))} ` +
          `(${formatPercent(Math.abs(result.premiumOverFairMarketValuePercent))}) below the fair market value you ` +
          `entered — a genuine bargain if that estimate holds up, worth confirming with a comparable listing or ` +
          `an appraisal before relying on it.`,
      );
    }
  }

  if (result.downtimeCost > 0) {
    notes.push(
      `Returning it carries ${formatMoney(result.downtimeCost)} of estimated downtime cost on top of the ` +
        `replacement price. If the replacement could ship late or need installation time you have not accounted ` +
        `for, that number is a floor, not a ceiling.`,
    );
  }

  if (result.removalCost === 0) {
    notes.push(
      'No removal or return cost was entered. Rigging, drayage, freight, and any lease-end inspection or ' +
        'reconditioning charge belong on the return side of this comparison — check the lease for an end-of-term ' +
        'condition clause before assuming it is zero.',
    );
  }

  return notes;
}
