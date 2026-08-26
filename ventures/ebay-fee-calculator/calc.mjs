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
  'auctionExpectedClose',
  'binSellThroughPct',
  'auctionSellThroughPct',
  'binDaysToSell',
  'auctionDays',
  'binInsertionFee',
  'auctionInsertionFee',
  'auctionPromotedRate',
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

function optionalNumber(value, name, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function requiredPositive(value, name, fallback) {
  const result = optionalNumber(value, name, fallback);
  if (result <= 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function requiredPercent(value, name, fallback) {
  const result = optionalNumber(value, name, fallback);
  if (result > 100) throw new Error(`${name} must be at most 100%`);
  return result;
}

// expectedProfit is linear in item price (fees and the return blend both
// scale with revenue). Two evaluations recover the slope so the break-even
// hammer uses the same function the table already shows.
function priceForExpectedProfit(input, promotedRate, targetExpectedProfit) {
  const atZero = calculateOrder({ ...input, price: 0, promotedRate });
  const atHundred = calculateOrder({ ...input, price: 100, promotedRate });
  const slope = (atHundred.expectedProfit - atZero.expectedProfit) / 100;
  if (slope <= 1e-12) return Infinity;
  return Math.max(0, (targetExpectedProfit - atZero.expectedProfit) / slope);
}

function listingFormatRow({
  format,
  label,
  price,
  sellThroughPct,
  days,
  insertionFee,
  promotedRate,
  input,
}) {
  const sold = calculateOrder({ ...input, price, promotedRate });
  const expectedProfit = sold.expectedProfit * (sellThroughPct / 100) - insertionFee;
  return {
    format,
    label,
    price,
    sellThroughPct,
    days,
    insertionFee,
    promotedRate,
    soldProfit: sold.profit,
    soldExpectedProfit: sold.expectedProfit,
    soldFees: sold.feeTotal,
    expectedProfit,
    expectedProfitPerDay: expectedProfit / days,
    expectedProfitDelta: 0,
    cashInvested: sold.cashInvested,
  };
}

/**
 * Auction vs Buy It Now on the same SKU. A completed auction sale is often
 * cheaper than BIN; auctions still win when they actually sell. Expected
 * listing profit is completed-sale expected profit (after the typed return
 * rate) times sell-through, minus the insertion fee that is sunk either way.
 * Promoted Listings Standard sits on the BIN row; the auction row uses its
 * own promoted rate (default 0).
 */
export function compareListingFormat(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const auctionClose = optionalNumber(
    input.auctionExpectedClose,
    'Auction expected close',
    Math.round(listedPrice * 0.9 * 100) / 100,
  );
  const binSellThroughPct = requiredPercent(input.binSellThroughPct, 'Buy It Now sell-through', 50);
  const auctionSellThroughPct = requiredPercent(input.auctionSellThroughPct, 'Auction sell-through', 90);
  const binDays = requiredPositive(input.binDaysToSell, 'Buy It Now days to sell', 21);
  const auctionDays = requiredPositive(input.auctionDays, 'Auction duration days', 7);
  const binInsertionFee = optionalNumber(input.binInsertionFee, 'Buy It Now insertion fee', 0);
  const auctionInsertionFee = optionalNumber(input.auctionInsertionFee, 'Auction insertion fee', 0);
  const auctionPromotedRate = optionalNumber(input.auctionPromotedRate, 'Auction promoted rate', 0);
  const binPromotedRate = optionalNumber(input.promotedRate, 'Promoted listings rate', 0);

  const bin = listingFormatRow({
    format: 'bin',
    label: 'Buy It Now',
    price: listedPrice,
    sellThroughPct: binSellThroughPct,
    days: binDays,
    insertionFee: binInsertionFee,
    promotedRate: binPromotedRate,
    input,
  });
  const auction = listingFormatRow({
    format: 'auction',
    label: 'Auction',
    price: auctionClose,
    sellThroughPct: auctionSellThroughPct,
    days: auctionDays,
    insertionFee: auctionInsertionFee,
    promotedRate: auctionPromotedRate,
    input,
  });
  bin.expectedProfitDelta = bin.expectedProfit - auction.expectedProfit;
  auction.expectedProfitDelta = auction.expectedProfit - bin.expectedProfit;

  let breakEvenAuctionClose = Infinity;
  if (auctionSellThroughPct > 0) {
    const neededSoldExpected = (bin.expectedProfit + auctionInsertionFee) / (auctionSellThroughPct / 100);
    breakEvenAuctionClose = priceForExpectedProfit(input, auctionPromotedRate, neededSoldExpected);
  }

  const winner = auction.expectedProfit > bin.expectedProfit + 1e-9
    ? 'auction'
    : auction.expectedProfit < bin.expectedProfit - 1e-9
      ? 'bin'
      : 'tie';

  return {
    bin,
    auction,
    rows: [bin, auction],
    winner,
    breakEvenAuctionClose,
  };
}

export function listingFormatNote(comparison) {
  if (!comparison?.bin || !comparison?.auction) {
    throw new Error('Listing-format comparison is missing rows');
  }
  const money = (value) => `$${value.toFixed(2)}`;
  const { bin, auction } = comparison;
  const gap = Math.abs(auction.expectedProfit - bin.expectedProfit);
  const ahead = auction.expectedProfit >= bin.expectedProfit ? 'more' : 'less';
  const close = `Auction at ${money(auction.price)} with ${auction.sellThroughPct}% sell-through over ${auction.days} days expects ${money(auction.expectedProfit)} after insertion — ${money(gap)} ${ahead} than Buy It Now at ${money(bin.price)} with ${bin.sellThroughPct}% sell-through over ${bin.days} days (${money(bin.expectedProfit)}).`;
  const sold = `A completed auction sale leaves ${money(auction.soldExpectedProfit)} after the typed return rate; a completed Buy It Now sale leaves ${money(bin.soldExpectedProfit)}.`;
  const hammer = Number.isFinite(comparison.breakEvenAuctionClose)
    ? ` Auction expected profit matches Buy It Now if the hammer is about ${money(comparison.breakEvenAuctionClose)}.`
    : ' No auction hammer on these rates can match Buy It Now expected profit.';
  return `${close} ${sold}${hammer}`;
}
