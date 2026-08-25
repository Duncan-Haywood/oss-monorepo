// Pure fee/profit/ROI arithmetic for one Etsy order. No network, no stored
// rate schedule: every rate and cost is an input so the result stays a
// transparent calculation the seller can check against their own statements
// rather than a claim about Etsy's current published fees.

export const OFFSITE_AD_RATE_PRESETS = [0, 12, 15];

function number(value, name) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

export function calculateOrder(input) {
  const price = number(input.price, 'Price');
  const shippingCharged = number(input.shippingCharged ?? 0, 'Shipping charged');
  const listingFee = number(input.listingFee ?? 0.2, 'Listing fee');
  const transactionRate = number(input.transactionRate ?? 6.5, 'Transaction rate');
  const paymentRate = number(input.paymentRate ?? 3, 'Payment rate');
  const paymentFixed = number(input.paymentFixed ?? 0.25, 'Payment fixed fee');
  const offsiteAdRate = number(input.offsiteAdRate ?? 0, 'Offsite ad rate');
  const shippingCost = number(input.shippingCost ?? 0, 'Shipping cost');
  const materialCost = number(input.materialCost ?? 0, 'Material cost');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const revenue = price + shippingCharged;
  const fees = {
    listing: listingFee,
    transaction: revenue * transactionRate / 100,
    payment: revenue * paymentRate / 100 + paymentFixed,
    offsiteAd: revenue * offsiteAdRate / 100,
  };

  // Cash the seller lays out to make and ship the order. Marketplace fees are
  // deducted from proceeds, not paid up front, so they stay out of invested
  // cash — that keeps return-on-investment honest (same split as the eBay
  // calculator).
  const cashInvested = shippingCost + materialCost + otherCost;
  const costs = fees.listing + fees.transaction + fees.payment + fees.offsiteAd + cashInvested;
  const profit = revenue - costs;
  return {
    revenue, fees, costs, profit, cashInvested,
    margin: revenue === 0 ? 0 : profit / revenue * 100,
    roi: cashInvested === 0 ? null : profit / cashInvested * 100,
    breakEvenPrice: Math.max(0, (listingFee + paymentFixed + shippingCost + materialCost + otherCost) /
      (1 - (transactionRate + paymentRate + offsiteAdRate) / 100)),
  };
}

export function priceForMargin(input, targetMargin) {
  const margin = Number(targetMargin);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error('Target margin must be between 0 and 99.9%');
  const n = name => Number(input[name] ?? ({ listingFee: .2, paymentFixed: .25, transactionRate: 6.5, paymentRate: 3, offsiteAdRate: 0 }[name] ?? 0));
  const denominator = 1 - (n('transactionRate') + n('paymentRate') + n('offsiteAdRate')) / 100 - margin / 100;
  if (denominator <= 0) throw new Error('Target margin is not possible with these fee rates');
  return Math.max(0, (n('listingFee') + n('paymentFixed') + n('shippingCost') + n('materialCost') + n('otherCost')) / denominator - n('shippingCharged'));
}

function rateLabel(rate) {
  if (rate === 0) return 'Organic (no offsite ads)';
  if (rate === 12) return '12% offsite ads (over $10k shop)';
  if (rate === 15) return '15% offsite ads (under $10k shop)';
  return `${rate}% offsite ads`;
}

// Side-by-side profit at Etsy's two published Offsite Ads rates plus organic.
// The seller's current offsiteAdRate is included when it is not already one
// of those presets, so a custom 8% or 13% still appears as "your input".
export function compareOffsiteAdRates(input, rates = OFFSITE_AD_RATE_PRESETS) {
  const current = number(input.offsiteAdRate ?? 0, 'Offsite ad rate');
  const unique = [...new Set([...rates, current])]
    .filter((rate) => Number.isFinite(rate) && rate >= 0)
    .sort((a, b) => a - b);
  const organic = calculateOrder({ ...input, offsiteAdRate: 0 });
  return unique.map((rate) => {
    const result = calculateOrder({ ...input, offsiteAdRate: rate });
    return {
      offsiteAdRate: rate,
      label: rateLabel(rate),
      isCurrent: rate === current,
      profit: result.profit,
      margin: result.margin,
      roi: result.roi,
      cashInvested: result.cashInvested,
      offsiteAdFee: result.fees.offsiteAd,
      profitVsOrganic: result.profit - organic.profit,
      stillProfitable: result.profit > 0,
    };
  });
}

// Highest Offsite Ads rate at which this order still clears minProfit
// (default: break-even). Algebra: profit = organicProfit - revenue * rate/100.
// Returns 0 when the order is already at or below the floor without ads.
export function maxAffordableOffsiteRate(input, minProfit = 0) {
  const floor = Number(minProfit);
  if (!Number.isFinite(floor)) throw new Error('Minimum profit must be a number');
  const organic = calculateOrder({ ...input, offsiteAdRate: 0 });
  if (organic.revenue <= 0) return 0;
  const rate = (organic.profit - floor) / organic.revenue * 100;
  if (!Number.isFinite(rate)) return 0;
  return Math.max(0, rate);
}
