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
  'partialRefundAmount',
  'monthlyCases',
  'authenticityFeeRate',
  'authenticityExtraShip',
  'withoutAgSellThroughPct',
  'authenticitySellThroughPct',
  'authenticityReturnRatePercent',
  'monthlyAgListings',
  'shipSellThroughPct',
  'pickupSellThroughPct',
  'pickupNoShowPct',
  'pickupMinutes',
  'pickupHourlyWage',
  'pickupFeeCharged',
  'pickupPackagingCost',
  'pickupReturnRatePercent',
  'monthlyPickupListings',
  'lotPieceCount',
  'singleExpectedPrice',
  'lotSellThroughPct',
  'singleSellThroughPct',
  'lotInsertionFee',
  'singleInsertionFee',
  'singleShippingCharged',
  'singleShippingCost',
  'singlePackagingCost',
  'lotListingMinutes',
  'singleListingMinutes',
  'lotListingWage',
  'monthlyLotDecisions',
  'envelopeShippingCost',
  'envelopePackagingCost',
  'envelopeClaimRatePercent',
  'envelopeFeeRefundOnClaimPercent',
  'trackedSellThroughPct',
  'envelopeSellThroughPct',
  'monthlyEnvelopeListings',
  'combinedItemCount',
  'combinedShippingCharged',
  'combinedShippingCost',
  'combinedPackagingCost',
  'combinedReturnShippingCost',
  'combinedFixedFee',
  'combinedReturnRatePercent',
  'monthlyCombinedOrders',
  'offerPercent',
  'waitSellThroughPct',
  'offerAcceptPct',
  'monthlyOffers',
  'offsiteSpend',
  'offsiteExtraOrders',
  'offsitePromotedRate',
  'monthlyOffsiteCampaigns',
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

