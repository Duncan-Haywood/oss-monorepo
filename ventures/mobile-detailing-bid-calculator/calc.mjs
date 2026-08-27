const defaults = {
  targetPrice: 180,
  laborHours: 3,
  travelHours: 0.75,
  setupHours: 0.25,
  cleanupHours: 0.25,
  travelMiles: 24,
  vehicleRate: 0.67,
  wage: 0,
  burdenPercent: 25,
  supplies: 18,
  overhead: 12,
  paymentRate: 3,
  targetMargin: 35,
};

function nonNegative(value, name) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new Error(`${name} must be a non-negative number`);
  return number;
}

export function calculateBid(input = {}) {
  const value = name => nonNegative(input[name] ?? defaults[name], name);
  const targetPrice = value('targetPrice');
  const laborHours = value('laborHours');
  const travelHours = value('travelHours');
  const setupHours = value('setupHours');
  const cleanupHours = value('cleanupHours');
  const travelMiles = value('travelMiles');
  const vehicleRate = value('vehicleRate');
  const wage = value('wage');
  const burdenPercent = value('burdenPercent');
  const supplies = value('supplies');
  const overhead = value('overhead');
  const paymentRate = value('paymentRate');
  const targetMargin = value('targetMargin');
  if (paymentRate >= 100) throw new Error('Payment fee must be below 100%');
  if (targetMargin >= 100) throw new Error('Target margin must be below 100%');
  if (laborHours === 0) throw new Error('Labor hours must be greater than zero');

  const totalHours = laborHours + travelHours + setupHours + cleanupHours;
  const loadedLaborRate = wage * (1 + burdenPercent / 100);
  const laborCost = totalHours * loadedLaborRate;
  const travelCost = travelMiles * vehicleRate;
  const directCosts = supplies + overhead + travelCost + laborCost;
  const paymentFee = targetPrice * paymentRate / 100;
  const totalCost = directCosts + paymentFee;
  const contribution = targetPrice - totalCost;
  const margin = targetPrice === 0 ? 0 : contribution / targetPrice * 100;
  const breakEven = directCosts / (1 - paymentRate / 100);
  // The payment fee and the target margin are both slices of the *final*
  // price, so together they can claim the whole ticket: at 3% fees and a 98%
  // target the denominator goes negative and the division returns a negative
  // price, which the page was printing as real advice ("quote at least
  // -$4,608.00"). At exactly 100% it returns Infinity. Neither is a quote.
  // Infinity is the house signal for "no price reaches this" — the eBay
  // calculator uses it the same way — and the page renders it as unreachable.
  const claimedSharePct = paymentRate + targetMargin;
  const targetDenominator = 1 - claimedSharePct / 100;
  const targetReachable = targetDenominator > 0;
  const targetQuote = targetReachable
    ? directCosts / targetDenominator
    : Infinity;
  const proposedPrice = targetPrice;
  return {
    targetPrice, laborHours, travelHours, setupHours, cleanupHours, totalHours,
    travelMiles, vehicleRate, wage, burdenPercent, loadedLaborRate, laborCost,
    supplies, overhead, paymentRate, targetMargin, claimedSharePct, targetReachable,
    travelCost, directCosts, paymentFee, totalCost, contribution, margin, breakEven, targetQuote,
    proposedPrice, profit: proposedPrice - totalCost,
    marginAtProposed: proposedPrice === 0 ? 0 : (proposedPrice - totalCost) / proposedPrice * 100,
    effectiveHourly: contribution / laborHours,
    effectiveRate: totalHours === 0 ? 0 : contribution / totalHours,
  };
}

/**
 * Live copy for the fee + margin pair. Both numbers are slices of the
 * *final* price, so they can jointly claim the whole ticket while each
 * input is still individually legal. Name the sum as the user types so
 * the conflict is visible before they read a quote that cannot exist.
 */
export function claimNote(result) {
  const claimed = Number(result.claimedSharePct);
  const fee = Number(result.paymentRate);
  const margin = Number(result.targetMargin);
  if (![claimed, fee, margin].every(Number.isFinite)) {
    return '';
  }
  const claimedLabel = claimed.toFixed(1);
  const leftover = (100 - claimed).toFixed(1);
  if (!result.targetReachable) {
    return `These two already claim ${claimedLabel}% of the price (fee ${fee.toFixed(1)}% + margin ${margin.toFixed(1)}%). No quote can hit that target — lower one of them.`;
  }
  return `Fee and margin claim ${claimedLabel}% of the price, leaving ${leftover}% for job costs.`;
}

export { defaults };
