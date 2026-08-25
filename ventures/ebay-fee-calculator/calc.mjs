// Pure fee/profit/ROI arithmetic for an eBay resale order. No network, no
// state: every rate and cost is an input so the result stays a transparent
// calculation the seller can check against their own eBay statements rather
// than a claim about eBay's current fee schedule.

// Every seller-supplied field, in the order the form presents them. The page
// and the save/share encoder both read this rather than keeping their own
// copies: when those lists drifted, a shared link silently dropped whichever
// field the encoder had not heard about, and the recipient saw a different
// order than the sender did.
export const INPUT_FIELDS = [
  'price',
  'quantity',
  'shippingCharged',
  'finalValueRate',
  'fixedFee',
  'promotedRate',
  'intlFeeRate',
  'costOfGoods',
  'shippingCost',
  'packagingCost',
  'otherCost',
  'targetMargin',
  'returnRatePercent',
  'returnShippingCost',
  'feeRefundOnReturnPercent',
];

export function calculateOrder(input) {
  const number = (value, name) => {
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  };
  const price = number(input.price, 'Item price');
  const shippingCharged = number(input.shippingCharged ?? 0, 'Shipping charged');
  const finalValueRate = number(input.finalValueRate ?? 13.25, 'Final value fee rate');
  const fixedFee = number(input.fixedFee ?? 0.3, 'Per-order fixed fee');
  const promotedRate = number(input.promotedRate ?? 0, 'Promoted listings rate');
  const intlFeeRate = number(input.intlFeeRate ?? 0, 'International fee rate');
  const costOfGoods = number(input.costOfGoods ?? 0, 'Cost of goods');
  const shippingCost = number(input.shippingCost ?? 0, 'Shipping cost');
  const packagingCost = number(input.packagingCost ?? 0, 'Packaging cost');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const targetMargin = number(input.targetMargin ?? 0, 'Target margin');
  const returnRatePercent = number(input.returnRatePercent ?? 0, 'Expected return rate');
  const returnShippingCost = number(input.returnShippingCost ?? 0, 'Return shipping cost');
  const feeRefundOnReturnPercent = number(input.feeRefundOnReturnPercent ?? 100, 'Fee refund on return');
  const quantity = number(input.quantity ?? 1, 'Units');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Units must be a whole number of at least 1');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');
  if (returnRatePercent > 100) throw new Error('Expected return rate must be at most 100%');
  if (feeRefundOnReturnPercent > 100) throw new Error('Fee refund on return must be at most 100%');

  // eBay charges the final value fee on the full order total (item + shipping),
  // so promoted-listings and international-fee percentages are modelled the same
  // way. The seller enters the blended rate that applies to their category.
  const revenue = (price + shippingCharged) * quantity;
  const percentRate = (finalValueRate + promotedRate + intlFeeRate) / 100;
  const fees = {
    finalValue: revenue * finalValueRate / 100,
    fixed: fixedFee * quantity,
    promoted: revenue * promotedRate / 100,
    international: revenue * intlFeeRate / 100,
  };
  const feeTotal = fees.finalValue + fees.fixed + fees.promoted + fees.international;

  // Cash the seller lays out up front to source and ship the item. Fees are
  // deducted from the sale proceeds, not paid in advance, so they are excluded
  // from invested cash — that keeps return-on-investment honest.
  const cashInvested = (costOfGoods + shippingCost + packagingCost + otherCost) * quantity;
  const costs = feeTotal + cashInvested;
  const profit = revenue - costs;

  // Fixed (non-percentage) cash outlay that must be recovered before the
  // percentage-based fees are covered, used to solve for break-even price.
  const fixedCash = fixedFee + costOfGoods + shippingCost + packagingCost + otherCost;
  const targetMarginRate = targetMargin / 100;
  const targetRevenueDenominator = 1 - percentRate - targetMarginRate;

  // A completed sale keeps the profit above. A return typically refunds the
  // buyer, often refunds percentage/fixed fees, and still eats the outbound
  // label, packaging, other cash, and return postage. The item is treated as
  // back in inventory, so cost of goods is not counted again as a loss.
  const returnRate = returnRatePercent / 100;
  const feeRefundRate = feeRefundOnReturnPercent / 100;
  const sunkOnReturn = (shippingCost + packagingCost + otherCost + returnShippingCost) * quantity;
  const unrefundedFees = feeTotal * (1 - feeRefundRate);
  const returnProfit = -sunkOnReturn - unrefundedFees;
  const expectedProfit = (1 - returnRate) * profit + returnRate * returnProfit;
  const expectedRevenue = revenue * (1 - returnRate);
  const profitReturnGap = profit - returnProfit;
  const breakEvenReturnRate = profit <= 0
    ? 0
    : profitReturnGap <= 0
      ? Infinity
      : Math.min(100, profit / profitReturnGap * 100);
  return {
    revenue,
    quantity,
    fees,
    feeTotal,
    cashInvested,
    costs,
    profit,
    unitProfit: profit / quantity,
    margin: revenue === 0 ? 0 : profit / revenue * 100,
    // Return on the cash actually invested. Null when nothing was invested
    // (e.g. a giveaway item with no sourcing or shipping cost), where ROI is
    // undefined rather than infinite.
    roi: cashInvested === 0 ? null : profit / cashInvested * 100,
    // Lowest item price (holding shipping charged constant) at which this order
    // stops losing money, given the percentage fees and fixed cash outlay.
    breakEvenPrice: percentRate >= 1
      ? Infinity
      : Math.max(0, fixedCash / (1 - percentRate) - shippingCharged),
    // Solve for the item price needed to reach the requested net margin.
    targetMarginPrice: targetRevenueDenominator <= 0
      ? Infinity
      : Math.max(0, fixedCash / targetRevenueDenominator - shippingCharged),
    returnRatePercent,
    returnShippingCost,
    feeRefundOnReturnPercent,
    returnProfit,
    cashEatenPerReturn: quantity === 0 ? 0 : -returnProfit / quantity,
    expectedProfit,
    expectedUnitProfit: expectedProfit / quantity,
    expectedRevenue,
    expectedMargin: expectedRevenue === 0 ? 0 : expectedProfit / expectedRevenue * 100,
    expectedProfitDelta: expectedProfit - profit,
    // Highest return rate at which expected profit is still non-negative.
    // Null-equivalent Infinity means even every order coming back still pays
    // (no sunk shipping/fees). Zero means the completed sale already loses.
    breakEvenReturnRate,
  };
}