function requiredWholeCount(value, name, fallback) {
  const result = optionalNumber(value, name, fallback);
  if (!Number.isInteger(result) || result < 2) {
    throw new Error(`${name} must be a whole number of at least 2`);
  }
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

/**
 * Illustrative “make it right” concession when the seller has not typed
 * one. Edit it from the amount you would actually offer — not a published
 * eBay policy. Four cases/month is a placeholder volume, not a forecast.
 */
export const DEFAULT_PARTIAL_REFUND = 15;
export const DEFAULT_MONTHLY_CASES = 4;

function percentFeeTotal(sold) {
  return sold.fees.finalValue + sold.fees.promoted + sold.fees.international;
}

function feeReturnedOnAmount(sold, amount) {
  if (sold.revenue <= 1e-12) return 0;
  const feeRefundRate = sold.feeRefundOnReturnPercent / 100;
  return amount * (percentFeeTotal(sold) / sold.revenue) * feeRefundRate;
}

function keepAfterConcession(sold, amount) {
  return sold.profit - amount + feeReturnedOnAmount(sold, amount);
}

/**
 * Same completed sale, three ways to close a buyer case.
 *
 *   - Partial refund, they keep it — send cash, keep the item out.
 *     Percentage fees usually come back on the refunded amount; the
 *     per-order fixed fee stays because the order still completed.
 *   - Take the return — existing returnProfit: item comes back, outbound
 *     label / pack / return postage stay with you.
 *   - Full refund, they keep it — eBay sometimes requires this on cheap
 *     items. You lose the item and the cash. Worse than a real return
 *     whenever the sourcing cost is still worth recovering.
 *
 * Complementary to the return-*rate* mix (expected profit after returns)
 * and to open eBay work on promoted, store, Best Offer, and international.
 * Rates are inputs, not eBay case policy.
 */
export function comparePartialRefund(input) {
  const sold = calculateOrder(input);
  const partialRefund = optionalNumber(input.partialRefundAmount, 'Partial refund', DEFAULT_PARTIAL_REFUND);
  const monthlyCases = optionalNumber(input.monthlyCases, 'Monthly cases', DEFAULT_MONTHLY_CASES);

  if (partialRefund > sold.revenue + 1e-9) {
    throw new Error('Partial refund cannot exceed the order total');
  }

  const partialKept = keepAfterConcession(sold, partialRefund);
  const returnKept = sold.returnProfit;
  const keepItemFullKept = keepAfterConcession(sold, sold.revenue);

  const partial = {
    id: 'partial',
    label: 'Partial refund, they keep it',
    cashBack: partialRefund,
    itemRecovered: false,
    feeReturned: feeReturnedOnAmount(sold, partialRefund),
    kept: partialKept,
  };
  const takeReturn = {
    id: 'return',
    label: 'Take the return',
    cashBack: sold.revenue,
    itemRecovered: true,
    feeReturned: sold.feeTotal * (sold.feeRefundOnReturnPercent / 100),
    kept: returnKept,
  };
  const keepItemFull = {
    id: 'keep_item_full',
    label: 'Full refund, they keep it',
    cashBack: sold.revenue,
    itemRecovered: false,
    feeReturned: feeReturnedOnAmount(sold, sold.revenue),
    kept: keepItemFullKept,
  };

  const rows = [partial, takeReturn, keepItemFull].map((row) => ({
    ...row,
    vsReturn: row.kept - returnKept,
    vsPartial: row.kept - partialKept,
  }));

  const maxKept = Math.max(...rows.map((row) => row.kept));
  const leaders = rows.filter((row) => Math.abs(row.kept - maxKept) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : 'tie';

  const percentRate = sold.revenue <= 1e-12 ? 0 : percentFeeTotal(sold) / sold.revenue;
  const feeRefundRate = sold.feeRefundOnReturnPercent / 100;
  const denom = 1 - percentRate * feeRefundRate;
  let breakEvenPartial = Infinity;
  if (denom > 1e-12) {
    breakEvenPartial = Math.max(0, (sold.profit - returnKept) / denom);
  }

  return {
    rows,
    partial: rows[0],
    takeReturn: rows[1],
    keepItemFull: rows[2],
    completedProfit: sold.profit,
    returnProfit: returnKept,
    partialRefund,
    monthlyCases,
    extraKeptOnPartial: partialKept - returnKept,
    extraKeptOnKeepItemFull: keepItemFullKept - returnKept,
    monthlyExtraOnPartial: (partialKept - returnKept) * monthlyCases,
    breakEvenPartial,
    winner,
  };
}

export function partialRefundNote(comparison) {
  if (!comparison?.partial || !comparison?.takeReturn || !comparison?.keepItemFull) {
    throw new Error('Partial-refund comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { partial, takeReturn, keepItemFull } = comparison;
  const gap = money(Math.abs(partial.kept - takeReturn.kept));
  const ahead = partial.kept >= takeReturn.kept ? 'more' : 'less';
  const caseLine = `A ${money(partial.cashBack)} partial refund, with the buyer keeping the item, leaves ${money(partial.kept)} — ${gap} ${ahead} than taking the return at ${money(takeReturn.kept)}.`;
  const fullLine = `Refunding the whole order and letting them keep it leaves ${money(keepItemFull.kept)}.`;
  const ceiling = Number.isFinite(comparison.breakEvenPartial)
    ? ` Taking the return starts to win once the partial exceeds about ${money(comparison.breakEvenPartial)}.`
    : ' No partial on these rates can match taking the return.';
  return `${caseLine} ${fullLine}${ceiling}`;
}

/**
 * Illustrative Authenticity Guarantee defaults. eBay’s live fee and whether
 * the hub label is prepaid change by category and year — these are inputs,
 * not a published schedule. 3% of item price and an $8 extra hub label are
 * placeholders a sneaker or watch seller overwrites from their last payout.
 */
export const DEFAULT_AUTHENTICITY_FEE_RATE = 3;
export const DEFAULT_AUTHENTICITY_EXTRA_SHIP = 8;
export const DEFAULT_WITHOUT_AG_SELL_THROUGH = 55;
export const DEFAULT_AUTHENTICITY_SELL_THROUGH = 80;
export const DEFAULT_AUTHENTICITY_RETURN_RATE = 4;
export const DEFAULT_MONTHLY_AG_LISTINGS = 8;

function authenticityRow({
  id,
  label,
  sellThroughPct,
  returnRatePercent,
  extraCashOnSale,
  soldExpectedProfit,
  completedProfit,
}) {
  const expectedProfit = soldExpectedProfit * (sellThroughPct / 100);
  return {
    id,
    label,
    sellThroughPct,
    returnRatePercent,
    extraCashOnSale,
    completedProfit,
    soldExpectedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same SKU, listed with or without Authenticity Guarantee.
 *
 *   - Skip AG — existing completed-sale expected profit (typed return
 *     rate) times a lower sell-through. No authenticity fee, ship
 *     straight to the buyer.
 *   - Use AG — authenticity fee (percent of item price) plus extra hub
 *     shipping come out of a completed sale. The fee is treated like a
 *     percentage marketplace fee and comes back on a return; the extra
 *     hub label does not. Sell-through is higher and the authenticity
 *     return rate is usually lower (fewer “not authentic” cases).
 *
 * Complementary to the return-*rate* mix, auction vs BIN, and the
 * one-case partial-refund table. Open eBay PRs still own promoted,
 * store, Best Offer, and international. Rates are inputs, not eBay
 * Authenticity Guarantee policy.
 */
export function compareAuthenticity(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }
  const sold = calculateOrder(input);
  const authenticityFeeRate = optionalNumber(
    input.authenticityFeeRate,
    'Authenticity fee rate',
    DEFAULT_AUTHENTICITY_FEE_RATE,
  );
  const authenticityExtraShip = optionalNumber(
    input.authenticityExtraShip,
    'Authenticity extra shipping',
    DEFAULT_AUTHENTICITY_EXTRA_SHIP,
  );
  const withoutSellThrough = requiredPercent(
    input.withoutAgSellThroughPct,
    'Sell-through without Authenticity Guarantee',
    DEFAULT_WITHOUT_AG_SELL_THROUGH,
  );
  const withSellThrough = requiredPercent(
    input.authenticitySellThroughPct,
    'Authenticity sell-through',
    DEFAULT_AUTHENTICITY_SELL_THROUGH,
  );
  const authenticityReturnRate = requiredPercent(
    input.authenticityReturnRatePercent,
    'Authenticity return rate',
    DEFAULT_AUTHENTICITY_RETURN_RATE,
  );
  const monthlyListings = optionalNumber(
    input.monthlyAgListings,
    'Monthly Authenticity listings',
    DEFAULT_MONTHLY_AG_LISTINGS,
  );

  const authenticityFee = sold.quantity * listedPrice * (authenticityFeeRate / 100);
  const extraShip = authenticityExtraShip * sold.quantity;
  const extraCashOnSale = authenticityFee + extraShip;
  const authenticityCompleted = sold.profit - extraCashOnSale;
  const authenticityReturn = sold.returnProfit - extraShip;
  const authenticityReturnRateFrac = authenticityReturnRate / 100;
  const authenticityExpected = (1 - authenticityReturnRateFrac) * authenticityCompleted
    + authenticityReturnRateFrac * authenticityReturn;

  const skip = authenticityRow({
    id: 'skip',
    label: 'Skip Authenticity Guarantee',
    sellThroughPct: withoutSellThrough,
    returnRatePercent: sold.returnRatePercent,
    extraCashOnSale: 0,
    soldExpectedProfit: sold.expectedProfit,
    completedProfit: sold.profit,
  });
  const authenticity = authenticityRow({
    id: 'authenticity',
    label: 'List with Authenticity Guarantee',
    sellThroughPct: withSellThrough,
    returnRatePercent: authenticityReturnRate,
    extraCashOnSale,
    soldExpectedProfit: authenticityExpected,
    completedProfit: authenticityCompleted,
  });
  skip.expectedProfitDelta = skip.expectedProfit - authenticity.expectedProfit;
  authenticity.expectedProfitDelta = authenticity.expectedProfit - skip.expectedProfit;

  const rows = [skip, authenticity];
  const winner = authenticity.expectedProfit > skip.expectedProfit + 1e-9
    ? 'authenticity'
    : authenticity.expectedProfit < skip.expectedProfit - 1e-9
      ? 'skip'
      : 'tie';

  const keepFrac = 1 - authenticityReturnRateFrac;
  let breakEvenAuthenticityFee = Infinity;
  if (withSellThrough > 1e-12 && keepFrac > 1e-12) {
    const targetExpected = skip.expectedProfit / (withSellThrough / 100);
    const baseExpected = keepFrac * (sold.profit - extraShip)
      + authenticityReturnRateFrac * (sold.returnProfit - extraShip);
    breakEvenAuthenticityFee = (baseExpected - targetExpected) / keepFrac;
  }

  let breakEvenExtraShip = Infinity;
  if (withSellThrough > 1e-12) {
    const targetExpected = skip.expectedProfit / (withSellThrough / 100);
    const withoutExtra = keepFrac * (sold.profit - authenticityFee)
      + authenticityReturnRateFrac * sold.returnProfit;
    breakEvenExtraShip = (withoutExtra - targetExpected) / sold.quantity;
  }

  return {
    rows,
    skip,
    authenticity,
    winner,
    authenticityFee,
    authenticityFeeRate,
    authenticityExtraShip,
    monthlyListings,
    extraKeptOnAuthenticity: authenticity.expectedProfit - skip.expectedProfit,
    monthlyExtraOnAuthenticity: (authenticity.expectedProfit - skip.expectedProfit) * monthlyListings,
    breakEvenAuthenticityFee,
    breakEvenAuthenticityFeeRate: sold.quantity * listedPrice <= 1e-12
      ? Infinity
      : breakEvenAuthenticityFee / (sold.quantity * listedPrice) * 100,
    breakEvenExtraShip,
    completedProfit: sold.profit,
    returnProfit: sold.returnProfit,
  };
}

export function authenticityNote(comparison) {
  if (!comparison?.skip || !comparison?.authenticity) {
    throw new Error('Authenticity comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { skip, authenticity } = comparison;
  const gap = money(Math.abs(authenticity.expectedProfit - skip.expectedProfit));
  const ahead = authenticity.expectedProfit >= skip.expectedProfit ? 'more' : 'less';
  const skipLine = `Skip Authenticity Guarantee at ${skip.sellThroughPct}% sell-through and a ${skip.returnRatePercent}% return rate expects ${money(skip.expectedProfit)}.`;
  const agLine = `With a ${comparison.authenticityFeeRate}% authenticity fee and ${money(comparison.authenticityExtraShip)} extra hub shipping, Authenticity at ${authenticity.sellThroughPct}% sell-through and a ${authenticity.returnRatePercent}% return rate expects ${money(authenticity.expectedProfit)} — ${gap} ${ahead}.`;
  const hub = Number.isFinite(comparison.breakEvenExtraShip)
    ? ` Extra hub shipping has to be about ${money(comparison.breakEvenExtraShip)} before Authenticity matches skip-AG.`
    : ' No extra hub shipping on these rates can match skip-AG.';
  return `${skipLine} ${agLine}${hub}`;
}

/**
 * Illustrative local-pickup defaults. A $5 label on a $40 SKU still
 * usually beats a 25-minute meetup once sell-through and no-shows are
 * in the mix. The bulky case (a freight label) is the one that flips.
 * Minutes and wage are inputs, not a published labor schedule.
 */
export const DEFAULT_SHIP_SELL_THROUGH = 70;
export const DEFAULT_PICKUP_SELL_THROUGH = 35;
export const DEFAULT_PICKUP_NO_SHOW = 20;
export const DEFAULT_PICKUP_MINUTES = 25;
export const DEFAULT_PICKUP_HOURLY_WAGE = 18;
export const DEFAULT_PICKUP_FEE = 0;
export const DEFAULT_PICKUP_PACKAGING = 0;
export const DEFAULT_PICKUP_RETURN_RATE = 2;
export const DEFAULT_MONTHLY_PICKUP_LISTINGS = 8;

function pickupRow({
  id,
  label,
  sellThroughPct,
  noShowPct,
  timeCost,
  postageAndPack,
  soldExpectedProfit,
  completedProfit,
  returnRatePercent,
  expectedProfit,
}) {
  return {
    id,
    label,
    sellThroughPct,
    noShowPct,
    timeCost,
    postageAndPack,
    soldExpectedProfit,
    completedProfit,
    returnRatePercent,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same SKU, listed as a shipped sale or local pickup only.
 *
 *   - Ship it — existing completed-sale expected profit (typed return
 *     rate, outbound label, pack, return postage) times ship
 *     sell-through. No meetup time.
 *   - Local pickup — no outbound label, no return postage, optional
 *     pickup fee and light pack. A committed buyer still ghosts at the
 *     typed no-show rate. Meetup time (minutes × wage) is paid on every
 *     scheduled pickup, including no-shows. Sell-through is usually
 *     lower because only local buyers can take it.
 *
 * Complementary to auction vs BIN (format), Authenticity Guarantee
 * (hub label), and the one-case partial-refund table. Open eBay PRs
 * still own promoted, store, Best Offer, international, and Managed
 * Returns. Rates and the wage are inputs, not eBay pickup policy.
 */
export function compareLocalPickup(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const shipSellThrough = requiredPercent(
    input.shipSellThroughPct,
    'Ship sell-through',
    DEFAULT_SHIP_SELL_THROUGH,
  );
  const pickupSellThrough = requiredPercent(
    input.pickupSellThroughPct,
    'Pickup sell-through',
    DEFAULT_PICKUP_SELL_THROUGH,
  );
  const noShow = requiredPercent(
    input.pickupNoShowPct,
    'Pickup no-show rate',
    DEFAULT_PICKUP_NO_SHOW,
  );
  const minutes = optionalNumber(input.pickupMinutes, 'Pickup minutes', DEFAULT_PICKUP_MINUTES);
  const wage = optionalNumber(input.pickupHourlyWage, 'Pickup hourly wage', DEFAULT_PICKUP_HOURLY_WAGE);
  const pickupFee = optionalNumber(input.pickupFeeCharged, 'Pickup fee charged', DEFAULT_PICKUP_FEE);
  const pickupPack = optionalNumber(input.pickupPackagingCost, 'Pickup packaging', DEFAULT_PICKUP_PACKAGING);
  const pickupReturnRate = requiredPercent(
    input.pickupReturnRatePercent,
    'Pickup return rate',
    DEFAULT_PICKUP_RETURN_RATE,
  );
  const monthlyListings = optionalNumber(
    input.monthlyPickupListings,
    'Monthly pickup listings',
    DEFAULT_MONTHLY_PICKUP_LISTINGS,
  );

  const shipped = calculateOrder(input);
  const pickupSold = calculateOrder({
    ...input,
    shippingCharged: pickupFee,
    shippingCost: 0,
    packagingCost: pickupPack,
    returnShippingCost: 0,
    returnRatePercent: pickupReturnRate,
  });

  const timeCost = (minutes / 60) * wage;
  const showFrac = 1 - noShow / 100;
  const pickupPerCommit = showFrac * pickupSold.expectedProfit - timeCost;
  const shipPostage = (optionalNumber(input.shippingCost, 'Shipping cost', 0)
    + optionalNumber(input.packagingCost, 'Packaging cost', 0)) * shipped.quantity;

  const ship = pickupRow({
    id: 'ship',
    label: 'Ship it',
    sellThroughPct: shipSellThrough,
    noShowPct: 0,
    timeCost: 0,
    postageAndPack: shipPostage,
    soldExpectedProfit: shipped.expectedProfit,
    completedProfit: shipped.profit,
    returnRatePercent: shipped.returnRatePercent,
    expectedProfit: shipped.expectedProfit * (shipSellThrough / 100),
  });
  const pickup = pickupRow({
    id: 'pickup',
    label: 'Local pickup only',
    sellThroughPct: pickupSellThrough,
    noShowPct: noShow,
    timeCost,
    postageAndPack: pickupPack * pickupSold.quantity,
    soldExpectedProfit: pickupSold.expectedProfit,
    completedProfit: pickupSold.profit,
    returnRatePercent: pickupReturnRate,
    expectedProfit: pickupPerCommit * (pickupSellThrough / 100),
  });
  ship.expectedProfitDelta = ship.expectedProfit - pickup.expectedProfit;
  pickup.expectedProfitDelta = pickup.expectedProfit - ship.expectedProfit;

  const rows = [ship, pickup];
  const winner = pickup.expectedProfit > ship.expectedProfit + 1e-9
    ? 'pickup'
    : pickup.expectedProfit < ship.expectedProfit - 1e-9
      ? 'ship'
      : 'tie';

  let breakEvenPickupSellThrough = Infinity;
  if (pickupPerCommit > 1e-12) {
    const needed = ship.expectedProfit / pickupPerCommit * 100;
    breakEvenPickupSellThrough = needed > 100 + 1e-9 ? Infinity : Math.max(0, needed);
  }

  let breakEvenNoShow = Infinity;
  if (pickupSellThrough > 1e-12 && pickupSold.expectedProfit > 1e-12) {
    const neededPerCommit = ship.expectedProfit / (pickupSellThrough / 100);
    const showNeeded = (neededPerCommit + timeCost) / pickupSold.expectedProfit;
    const noShowCeiling = (1 - showNeeded) * 100;
    breakEvenNoShow = noShowCeiling < -1e-9 || noShowCeiling > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, noShowCeiling));
  }

  const shipAtLabel = (shippingCost) => (
    calculateOrder({ ...input, shippingCost }).expectedProfit * (shipSellThrough / 100)
  );
  const atZeroLabel = shipAtLabel(0);
  const atTenLabel = shipAtLabel(10);
  const labelSlope = (atTenLabel - atZeroLabel) / 10;
  let breakEvenShippingCost = Infinity;
  if (Math.abs(labelSlope) > 1e-12) {
    breakEvenShippingCost = (pickup.expectedProfit - atZeroLabel) / labelSlope;
  }

  return {
    rows,
    ship,
    pickup,
    winner,
    timeCost,
    pickupFee,
    pickupPack,
    pickupReturnRate,
    monthlyListings,
    extraKeptOnPickup: pickup.expectedProfit - ship.expectedProfit,
    monthlyExtraOnPickup: (pickup.expectedProfit - ship.expectedProfit) * monthlyListings,
    breakEvenPickupSellThrough,
    breakEvenNoShow,
    breakEvenShippingCost,
    completedProfit: shipped.profit,
    pickupCompletedProfit: pickupSold.profit,
  };
}

export function localPickupNote(comparison) {
  if (!comparison?.ship || !comparison?.pickup) {
    throw new Error('Local-pickup comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { ship, pickup } = comparison;
  const gap = money(Math.abs(pickup.expectedProfit - ship.expectedProfit));
  const ahead = pickup.expectedProfit >= ship.expectedProfit ? 'more' : 'less';
  const shipLine = `Shipping at ${ship.sellThroughPct}% sell-through, with ${money(ship.postageAndPack)} postage and pack, expects ${money(ship.expectedProfit)}.`;
  const pickupLine = `Local pickup at ${pickup.sellThroughPct}% sell-through, a ${pickup.noShowPct}% no-show rate, and ${money(comparison.timeCost)} of meetup time expects ${money(pickup.expectedProfit)} — ${gap} ${ahead}.`;
  const label = Number.isFinite(comparison.breakEvenShippingCost)
    ? ` The outbound label has to be about ${money(comparison.breakEvenShippingCost)} before shipping matches pickup.`
    : ' No outbound label on these rates can match pickup.';
  return `${shipLine} ${pickupLine}${label}`;
}

/**
 * Illustrative lot-vs-singles defaults. A $40 pile of five mixed
 * pieces still usually beats five $14 listings once you pay five
 * labels, five insertions, and the extra listing time. The known-SKU
 * case (high single sell-through, store insertion) is the one that
 * flips. Minutes and wage are inputs, not a published labor schedule.
 */
export const DEFAULT_LOT_PIECE_COUNT = 5;
export const DEFAULT_SINGLE_EXPECTED_PRICE = 14;
export const DEFAULT_LOT_SELL_THROUGH = 80;
export const DEFAULT_SINGLE_SELL_THROUGH = 55;
export const DEFAULT_LOT_INSERTION_FEE = 0;
export const DEFAULT_SINGLE_INSERTION_FEE = 0.35;
export const DEFAULT_SINGLE_SHIPPING_CHARGED = 5;
export const DEFAULT_SINGLE_SHIPPING_COST = 4;
export const DEFAULT_SINGLE_PACKAGING_COST = 1;
export const DEFAULT_LOT_LISTING_MINUTES = 8;
export const DEFAULT_SINGLE_LISTING_MINUTES = 8;
export const DEFAULT_LOT_LISTING_WAGE = 18;
export const DEFAULT_MONTHLY_LOT_DECISIONS = 6;

function lotRow({
  id,
  label,
  listings,
  sellThroughPct,
  insertionFee,
  timeCost,
  postageAndPack,
  soldExpectedProfit,
  completedProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    listings,
    sellThroughPct,
    insertionFee,
    timeCost,
    postageAndPack,
    soldExpectedProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same pile of items, listed as one lot or broken into individual
 * listings.
 *
 *   - Keep the lot — one listing, one label, one insertion, one pack.
 *     Item price and shipping on the form are the lot. Cost of goods
 *     is the pile. Listing time is paid whether it sells or not.
 *   - Split into singles — N listings, N labels, N insertions, N packs.
 *     Cost of goods is split across the pieces. Each listing uses the
 *     typed single price and single postage. Listing time is paid on
 *     every piece, including the ones that do not sell.
 *
 * Complementary to auction vs BIN (format), local pickup (meetup vs
 * label), and Authenticity Guarantee (hub label). Open eBay PRs still
 * own promoted, store, Best Offer, international, and Managed Returns.
 * Rates, insertion, and the wage are inputs, not eBay listing policy.
 */
export function compareLotVsSingles(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const pieceCount = requiredWholeCount(
    input.lotPieceCount,
    'Pieces in the lot',
    DEFAULT_LOT_PIECE_COUNT,
  );
  const singlePrice = optionalNumber(
    input.singleExpectedPrice,
    'Single expected price',
    DEFAULT_SINGLE_EXPECTED_PRICE,
  );
  const lotSellThrough = requiredPercent(
    input.lotSellThroughPct,
    'Lot sell-through',
    DEFAULT_LOT_SELL_THROUGH,
  );
  const singleSellThrough = requiredPercent(
    input.singleSellThroughPct,
    'Single sell-through',
    DEFAULT_SINGLE_SELL_THROUGH,
  );
  const lotInsertion = optionalNumber(
    input.lotInsertionFee,
    'Lot insertion fee',
    DEFAULT_LOT_INSERTION_FEE,
  );
  const singleInsertion = optionalNumber(
    input.singleInsertionFee,
    'Single insertion fee',
    DEFAULT_SINGLE_INSERTION_FEE,
  );
  const singleShipCharged = optionalNumber(
    input.singleShippingCharged,
    'Single shipping charged',
    DEFAULT_SINGLE_SHIPPING_CHARGED,
  );
  const singleShipCost = optionalNumber(
    input.singleShippingCost,
    'Single shipping cost',
    DEFAULT_SINGLE_SHIPPING_COST,
  );
  const singlePack = optionalNumber(
    input.singlePackagingCost,
    'Single packaging',
    DEFAULT_SINGLE_PACKAGING_COST,
  );
  const lotMinutes = optionalNumber(
    input.lotListingMinutes,
    'Lot listing minutes',
    DEFAULT_LOT_LISTING_MINUTES,
  );
  const singleMinutes = optionalNumber(
    input.singleListingMinutes,
    'Single listing minutes',
    DEFAULT_SINGLE_LISTING_MINUTES,
  );
  const wage = optionalNumber(
    input.lotListingWage,
    'Listing hourly wage',
    DEFAULT_LOT_LISTING_WAGE,
  );
  const monthlyDecisions = optionalNumber(
    input.monthlyLotDecisions,
    'Monthly lot decisions',
    DEFAULT_MONTHLY_LOT_DECISIONS,
  );

  const costOfGoods = optionalNumber(input.costOfGoods, 'Cost of goods', 0);
  const lotSold = calculateOrder({ ...input, quantity: 1 });
  const singleSold = calculateOrder({
    ...input,
    quantity: 1,
    price: singlePrice,
    shippingCharged: singleShipCharged,
    shippingCost: singleShipCost,
    packagingCost: singlePack,
    costOfGoods: costOfGoods / pieceCount,
  });

  const lotTime = (lotMinutes / 60) * wage;
  const singleTime = pieceCount * (singleMinutes / 60) * wage;
  const lotPostage = optionalNumber(input.shippingCost, 'Shipping cost', 0)
    + optionalNumber(input.packagingCost, 'Packaging cost', 0);
  const singlePostage = (singleShipCost + singlePack) * pieceCount;

  const lotExpected = lotSold.expectedProfit * (lotSellThrough / 100) - lotInsertion - lotTime;
  const singleExpected = (singleSold.expectedProfit * (singleSellThrough / 100) - singleInsertion)
    * pieceCount - singleTime;

  const lot = lotRow({
    id: 'lot',
    label: 'Keep the lot',
    listings: 1,
    sellThroughPct: lotSellThrough,
    insertionFee: lotInsertion,
    timeCost: lotTime,
    postageAndPack: lotPostage,
    soldExpectedProfit: lotSold.expectedProfit,
    completedProfit: lotSold.profit,
    expectedProfit: lotExpected,
  });
  const singles = lotRow({
    id: 'singles',
    label: `Split into ${pieceCount} listings`,
    listings: pieceCount,
    sellThroughPct: singleSellThrough,
    insertionFee: singleInsertion * pieceCount,
    timeCost: singleTime,
    postageAndPack: singlePostage,
    soldExpectedProfit: singleSold.expectedProfit * pieceCount,
    completedProfit: singleSold.profit * pieceCount,
    expectedProfit: singleExpected,
  });
  lot.expectedProfitDelta = lot.expectedProfit - singles.expectedProfit;
  singles.expectedProfitDelta = singles.expectedProfit - lot.expectedProfit;

  const winner = singles.expectedProfit > lot.expectedProfit + 1e-9
    ? 'singles'
    : singles.expectedProfit < lot.expectedProfit - 1e-9
      ? 'lot'
      : 'tie';

  let breakEvenSingleSellThrough = Infinity;
  if (singleSold.expectedProfit > 1e-12) {
    const needed = ((lot.expectedProfit + singleTime) / pieceCount + singleInsertion)
      / singleSold.expectedProfit * 100;
    breakEvenSingleSellThrough = needed > 100 + 1e-9 ? Infinity : Math.max(0, needed);
  }

  const singlesAtPrice = (price) => {
    const sold = calculateOrder({
      ...input,
      quantity: 1,
      price,
      shippingCharged: singleShipCharged,
      shippingCost: singleShipCost,
      packagingCost: singlePack,
      costOfGoods: costOfGoods / pieceCount,
    });
    return (sold.expectedProfit * (singleSellThrough / 100) - singleInsertion)
      * pieceCount - singleTime;
  };
  const atZero = singlesAtPrice(0);
  const atHundred = singlesAtPrice(100);
  const slope = (atHundred - atZero) / 100;
  let breakEvenSinglePrice = Infinity;
  if (slope > 1e-12) {
    breakEvenSinglePrice = Math.max(0, (lot.expectedProfit - atZero) / slope);
  }

  return {
    rows: [lot, singles],
    lot,
    singles,
    winner,
    pieceCount,
    singlePrice,
    lotInsertion,
    singleInsertion,
    monthlyDecisions,
    extraKeptOnSingles: singles.expectedProfit - lot.expectedProfit,
    monthlyExtraOnSingles: (singles.expectedProfit - lot.expectedProfit) * monthlyDecisions,
    breakEvenSingleSellThrough,
    breakEvenSinglePrice,
    lotCompletedProfit: lotSold.profit,
    singleCompletedProfit: singleSold.profit,
  };
}

export function lotVsSinglesNote(comparison) {
  if (!comparison?.lot || !comparison?.singles) {
    throw new Error('Lot-versus-singles comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { lot, singles } = comparison;
  const gap = money(Math.abs(singles.expectedProfit - lot.expectedProfit));
  const ahead = singles.expectedProfit >= lot.expectedProfit ? 'more' : 'less';
  const lotLine = `Keeping the lot at ${lot.sellThroughPct}% sell-through, with ${money(lot.postageAndPack)} postage and pack and ${money(lot.timeCost)} of listing time, expects ${money(lot.expectedProfit)}.`;
  const singlesLine = `Splitting into ${comparison.pieceCount} listings at ${money(comparison.singlePrice)} each, ${singles.sellThroughPct}% sell-through, and ${money(singles.timeCost)} of listing time expects ${money(singles.expectedProfit)} — ${gap} ${ahead}.`;
  const price = Number.isFinite(comparison.breakEvenSinglePrice)
    ? ` Each single has to list at about ${money(comparison.breakEvenSinglePrice)} before splitting matches the lot.`
    : ' No single list price on these rates can match the lot.';
  return `${lotLine} ${singlesLine}${price}`;
}

/**
 * Illustrative Standard Envelope defaults. A $0.66 envelope plus a
 * rigid mailer usually beats a $5 Ground / First Class label on a
 * $40 collectible — until the item is expensive enough that an
 * item-not-received claim eats the sourcing cost. Postage and the
 * claim rate are inputs, not eBay's live envelope schedule.
 */
export const DEFAULT_ENVELOPE_SHIPPING_COST = 0.66;
export const DEFAULT_ENVELOPE_PACKAGING_COST = 0.35;
export const DEFAULT_ENVELOPE_CLAIM_RATE = 8;
export const DEFAULT_ENVELOPE_FEE_REFUND_ON_CLAIM = 100;
export const DEFAULT_TRACKED_SELL_THROUGH = 90;
export const DEFAULT_ENVELOPE_SELL_THROUGH = 85;
export const DEFAULT_MONTHLY_ENVELOPE_LISTINGS = 40;

function envelopeRow({
  id,
  label,
  sellThroughPct,
  lossRatePercent,
  lossKind,
  postageAndPack,
  soldExpectedProfit,
  completedProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    sellThroughPct,
    lossRatePercent,
    lossKind,
    postageAndPack,
    soldExpectedProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same SKU, shipped with a tracked label or with eBay Standard
 * Envelope.
 *
 *   - Tracked label — the order you already calculated, including the
 *     typed return rate. A return restocks the item; you eat the
 *     outbound label and return postage. Sell-through is the tracked
 *     rate.
 *   - Standard Envelope — cheaper postage and pack, no tracking. A
 *     claim is not a return: the buyer is refunded and the item is
 *     gone, so cost of goods is lost. Percentage fees usually come
 *     back on an item-not-received case; that refund rate is an
 *     input. Envelope completed-sale math uses a 0% return rate so
 *     claims are not double-counted.
 *
 * Complementary to local pickup (meetup vs any label), lot vs
 * singles (one listing vs many), and Authenticity Guarantee (hub
 * label). Open eBay PRs still own promoted, store, Best Offer,
 * international, and Managed Returns. Postage and the claim rate
 * are inputs, not eBay envelope eligibility or seller-protection
 * policy.
 */
export function compareStandardEnvelope(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const envelopeShip = optionalNumber(
    input.envelopeShippingCost,
    'Envelope postage',
    DEFAULT_ENVELOPE_SHIPPING_COST,
  );
  const envelopePack = optionalNumber(
    input.envelopePackagingCost,
    'Envelope packaging',
    DEFAULT_ENVELOPE_PACKAGING_COST,
  );
  const claimRate = requiredPercent(
    input.envelopeClaimRatePercent,
    'Envelope claim rate',
    DEFAULT_ENVELOPE_CLAIM_RATE,
  );
  const feeRefundOnClaim = requiredPercent(
    input.envelopeFeeRefundOnClaimPercent,
    'Fee refund on envelope claim',
    DEFAULT_ENVELOPE_FEE_REFUND_ON_CLAIM,
  );
  const trackedSellThrough = requiredPercent(
    input.trackedSellThroughPct,
    'Tracked sell-through',
    DEFAULT_TRACKED_SELL_THROUGH,
  );
  const envelopeSellThrough = requiredPercent(
    input.envelopeSellThroughPct,
    'Envelope sell-through',
    DEFAULT_ENVELOPE_SELL_THROUGH,
  );
  const monthlyListings = optionalNumber(
    input.monthlyEnvelopeListings,
    'Monthly envelope listings',
    DEFAULT_MONTHLY_ENVELOPE_LISTINGS,
  );

  const trackedSold = calculateOrder(input);
  const envelopeSold = calculateOrder({
    ...input,
    shippingCost: envelopeShip,
    packagingCost: envelopePack,
    returnRatePercent: 0,
    returnShippingCost: 0,
  });

  const quantity = envelopeSold.quantity;
  const costOfGoods = optionalNumber(input.costOfGoods, 'Cost of goods', 0);
  const otherCost = optionalNumber(input.otherCost, 'Other cost', 0);
  const unrefundedFees = envelopeSold.feeTotal * (1 - feeRefundOnClaim / 100);
  const sunkOnClaim = (costOfGoods + envelopeShip + envelopePack + otherCost) * quantity;
  const claimProfit = -sunkOnClaim - unrefundedFees;
  const claimRateFrac = claimRate / 100;
  const envelopeAfterClaims = (1 - claimRateFrac) * envelopeSold.profit + claimRateFrac * claimProfit;

  const trackedPostage = (optionalNumber(input.shippingCost, 'Shipping cost', 0)
    + optionalNumber(input.packagingCost, 'Packaging cost', 0)) * trackedSold.quantity;
  const envelopePostage = (envelopeShip + envelopePack) * quantity;

  const tracked = envelopeRow({
    id: 'tracked',
    label: 'Tracked label',
    sellThroughPct: trackedSellThrough,
    lossRatePercent: trackedSold.returnRatePercent,
    lossKind: 'return',
    postageAndPack: trackedPostage,
    soldExpectedProfit: trackedSold.expectedProfit,
    completedProfit: trackedSold.profit,
    expectedProfit: trackedSold.expectedProfit * (trackedSellThrough / 100),
  });
  const envelope = envelopeRow({
    id: 'envelope',
    label: 'Standard Envelope',
    sellThroughPct: envelopeSellThrough,
    lossRatePercent: claimRate,
    lossKind: 'claim',
    postageAndPack: envelopePostage,
    soldExpectedProfit: envelopeAfterClaims,
    completedProfit: envelopeSold.profit,
    expectedProfit: envelopeAfterClaims * (envelopeSellThrough / 100),
  });
  tracked.expectedProfitDelta = tracked.expectedProfit - envelope.expectedProfit;
  envelope.expectedProfitDelta = envelope.expectedProfit - tracked.expectedProfit;

  const winner = envelope.expectedProfit > tracked.expectedProfit + 1e-9
    ? 'envelope'
    : envelope.expectedProfit < tracked.expectedProfit - 1e-9
      ? 'tracked'
      : 'tie';

  const profitClaimGap = envelopeSold.profit - claimProfit;
  let breakEvenClaimRate = Infinity;
  if (envelopeSellThrough > 1e-12 && profitClaimGap > 1e-12) {
    const neededAfterClaims = tracked.expectedProfit / (envelopeSellThrough / 100);
    const rate = (envelopeSold.profit - neededAfterClaims) / profitClaimGap * 100;
    breakEvenClaimRate = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  const envelopeAtPostage = (shippingCost) => {
    const sold = calculateOrder({
      ...input,
      shippingCost,
      packagingCost: envelopePack,
      returnRatePercent: 0,
      returnShippingCost: 0,
    });
    const sunk = (costOfGoods + shippingCost + envelopePack + otherCost) * quantity;
    const unrefunded = sold.feeTotal * (1 - feeRefundOnClaim / 100);
    const claim = -sunk - unrefunded;
    const afterClaims = (1 - claimRateFrac) * sold.profit + claimRateFrac * claim;
    return afterClaims * (envelopeSellThrough / 100);
  };
  const atZeroPostage = envelopeAtPostage(0);
  const atTenPostage = envelopeAtPostage(10);
  const postageSlope = (atTenPostage - atZeroPostage) / 10;
  let breakEvenEnvelopePostage = Infinity;
  if (Math.abs(postageSlope) > 1e-12) {
    const neededPostage = (tracked.expectedProfit - atZeroPostage) / postageSlope;
    breakEvenEnvelopePostage = neededPostage < -1e-9 ? Infinity : neededPostage;
  }

  return {
    rows: [tracked, envelope],
    tracked,
    envelope,
    winner,
    envelopeShip,
    envelopePack,
    claimRate,
    feeRefundOnClaim,
    claimProfit,
    monthlyListings,
    extraKeptOnEnvelope: envelope.expectedProfit - tracked.expectedProfit,
    monthlyExtraOnEnvelope: (envelope.expectedProfit - tracked.expectedProfit) * monthlyListings,
    breakEvenClaimRate,
    breakEvenEnvelopePostage,
    trackedCompletedProfit: trackedSold.profit,
    envelopeCompletedProfit: envelopeSold.profit,
  };
}

export function standardEnvelopeNote(comparison) {
  if (!comparison?.tracked || !comparison?.envelope) {
    throw new Error('Standard Envelope comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { tracked, envelope } = comparison;
  const gap = money(Math.abs(envelope.expectedProfit - tracked.expectedProfit));
  const ahead = envelope.expectedProfit >= tracked.expectedProfit ? 'more' : 'less';
  const trackedLine = `A tracked label at ${tracked.sellThroughPct}% sell-through, with ${money(tracked.postageAndPack)} postage and pack and a ${tracked.lossRatePercent}% return rate, expects ${money(tracked.expectedProfit)}.`;
  const envelopeLine = `Standard Envelope at ${envelope.sellThroughPct}% sell-through, ${money(envelope.postageAndPack)} postage and pack, and an ${envelope.lossRatePercent}% item-not-received claim rate expects ${money(envelope.expectedProfit)} — ${gap} ${ahead}.`;
  const claim = Number.isFinite(comparison.breakEvenClaimRate)
    ? ` Claims have to stay at about ${comparison.breakEvenClaimRate.toFixed(1)}% before the envelope matches the tracked label.`
    : ' No claim rate on these postage figures can match the tracked label.';
  return `${trackedLine} ${envelopeLine}${claim}`;
}

/**
 * Illustrative combined-shipping defaults. Two already-sold $40
 * listings that each charged $6 postage still usually beat a $4
 * “I’ll combine them cheap” invoice — the buyer-friendly discount
 * gives away more shipping revenue than one box saves. Collecting
 * $8 on the combined box is the one that still pays. Postage and
 * the combined return rate are inputs, not eBay invoice policy.
 */
export const DEFAULT_COMBINED_ITEM_COUNT = 2;
export const DEFAULT_COMBINED_SHIPPING_CHARGED = 8;
export const DEFAULT_COMBINED_SHIPPING_COST = 6.5;
export const DEFAULT_COMBINED_PACKAGING_COST = 1.25;
export const DEFAULT_COMBINED_RETURN_SHIPPING_COST = 6.5;
export const DEFAULT_COMBINED_FIXED_FEE = 0.3;
export const DEFAULT_MONTHLY_COMBINED_ORDERS = 12;

function combinedRow({
  id,
  label,
  items,
  shipments,
  postageAndPack,
  shippingCharged,
  soldExpectedProfit,
  completedProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    items,
    shipments,
    postageAndPack,
    shippingCharged,
    soldExpectedProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same two (or N) already-sold listings, shipped as separate
 * packages or as one combined box.
 *
 *   - Ship separately — N completed sales, N shipping charges, N
 *     labels, N packs, N per-order fixed fees, N return exposures.
 *     Item price and postage on the form are one listing.
 *   - Combine into one box — one shipment. Combined shipping
 *     charged, one label, one pack, and the typed combined fixed
 *     fee (default one checkout). A return restocks every item in
 *     the box and eats the one outbound plus the one return label.
 *
 * This is a fulfillment decision after the sales already closed.
 * It is not lot-versus-singles (listing format before anyone
 * buys) and not Standard Envelope (postage type on one item).
 * Complementary to Promoted Offsite (ad spend billed even if
 * they bounce). Open eBay PRs still own Promoted Listings
 * Standard rate, store, Best Offer, international, Top Rated
 * Plus, and Managed Returns. Postage and the combined return
 * rate are inputs, not eBay combined-invoice policy.
 */
export function compareCombinedShipping(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const itemCount = requiredWholeCount(
    input.combinedItemCount,
    'Items already sold',
    DEFAULT_COMBINED_ITEM_COUNT,
  );
  const combinedCharged = optionalNumber(
    input.combinedShippingCharged,
    'Combined shipping charged',
    DEFAULT_COMBINED_SHIPPING_CHARGED,
  );
  const combinedShip = optionalNumber(
    input.combinedShippingCost,
    'Combined postage',
    DEFAULT_COMBINED_SHIPPING_COST,
  );
  const combinedPack = optionalNumber(
    input.combinedPackagingCost,
    'Combined packaging',
    DEFAULT_COMBINED_PACKAGING_COST,
  );
  const combinedReturnShip = optionalNumber(
    input.combinedReturnShippingCost,
    'Combined return postage',
    DEFAULT_COMBINED_RETURN_SHIPPING_COST,
  );
  const combinedFixed = optionalNumber(
    input.combinedFixedFee,
    'Combined per-order fixed fee',
    DEFAULT_COMBINED_FIXED_FEE,
  );
  const combinedReturnRate = requiredPercent(
    input.combinedReturnRatePercent,
    'Combined return rate',
    optionalNumber(input.returnRatePercent, 'Expected return rate', 0),
  );
  const monthlyOrders = optionalNumber(
    input.monthlyCombinedOrders,
    'Monthly combined invoices',
    DEFAULT_MONTHLY_COMBINED_ORDERS,
  );

  const costOfGoods = optionalNumber(input.costOfGoods, 'Cost of goods', 0);
  const otherCost = optionalNumber(input.otherCost, 'Other cost', 0);
  const separateSold = calculateOrder({ ...input, quantity: 1 });
  const combinedSold = calculateOrder({
    ...input,
    quantity: 1,
    price: listedPrice * itemCount,
    costOfGoods: costOfGoods * itemCount,
    otherCost: otherCost * itemCount,
    shippingCharged: combinedCharged,
    shippingCost: combinedShip,
    packagingCost: combinedPack,
    returnShippingCost: combinedReturnShip,
    fixedFee: combinedFixed,
    returnRatePercent: combinedReturnRate,
  });

  const separatePostage = (optionalNumber(input.shippingCost, 'Shipping cost', 0)
    + optionalNumber(input.packagingCost, 'Packaging cost', 0)) * itemCount;
  const separateCharged = optionalNumber(input.shippingCharged, 'Shipping charged', 0) * itemCount;
  const separateExpected = separateSold.expectedProfit * itemCount;
  const separateCompleted = separateSold.profit * itemCount;

  const separate = combinedRow({
    id: 'separate',
    label: `Ship ${itemCount} separately`,
    items: itemCount,
    shipments: itemCount,
    postageAndPack: separatePostage,
    shippingCharged: separateCharged,
    soldExpectedProfit: separateExpected,
    completedProfit: separateCompleted,
    expectedProfit: separateExpected,
  });
  const combined = combinedRow({
    id: 'combined',
    label: 'Combine into one box',
    items: itemCount,
    shipments: 1,
    postageAndPack: combinedShip + combinedPack,
    shippingCharged: combinedCharged,
    soldExpectedProfit: combinedSold.expectedProfit,
    completedProfit: combinedSold.profit,
    expectedProfit: combinedSold.expectedProfit,
  });
  separate.expectedProfitDelta = separate.expectedProfit - combined.expectedProfit;
  combined.expectedProfitDelta = combined.expectedProfit - separate.expectedProfit;

  const winner = combined.expectedProfit > separate.expectedProfit + 1e-9
    ? 'combined'
    : combined.expectedProfit < separate.expectedProfit - 1e-9
      ? 'separate'
      : 'tie';

  const combinedAtCharged = (shippingCharged) => calculateOrder({
    ...input,
    quantity: 1,
    price: listedPrice * itemCount,
    costOfGoods: costOfGoods * itemCount,
    otherCost: otherCost * itemCount,
    shippingCharged,
    shippingCost: combinedShip,
    packagingCost: combinedPack,
    returnShippingCost: combinedReturnShip,
    fixedFee: combinedFixed,
    returnRatePercent: combinedReturnRate,
  }).expectedProfit;
  const atZeroCharged = combinedAtCharged(0);
  const atTenCharged = combinedAtCharged(10);
  const chargedSlope = (atTenCharged - atZeroCharged) / 10;
  let breakEvenCombinedCharged = Infinity;
  if (Math.abs(chargedSlope) > 1e-12) {
    const needed = (separate.expectedProfit - atZeroCharged) / chargedSlope;
    breakEvenCombinedCharged = needed < -1e-9 ? Infinity : needed;
  }

  const combinedAtPostage = (shippingCost) => calculateOrder({
    ...input,
    quantity: 1,
    price: listedPrice * itemCount,
    costOfGoods: costOfGoods * itemCount,
    otherCost: otherCost * itemCount,
    shippingCharged: combinedCharged,
    shippingCost,
    packagingCost: combinedPack,
    returnShippingCost: combinedReturnShip,
    fixedFee: combinedFixed,
    returnRatePercent: combinedReturnRate,
  }).expectedProfit;
  const atZeroPostage = combinedAtPostage(0);
  const atTenPostage = combinedAtPostage(10);
  const postageSlope = (atTenPostage - atZeroPostage) / 10;
  let breakEvenCombinedPostage = Infinity;
  if (Math.abs(postageSlope) > 1e-12) {
    const needed = (separate.expectedProfit - atZeroPostage) / postageSlope;
    breakEvenCombinedPostage = needed < -1e-9 ? Infinity : needed;
  }

  return {
    rows: [separate, combined],
    separate,
    combined,
    winner,
    itemCount,
    combinedCharged,
    combinedShip,
    combinedPack,
    combinedReturnShip,
    combinedFixed,
    combinedReturnRate,
    monthlyOrders,
    extraKeptOnCombined: combined.expectedProfit - separate.expectedProfit,
    monthlyExtraOnCombined: (combined.expectedProfit - separate.expectedProfit) * monthlyOrders,
    breakEvenCombinedCharged,
    breakEvenCombinedPostage,
    separateCompletedProfit: separateCompleted,
    combinedCompletedProfit: combinedSold.profit,
  };
}

export function combinedShippingNote(comparison) {
  if (!comparison?.separate || !comparison?.combined) {
    throw new Error('Combined-shipping comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { separate, combined } = comparison;
  const gap = money(Math.abs(combined.expectedProfit - separate.expectedProfit));
  const ahead = combined.expectedProfit >= separate.expectedProfit ? 'more' : 'less';
  const separateLine = `Shipping ${comparison.itemCount} separately, collecting ${money(separate.shippingCharged)} postage and paying ${money(separate.postageAndPack)} postage and pack, expects ${money(separate.expectedProfit)} after the typed return rate.`;
  const combinedLine = `Combining into one box, collecting ${money(combined.shippingCharged)} and paying ${money(combined.postageAndPack)} postage and pack, expects ${money(combined.expectedProfit)} — ${gap} ${ahead}.`;
  const charged = Number.isFinite(comparison.breakEvenCombinedCharged)
    ? ` Combined shipping charged has to stay at about ${money(comparison.breakEvenCombinedCharged)} before one box matches separate labels.`
    : ' No combined shipping charge on these postage figures can match separate labels.';
  return `${separateLine} ${combinedLine}${charged}`;
}

/**
 * Illustrative “send offer to watchers” extras. 10% off is the
 * coupon eBay surfaces first. 40% vs 55% is a 15-point conversion
 * lift on the same watchers — wait sell-through versus accept
 * rate, both typed, not scraped from Seller Hub. Forty offers is
 * a placeholder volume, not a forecast.
 */
export const DEFAULT_OFFER_PERCENT = 10;
export const DEFAULT_WAIT_SELL_THROUGH = 40;
export const DEFAULT_OFFER_ACCEPT = 55;
export const DEFAULT_MONTHLY_OFFERS = 40;

function offerPriceFromPercent(listPrice, offerPercent) {
  return Math.max(0, listPrice * (1 - offerPercent / 100));
}

function sioRow({ id, label, price, sellThroughPct, input }) {
  const sold = calculateOrder({ ...input, price });
  const expectedProfit = sold.expectedProfit * (sellThroughPct / 100);
  return {
    id,
    label,
    price,
    sellThroughPct,
    soldProfit: sold.profit,
    soldExpectedProfit: sold.expectedProfit,
    soldFees: sold.feeTotal,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same listed SKU, two ways to close the watchers you already have:
 * wait for Buy It Now, or send a seller-initiated offer.
 *
 * This is not incoming Best Offer (open #1538): the buyer is not
 * naming a price. You are. It is also not auction vs BIN (listing
 * format before anyone watches) and not the repricing table (a
 * price move without a typed conversion lift). Insertion is
 * already sunk — the listing exists. Accept rate and wait
 * sell-through are inputs, not eBay watcher-conversion policy.
 *
 * Open eBay PRs still own promoted, store, Best Offer,
 * international, Managed Returns, and Top Rated Plus.
 */
export function compareSellerInitiatedOffer(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const offerPercent = requiredPercent(
    input.offerPercent,
    'Offer percent',
    DEFAULT_OFFER_PERCENT,
  );
  const waitSellThroughPct = requiredPercent(
    input.waitSellThroughPct,
    'Wait sell-through',
    DEFAULT_WAIT_SELL_THROUGH,
  );
  const offerAcceptPct = requiredPercent(
    input.offerAcceptPct,
    'Offer accept rate',
    DEFAULT_OFFER_ACCEPT,
  );
  const monthlyOffers = optionalNumber(
    input.monthlyOffers,
    'Monthly offers',
    DEFAULT_MONTHLY_OFFERS,
  );

  const offerPrice = offerPriceFromPercent(listedPrice, offerPercent);
  const wait = sioRow({
    id: 'wait',
    label: 'Wait for Buy It Now',
    price: listedPrice,
    sellThroughPct: waitSellThroughPct,
    input,
  });
  const offer = sioRow({
    id: 'offer',
    label: `Send a ${offerPercent}% offer`,
    price: offerPrice,
    sellThroughPct: offerAcceptPct,
    input,
  });
  wait.expectedProfitDelta = wait.expectedProfit - offer.expectedProfit;
  offer.expectedProfitDelta = offer.expectedProfit - wait.expectedProfit;

  const extraKeptOnOffer = offer.expectedProfit - wait.expectedProfit;
  const winner = extraKeptOnOffer > 1e-9
    ? 'offer'
    : extraKeptOnOffer < -1e-9
      ? 'wait'
      : 'tie';

  const breakEvenAcceptPct = offer.soldExpectedProfit <= 1e-12
    ? (wait.expectedProfit <= 1e-12 ? 0 : Infinity)
    : (wait.expectedProfit / offer.soldExpectedProfit) * 100;

  const promotedRate = optionalNumber(input.promotedRate, 'Promoted listings rate', 0);
  let offerPriceCeiling = Infinity;
  if (offerAcceptPct > 1e-12) {
    const neededSoldExpected = wait.expectedProfit / (offerAcceptPct / 100);
    offerPriceCeiling = priceForExpectedProfit(input, promotedRate, neededSoldExpected);
  }
  const offerPercentCeiling = !Number.isFinite(offerPriceCeiling) || listedPrice <= 1e-12
    ? (listedPrice <= 1e-12 ? 0 : Infinity)
    : ((listedPrice - offerPriceCeiling) / listedPrice) * 100;

  return {
    rows: [wait, offer],
    wait,
    offer,
    winner,
    offerPercent,
    offerPrice,
    waitSellThroughPct,
    offerAcceptPct,
    monthlyOffers,
    extraKeptOnOffer,
    monthlyExtraOnOffer: extraKeptOnOffer * monthlyOffers,
    breakEvenAcceptPct,
    offerPriceCeiling,
    offerPercentCeiling,
    offerPays: extraKeptOnOffer > 1e-9,
  };
}

export function sellerInitiatedOfferNote(comparison) {
  if (!comparison?.wait || !comparison?.offer) {
    throw new Error('Seller-initiated-offer comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { wait, offer } = comparison;
  const gap = money(Math.abs(offer.expectedProfit - wait.expectedProfit));
  const ahead = offer.expectedProfit >= wait.expectedProfit ? 'more' : 'less';
  const waitLine = `Waiting for Buy It Now at ${money(wait.price)} with ${wait.sellThroughPct}% sell-through expects ${money(wait.expectedProfit)} after the typed return rate.`;
  const offerLine = ` Sending a ${comparison.offerPercent}% offer (${money(offer.price)}) at a ${offer.sellThroughPct}% accept rate expects ${money(offer.expectedProfit)} — ${gap} ${ahead}.`;
  const packed = ` A packed Buy It Now sale leaves ${money(wait.soldExpectedProfit)}; a packed accepted offer leaves ${money(offer.soldExpectedProfit)}.`;
  const accept = Number.isFinite(comparison.breakEvenAcceptPct)
    ? ` The offer has to be accepted about ${comparison.breakEvenAcceptPct.toFixed(1)}% of the time before it matches waiting.`
    : ' No finite accept rate can match waiting when a packed accepted offer leaves $0.00 or less.';
  const ceiling = Number.isFinite(comparison.offerPercentCeiling)
    ? ` At this conversion lift the offer has to stay at or below about ${comparison.offerPercentCeiling.toFixed(1)}% off (${money(comparison.offerPriceCeiling)}).`
    : '';
  return `${waitLine}${offerLine}${packed}${accept}${ceiling}`;
}

/**
 * Illustrative Promoted Offsite defaults. A $20 Offsite campaign
 * that actually produces two extra $40 sales still usually pays
 * after the typed return rate. One extra sale for the same $20
 * does not. Spend is billed whether they buy or not — that is
 * the difference from Promoted Listings Standard. Extra-sale
 * counts and the Offsite spend are inputs, not eBay's live
 * Offsite bid or daily budget.
 */
export const DEFAULT_OFFSITE_SPEND = 20;
export const DEFAULT_OFFSITE_EXTRA_ORDERS = 2;
export const DEFAULT_MONTHLY_OFFSITE_CAMPAIGNS = 4;

function offsiteRow({
  id,
  label,
  extraOrders,
  adSpend,
  extraSalesProfit,
  completedProfit,
  expectedProfit,
  promotedRate,
}) {
  return {
    id,
    label,
    extraOrders,
    adSpend,
    extraSalesProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
    promotedRate,
  };
}

/**
 * Same listing, skip Promoted Offsite or add a campaign.
 *
 *   - Skip Offsite — the listing you already have. No extra
 *     spend, no extra sales. Promoted Listings Standard, if
 *     typed, is already in that sale.
 *   - Add Offsite — the same listing plus N extra completed
 *     sales, minus the Offsite spend. The spend is paid even
 *     if they bounce. Extra sales still pay final value fee
 *     and, by default, the same Promoted Listings rate as
 *     the listing (they stack). Set the Offsite sale promoted
 *     rate to 0 if those extra sales would not also pay
 *     Standard.
 *
 * This is not “does a Promoted Listings percent still pay”
 * (#1482): Standard is a percent of a completed sale. Offsite
 * is a bill either way. Open eBay PRs still own store, Best
 * Offer, international, Top Rated Plus, and Managed Returns.
 * Spend and extra-sale counts are inputs, not eBay Offsite
 * policy.
 */
export function comparePromotedOffsite(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const offsiteSpend = optionalNumber(
    input.offsiteSpend,
    'Promoted Offsite spend',
    DEFAULT_OFFSITE_SPEND,
  );
  const extraOrders = optionalNumber(
    input.offsiteExtraOrders,
    'Extra Offsite orders',
    DEFAULT_OFFSITE_EXTRA_ORDERS,
  );
  const listingPromotedRate = optionalNumber(input.promotedRate, 'Promoted listings rate', 0);
  const offsitePromotedRate = requiredPercent(
    input.offsitePromotedRate,
    'Offsite sale promoted rate',
    listingPromotedRate,
  );
  const monthlyCampaigns = optionalNumber(
    input.monthlyOffsiteCampaigns,
    'Monthly Offsite campaigns',
    DEFAULT_MONTHLY_OFFSITE_CAMPAIGNS,
  );

  const listing = calculateOrder(input);
  const extraSale = calculateOrder({ ...input, promotedRate: offsitePromotedRate });
  const extraSalesProfit = extraSale.expectedProfit * extraOrders;
  const extraSalesCompleted = extraSale.profit * extraOrders;

  const skip = offsiteRow({
    id: 'skip',
    label: 'Skip Promoted Offsite',
    extraOrders: 0,
    adSpend: 0,
    extraSalesProfit: 0,
    completedProfit: listing.profit,
    expectedProfit: listing.expectedProfit,
    promotedRate: listingPromotedRate,
  });
  const offsite = offsiteRow({
    id: 'offsite',
    label: 'Add Promoted Offsite',
    extraOrders,
    adSpend: offsiteSpend,
    extraSalesProfit,
    completedProfit: listing.profit + extraSalesCompleted - offsiteSpend,
    expectedProfit: listing.expectedProfit + extraSalesProfit - offsiteSpend,
    promotedRate: offsitePromotedRate,
  });
  skip.expectedProfitDelta = skip.expectedProfit - offsite.expectedProfit;
  offsite.expectedProfitDelta = offsite.expectedProfit - skip.expectedProfit;

  const winner = offsite.expectedProfit > skip.expectedProfit + 1e-9
    ? 'offsite'
    : offsite.expectedProfit < skip.expectedProfit - 1e-9
      ? 'skip'
      : 'tie';

  let breakEvenExtraOrders = Infinity;
  if (extraSale.expectedProfit > 1e-12) {
    breakEvenExtraOrders = offsiteSpend / extraSale.expectedProfit;
  } else if (offsiteSpend <= 1e-12) {
    breakEvenExtraOrders = 0;
  }

  const breakEvenOffsiteSpend = extraOrders * extraSale.expectedProfit;
  const costPerExtraSale = extraOrders > 1e-12 ? offsiteSpend / extraOrders : Infinity;

  return {
    rows: [skip, offsite],
    skip,
    offsite,
    winner,
    offsiteSpend,
    extraOrders,
    offsitePromotedRate,
    listingPromotedRate,
    extraSaleExpectedProfit: extraSale.expectedProfit,
    extraSaleCompletedProfit: extraSale.profit,
    monthlyCampaigns,
    extraKeptOnOffsite: offsite.expectedProfit - skip.expectedProfit,
    monthlyExtraOnOffsite: (offsite.expectedProfit - skip.expectedProfit) * monthlyCampaigns,
    breakEvenExtraOrders,
    breakEvenOffsiteSpend,
    costPerExtraSale,
    listingExpectedProfit: listing.expectedProfit,
    listingCompletedProfit: listing.profit,
  };
}

export function promotedOffsiteNote(comparison) {
  if (!comparison?.skip || !comparison?.offsite) {
    throw new Error('Promoted Offsite comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { skip, offsite } = comparison;
  const gap = money(Math.abs(offsite.expectedProfit - skip.expectedProfit));
  const ahead = offsite.expectedProfit >= skip.expectedProfit ? 'more' : 'less';
  const skipLine = `Skip Promoted Offsite. The listing you already have expects ${money(skip.expectedProfit)} after the typed return rate.`;
  const offsiteLine = `A ${money(comparison.offsiteSpend)} Offsite campaign that produces ${comparison.extraOrders} extra sale${comparison.extraOrders === 1 ? '' : 's'} expects ${money(offsite.expectedProfit)} after that spend — ${gap} ${ahead}.`;
  const floor = Number.isFinite(comparison.breakEvenExtraOrders)
    ? ` Extra sales have to stay at about ${comparison.breakEvenExtraOrders.toFixed(2)} before Offsite matches skip.`
    : ' No extra-sale count on these rates can match skip-Offsite.';
  return `${skipLine} ${offsiteLine}${floor}`;
}
