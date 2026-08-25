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
  'monthlyOrders',
  'monthlyStoreFee',
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
  const quantity = number(input.quantity ?? 1, 'Units');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Units must be a whole number of at least 1');
  if (targetMargin >= 100) throw new Error('Target margin must be less than 100%');

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

// Example store-subscription assumptions a reseller can treat as a starting
// point, not a statement of eBay's current published prices. Each row is a
// monthly subscription plus the final-value rate that tier is assumed to
// unlock. The seller's typed rate stays the "current" comparison baseline.
export const STORE_TIER_PRESETS = [
  { id: 'starter', label: 'Starter (example)', monthlyFee: 7.95, finalValueRate: 12.95 },
  { id: 'basic', label: 'Basic (example)', monthlyFee: 27.95, finalValueRate: 12.55 },
  { id: 'premium', label: 'Premium (example)', monthlyFee: 74.95, finalValueRate: 11.85 },
];

function wholeOrders(value, name, fallback) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const result = Number(raw);
  if (!Number.isInteger(result) || result < 1) {
    throw new Error(`${name} must be a whole number of at least 1`);
  }
  return result;
}

function nonNegativeNumber(value, name, fallback = 0) {
  const raw = value === undefined || value === null || value === '' ? fallback : value;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return result;
}

// Orders needed at this order's revenue for a lower final-value rate to cover
// the extra monthly subscription. Null when the store rate is not cheaper —
// paying more per order never recovers a subscription.
export function storeBreakEvenOrders({
  revenue,
  currentFinalValueRate,
  storeFinalValueRate,
  monthlyFee,
}) {
  const orderRevenue = nonNegativeNumber(revenue, 'Order revenue');
  const currentRate = nonNegativeNumber(currentFinalValueRate, 'Current final value fee rate');
  const storeRate = nonNegativeNumber(storeFinalValueRate, 'Store final value fee rate');
  const fee = nonNegativeNumber(monthlyFee, 'Store monthly fee');
  const savingsPerOrder = orderRevenue * (currentRate - storeRate) / 100;
  if (savingsPerOrder <= 0) return null;
  return fee / savingsPerOrder;
}

function storeRow({
  id,
  label,
  monthlyFee,
  finalValueRate,
  order,
  monthlyOrders,
  currentMonthlyProfit,
  currentFinalValueRate,
  isCurrent,
}) {
  const monthlyProfit = order.profit * monthlyOrders - monthlyFee;
  return {
    id,
    label,
    monthlyFee,
    finalValueRate,
    monthlyOrders,
    revenue: order.revenue,
    feeTotal: order.feeTotal,
    profit: order.profit,
    monthlyProfit,
    monthlyDelta: monthlyProfit - currentMonthlyProfit,
    breakEvenOrders: isCurrent
      ? 0
      : storeBreakEvenOrders({
        revenue: order.revenue,
        currentFinalValueRate,
        storeFinalValueRate: finalValueRate,
        monthlyFee,
      }),
    isCurrent,
    pays: monthlyProfit > currentMonthlyProfit,
  };
}

// Same order at the seller's current rate and at example store tiers. The
// monthly subscription is taken out of monthly profit, not folded into the
// per-order cash-invested figure — that keeps ROI honest for a single sale
// and still answers "does the store pay at my volume?"
export function compareStoreTiers(input, tiers = STORE_TIER_PRESETS) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error('At least one store tier is required');
  }
  const monthlyOrders = wholeOrders(input.monthlyOrders, 'Monthly orders', 40);
  const currentStoreFee = nonNegativeNumber(input.monthlyStoreFee, 'Current monthly store fee');
  const currentRate = nonNegativeNumber(input.finalValueRate ?? 13.25, 'Final value fee rate');
  const currentOrder = calculateOrder(input);
  const currentMonthlyProfit = currentOrder.profit * monthlyOrders - currentStoreFee;
  const current = storeRow({
    id: 'current',
    label: 'Your current rate',
    monthlyFee: currentStoreFee,
    finalValueRate: currentRate,
    order: currentOrder,
    monthlyOrders,
    currentMonthlyProfit,
    currentFinalValueRate: currentRate,
    isCurrent: true,
  });

  const rows = [current];
  for (const tier of tiers) {
    const monthlyFee = nonNegativeNumber(tier.monthlyFee, 'Store monthly fee');
    const finalValueRate = nonNegativeNumber(tier.finalValueRate, 'Store final value fee rate');
    if (finalValueRate === currentRate && monthlyFee === currentStoreFee) continue;
    const order = calculateOrder({ ...input, finalValueRate });
    rows.push(storeRow({
      id: String(tier.id ?? finalValueRate),
      label: String(tier.label ?? `${finalValueRate}% store`),
      monthlyFee,
      finalValueRate,
      order,
      monthlyOrders,
      currentMonthlyProfit,
      currentFinalValueRate: currentRate,
      isCurrent: false,
    }));
  }

  const winner = rows.reduce((best, row) => (
    row.monthlyProfit > best.monthlyProfit ? row : best
  ));
  return rows.map((row) => ({ ...row, isWinner: row.id === winner.id }));
}