// Compare listing prices without changing any of the seller's other
// assumptions. The returned rows are deliberately plain data so the UI and
// tests can use the same calculation.
export function calculatePriceScenarios(input, prices) {
  if (!Array.isArray(prices) || prices.length === 0) throw new Error('At least one scenario price is required');
  return prices.map(price => ({
    price: Number(price),
    ...calculateOrder({ ...input, price }),
  }));
}

// The repricing table the UI renders: scenarios placed a few percent either
// side of the price the seller typed.
//
// Percentage offsets rather than absolute prices, because that is what lets the
// "current" row be identified exactly instead of by comparing two floats, and
// it puts the rounding to whole cents — what the seller would actually type
// into eBay — in one place a test can pin.
export function calculateRepricingTable(input, offsets = [-20, -10, 0, 10, 20]) {
  if (!Array.isArray(offsets) || offsets.length === 0) throw new Error('At least one price offset is required');
  const percentages = offsets.map(offset => {
    const percent = Number(offset);
    if (!Number.isFinite(percent) || percent <= -100) throw new Error('Price offset must be greater than -100%');
    return percent;
  });
  const current = calculateOrder(input);
  const prices = percentages.map(percent => Math.round(Number(input.price) * (1 + percent / 100) * 100) / 100);
  return calculatePriceScenarios(input, prices).map((scenario, index) => ({
    ...scenario,
    offset: percentages[index],
    isCurrent: percentages[index] === 0,
    // Signed change against the seller's current price, so the table answers
    // "what does moving the price actually buy me" without mental arithmetic.
    profitDelta: scenario.profit - current.profit,
  }));
}
