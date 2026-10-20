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
  'targetRoi',
  'targetProfit',
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
  'promotedStandardRate',
  'promotedStandardExtraOrders',
  'monthlyPromotedListings',
  'advancedCpc',
  'advancedClicks',
  'advancedExtraOrders',
  'advancedPromotedRate',
  'monthlyAdvancedCampaigns',
  'qtyDiscountUnits',
  'qtyDiscountPercent',
  'qtyShippingCharged',
  'qtyShippingCost',
  'qtyPackagingCost',
  'qtyReturnShippingCost',
  'qtyFixedFee',
  'qtyReturnRatePercent',
  'singlesSellThroughPct',
  'qtyTakePct',
  'monthlyQtyOrders',
  'couponPercent',
  'couponRedeemPct',
  'listedSellThroughPct',
  'couponSellThroughPct',
  'dropSellThroughPct',
  'monthlyCouponListings',
  'unpaidRatePercent',
  'laterSellThroughPct',
  'immediateSellThroughPct',
  'unpaidRelistFee',
  'unpaidMinutes',
  'unpaidHourlyWage',
  'monthlyImmediateListings',
  'trsDiscountPct',
  'standardSellThroughPct',
  'trsSellThroughPct',
  'standardReturnRatePercent',
  'trsReturnRatePercent',
  'standardReturnShippingCost',
  'trsReturnShippingCost',
  'trsHandlingMinutes',
  'trsHandlingWage',
  'monthlyTrsListings',
  'selfReturnShippingCost',
  'selfReturnRatePercent',
  'managedReturnFee',
  'managedReturnRatePercent',
  'buyerPaysReturnRatePercent',
  'monthlyManagedListings',
  'gspReturnRatePercent',
  'gspSellThroughPct',
  'selfShipShippingCharged',
  'selfShipShippingCost',
  'selfShipReturnShippingCost',
  'selfShipIntlFeeRate',
  'selfShipReturnRatePercent',
  'selfShipClaimRatePercent',
  'selfShipSellThroughPct',
  'monthlyGspListings',
  'monthlyStoreOrders',
  'monthlyStoreFee',
  // Comparison-only: ignored by calculateOrder, carried by save/share
  // so a "should I take this offer?" link opens with the same offer.
  'incomingBestOffer',
  'incomingWaitChancePct',
  'freeShipPrice',
  'buyerPaysSellThroughPct',
  'freeShipSellThroughPct',
  'monthlyFreeShipListings',
  // Comparison-only: extra label cost when the seller absorbs
  // international postage. Ignored by calculateOrder so the
  // headline stays a domestic order until they type an intl fee.
  'intlExtraShipping',
  // Comparison-only: skip vs insurance vs signature on the
  // same already-sold tracked shipment. Ignored by calculateOrder.
  'skipClaimRatePercent',
  'insurancePremium',
  'insuranceClaimRatePercent',
  'insurancePayout',
  'signatureFee',
  'signatureClaimRatePercent',
  'protectionFeeRefundOnClaimPercent',
  'monthlyProtectionShipments',
  // Comparison-only: eBay label vs Pirate Ship / Shippo on the
  // same already-sold shipment. Ignored by calculateOrder.
  'ebayLabelCost',
  'thirdPartyLabelCost',
  'ebayLabelClaimRatePercent',
  'thirdPartyClaimRatePercent',
  'labelUploadMinutes',
  'labelUploadWage',
  'labelFeeRefundOnClaimPercent',
  'monthlyLabelShipments',
];

export function calculateOrder(input) {
  const number = (value, name) => {
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  };
  const price = number(input.price, 'Item price');
  const shippingCharged = number(input.shippingCharged ?? 0, 'Shipping charged');
  const finalValueRate = number(input.finalValueRate ?? 13.6, 'Final value fee rate');
  const fixedFee = number(input.fixedFee ?? 0.4, 'Per-order fixed fee');
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
    // This is a per-order charge, so a batch still pays it once. Per-unit
    // costs below remain multiplied by quantity.
    fixed: fixedFee,
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
  // Net sale proceeds available to recover the cash spent on this order. This
  // deliberately excludes modeled operating outlays because those are what
  // the checkpoint compares against as invested cash.
  const cashRecovered = revenue - feeTotal;

  // Fixed (non-percentage) cash outlay that must be recovered before the
  // percentage-based fees are covered, used to solve for break-even price.
  // Solve the batch threshold on a per-unit basis. The one per-order fee is
  // spread across the batch, while item and fulfilment costs are per unit.
  const fixedCash = fixedFee / quantity + costOfGoods + shippingCost + packagingCost + otherCost;
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
  // Solve (1-rate)*profit + rate*returnProfit = 0 for a return rate in
  // [0, 100]. profit can be negative -- the completed sale can already be a
  // loss before any returns -- and "0" is not the break-even in that case:
  // at 0% returns the order is already below zero, not sitting at it (the
  // same defect fixed in shopify-fee-calculator's breakEvenRefundRate).
  // returnProfit is a sum of non-negative sunk costs and unrefunded fees,
  // negated, so it is never positive; a convex mix of two non-positive
  // numbers can only land on exactly zero at the r=100% boundary (when
  // returnProfit itself is 0), so once profit is negative the honest
  // default is "no return rate reaches break-even", not "already there".
  let breakEvenReturnRate;
  if (Math.abs(profitReturnGap) <= 1e-12) {
    breakEvenReturnRate = Math.abs(profit) <= 1e-12 ? 0 : Infinity;
  } else {
    const rate = (profit / profitReturnGap) * 100;
    breakEvenReturnRate = rate < -1e-9 || rate > 100 + 1e-9 ? Infinity : Math.max(0, rate);
  }
  return {
    revenue,
    quantity,
    fees,
    feeTotal,
    cashInvested,
    cashRecovered,
    cashRecoveryPct: cashInvested === 0 ? null : cashRecovered / cashInvested * 100,
    cashSurplus: cashRecovered - cashInvested,
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
    // Inverse of targetMarginPrice: highest item cost that still hits the
    // requested net margin at the current sale price. Distinct from
    // calculateSourcingCeiling, which solves for a target ROI.
    maxCostOfGoods: targetRevenueDenominator <= 0
      ? 0
      : Math.max(
        0,
        (price + shippingCharged) * targetRevenueDenominator
          - fixedFee / quantity
          - shippingCost
          - packagingCost
          - otherCost,
      ),
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
    // Inverse of leftover: the item price that holds a typed leftover
    // after the same fee stack. Complementary to targetMarginPrice
    // (percent of revenue) and calculateSourcingCeiling (max buy for ROI).
    // Salvaged from #1564.
    targetProfitPrice: priceToMatchProfit(input, input.targetProfit ?? 0),
  };
}

/**
 * Item price that leaves `targetProfit` after the typed fee stack.
 *
 * Percentage fees sit on item plus shipping charged, so this is not
 * leftover plus costs — a $1 leftover target is not a $1 price move.
 * Salvaged from #1564 onto current main. Not eBay's live fee schedule.
 */
export function priceToMatchProfit(input, targetProfit) {
  const profit = Number(targetProfit);
  if (!Number.isFinite(profit)) throw new Error('Target profit must be a number');
  const number = (value, name) => {
    const result = Number(value);
    if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
    return result;
  };
  const quantity = number(input.quantity ?? 1, 'Units');
  if (!Number.isInteger(quantity) || quantity < 1) throw new Error('Units must be a whole number of at least 1');
  const shippingCharged = number(input.shippingCharged ?? 0, 'Shipping charged');
  const finalValueRate = number(input.finalValueRate ?? 13.6, 'Final value fee rate');
  const fixedFee = number(input.fixedFee ?? 0.4, 'Per-order fixed fee');
  const promotedRate = number(input.promotedRate ?? 0, 'Promoted listings rate');
  const intlFeeRate = number(input.intlFeeRate ?? 0, 'International fee rate');
  const costOfGoods = number(input.costOfGoods ?? 0, 'Cost of goods');
  const shippingCost = number(input.shippingCost ?? 0, 'Shipping cost');
  const packagingCost = number(input.packagingCost ?? 0, 'Packaging cost');
  const otherCost = number(input.otherCost ?? 0, 'Other cost');
  const percentRate = (finalValueRate + promotedRate + intlFeeRate) / 100;
  if (percentRate >= 1) return Infinity;
  const fixedPerUnit = fixedFee + costOfGoods + shippingCost + packagingCost + otherCost;
  const price = (profit / quantity + fixedPerUnit) / (1 - percentRate) - shippingCharged;
  return Math.round(Math.max(0, price) * 100) / 100;
}

// Default promoted-listings rates a reseller actually types into eBay's
// campaign picker, plus 0% so "do not promote" is always on the table.
export const PROMOTED_RATE_PRESETS = [0, 2, 4, 6, 8, 10, 12];

/**
 * Highest promoted-listings rate that still meets a goal, holding every
 * other assumption still. Each extra ad point takes 1% of order revenue,
 * so the unpromoted margin is the remaining budget for ads.
 *
 * forTargetMargin: false → leftover stays non-negative (break-even).
 * forTargetMargin: true  → net margin stays at the seller's target.
 * A negative result means the goal is already missed with ads off.
 * Salvaged from #1482 leftover onto current main.
 */
export function maxAffordablePromotedRate(input, options = {}) {
  const forTargetMargin = options.forTargetMargin === true;
  const unpromoted = calculateOrder({ ...input, promotedRate: 0 });
  const target = forTargetMargin ? Number(input.targetMargin ?? 0) : 0;
  return unpromoted.margin - target;
}

/**
 * Same order at several ad rates. The seller's typed rate is always
 * included so the "now" row cannot drift from the headline result.
 * profitDelta is against the unpromoted (0%) row — the cash promoting
 * this listing actually costs, not a price-move delta.
 * Complementary to comparePromotedStandard (skip vs one campaign).
 */
export function calculatePromotedTable(input, rates = PROMOTED_RATE_PRESETS) {
  if (!Array.isArray(rates) || rates.length === 0) {
    throw new Error('At least one promoted-listings rate is required');
  }
  const currentRate = Number(input.promotedRate ?? 0);
  if (!Number.isFinite(currentRate) || currentRate < 0) {
    throw new Error('Promoted listings rate must be a non-negative number');
  }
  const uniqueRates = [...new Set([...rates.map(Number), currentRate])];
  for (const rate of uniqueRates) {
    if (!Number.isFinite(rate) || rate < 0) {
      throw new Error('Promoted listings rate must be a non-negative number');
    }
  }
  uniqueRates.sort((a, b) => a - b);
  const unpromoted = calculateOrder({ ...input, promotedRate: 0 });
  return uniqueRates.map((rate) => {
    const scenario = calculateOrder({ ...input, promotedRate: rate });
    return {
      ...scenario,
      promotedRate: rate,
      isCurrent: rate === currentRate,
      isUnpromoted: rate === 0,
      profitDelta: scenario.profit - unpromoted.profit,
    };
  });
}

export function calculateSourcingCeiling(input, targetRoi) {
  const target = Number(targetRoi);
  if (!Number.isFinite(target) || target < 0) throw new Error('Target ROI must be a non-negative number');
  // Validate the seller's actual inputs first so a bad cost of goods or
  // quantity is not silently replaced by the zero-cost, one-unit baseline.
  const current = calculateOrder(input);
  const baseline = calculateOrder({ ...input, costOfGoods: 0, quantity: 1 });
  const otherCashPerUnit = Number(input.shippingCost ?? 0) + Number(input.packagingCost ?? 0) + Number(input.otherCost ?? 0);
  const targetRate = target / 100;
  const numerator = baseline.unitProfit - targetRate * otherCashPerUnit;
  const maximumAcquisitionCost = Math.max(0, numerator / (1 + targetRate));
  return {
    targetRoi: target,
    maximumAcquisitionCost,
    maximumBatchAcquisitionCost: maximumAcquisitionCost * current.quantity,
    quantity: current.quantity,
    currentAcquisitionCost: Number(input.costOfGoods ?? 0),
    isReachable: numerator >= 0,
    amountOverCeiling: Math.max(0, Number(input.costOfGoods ?? 0) - maximumAcquisitionCost),
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

// Solve rate/100 * profitAtFullRate = targetExpected for a rate in [0, 100]
// (an accept rate, a sell-through rate, a take/redeem rate, a wait chance —
// whatever the caller is scaling). profitAtFullRate is the profit the rate
// scales, and it can be negative: the scaled path (accepting an offer,
// selling at a discount, self-shipping) can lose money at every unit sold,
// not just cost more, and the straight ratio still finds the real crossing
// whatever its sign — a losing scaled path paired with a losing target
// still ties at a real, positive rate (both non-positive numbers cross at
// rate = target/profitAtFullRate, which is positive whenever they share a
// sign). Gating on profitAtFullRate's sign alone (as every call site here
// used to: `profitAtFullRate <= 1e-12 ? (targetExpected <= 1e-12 ? 0 :
// Infinity) : ratio`) silently reported 0% — "already break-even" — for
// every one of those real, reachable, nonzero crossings, understating the
// floor every one of these comparisons exists to warn about. Same defect
// class as etsy-profit-calculator's breakEvenSellThroughRate and
// shopify-fee-calculator's six break-even solvers.
function breakEvenScaledRate(targetExpected, profitAtFullRate) {
  if (Math.abs(profitAtFullRate) <= 1e-12) {
    return Math.abs(targetExpected) <= 1e-12 ? 0 : Infinity;
  }
  const rate = (targetExpected / profitAtFullRate) * 100;
  if (rate < -1e-9 || rate > 100 + 1e-9) return Infinity;
  return Math.max(0, rate);
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
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
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
export const DEFAULT_COMBINED_FIXED_FEE = 0.4;
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
 * This is not incoming Best Offer: the buyer is not naming a
 * price. You are. Incoming Best Offer is compareBestOffer. It
 * is also not auction vs BIN (listing format before anyone
 * watches) and not the repricing table (a price move without a
 * typed conversion lift). Insertion is already sunk — the
 * listing exists. Accept rate and wait sell-through are inputs,
 * not eBay watcher-conversion policy.
 *
 * Complementary to incoming Best Offer and
 * compareInternational (domestic vs worldwide at this list).
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

  const breakEvenAcceptPct = breakEvenScaledRate(wait.expectedProfit, offer.soldExpectedProfit);

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

/**
 * Illustrative Promoted Listings Standard extras. 5% is a rate
 * sellers actually type into the campaign picker. One extra sale
 * is the first lift that can cover the cut Standard takes on the
 * sale you already would have made. Twenty listings is a
 * placeholder volume, not a forecast. This is not Offsite: there
 * is no campaign bill if they bounce.
 */
export const DEFAULT_PROMOTED_STANDARD_RATE = 5;
export const DEFAULT_PROMOTED_STANDARD_EXTRA_ORDERS = 1;
export const DEFAULT_MONTHLY_PROMOTED_LISTINGS = 20;

function standardRow({
  id,
  label,
  extraOrders,
  adFee,
  extraSalesProfit,
  completedProfit,
  expectedProfit,
  promotedRate,
}) {
  return {
    id,
    label,
    extraOrders,
    adFee,
    extraSalesProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
    promotedRate,
  };
}

function expectedProfitAtPromotedRate(input, promotedRate) {
  return calculateOrder({ ...input, promotedRate }).expectedProfit;
}

/**
 * Highest Standard rate at the typed extra-sale count that still
 * matches skip. expectedProfit is linear in the promoted rate
 * when fee refunds are a constant share of fees, so two
 * evaluations recover the slope. Binary-search fallback covers
 * a non-linear refund mix.
 */
function breakEvenStandardRate(input, extraOrders, skipExpected) {
  const sales = 1 + extraOrders;
  const atZero = expectedProfitAtPromotedRate(input, 0) * sales;
  const atTen = expectedProfitAtPromotedRate(input, 10) * sales;
  const slope = (atTen - atZero) / 10;
  if (Math.abs(slope) > 1e-12) {
    const closed = (skipExpected - atZero) / slope;
    if (Number.isFinite(closed)) {
      const clamped = Math.max(0, Math.min(100, closed));
      const check = expectedProfitAtPromotedRate(input, clamped) * sales;
      if (Math.abs(check - skipExpected) < 1e-6) return clamped;
    }
  }
  let lo = 0;
  let hi = 100;
  const atHi = expectedProfitAtPromotedRate(input, hi) * sales;
  if (atZero < skipExpected - 1e-9 && atHi < skipExpected - 1e-9) {
    return Infinity;
  }
  for (let i = 0; i < 40; i += 1) {
    const mid = (lo + hi) / 2;
    if (expectedProfitAtPromotedRate(input, mid) * sales >= skipExpected - 1e-9) lo = mid;
    else hi = mid;
  }
  return lo;
}

/**
 * Same listing, skip Promoted Listings Standard or turn it on.
 *
 *   - Skip Standard — the sale you already have at 0% ads.
 *   - Add Standard — that same sale now pays the typed percent,
 *     plus N extra completed sales that also pay it. There is
 *     no campaign bill if they bounce. Zero extra sales is the
 *     conservative test: the campaign only takes a cut of a
 *     sale you already would have made.
 *
 * This is not Offsite (#1653): Offsite is a bill either way.
 * Open eBay PRs still own Best Offer and international.
 * Extra-sale counts are inputs, not eBay’s Promoted Listings
 * attribution.
 */
export function comparePromotedStandard(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const promotedRate = requiredPercent(
    input.promotedStandardRate,
    'Promoted Listings Standard rate',
    DEFAULT_PROMOTED_STANDARD_RATE,
  );
  const extraOrders = optionalNumber(
    input.promotedStandardExtraOrders,
    'Extra Standard orders',
    DEFAULT_PROMOTED_STANDARD_EXTRA_ORDERS,
  );
  const monthlyListings = optionalNumber(
    input.monthlyPromotedListings,
    'Monthly promoted listings',
    DEFAULT_MONTHLY_PROMOTED_LISTINGS,
  );

  const skipSale = calculateOrder({ ...input, promotedRate: 0 });
  const promotedSale = calculateOrder({ ...input, promotedRate });
  const extraSalesProfit = promotedSale.expectedProfit * extraOrders;
  const extraSalesCompleted = promotedSale.profit * extraOrders;

  const skip = standardRow({
    id: 'skip',
    label: 'Skip Promoted Listings',
    extraOrders: 0,
    adFee: 0,
    extraSalesProfit: 0,
    completedProfit: skipSale.profit,
    expectedProfit: skipSale.expectedProfit,
    promotedRate: 0,
  });
  const promote = standardRow({
    id: 'promote',
    label: 'Add Promoted Listings Standard',
    extraOrders,
    adFee: promotedSale.fees.promoted * (1 + extraOrders),
    extraSalesProfit,
    completedProfit: promotedSale.profit + extraSalesCompleted,
    expectedProfit: promotedSale.expectedProfit + extraSalesProfit,
    promotedRate,
  });
  skip.expectedProfitDelta = skip.expectedProfit - promote.expectedProfit;
  promote.expectedProfitDelta = promote.expectedProfit - skip.expectedProfit;

  const winner = promote.expectedProfit > skip.expectedProfit + 1e-9
    ? 'promote'
    : promote.expectedProfit < skip.expectedProfit - 1e-9
      ? 'skip'
      : 'tie';

  let breakEvenExtraOrders = Infinity;
  if (promotedSale.expectedProfit > 1e-12) {
    breakEvenExtraOrders = skipSale.expectedProfit / promotedSale.expectedProfit - 1;
    if (breakEvenExtraOrders < 0) breakEvenExtraOrders = 0;
  } else if (skipSale.expectedProfit <= 1e-12) {
    breakEvenExtraOrders = 0;
  }

  const noLiftExpectedProfit = promotedSale.expectedProfit;
  const adDragOnExistingSale = skipSale.expectedProfit - noLiftExpectedProfit;
  const breakEvenRate = breakEvenStandardRate(input, extraOrders, skipSale.expectedProfit);

  return {
    rows: [skip, promote],
    skip,
    promote,
    winner,
    promotedRate,
    extraOrders,
    monthlyListings,
    extraKeptOnPromote: promote.expectedProfit - skip.expectedProfit,
    monthlyExtraOnPromote: (promote.expectedProfit - skip.expectedProfit) * monthlyListings,
    breakEvenExtraOrders,
    breakEvenPromotedRate: breakEvenRate,
    noLiftExpectedProfit,
    adDragOnExistingSale,
    extraSaleExpectedProfit: promotedSale.expectedProfit,
    extraSaleCompletedProfit: promotedSale.profit,
    listingExpectedProfit: skipSale.expectedProfit,
    listingCompletedProfit: skipSale.profit,
    promotedAdFee: promotedSale.fees.promoted,
  };
}

/**
 * Illustrative Promoted Listings Advanced extras. $0.40 CPC
 * on 40 clicks is a $16 campaign bill — charged even if they
 * bounce. One extra sale at 2.5% conversion is the first
 * integer lift that can still cover that bill on the default
 * $40 listing. Twenty campaigns is a placeholder volume, not
 * a forecast. This is not Standard: there is a campaign bill
 * if they bounce. This is not Offsite: the clicks are on eBay
 * search, not Google or Facebook.
 */
export const DEFAULT_ADVANCED_CPC = 0.4;
export const DEFAULT_ADVANCED_CLICKS = 40;
export const DEFAULT_ADVANCED_EXTRA_ORDERS = 1;
export const DEFAULT_MONTHLY_ADVANCED_CAMPAIGNS = 20;

function advancedRow({
  id,
  label,
  extraOrders,
  clicks,
  cpc,
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
    clicks,
    cpc,
    adSpend,
    extraSalesProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
    promotedRate,
  };
}

/**
 * Same listing, skip Promoted Listings Advanced or turn it on.
 *
 *   - Skip Advanced — the sale you already have, no click bill.
 *   - Add Advanced — that same sale plus N extra completed
 *     sales, minus CPC × clicks. The click bill is charged
 *     even if they bounce. Zero extra sales is the
 *     conservative test: you paid for traffic and kept the
 *     sale you already had.
 *
 * This is not Standard (#1669): Standard is a percent taken
 * only when the listing sells. This is not Offsite (#1653):
 * Offsite is a Google/Facebook campaign billed either way.
 * Open complementary eBay PRs: free shipping (#1674),
 * international (#1564). Extra-sale counts, CPC, and clicks
 * are inputs, not eBay’s Promoted Listings attribution.
 */
export function comparePromotedAdvanced(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const cpc = optionalNumber(input.advancedCpc, 'Promoted Listings Advanced CPC', DEFAULT_ADVANCED_CPC);
  const clicks = optionalNumber(input.advancedClicks, 'Promoted Listings Advanced clicks', DEFAULT_ADVANCED_CLICKS);
  if (!Number.isInteger(clicks)) {
    throw new Error('Promoted Listings Advanced clicks must be a whole number');
  }
  const extraOrders = optionalNumber(
    input.advancedExtraOrders,
    'Extra Advanced orders',
    DEFAULT_ADVANCED_EXTRA_ORDERS,
  );
  const listingPromotedRate = optionalNumber(input.promotedRate, 'Promoted listings rate', 0);
  const advancedPromotedRate = requiredPercent(
    input.advancedPromotedRate,
    'Advanced sale promoted rate',
    listingPromotedRate,
  );
  const monthlyCampaigns = optionalNumber(
    input.monthlyAdvancedCampaigns,
    'Monthly Advanced campaigns',
    DEFAULT_MONTHLY_ADVANCED_CAMPAIGNS,
  );

  const adSpend = cpc * clicks;
  const listing = calculateOrder(input);
  const extraSale = calculateOrder({ ...input, promotedRate: advancedPromotedRate });
  const extraSalesProfit = extraSale.expectedProfit * extraOrders;
  const extraSalesCompleted = extraSale.profit * extraOrders;

  const skip = advancedRow({
    id: 'skip',
    label: 'Skip Promoted Listings Advanced',
    extraOrders: 0,
    clicks: 0,
    cpc,
    adSpend: 0,
    extraSalesProfit: 0,
    completedProfit: listing.profit,
    expectedProfit: listing.expectedProfit,
    promotedRate: listingPromotedRate,
  });
  const advanced = advancedRow({
    id: 'advanced',
    label: 'Add Promoted Listings Advanced',
    extraOrders,
    clicks,
    cpc,
    adSpend,
    extraSalesProfit,
    completedProfit: listing.profit + extraSalesCompleted - adSpend,
    expectedProfit: listing.expectedProfit + extraSalesProfit - adSpend,
    promotedRate: advancedPromotedRate,
  });
  skip.expectedProfitDelta = skip.expectedProfit - advanced.expectedProfit;
  advanced.expectedProfitDelta = advanced.expectedProfit - skip.expectedProfit;

  const winner = advanced.expectedProfit > skip.expectedProfit + 1e-9
    ? 'advanced'
    : advanced.expectedProfit < skip.expectedProfit - 1e-9
      ? 'skip'
      : 'tie';

  let breakEvenExtraOrders = Infinity;
  if (extraSale.expectedProfit > 1e-12) {
    breakEvenExtraOrders = adSpend / extraSale.expectedProfit;
  } else if (adSpend <= 1e-12) {
    breakEvenExtraOrders = 0;
  }

  const breakEvenAdSpend = extraOrders * extraSale.expectedProfit;
  const breakEvenCpc = clicks > 1e-12 ? breakEvenAdSpend / clicks : Infinity;
  const breakEvenClicks = cpc > 1e-12 ? breakEvenAdSpend / cpc : Infinity;
  const costPerExtraSale = extraOrders > 1e-12 ? adSpend / extraOrders : Infinity;
  const conversionPct = clicks > 1e-12 ? extraOrders / clicks * 100 : 0;
  const breakEvenConversionPct = clicks > 1e-12 && Number.isFinite(breakEvenExtraOrders)
    ? breakEvenExtraOrders / clicks * 100
    : Infinity;
  const noLiftExpectedProfit = listing.expectedProfit - adSpend;

  return {
    rows: [skip, advanced],
    skip,
    advanced,
    winner,
    cpc,
    clicks,
    adSpend,
    extraOrders,
    advancedPromotedRate,
    listingPromotedRate,
    extraSaleExpectedProfit: extraSale.expectedProfit,
    extraSaleCompletedProfit: extraSale.profit,
    monthlyCampaigns,
    extraKeptOnAdvanced: advanced.expectedProfit - skip.expectedProfit,
    monthlyExtraOnAdvanced: (advanced.expectedProfit - skip.expectedProfit) * monthlyCampaigns,
    breakEvenExtraOrders,
    breakEvenAdSpend,
    breakEvenCpc,
    breakEvenClicks,
    costPerExtraSale,
    conversionPct,
    breakEvenConversionPct,
    noLiftExpectedProfit,
    listingExpectedProfit: listing.expectedProfit,
    listingCompletedProfit: listing.profit,
  };
}

export function promotedAdvancedNote(comparison) {
  if (!comparison?.skip || !comparison?.advanced) {
    throw new Error('Promoted Listings Advanced comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { skip, advanced } = comparison;
  const gap = money(Math.abs(advanced.expectedProfit - skip.expectedProfit));
  const ahead = advanced.expectedProfit >= skip.expectedProfit ? 'more' : 'less';
  const skipLine = `Skip Promoted Listings Advanced. The listing you already have expects ${money(skip.expectedProfit)} after the typed return rate.`;
  const advancedLine = `A ${money(comparison.cpc)} CPC campaign on ${comparison.clicks} click${comparison.clicks === 1 ? '' : 's'} (${money(comparison.adSpend)} billed either way) that produces ${comparison.extraOrders} extra sale${comparison.extraOrders === 1 ? '' : 's'} expects ${money(advanced.expectedProfit)} after that spend — ${gap} ${ahead}.`;
  const drag = ` With no extra sales the same clicks leave ${money(comparison.noLiftExpectedProfit)} (${money(comparison.adSpend)} less than skip).`;
  const floor = Number.isFinite(comparison.breakEvenExtraOrders)
    ? ` Extra sales have to stay at about ${comparison.breakEvenExtraOrders.toFixed(2)} before Advanced matches skip.`
    : ' No extra-sale count on these rates can match skip.';
  return `${skipLine} ${advancedLine}${drag}${floor}`;
}

export function promotedStandardNote(comparison) {
  if (!comparison?.skip || !comparison?.promote) {
    throw new Error('Promoted Listings Standard comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { skip, promote } = comparison;
  const gap = money(Math.abs(promote.expectedProfit - skip.expectedProfit));
  const ahead = promote.expectedProfit >= skip.expectedProfit ? 'more' : 'less';
  const skipLine = `Skip Promoted Listings. The sale you already have expects ${money(skip.expectedProfit)} after the typed return rate.`;
  const promoteLine = `A ${comparison.promotedRate}% Standard campaign that produces ${comparison.extraOrders} extra sale${comparison.extraOrders === 1 ? '' : 's'} expects ${money(promote.expectedProfit)} after the ad cut — ${gap} ${ahead}.`;
  const drag = ` With no extra sales the same rate leaves ${money(comparison.noLiftExpectedProfit)} (${money(comparison.adDragOnExistingSale)} less than skip).`;
  const floor = Number.isFinite(comparison.breakEvenExtraOrders)
    ? ` Extra sales have to stay at about ${comparison.breakEvenExtraOrders.toFixed(2)} before Standard matches skip.`
    : ' No extra-sale count on these rates can match skip.';
  return `${skipLine} ${promoteLine}${drag}${floor}`;
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

/**
 * Illustrative quantity-discount extras. Two units at 10% off is
 * the first tier eBay surfaces. $6 charged / $5.50 label / $1.25
 * pack is one slightly heavier box instead of two $5+$1 singles.
 * 55% vs 70% is a 15-point multi-buy lift — both typed, not
 * scraped from Seller Hub. Twenty orders is a placeholder
 * volume, not a forecast.
 */
export const DEFAULT_QTY_DISCOUNT_UNITS = 2;
export const DEFAULT_QTY_DISCOUNT_PERCENT = 10;
export const DEFAULT_QTY_SHIPPING_CHARGED = 6;
export const DEFAULT_QTY_SHIPPING_COST = 5.5;
export const DEFAULT_QTY_PACKAGING_COST = 1.25;
export const DEFAULT_QTY_RETURN_SHIPPING_COST = 5.5;
export const DEFAULT_QTY_FIXED_FEE = 0.4;
export const DEFAULT_SINGLES_SELL_THROUGH = 55;
export const DEFAULT_QTY_TAKE_PCT = 70;
export const DEFAULT_MONTHLY_QTY_ORDERS = 20;

function qtyDiscountUnitPrice(listPrice, discountPercent) {
  return Math.max(0, listPrice * (1 - discountPercent / 100));
}

function qtyDiscountSold(input, {
  units,
  discountPercent,
  charged,
  ship,
  pack,
  returnShip,
  fixed,
  returnRate,
}) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  const unitPrice = qtyDiscountUnitPrice(listedPrice, discountPercent);
  const costOfGoods = optionalNumber(input.costOfGoods, 'Cost of goods', 0);
  const otherCost = optionalNumber(input.otherCost, 'Other cost', 0);
  return {
    unitPrice,
    sold: calculateOrder({
      ...input,
      quantity: 1,
      price: unitPrice * units,
      costOfGoods: costOfGoods * units,
      otherCost: otherCost * units,
      shippingCharged: charged,
      shippingCost: ship,
      packagingCost: pack,
      returnShippingCost: returnShip,
      fixedFee: fixed,
      returnRatePercent: returnRate,
    }),
  };
}

function qtyRow({
  id,
  label,
  units,
  shipments,
  unitPrice,
  shippingCharged,
  postageAndPack,
  sellThroughPct,
  completedProfit,
  soldExpectedProfit,
}) {
  return {
    id,
    label,
    units,
    shipments,
    unitPrice,
    shippingCharged,
    postageAndPack,
    sellThroughPct,
    completedProfit,
    soldExpectedProfit,
    expectedProfit: soldExpectedProfit * (sellThroughPct / 100),
    expectedProfitDelta: 0,
  };
}

/**
 * Same multi-quantity SKU, two ways to move N units: sell them
 * as N separate singles at list, or turn on a quantity discount
 * so one buyer takes all N at a percent off, one shipping
 * charge, and one label.
 *
 * This is not combined shipping (already-sold different items,
 * no price cut). It is not lot-versus-singles (one listing of a
 * pile versus N listings). It is not a seller-initiated offer
 * (one unit, percent off to watchers). Promoted Offsite (#1653) is a campaign billed either way,
 * not a price cut. Open eBay PRs still own promoted Standard,
 * store, incoming Best Offer, international, Managed Returns,
 * and Top Rated Plus. Postage, the discount,
 * and both close rates are inputs, not eBay volume-pricing
 * policy.
 */
export function compareQuantityDiscount(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const units = requiredWholeCount(
    input.qtyDiscountUnits,
    'Quantity-discount units',
    DEFAULT_QTY_DISCOUNT_UNITS,
  );
  const discountPercent = requiredPercent(
    input.qtyDiscountPercent,
    'Quantity-discount percent',
    DEFAULT_QTY_DISCOUNT_PERCENT,
  );
  const charged = optionalNumber(
    input.qtyShippingCharged,
    'Quantity-discount shipping charged',
    DEFAULT_QTY_SHIPPING_CHARGED,
  );
  const ship = optionalNumber(
    input.qtyShippingCost,
    'Quantity-discount postage',
    DEFAULT_QTY_SHIPPING_COST,
  );
  const pack = optionalNumber(
    input.qtyPackagingCost,
    'Quantity-discount packaging',
    DEFAULT_QTY_PACKAGING_COST,
  );
  const returnShip = optionalNumber(
    input.qtyReturnShippingCost,
    'Quantity-discount return postage',
    DEFAULT_QTY_RETURN_SHIPPING_COST,
  );
  const fixed = optionalNumber(
    input.qtyFixedFee,
    'Quantity-discount per-order fixed fee',
    DEFAULT_QTY_FIXED_FEE,
  );
  const returnRate = requiredPercent(
    input.qtyReturnRatePercent,
    'Quantity-discount return rate',
    optionalNumber(input.returnRatePercent, 'Expected return rate', 0),
  );
  const singlesSellThroughPct = requiredPercent(
    input.singlesSellThroughPct,
    'Singles sell-through',
    DEFAULT_SINGLES_SELL_THROUGH,
  );
  const qtyTakePct = requiredPercent(
    input.qtyTakePct,
    'Quantity-discount take rate',
    DEFAULT_QTY_TAKE_PCT,
  );
  const monthlyQtyOrders = optionalNumber(
    input.monthlyQtyOrders,
    'Monthly quantity-discount orders',
    DEFAULT_MONTHLY_QTY_ORDERS,
  );

  const singleSold = calculateOrder({ ...input, quantity: 1 });
  const discountEval = qtyDiscountSold(input, {
    units,
    discountPercent,
    charged,
    ship,
    pack,
    returnShip,
    fixed,
    returnRate,
  });

  const singlesPostage = (optionalNumber(input.shippingCost, 'Shipping cost', 0)
    + optionalNumber(input.packagingCost, 'Packaging cost', 0)) * units;
  const singlesCharged = optionalNumber(input.shippingCharged, 'Shipping charged', 0) * units;

  const singles = qtyRow({
    id: 'singles',
    label: `Sell ${units} separately`,
    units,
    shipments: units,
    unitPrice: listedPrice,
    shippingCharged: singlesCharged,
    postageAndPack: singlesPostage,
    sellThroughPct: singlesSellThroughPct,
    completedProfit: singleSold.profit * units,
    soldExpectedProfit: singleSold.expectedProfit * units,
  });
  const discount = qtyRow({
    id: 'discount',
    label: `Sell ${units} at ${discountPercent}% off, one box`,
    units,
    shipments: 1,
    unitPrice: discountEval.unitPrice,
    shippingCharged: charged,
    postageAndPack: ship + pack,
    sellThroughPct: qtyTakePct,
    completedProfit: discountEval.sold.profit,
    soldExpectedProfit: discountEval.sold.expectedProfit,
  });
  singles.expectedProfitDelta = singles.expectedProfit - discount.expectedProfit;
  discount.expectedProfitDelta = discount.expectedProfit - singles.expectedProfit;

  const extraKeptOnDiscount = discount.expectedProfit - singles.expectedProfit;
  const extraPackedOnDiscount = discount.soldExpectedProfit - singles.soldExpectedProfit;
  const winner = extraKeptOnDiscount > 1e-9
    ? 'discount'
    : extraKeptOnDiscount < -1e-9
      ? 'singles'
      : 'tie';

  const atZero = qtyDiscountSold(input, {
    units,
    discountPercent: 0,
    charged,
    ship,
    pack,
    returnShip,
    fixed,
    returnRate,
  }).sold.expectedProfit;
  const atTwenty = qtyDiscountSold(input, {
    units,
    discountPercent: 20,
    charged,
    ship,
    pack,
    returnShip,
    fixed,
    returnRate,
  }).sold.expectedProfit;
  const packedSlope = (atTwenty - atZero) / 20;
  let breakEvenDiscountPercent = Infinity;
  if (Math.abs(packedSlope) > 1e-12) {
    const needed = (singles.soldExpectedProfit - atZero) / packedSlope;
    breakEvenDiscountPercent = needed < -1e-9 ? Infinity : needed;
  }

  const breakEvenTakePct = breakEvenScaledRate(singles.expectedProfit, discount.soldExpectedProfit);

  return {
    rows: [singles, discount],
    singles,
    discount,
    winner,
    units,
    discountPercent,
    charged,
    ship,
    pack,
    returnShip,
    fixed,
    returnRate,
    singlesSellThroughPct,
    qtyTakePct,
    monthlyQtyOrders,
    extraKeptOnDiscount,
    extraPackedOnDiscount,
    monthlyExtraOnDiscount: extraKeptOnDiscount * monthlyQtyOrders,
    breakEvenDiscountPercent,
    breakEvenTakePct,
    discountPays: extraKeptOnDiscount > 1e-9,
  };
}

export function quantityDiscountNote(comparison) {
  if (!comparison?.singles || !comparison?.discount) {
    throw new Error('Quantity-discount comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { singles, discount } = comparison;
  const packedGap = money(Math.abs(discount.soldExpectedProfit - singles.soldExpectedProfit));
  const packedAhead = discount.soldExpectedProfit >= singles.soldExpectedProfit ? 'more' : 'less';
  const stGap = money(Math.abs(discount.expectedProfit - singles.expectedProfit));
  const stAhead = discount.expectedProfit >= singles.expectedProfit ? 'more' : 'less';
  const singlesLine = `Selling ${comparison.units} separately at ${money(singles.unitPrice)} each, collecting ${money(singles.shippingCharged)} postage and paying ${money(singles.postageAndPack)} postage and pack, expects ${money(singles.soldExpectedProfit)} after the typed return rate.`;
  const discountLine = ` Selling ${comparison.units} at ${comparison.discountPercent}% off (${money(discount.unitPrice)} each) in one box, collecting ${money(discount.shippingCharged)} and paying ${money(discount.postageAndPack)}, expects ${money(discount.soldExpectedProfit)} — ${packedGap} ${packedAhead} on leftover.`;
  const closeLine = ` At ${singles.sellThroughPct}% singles sell-through versus a ${discount.sellThroughPct}% multi-buy take rate, singles expect ${money(singles.expectedProfit)} and the discount expects ${money(discount.expectedProfit)} — ${stGap} ${stAhead}.`;
  const take = Number.isFinite(comparison.breakEvenTakePct)
    ? ` The multi-buy has to be taken about ${comparison.breakEvenTakePct.toFixed(1)}% of the time before it matches selling separately after sell-through.`
    : ' No finite take rate can match selling separately when a packed multi-buy leaves $0.00 or less.';
  const ceiling = Number.isFinite(comparison.breakEvenDiscountPercent)
    ? ` On leftover, the discount has to stay at or below about ${comparison.breakEvenDiscountPercent.toFixed(1)}% off before one box matches ${comparison.units} singles.`
    : '';
  return `${singlesLine}${discountLine}${closeLine}${take}${ceiling}`;
}

/**
 * Illustrative seller-coupon extras. 15% off is the first public
 * coupon eBay surfaces that is not the 10% watcher offer. 40%
 * redeem means four in ten coupon-path sales actually apply the
 * code; the rest still pay Buy It Now. 40% vs 55% vs 50% is a
 * typed conversion lift on listed / coupon-badge / dropped-BIN
 * search, not scraped from Seller Hub. Forty listings is a
 * placeholder volume, not a forecast.
 */
export const DEFAULT_COUPON_PERCENT = 15;
export const DEFAULT_COUPON_REDEEM_PCT = 40;
export const DEFAULT_LISTED_SELL_THROUGH = 40;
export const DEFAULT_COUPON_SELL_THROUGH = 55;
export const DEFAULT_DROP_SELL_THROUGH = 50;
export const DEFAULT_MONTHLY_COUPON_LISTINGS = 40;

function couponPriceFromPercent(listPrice, couponPercent) {
  return Math.max(0, listPrice * (1 - couponPercent / 100));
}

function couponRow({
  id,
  label,
  price,
  redeemPct,
  sellThroughPct,
  soldExpectedProfit,
  completedProfit,
}) {
  return {
    id,
    label,
    price,
    redeemPct,
    sellThroughPct,
    soldExpectedProfit,
    completedProfit,
    expectedProfit: soldExpectedProfit * (sellThroughPct / 100),
    expectedProfitDelta: 0,
  };
}

/**
 * Same listed SKU, three ways to move one unit: keep Buy It Now,
 * publish a seller coupon so only redeemers pay less, or drop
 * the list so search shows the cheaper price to everyone.
 *
 * This is not a seller-initiated offer (private sent price to
 * watchers, one accept rate). It is not a quantity discount
 * (N units, one box). It is not Promoted Offsite (a campaign
 * billed either way). The listing stays at BIN when the coupon
 * is on; only the redeem share pays the cut. Dropping the list
 * writes the cheaper price into sold comps. Rates are inputs,
 * not eBay coupon policy.
 *
 * Open eBay PRs still own promoted Standard, store, incoming
 * Best Offer, international, Managed Returns, and Top Rated Plus.
 */
export function compareSellerCoupon(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const couponPercent = requiredPercent(
    input.couponPercent,
    'Coupon percent',
    DEFAULT_COUPON_PERCENT,
  );
  const couponRedeemPct = requiredPercent(
    input.couponRedeemPct,
    'Coupon redeem rate',
    DEFAULT_COUPON_REDEEM_PCT,
  );
  const listedSellThroughPct = requiredPercent(
    input.listedSellThroughPct,
    'Listed sell-through',
    DEFAULT_LISTED_SELL_THROUGH,
  );
  const couponSellThroughPct = requiredPercent(
    input.couponSellThroughPct,
    'Coupon sell-through',
    DEFAULT_COUPON_SELL_THROUGH,
  );
  const dropSellThroughPct = requiredPercent(
    input.dropSellThroughPct,
    'Dropped-list sell-through',
    DEFAULT_DROP_SELL_THROUGH,
  );
  const monthlyCouponListings = optionalNumber(
    input.monthlyCouponListings,
    'Monthly coupon listings',
    DEFAULT_MONTHLY_COUPON_LISTINGS,
  );

  const couponPrice = couponPriceFromPercent(listedPrice, couponPercent);
  const listedSold = calculateOrder({ ...input, quantity: 1 });
  const couponSold = calculateOrder({ ...input, quantity: 1, price: couponPrice });
  const redeemRate = couponRedeemPct / 100;
  const couponPacked = couponSold.expectedProfit * redeemRate
    + listedSold.expectedProfit * (1 - redeemRate);
  const couponCompleted = couponSold.profit * redeemRate
    + listedSold.profit * (1 - redeemRate);

  const listed = couponRow({
    id: 'listed',
    label: 'Stay listed at Buy It Now',
    price: listedPrice,
    redeemPct: 0,
    sellThroughPct: listedSellThroughPct,
    soldExpectedProfit: listedSold.expectedProfit,
    completedProfit: listedSold.profit,
  });
  const coupon = couponRow({
    id: 'coupon',
    label: `Add a ${couponPercent}% coupon`,
    price: couponPrice,
    redeemPct: couponRedeemPct,
    sellThroughPct: couponSellThroughPct,
    soldExpectedProfit: couponPacked,
    completedProfit: couponCompleted,
  });
  const drop = couponRow({
    id: 'drop',
    label: `Drop the list ${couponPercent}%`,
    price: couponPrice,
    redeemPct: 100,
    sellThroughPct: dropSellThroughPct,
    soldExpectedProfit: couponSold.expectedProfit,
    completedProfit: couponSold.profit,
  });
  listed.expectedProfitDelta = listed.expectedProfit - coupon.expectedProfit;
  coupon.expectedProfitDelta = coupon.expectedProfit - listed.expectedProfit;
  drop.expectedProfitDelta = drop.expectedProfit - listed.expectedProfit;

  const extraKeptOnCoupon = coupon.expectedProfit - listed.expectedProfit;
  const extraPackedOnCoupon = coupon.soldExpectedProfit - listed.soldExpectedProfit;
  const extraKeptOnDrop = drop.expectedProfit - listed.expectedProfit;
  const extraPackedOnDrop = drop.soldExpectedProfit - listed.soldExpectedProfit;

  const scored = [
    { id: 'listed', value: listed.expectedProfit },
    { id: 'coupon', value: coupon.expectedProfit },
    { id: 'drop', value: drop.expectedProfit },
  ];
  const bestExpected = Math.max(...scored.map((row) => row.value));
  const tied = scored.filter((row) => Math.abs(row.value - bestExpected) <= 1e-9);
  const winner = tied.length > 1 ? 'tie' : tied[0].id;

  const breakEvenCouponSellThroughPct = breakEvenScaledRate(listed.expectedProfit, coupon.soldExpectedProfit);

  const packedGap = listedSold.expectedProfit - couponSold.expectedProfit;
  let breakEvenRedeemPct = Infinity;
  if (Math.abs(packedGap) > 1e-12) {
    const needed = (listed.soldExpectedProfit - listedSold.expectedProfit) / -packedGap;
    // listed leftover minus listed leftover is 0; redeem rate that
    // matches listed leftover is 0. The useful floor is the redeem
    // rate at which coupon leftover * coupon ST still matches listed
    // expected — solved from mix leftover = listed expected / coupon ST.
    const targetPacked = couponSellThroughPct <= 1e-12
      ? Infinity
      : listed.expectedProfit / (couponSellThroughPct / 100);
    const redeemForTarget = (listedSold.expectedProfit - targetPacked) / packedGap;
    breakEvenRedeemPct = redeemForTarget < -1e-9 ? Infinity : redeemForTarget * 100;
  } else if (coupon.expectedProfit >= listed.expectedProfit - 1e-12) {
    breakEvenRedeemPct = 100;
  }

  const atZero = calculateOrder({ ...input, quantity: 1, price: listedPrice }).expectedProfit;
  const atTwenty = calculateOrder({
    ...input,
    quantity: 1,
    price: couponPriceFromPercent(listedPrice, 20),
  }).expectedProfit;
  const packedSlope = (atTwenty - atZero) / 20;
  let breakEvenCouponPercent = Infinity;
  if (Math.abs(packedSlope) > 1e-12 && couponRedeemPct > 1e-12) {
    // Mix leftover at percent p ≈ listed + redeem * (listed + p*slope - listed)
    // = listed + redeem * p * slope. Match listed leftover → p = 0.
    // Match listed expected after coupon ST:
    const targetPacked = couponSellThroughPct <= 1e-12
      ? Infinity
      : listed.expectedProfit / (couponSellThroughPct / 100);
    const needed = (targetPacked - listedSold.expectedProfit)
      / (redeemRate * packedSlope);
    breakEvenCouponPercent = needed < -1e-9 ? Infinity : needed;
  }

  const breakEvenDropSellThroughPct = breakEvenScaledRate(coupon.expectedProfit, drop.soldExpectedProfit);

  return {
    rows: [listed, coupon, drop],
    listed,
    coupon,
    drop,
    winner,
    couponPercent,
    couponRedeemPct,
    couponPrice,
    listedSellThroughPct,
    couponSellThroughPct,
    dropSellThroughPct,
    monthlyCouponListings,
    extraKeptOnCoupon,
    extraPackedOnCoupon,
    extraKeptOnDrop,
    extraPackedOnDrop,
    monthlyExtraOnCoupon: extraKeptOnCoupon * monthlyCouponListings,
    monthlyExtraOnDrop: extraKeptOnDrop * monthlyCouponListings,
    breakEvenCouponSellThroughPct,
    breakEvenRedeemPct,
    breakEvenCouponPercent,
    breakEvenDropSellThroughPct,
    couponPays: extraKeptOnCoupon > 1e-9,
    dropPays: extraKeptOnDrop > 1e-9,
  };
}

export function sellerCouponNote(comparison) {
  if (!comparison?.listed || !comparison?.coupon || !comparison?.drop) {
    throw new Error('Seller-coupon comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { listed, coupon, drop } = comparison;
  const packedGap = money(Math.abs(coupon.soldExpectedProfit - listed.soldExpectedProfit));
  const packedAhead = coupon.soldExpectedProfit >= listed.soldExpectedProfit ? 'more' : 'less';
  const stGap = money(Math.abs(coupon.expectedProfit - listed.expectedProfit));
  const stAhead = coupon.expectedProfit >= listed.expectedProfit ? 'more' : 'less';
  const dropGap = money(Math.abs(drop.expectedProfit - coupon.expectedProfit));
  const dropAhead = drop.expectedProfit >= coupon.expectedProfit ? 'more' : 'less';
  const listedLine = `Staying listed at ${money(listed.price)}, with every sale at Buy It Now, expects ${money(listed.soldExpectedProfit)} after the typed return rate.`;
  const couponLine = ` A ${comparison.couponPercent}% coupon (${money(coupon.price)}) that ${comparison.couponRedeemPct}% of sales redeem expects ${money(coupon.soldExpectedProfit)} leftover — ${packedGap} ${packedAhead}.`;
  const closeLine = ` At ${listed.sellThroughPct}% listed sell-through versus ${coupon.sellThroughPct}% with the coupon badge, listed expects ${money(listed.expectedProfit)} and the coupon expects ${money(coupon.expectedProfit)} — ${stGap} ${stAhead}.`;
  const dropLine = ` Dropping the list to ${money(drop.price)} so everyone pays the cheaper price expects ${money(drop.soldExpectedProfit)} leftover and ${money(drop.expectedProfit)} at ${drop.sellThroughPct}% sell-through — ${dropGap} ${dropAhead} than the coupon after sell-through.`;
  const take = Number.isFinite(comparison.breakEvenCouponSellThroughPct)
    ? ` The coupon has to convert about ${comparison.breakEvenCouponSellThroughPct.toFixed(1)}% of the time before it matches staying listed after sell-through.`
    : ' No finite coupon sell-through can match staying listed when leftover on the mix is $0.00 or less.';
  const dropFloor = Number.isFinite(comparison.breakEvenDropSellThroughPct)
    ? ` Dropping the list has to convert about ${comparison.breakEvenDropSellThroughPct.toFixed(1)}% of the time before it matches the coupon after sell-through.`
    : '';
  return `${listedLine}${couponLine}${closeLine}${dropLine}${take}${dropFloor}`;
}

/**
 * Illustrative immediate-payment extras. 8% unpaid is a typed
 * checkout-that-never-pays share — not scraped from Seller Hub.
 * 55% vs 45% is a 10-point conversion hit when buyers cannot pay
 * later. Twenty minutes at $18 is the unpaid-item case plus
 * relist; $0.35 is a non-store insertion. Forty listings is a
 * placeholder volume, not a forecast.
 */
export const DEFAULT_UNPAID_RATE = 8;
export const DEFAULT_LATER_SELL_THROUGH = 55;
export const DEFAULT_IMMEDIATE_SELL_THROUGH = 45;
export const DEFAULT_UNPAID_RELIST_FEE = 0.35;
export const DEFAULT_UNPAID_MINUTES = 20;
export const DEFAULT_UNPAID_HOURLY_WAGE = 18;
export const DEFAULT_MONTHLY_IMMEDIATE_LISTINGS = 40;

function immediateRow({
  id,
  label,
  unpaidPct,
  sellThroughPct,
  soldExpectedProfit,
  completedProfit,
  timeCost,
  relistFee,
}) {
  return {
    id,
    label,
    unpaidPct,
    sellThroughPct,
    soldExpectedProfit,
    completedProfit,
    timeCost,
    relistFee,
    expectedProfit: soldExpectedProfit * (sellThroughPct / 100),
    expectedProfitDelta: 0,
  };
}

/**
 * Same listed SKU, two ways to take the checkout: allow the buyer
 * to pay later and eat a typed unpaid-item rate, or require
 * immediate payment and take a typed sell-through hit.
 *
 * This is not a seller-initiated offer (a sent price), not a
 * coupon (a public code), not a quantity discount, not Promoted
 * Offsite, and not local pickup (a no-show after they committed
 * to a meetup). An unpaid checkout never ships — cost of goods
 * stays, the outbound label is not bought, and final value fee
 * is treated as refunded. You still pay relist insertion and
 * case time. Immediate payment is modelled as unpaid = 0. Rates
 * are inputs, not eBay unpaid-item policy.
 *
 * Open eBay PRs still own promoted Standard, store, incoming
 * Best Offer, international, Managed Returns, and Top Rated Plus.
 */
export function compareImmediatePayment(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const unpaidRatePercent = requiredPercent(
    input.unpaidRatePercent,
    'Unpaid checkout rate',
    DEFAULT_UNPAID_RATE,
  );
  const laterSellThroughPct = requiredPercent(
    input.laterSellThroughPct,
    'Later-pay sell-through',
    DEFAULT_LATER_SELL_THROUGH,
  );
  const immediateSellThroughPct = requiredPercent(
    input.immediateSellThroughPct,
    'Immediate-pay sell-through',
    DEFAULT_IMMEDIATE_SELL_THROUGH,
  );
  const unpaidRelistFee = optionalNumber(
    input.unpaidRelistFee,
    'Unpaid relist fee',
    DEFAULT_UNPAID_RELIST_FEE,
  );
  const unpaidMinutes = optionalNumber(
    input.unpaidMinutes,
    'Unpaid case minutes',
    DEFAULT_UNPAID_MINUTES,
  );
  const unpaidHourlyWage = optionalNumber(
    input.unpaidHourlyWage,
    'Unpaid hourly wage',
    DEFAULT_UNPAID_HOURLY_WAGE,
  );
  const monthlyImmediateListings = optionalNumber(
    input.monthlyImmediateListings,
    'Monthly immediate-payment listings',
    DEFAULT_MONTHLY_IMMEDIATE_LISTINGS,
  );

  const paid = calculateOrder({ ...input, quantity: 1 });
  const timeCost = (unpaidMinutes / 60) * unpaidHourlyWage;
  const unpaidOutcome = -(unpaidRelistFee + timeCost);
  const unpaidRate = unpaidRatePercent / 100;
  const laterPacked = (1 - unpaidRate) * paid.expectedProfit + unpaidRate * unpaidOutcome;

  const later = immediateRow({
    id: 'later',
    label: 'Allow checkout later',
    unpaidPct: unpaidRatePercent,
    sellThroughPct: laterSellThroughPct,
    soldExpectedProfit: laterPacked,
    completedProfit: paid.profit,
    timeCost,
    relistFee: unpaidRelistFee,
  });
  const immediate = immediateRow({
    id: 'immediate',
    label: 'Require immediate payment',
    unpaidPct: 0,
    sellThroughPct: immediateSellThroughPct,
    soldExpectedProfit: paid.expectedProfit,
    completedProfit: paid.profit,
    timeCost: 0,
    relistFee: 0,
  });
  later.expectedProfitDelta = later.expectedProfit - immediate.expectedProfit;
  immediate.expectedProfitDelta = immediate.expectedProfit - later.expectedProfit;

  const extraKeptOnImmediate = immediate.expectedProfit - later.expectedProfit;
  const extraPackedOnImmediate = immediate.soldExpectedProfit - later.soldExpectedProfit;

  const winner = extraKeptOnImmediate > 1e-9
    ? 'immediate'
    : extraKeptOnImmediate < -1e-9
      ? 'later'
      : 'tie';

  let breakEvenUnpaidRate = Infinity;
  if (laterSellThroughPct <= 1e-12) {
    breakEvenUnpaidRate = laterPacked >= immediate.expectedProfit - 1e-12 ? 0 : Infinity;
  } else {
    const targetPacked = immediate.expectedProfit / (laterSellThroughPct / 100);
    const gap = paid.expectedProfit - unpaidOutcome;
    if (Math.abs(gap) <= 1e-12) {
      breakEvenUnpaidRate = laterPacked >= targetPacked - 1e-12 ? 0 : Infinity;
    } else {
      const needed = (paid.expectedProfit - targetPacked) / gap;
      breakEvenUnpaidRate = needed < -1e-9 ? Infinity : needed * 100;
    }
  }

  const breakEvenImmediateSellThroughPct = breakEvenScaledRate(later.expectedProfit, paid.expectedProfit);

  return {
    rows: [later, immediate],
    later,
    immediate,
    winner,
    unpaidRatePercent,
    laterSellThroughPct,
    immediateSellThroughPct,
    unpaidRelistFee,
    unpaidMinutes,
    unpaidHourlyWage,
    timeCost,
    unpaidOutcome,
    monthlyImmediateListings,
    extraKeptOnImmediate,
    extraPackedOnImmediate,
    monthlyExtraOnImmediate: extraKeptOnImmediate * monthlyImmediateListings,
    breakEvenUnpaidRate,
    breakEvenImmediateSellThroughPct,
    immediatePays: extraKeptOnImmediate > 1e-9,
  };
}

export function immediatePaymentNote(comparison) {
  if (!comparison?.later || !comparison?.immediate) {
    throw new Error('Immediate-payment comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { later, immediate } = comparison;
  const packedGap = money(Math.abs(immediate.soldExpectedProfit - later.soldExpectedProfit));
  const packedAhead = immediate.soldExpectedProfit >= later.soldExpectedProfit ? 'more' : 'less';
  const stGap = money(Math.abs(immediate.expectedProfit - later.expectedProfit));
  const stAhead = immediate.expectedProfit >= later.expectedProfit ? 'more' : 'less';
  const laterLine = `Allowing checkout later, with ${comparison.unpaidRatePercent}% of started checkouts never paying, expects ${money(later.soldExpectedProfit)} leftover after the typed return rate on the paid share and ${money(comparison.unpaidOutcome)} on each unpaid case (${money(comparison.unpaidRelistFee)} relist plus ${money(comparison.timeCost)} of case time).`;
  const immediateLine = ` Requiring immediate payment, with unpaid treated as 0%, expects ${money(immediate.soldExpectedProfit)} leftover — ${packedGap} ${packedAhead}.`;
  const closeLine = ` At ${later.sellThroughPct}% later-pay sell-through versus ${immediate.sellThroughPct}% when they must pay now, later expects ${money(later.expectedProfit)} and immediate payment expects ${money(immediate.expectedProfit)} — ${stGap} ${stAhead}.`;
  const unpaidFloor = Number.isFinite(comparison.breakEvenUnpaidRate)
    ? ` Unpaid checkouts have to reach about ${comparison.breakEvenUnpaidRate.toFixed(1)}% before requiring immediate payment matches allowing later checkout after sell-through.`
    : ' No finite unpaid rate can make requiring immediate payment match later checkout when leftover on a paid sale is $0.00 or less.';
  const stFloor = Number.isFinite(comparison.breakEvenImmediateSellThroughPct)
    ? ` Immediate payment has to convert about ${comparison.breakEvenImmediateSellThroughPct.toFixed(1)}% of the time before it matches allowing later checkout after sell-through.`
    : '';
  return `${laterLine}${immediateLine}${closeLine}${unpaidFloor}${stFloor}`;
}

/**
 * Illustrative Top Rated Plus defaults. A 10% final-value discount
 * looks like free money on a $40 listing — until seller-paid
 * return labels, a doubled return rate, and 1-day handling wipe
 * the fee save. Discount, rates, and handling minutes are inputs,
 * not eBay's live Top Rated schedule.
 */
export const DEFAULT_TRS_DISCOUNT_PCT = 10;
export const DEFAULT_STANDARD_SELL_THROUGH = 60;
export const DEFAULT_TRS_SELL_THROUGH = 75;
export const DEFAULT_STANDARD_RETURN_RATE = 8;
export const DEFAULT_TRS_RETURN_RATE = 16;
export const DEFAULT_STANDARD_RETURN_SHIPPING = 0;
export const DEFAULT_TRS_RETURN_SHIPPING = 5;
export const DEFAULT_TRS_HANDLING_MINUTES = 8;
export const DEFAULT_TRS_HANDLING_WAGE = 18;
export const DEFAULT_MONTHLY_TRS_LISTINGS = 40;

function topRatedRow({
  id,
  label,
  sellThroughPct,
  returnRatePercent,
  returnShippingCost,
  finalValueRate,
  handlingCost,
  soldExpectedProfit,
  completedProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    sellThroughPct,
    returnRatePercent,
    returnShippingCost,
    finalValueRate,
    handlingCost,
    soldExpectedProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same SKU, listed under a standard return policy or as Top Rated
 * Plus style: seller-paid returns, faster handling, a typed
 * final-value discount, and a badge sell-through lift.
 *
 *   - Stay standard — typed standard return rate and return postage
 *     (defaults: buyer pays the label). Full final-value rate. No
 *     extra 1-day handling time.
 *   - Top Rated Plus — final-value rate reduced by the typed
 *     discount, seller-paid return labels, a higher return rate,
 *     extra handling minutes on every sale, and a higher
 *     sell-through from the badge.
 *
 * Expected listing profit is completed-sale expected profit times
 * sell-through, minus handling paid on the sales you actually pack.
 * Complementary to the return-*rate* mix (one postage), partial vs
 * take-the-return (one case), Standard Envelope (claim vs return),
 * local pickup (no shipping), and seller coupon (public code).
 * Complementary to Managed Returns (who buys the label). Open
 * eBay PRs still own Promoted Listings Standard rate, store,
 * Best Offer, and international. Discount and rates are inputs,
 * not eBay Top Rated policy.
 */
export function compareTopRatedPlus(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const discountPct = requiredPercent(
    input.trsDiscountPct,
    'Top Rated final-value discount',
    DEFAULT_TRS_DISCOUNT_PCT,
  );
  const standardSellThrough = requiredPercent(
    input.standardSellThroughPct,
    'Standard sell-through',
    DEFAULT_STANDARD_SELL_THROUGH,
  );
  const trsSellThrough = requiredPercent(
    input.trsSellThroughPct,
    'Top Rated sell-through',
    DEFAULT_TRS_SELL_THROUGH,
  );
  const standardReturnRate = requiredPercent(
    input.standardReturnRatePercent,
    'Standard return rate',
    DEFAULT_STANDARD_RETURN_RATE,
  );
  const trsReturnRate = requiredPercent(
    input.trsReturnRatePercent,
    'Top Rated return rate',
    DEFAULT_TRS_RETURN_RATE,
  );
  const standardReturnShip = optionalNumber(
    input.standardReturnShippingCost,
    'Standard return shipping',
    DEFAULT_STANDARD_RETURN_SHIPPING,
  );
  const trsReturnShip = optionalNumber(
    input.trsReturnShippingCost,
    'Top Rated return shipping',
    DEFAULT_TRS_RETURN_SHIPPING,
  );
  const minutes = optionalNumber(
    input.trsHandlingMinutes,
    'Top Rated handling minutes',
    DEFAULT_TRS_HANDLING_MINUTES,
  );
  const wage = optionalNumber(
    input.trsHandlingWage,
    'Top Rated handling wage',
    DEFAULT_TRS_HANDLING_WAGE,
  );
  const monthlyListings = optionalNumber(
    input.monthlyTrsListings,
    'Monthly Top Rated listings',
    DEFAULT_MONTHLY_TRS_LISTINGS,
  );

  const listedFvf = optionalNumber(input.finalValueRate, 'Final value fee rate', 13.6);
  const discountedFvf = listedFvf * (1 - discountPct / 100);
  const handlingCost = (minutes / 60) * wage;

  const standardSold = calculateOrder({
    ...input,
    returnRatePercent: standardReturnRate,
    returnShippingCost: standardReturnShip,
  });
  const trsSold = calculateOrder({
    ...input,
    finalValueRate: discountedFvf,
    returnRatePercent: trsReturnRate,
    returnShippingCost: trsReturnShip,
  });

  const standardExpected = standardSold.expectedProfit * (standardSellThrough / 100);
  const trsExpected = (trsSold.expectedProfit - handlingCost) * (trsSellThrough / 100);

  const standard = topRatedRow({
    id: 'standard',
    label: 'Stay standard',
    sellThroughPct: standardSellThrough,
    returnRatePercent: standardReturnRate,
    returnShippingCost: standardReturnShip,
    finalValueRate: listedFvf,
    handlingCost: 0,
    soldExpectedProfit: standardSold.expectedProfit,
    completedProfit: standardSold.profit,
    expectedProfit: standardExpected,
  });
  const topRated = topRatedRow({
    id: 'topRated',
    label: 'Top Rated Plus',
    sellThroughPct: trsSellThrough,
    returnRatePercent: trsReturnRate,
    returnShippingCost: trsReturnShip,
    finalValueRate: discountedFvf,
    handlingCost,
    soldExpectedProfit: trsSold.expectedProfit,
    completedProfit: trsSold.profit,
    expectedProfit: trsExpected,
  });
  standard.expectedProfitDelta = standard.expectedProfit - topRated.expectedProfit;
  topRated.expectedProfitDelta = topRated.expectedProfit - standard.expectedProfit;

  const winner = topRated.expectedProfit > standard.expectedProfit + 1e-9
    ? 'topRated'
    : topRated.expectedProfit < standard.expectedProfit - 1e-9
      ? 'standard'
      : 'tie';

  let breakEvenTrsSellThrough = Infinity;
  const trsPerSale = trsSold.expectedProfit - handlingCost;
  if (trsPerSale > 1e-12) {
    const needed = standard.expectedProfit / trsPerSale * 100;
    breakEvenTrsSellThrough = needed > 100 + 1e-9 ? Infinity : Math.max(0, needed);
  }

  let breakEvenTrsReturnRate = Infinity;
  const trsStFrac = trsSellThrough / 100;
  if (trsStFrac > 1e-12) {
    const targetSold = standard.expectedProfit / trsStFrac + handlingCost;
    const gap = trsSold.profit - trsSold.returnProfit;
    if (Math.abs(gap) > 1e-12) {
      const needed = (trsSold.profit - targetSold) / gap * 100;
      breakEvenTrsReturnRate = needed < -1e-9 || needed > 100 + 1e-9
        ? Infinity
        : Math.max(0, Math.min(100, needed));
    }
  }

  const fvfSave = standardSold.fees.finalValue - trsSold.fees.finalValue;

  return {
    rows: [standard, topRated],
    standard,
    topRated,
    winner,
    discountPct,
    discountedFvf,
    handlingCost,
    fvfSave,
    monthlyListings,
    extraKeptOnTopRated: topRated.expectedProfit - standard.expectedProfit,
    monthlyExtraOnTopRated: (topRated.expectedProfit - standard.expectedProfit) * monthlyListings,
    breakEvenTrsSellThrough,
    breakEvenTrsReturnRate,
    standardCompletedProfit: standardSold.profit,
    topRatedCompletedProfit: trsSold.profit,
  };
}

export function topRatedPlusNote(comparison) {
  if (!comparison?.standard || !comparison?.topRated) {
    throw new Error('Top Rated Plus comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { standard, topRated } = comparison;
  const gap = money(Math.abs(topRated.expectedProfit - standard.expectedProfit));
  const ahead = topRated.expectedProfit >= standard.expectedProfit ? 'more' : 'less';
  const standardLine = `Staying standard at ${standard.sellThroughPct}% sell-through and a ${standard.returnRatePercent}% return rate, with ${money(standard.returnShippingCost)} return postage, expects ${money(standard.expectedProfit)}.`;
  const trsLine = `Top Rated Plus at a ${comparison.discountPct}% final-value discount, ${topRated.sellThroughPct}% sell-through, a ${topRated.returnRatePercent}% return rate, ${money(topRated.returnShippingCost)} seller-paid return postage, and ${money(comparison.handlingCost)} of 1-day handling expects ${money(topRated.expectedProfit)} — ${gap} ${ahead}.`;
  const ceiling = Number.isFinite(comparison.breakEvenTrsReturnRate)
    ? ` Free returns can rise to about ${comparison.breakEvenTrsReturnRate.toFixed(1)}% before Top Rated Plus matches staying standard.`
    : ' No free-return rate on these sell-throughs can match staying standard.';
  return `${standardLine} ${trsLine}${ceiling}`;
}

/**
 * Illustrative Managed Returns defaults. Per-return program fee and the
 * two return rates are inputs — not eBay's current Managed Returns
 * schedule. $8 self-label / $5.50 program fee / 10% vs 14% vs 6% is a
 * clothing-adjacent mix a seller overwrites from their last month.
 */
export const DEFAULT_SELF_RETURN_LABEL = 8;
export const DEFAULT_SELF_RETURN_RATE = 10;
export const DEFAULT_MANAGED_RETURN_FEE = 5.5;
export const DEFAULT_MANAGED_RETURN_RATE = 14;
export const DEFAULT_BUYER_PAYS_RETURN_RATE = 6;
export const DEFAULT_MONTHLY_MANAGED_LISTINGS = 40;

function firstPresent(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return undefined;
}

/**
 * Same SKU, three ways to handle the return label.
 *
 *   - Self-label — you buy the typed return postage at the typed
 *     self-return rate. Dedicated fields keep the headline
 *     return-rate mix untouched; the sibling page can still pass
 *     returnShippingCost / returnRatePercent.
 *   - Managed Returns — eBay's per-return program fee replaces your
 *     label. The return rate is often higher because the buyer path
 *     is easier.
 *   - Buyer pays return shipping — no label cost, lower return rate
 *     from the extra friction.
 *
 * Complementary to the return-*rate* mix (one postage, one rate),
 * partial vs take-the-return (one case), and Top Rated Plus (fee
 * discount vs free returns). Rates and the program fee are inputs,
 * not eBay Managed Returns policy.
 */
export function compareManagedReturns(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const selfLabel = optionalNumber(
    firstPresent(input.selfReturnShippingCost, input.returnShippingCost),
    'Self-return shipping',
    DEFAULT_SELF_RETURN_LABEL,
  );
  const selfRate = requiredPercent(
    firstPresent(input.selfReturnRatePercent, input.returnRatePercent),
    'Self-return rate',
    DEFAULT_SELF_RETURN_RATE,
  );
  const managedFee = optionalNumber(input.managedReturnFee, 'Managed Returns fee', DEFAULT_MANAGED_RETURN_FEE);
  const managedRate = requiredPercent(
    input.managedReturnRatePercent,
    'Managed Returns rate',
    DEFAULT_MANAGED_RETURN_RATE,
  );
  const buyerRate = requiredPercent(
    input.buyerPaysReturnRatePercent,
    'Buyer-pays return rate',
    DEFAULT_BUYER_PAYS_RETURN_RATE,
  );
  const monthlyListings = optionalNumber(
    input.monthlyManagedListings,
    'Monthly listings',
    DEFAULT_MONTHLY_MANAGED_LISTINGS,
  );
  if (monthlyListings === 0) throw new Error('Monthly listings must be greater than zero');

  const selfOrder = calculateOrder({
    ...input,
    returnShippingCost: selfLabel,
    returnRatePercent: selfRate,
  });
  const managedOrder = calculateOrder({
    ...input,
    returnShippingCost: managedFee,
    returnRatePercent: managedRate,
  });
  const buyerOrder = calculateOrder({
    ...input,
    returnShippingCost: 0,
    returnRatePercent: buyerRate,
  });

  const self = {
    id: 'self',
    label: 'Buy the return label yourself',
    returnCost: selfLabel,
    returnRatePercent: selfRate,
    returnProfit: selfOrder.returnProfit,
    expectedProfit: selfOrder.expectedProfit,
  };
  const managed = {
    id: 'managed',
    label: 'eBay Managed Returns',
    returnCost: managedFee,
    returnRatePercent: managedRate,
    returnProfit: managedOrder.returnProfit,
    expectedProfit: managedOrder.expectedProfit,
  };
  const buyerPays = {
    id: 'buyer_pays',
    label: 'Buyer pays return shipping',
    returnCost: 0,
    returnRatePercent: buyerRate,
    returnProfit: buyerOrder.returnProfit,
    expectedProfit: buyerOrder.expectedProfit,
  };

  const extraKeptOnManaged = managed.expectedProfit - self.expectedProfit;
  const extraKeptOnBuyerPays = buyerPays.expectedProfit - self.expectedProfit;
  const rows = [self, managed, buyerPays].map((row) => ({
    ...row,
    vsSelf: row.expectedProfit - self.expectedProfit,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.expectedProfit));
  const leaders = rows.filter((row) => Math.abs(row.expectedProfit - maxProfit) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : 'tie';

  const completedProfit = selfOrder.profit;
  const selfGap = completedProfit - self.returnProfit;
  const managedGap = completedProfit - managed.returnProfit;
  let breakEvenManagedRate = Infinity;
  if (managedGap > 1e-12) {
    breakEvenManagedRate = Math.min(100, (selfRate / 100) * selfGap / managedGap * 100);
  }
  let breakEvenManagedFee = Infinity;
  const outboundSunk = (Number(input.shippingCost ?? 0) + Number(input.packagingCost ?? 0) + Number(input.otherCost ?? 0))
    * (Number(input.quantity ?? 1));
  const unrefundedFees = selfOrder.feeTotal * (1 - selfOrder.feeRefundOnReturnPercent / 100);
  const managedBlend = managedRate / 100;
  if (managedBlend > 1e-12) {
    const targetReturnProfit = (self.expectedProfit - (1 - managedBlend) * completedProfit) / managedBlend;
    breakEvenManagedFee = -targetReturnProfit - outboundSunk - unrefundedFees;
    if (breakEvenManagedFee < 0) breakEvenManagedFee = -Infinity;
  }

  return {
    rows,
    self: rows[0],
    managed: rows[1],
    buyerPays: rows[2],
    completedProfit,
    selfLabel,
    managedFee,
    extraKeptOnManaged,
    extraKeptOnBuyerPays,
    monthlyExtraOnManaged: extraKeptOnManaged * monthlyListings,
    monthlyExtraOnBuyerPays: extraKeptOnBuyerPays * monthlyListings,
    monthlyListings,
    breakEvenManagedRate,
    breakEvenManagedFee,
    winner,
    summary: managedReturnsNote({
      winner,
      extraKeptOnManaged,
      extraKeptOnBuyerPays,
      breakEvenManagedRate,
      managedFee,
      selfLabel,
    }),
  };
}

export function managedReturnsNote(comparison) {
  if (!comparison || comparison.extraKeptOnManaged === undefined) {
    throw new Error('Managed Returns comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const {
    winner,
    extraKeptOnManaged,
    extraKeptOnBuyerPays,
    breakEvenManagedRate,
    managedFee,
    selfLabel,
  } = comparison;
  const managedGap = money(Math.abs(extraKeptOnManaged));
  const managedAhead = extraKeptOnManaged >= 0 ? 'more' : 'less';
  const feeLine = `Managed Returns at ${money(managedFee)} keeps ${managedGap} ${managedAhead} than buying the ${money(selfLabel)} label yourself.`;
  const floor = Number.isFinite(breakEvenManagedRate)
    ? ` The program still ties your own label as long as the Managed Returns rate stays near ${breakEvenManagedRate.toFixed(1)}%.`
    : ' No Managed Returns rate on these fees can match buying the label yourself.';
  const buyer = ` Buyer-paid return shipping keeps ${money(Math.abs(extraKeptOnBuyerPays))} ${extraKeptOnBuyerPays >= 0 ? 'more' : 'less'}.`;
  if (winner === 'tie') {
    return `Managed Returns and your own label leave the same expected profit on these rates.${buyer}`;
  }
  return `${feeLine}${floor}${buyer}`;
}

/**
 * Illustrative Global Shipping Program defaults. A $40 listing that
 * already ships domestically for $6/$5 still usually keeps more
 * leftover through the hub than buying an $18 international label,
 * even after GSP sticker-shock sell-through. Postage, the extra
 * international fee, and the claim rate are inputs, not eBay
 * invoice policy.
 */
export const DEFAULT_GSP_RETURN_RATE = 6;
export const DEFAULT_GSP_SELL_THROUGH = 40;
export const DEFAULT_SELF_SHIP_SHIPPING_CHARGED = 22;
export const DEFAULT_SELF_SHIP_SHIPPING_COST = 18;
export const DEFAULT_SELF_SHIP_RETURN_SHIPPING_COST = 18;
export const DEFAULT_SELF_SHIP_INTL_FEE_RATE = 1.65;
export const DEFAULT_SELF_SHIP_RETURN_RATE = 10;
export const DEFAULT_SELF_SHIP_CLAIM_RATE = 8;
export const DEFAULT_SELF_SHIP_SELL_THROUGH = 55;
export const DEFAULT_MONTHLY_GSP_LISTINGS = 20;

function globalShippingRow({
  id,
  label,
  sellThroughPct,
  shippingCharged,
  postageAndPack,
  intlFeeRate,
  lossRatePercent,
  lossKind,
  soldExpectedProfit,
  completedProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    sellThroughPct,
    shippingCharged,
    postageAndPack,
    intlFeeRate,
    lossRatePercent,
    lossKind,
    soldExpectedProfit,
    completedProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same listed SKU, one international buyer, two ways to get the
 * box there: enable Global Shipping Program and ship to the US
 * hub, or collect international postage and buy the label yourself.
 *
 *   - GSP — seller revenue stays item + the domestic shipping they
 *     already charge. Buyer pays the GSP international bill to
 *     eBay, not to you. You buy a domestic hub label. The extra
 *     international fee is treated as 0% because the sale is
 *     handed to a US hub. After intake, lost-in-transit claims are
 *     GSP's. You still take a typed GSP return rate.
 *   - You-ship — you collect international postage, pay the
 *     international label, and take the typed extra international
 *     fee. A typed claim rate is an item-not-received or customs
 *     loss: cost of goods and postage stay gone. That is not a
 *     return (the item does not come back).
 *
 * This is not "should I offer international at all"
 * (compareInternational — domestic vs worldwide at this list
 * price). That question is whether turning worldwide on still
 * leaves a profit. This table assumes an international buyer
 * already wants the item. Not Standard Envelope (domestic cheap
 * postage vs a claim), not combined shipping, and not
 * Authenticity Guarantee (a hub label for authentication).
 * Rates and postage are inputs, not eBay's live GSP schedule.
 */
export function compareGlobalShipping(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const gspReturnRate = requiredPercent(
    input.gspReturnRatePercent,
    'GSP return rate',
    DEFAULT_GSP_RETURN_RATE,
  );
  const gspSellThrough = requiredPercent(
    input.gspSellThroughPct,
    'GSP sell-through',
    DEFAULT_GSP_SELL_THROUGH,
  );
  const selfShipCharged = optionalNumber(
    input.selfShipShippingCharged,
    'Self-ship shipping charged',
    DEFAULT_SELF_SHIP_SHIPPING_CHARGED,
  );
  const selfShipCost = optionalNumber(
    input.selfShipShippingCost,
    'Self-ship shipping cost',
    DEFAULT_SELF_SHIP_SHIPPING_COST,
  );
  const selfShipReturnCost = optionalNumber(
    input.selfShipReturnShippingCost,
    'Self-ship return shipping',
    DEFAULT_SELF_SHIP_RETURN_SHIPPING_COST,
  );
  const selfShipIntlFee = requiredPercent(
    input.selfShipIntlFeeRate,
    'Self-ship international fee',
    DEFAULT_SELF_SHIP_INTL_FEE_RATE,
  );
  const selfShipReturnRate = requiredPercent(
    input.selfShipReturnRatePercent,
    'Self-ship return rate',
    DEFAULT_SELF_SHIP_RETURN_RATE,
  );
  const selfShipClaimRate = requiredPercent(
    input.selfShipClaimRatePercent,
    'Self-ship claim rate',
    DEFAULT_SELF_SHIP_CLAIM_RATE,
  );
  const selfShipSellThrough = requiredPercent(
    input.selfShipSellThroughPct,
    'Self-ship sell-through',
    DEFAULT_SELF_SHIP_SELL_THROUGH,
  );
  const monthlyListings = optionalNumber(
    input.monthlyGspListings,
    'Monthly international listings',
    DEFAULT_MONTHLY_GSP_LISTINGS,
  );

  const packagingCost = optionalNumber(input.packagingCost, 'Packaging cost', 0);
  const costOfGoods = optionalNumber(input.costOfGoods, 'Cost of goods', 0);
  const otherCost = optionalNumber(input.otherCost, 'Other cost', 0);
  const gspShippingCharged = optionalNumber(input.shippingCharged, 'Shipping charged', 0);
  const gspShippingCost = optionalNumber(input.shippingCost, 'Shipping cost', 0);
  const feeRefundOnReturn = requiredPercent(
    input.feeRefundOnReturnPercent,
    'Fee refund on return',
    100,
  );

  const gspSold = calculateOrder({
    ...input,
    intlFeeRate: 0,
    returnRatePercent: gspReturnRate,
  });
  const selfSold = calculateOrder({
    ...input,
    shippingCharged: selfShipCharged,
    shippingCost: selfShipCost,
    returnShippingCost: selfShipReturnCost,
    intlFeeRate: selfShipIntlFee,
    returnRatePercent: selfShipReturnRate,
  });

  const quantity = selfSold.quantity;
  const sunkOnClaim = (costOfGoods + selfShipCost + packagingCost + otherCost) * quantity;
  const unrefundedFees = selfSold.feeTotal * (1 - feeRefundOnReturn / 100);
  const claimProfit = -sunkOnClaim - unrefundedFees;
  const claimRateFrac = selfShipClaimRate / 100;
  const selfAfterClaims = (1 - claimRateFrac) * selfSold.expectedProfit + claimRateFrac * claimProfit;

  const gspPostage = (gspShippingCost + packagingCost) * gspSold.quantity;
  const selfPostage = (selfShipCost + packagingCost) * quantity;

  const gsp = globalShippingRow({
    id: 'gsp',
    label: 'Global Shipping Program',
    sellThroughPct: gspSellThrough,
    shippingCharged: gspShippingCharged,
    postageAndPack: gspPostage,
    intlFeeRate: 0,
    lossRatePercent: gspReturnRate,
    lossKind: 'return',
    soldExpectedProfit: gspSold.expectedProfit,
    completedProfit: gspSold.profit,
    expectedProfit: gspSold.expectedProfit * (gspSellThrough / 100),
  });
  const selfShip = globalShippingRow({
    id: 'self-ship',
    label: 'You ship internationally',
    sellThroughPct: selfShipSellThrough,
    shippingCharged: selfShipCharged,
    postageAndPack: selfPostage,
    intlFeeRate: selfShipIntlFee,
    lossRatePercent: selfShipClaimRate,
    lossKind: 'claim',
    soldExpectedProfit: selfAfterClaims,
    completedProfit: selfSold.profit,
    expectedProfit: selfAfterClaims * (selfShipSellThrough / 100),
  });
  gsp.expectedProfitDelta = gsp.expectedProfit - selfShip.expectedProfit;
  selfShip.expectedProfitDelta = selfShip.expectedProfit - gsp.expectedProfit;

  const extraKeptOnGsp = gsp.expectedProfit - selfShip.expectedProfit;
  const winner = extraKeptOnGsp > 1e-9
    ? 'gsp'
    : extraKeptOnGsp < -1e-9
      ? 'self-ship'
      : 'tie';

  const profitClaimGap = selfSold.expectedProfit - claimProfit;
  let breakEvenClaimRate = Infinity;
  if (selfShipSellThrough > 1e-12 && profitClaimGap > 1e-12) {
    const neededPacked = gsp.expectedProfit / (selfShipSellThrough / 100);
    const rate = (selfSold.expectedProfit - neededPacked) / profitClaimGap * 100;
    breakEvenClaimRate = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  const breakEvenSelfShipSellThroughPct = breakEvenScaledRate(gsp.expectedProfit, selfAfterClaims);

  const selfAtPostage = (shippingCost) => {
    const sold = calculateOrder({
      ...input,
      shippingCharged: selfShipCharged,
      shippingCost,
      returnShippingCost: selfShipReturnCost,
      intlFeeRate: selfShipIntlFee,
      returnRatePercent: selfShipReturnRate,
    });
    const sunk = (costOfGoods + shippingCost + packagingCost + otherCost) * quantity;
    const unrefunded = sold.feeTotal * (1 - feeRefundOnReturn / 100);
    const claim = -sunk - unrefunded;
    const afterClaims = (1 - claimRateFrac) * sold.expectedProfit + claimRateFrac * claim;
    return afterClaims * (selfShipSellThrough / 100);
  };
  const atZeroPostage = selfAtPostage(0);
  const atTenPostage = selfAtPostage(10);
  const postageSlope = (atTenPostage - atZeroPostage) / 10;
  let breakEvenSelfShipPostage = Infinity;
  if (Math.abs(postageSlope) > 1e-12) {
    const neededPostage = (gsp.expectedProfit - atZeroPostage) / postageSlope;
    breakEvenSelfShipPostage = neededPostage < -1e-9 ? Infinity : neededPostage;
  }

  return {
    rows: [gsp, selfShip],
    gsp,
    selfShip,
    winner,
    gspReturnRate,
    gspSellThrough,
    selfShipCharged,
    selfShipCost,
    selfShipReturnCost,
    selfShipIntlFee,
    selfShipReturnRate,
    selfShipClaimRate,
    selfShipSellThrough,
    claimProfit,
    monthlyListings,
    extraKeptOnGsp,
    extraPackedOnGsp: gsp.soldExpectedProfit - selfShip.soldExpectedProfit,
    monthlyExtraOnGsp: extraKeptOnGsp * monthlyListings,
    breakEvenClaimRate,
    breakEvenSelfShipSellThroughPct,
    breakEvenSelfShipPostage,
    gspCompletedProfit: gspSold.profit,
    selfShipCompletedProfit: selfSold.profit,
    gspPays: extraKeptOnGsp > 1e-9,
  };
}

export function globalShippingNote(comparison) {
  if (!comparison?.gsp || !comparison?.selfShip) {
    throw new Error('Global Shipping comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { gsp, selfShip } = comparison;
  const packedGap = money(Math.abs(gsp.soldExpectedProfit - selfShip.soldExpectedProfit));
  const packedAhead = gsp.soldExpectedProfit >= selfShip.soldExpectedProfit ? 'more' : 'less';
  const stGap = money(Math.abs(gsp.expectedProfit - selfShip.expectedProfit));
  const stAhead = gsp.expectedProfit >= selfShip.expectedProfit ? 'more' : 'less';
  const gspLine = `Global Shipping Program, shipping to the hub at ${money(gsp.postageAndPack)} postage and pack with a ${gsp.lossRatePercent}% return rate, expects ${money(gsp.soldExpectedProfit)} leftover after returns.`;
  const selfLine = ` You-ship, collecting ${money(selfShip.shippingCharged)} postage, paying ${money(selfShip.postageAndPack)} for the international label and pack, a ${comparison.selfShipIntlFee}% international fee, a ${comparison.selfShipReturnRate}% return rate, and an ${selfShip.lossRatePercent}% item-not-received claim rate, expects ${money(selfShip.soldExpectedProfit)} leftover — ${packedGap} ${packedAhead} on a completed international sale.`;
  const closeLine = ` At ${gsp.sellThroughPct}% GSP sell-through versus ${selfShip.sellThroughPct}% when you set your own international rate, GSP expects ${money(gsp.expectedProfit)} and you-ship expects ${money(selfShip.expectedProfit)} — ${stGap} ${stAhead}.`;
  const claim = Number.isFinite(comparison.breakEvenClaimRate)
    ? ` Claims have to stay at about ${comparison.breakEvenClaimRate.toFixed(1)}% before you-ship matches GSP after sell-through.`
    : ' No claim rate on these postage figures can make you-ship match GSP after sell-through.';
  const stFloor = Number.isFinite(comparison.breakEvenSelfShipSellThroughPct)
    ? ` You-ship has to convert about ${comparison.breakEvenSelfShipSellThroughPct.toFixed(1)}% of the time before it matches GSP after sell-through.`
    : '';
  return `${gspLine}${selfLine}${closeLine}${claim}${stFloor}`;
}

/**
 * Illustrative store-subscription assumptions. Monthly fee and the
 * final-value rate each tier unlocks are inputs — not eBay's current
 * published store prices. $7.95 / 12.95%, $27.95 / 12.55%, $74.95 /
 * 11.85% is a Starter / Basic / Premium-shaped mix a seller overwrites
 * from their own invoice.
 */
export const STORE_TIER_PRESETS = [
  { id: 'starter', label: 'Starter (example)', monthlyFee: 7.95, finalValueRate: 12.95 },
  { id: 'basic', label: 'Basic (example)', monthlyFee: 27.95, finalValueRate: 12.55 },
  { id: 'premium', label: 'Premium (example)', monthlyFee: 74.95, finalValueRate: 11.85 },
];
export const DEFAULT_MONTHLY_STORE_ORDERS = 40;
export const DEFAULT_MONTHLY_STORE_FEE = 0;

/**
 * Orders needed at this order's revenue for a cheaper final-value
 * rate to cover the extra monthly subscription. Infinity when the
 * store rate is not cheaper — paying more per order never recovers
 * a subscription.
 */
export function storeBreakEvenOrders({
  revenue,
  currentFinalValueRate,
  storeFinalValueRate,
  monthlyFee,
}) {
  const orderRevenue = optionalNumber(revenue, 'Order revenue', 0);
  const currentRate = optionalNumber(currentFinalValueRate, 'Current final value fee rate', 0);
  const storeRate = optionalNumber(storeFinalValueRate, 'Store final value fee rate', 0);
  const fee = optionalNumber(monthlyFee, 'Store monthly fee', 0);
  const savingsPerOrder = orderRevenue * (currentRate - storeRate) / 100;
  if (savingsPerOrder <= 1e-12) return Infinity;
  return fee / savingsPerOrder;
}

/**
 * Same SKU, the typed final-value rate versus example store tiers.
 *
 *   - No store / current rate — the headline final-value percent
 *     minus any subscription the seller already pays.
 *   - Starter / Basic / Premium — that same order at the example
 *     store rate, then the monthly subscription is taken out of
 *     monthly leftover. The subscription stays off per-order
 *     invested cash so ROI on one sale stays honest.
 *
 * Complementary to Promoted Listings (a percent of a completed
 * sale) and Top Rated Plus (a fee discount for free returns).
 * Fees and rates are inputs, not eBay store policy. Complementary
 * to Global Shipping (#1671), incoming Best Offer, and
 * compareInternational (domestic vs worldwide at this list).
 */
export function compareStoreTiers(input, tiers = STORE_TIER_PRESETS) {
  if (!Array.isArray(tiers) || tiers.length === 0) {
    throw new Error('At least one store tier is required');
  }
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const monthlyOrders = optionalNumber(
    firstPresent(input.monthlyStoreOrders, input.monthlyOrders),
    'Monthly store orders',
    DEFAULT_MONTHLY_STORE_ORDERS,
  );
  if (!Number.isInteger(monthlyOrders) || monthlyOrders < 1) {
    throw new Error('Monthly store orders must be a whole number of at least 1');
  }
  const currentStoreFee = optionalNumber(
    input.monthlyStoreFee,
    'Current monthly store fee',
    DEFAULT_MONTHLY_STORE_FEE,
  );
  const currentRate = optionalNumber(input.finalValueRate, 'Final value fee rate', 13.6);

  const currentOrder = calculateOrder(input);
  const currentMonthlyProfit = currentOrder.profit * monthlyOrders - currentStoreFee;

  const makeRow = ({ id, label, monthlyFee, finalValueRate, order, isCurrent }) => {
    const monthlyProfit = order.profit * monthlyOrders - monthlyFee;
    return {
      id,
      label,
      monthlyFee,
      finalValueRate,
      profit: order.profit,
      feeTotal: order.feeTotal,
      revenue: order.revenue,
      monthlyProfit,
      monthlyDelta: monthlyProfit - currentMonthlyProfit,
      breakEvenOrders: isCurrent
        ? 0
        : storeBreakEvenOrders({
          revenue: order.revenue,
          currentFinalValueRate: currentRate,
          storeFinalValueRate: finalValueRate,
          monthlyFee,
        }),
      isCurrent,
    };
  };

  const current = makeRow({
    id: 'current',
    label: 'No store / current rate',
    monthlyFee: currentStoreFee,
    finalValueRate: currentRate,
    order: currentOrder,
    isCurrent: true,
  });

  const storeRows = [];
  for (const tier of tiers) {
    const monthlyFee = optionalNumber(tier.monthlyFee, 'Store monthly fee', 0);
    const finalValueRate = optionalNumber(tier.finalValueRate, 'Store final value fee rate', 0);
    if (finalValueRate === currentRate && monthlyFee === currentStoreFee) continue;
    const order = calculateOrder({ ...input, finalValueRate });
    storeRows.push(makeRow({
      id: String(tier.id ?? finalValueRate),
      label: String(tier.label ?? `${finalValueRate}% store`),
      monthlyFee,
      finalValueRate,
      order,
      isCurrent: false,
    }));
  }

  const rows = [current, ...storeRows].map((row) => ({
    ...row,
    vsCurrent: row.monthlyProfit - currentMonthlyProfit,
  }));
  const maxProfit = Math.max(...rows.map((row) => row.monthlyProfit));
  const leaders = rows.filter((row) => Math.abs(row.monthlyProfit - maxProfit) < 1e-9);
  const winner = leaders.length === 1 ? leaders[0].id : 'tie';

  const starter = rows.find((row) => row.id === 'starter');
  const basic = rows.find((row) => row.id === 'basic');
  const premium = rows.find((row) => row.id === 'premium');
  const extraKeptOnStarter = starter ? starter.monthlyProfit - currentMonthlyProfit : 0;

  return {
    rows,
    current: rows[0],
    starter,
    basic,
    premium,
    monthlyOrders,
    currentStoreFee,
    currentRate,
    extraKeptOnStarter,
    extraKeptOnBasic: basic ? basic.monthlyProfit - currentMonthlyProfit : 0,
    extraKeptOnPremium: premium ? premium.monthlyProfit - currentMonthlyProfit : 0,
    winner,
    summary: storeTiersNote({
      winner,
      currentRate,
      extraKeptOnStarter,
      starter,
    }),
  };
}

export function storeTiersNote(comparison) {
  if (!comparison || comparison.extraKeptOnStarter === undefined) {
    throw new Error('Store comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { winner, currentRate, extraKeptOnStarter, starter } = comparison;
  // A seller already on Starter (or a matching fee+rate) drops that
  // preset so the table is not two identical rows. The note then
  // talks about the remaining mix instead of inventing a Starter gap.
  if (!starter) {
    return `Your current rate already matches an example store mix, so the table compares the remaining tiers at ${currentRate}%.`;
  }
  const gap = money(Math.abs(extraKeptOnStarter));
  const ahead = extraKeptOnStarter >= 0 ? 'more' : 'less';
  const feeLine = `Starter at ${money(starter.monthlyFee)} / ${starter.finalValueRate}% keeps ${gap} ${ahead} than staying at ${currentRate}% with no subscription.`;
  const floor = Number.isFinite(starter.breakEvenOrders)
    ? ` Starter still ties around ${starter.breakEvenOrders.toFixed(0)} of these sales.`
    : ' No order count recovers Starter when its final-value rate is not cheaper.';
  if (winner === 'tie') {
    return `Starter and your current rate leave the same monthly leftover on these fees.${floor}`;
  }
  return `${feeLine}${floor}`;
}

export const DEFAULT_INCOMING_BEST_OFFER = 34;
export const DEFAULT_INCOMING_WAIT_CHANCE = 50;

function pricedOrder(input, price) {
  const rounded = Math.round(Number(price) * 100) / 100;
  return { price: rounded, ...calculateOrder({ ...input, price: rounded }) };
}

/**
 * A buyer sent a Best Offer. Compare taking it now against
 * waiting for list (list profit × the typed chance the item
 * still sells at list), a midpoint counter, and the
 * target-margin price.
 *
 * Waiting treats a miss as $0 this cycle — the item is still
 * sitting, cash still tied up — rather than assuming a later
 * offer. The offer is in hand: accept keeps that profit. This
 * is not a seller-initiated offer (you naming a discount to
 * watchers) and not the repricing table (a list move without
 * a typed wait chance). Dedicated incomingBestOffer /
 * incomingWaitChancePct keep the headline sale at list.
 *
 * Complementary to compareSellerInitiatedOffer and
 * compareInternational (domestic vs worldwide at this list).
 */
export function compareBestOffer(input, offerAmount, listChance) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const offerPrice = optionalNumber(
    firstPresent(offerAmount, input.incomingBestOffer, input.bestOffer),
    'Best offer',
    DEFAULT_INCOMING_BEST_OFFER,
  );
  const chancePct = requiredPercent(
    firstPresent(listChance, input.incomingWaitChancePct, input.listChance),
    'Chance of selling at list',
    DEFAULT_INCOMING_WAIT_CHANCE,
  );

  const listing = pricedOrder(input, listedPrice);
  const offer = pricedOrder(input, offerPrice);
  const midpoint = pricedOrder(input, (listing.price + offerPrice) / 2);
  const target = Number.isFinite(listing.targetMarginPrice)
    ? pricedOrder(input, listing.targetMarginPrice)
    : null;
  const expectedWaitProfit = listing.profit * (chancePct / 100);
  const extraKeptOnAccept = offer.profit - expectedWaitProfit;
  const winner = extraKeptOnAccept > 1e-9
    ? 'offer'
    : extraKeptOnAccept < -1e-9
      ? 'wait'
      : 'tie';
  const waitChanceCeiling = breakEvenScaledRate(offer.profit, listing.profit);

  const wait = {
    id: 'wait',
    label: 'Wait for list',
    kind: 'wait',
    price: listing.price,
    profit: listing.profit,
    margin: listing.margin,
    soldProfit: listing.profit,
    expectedProfit: expectedWaitProfit,
    sellThroughPct: chancePct,
    expectedProfitDelta: 0,
  };

  const comparison = {
    listing,
    offer,
    midpoint,
    target,
    wait,
    cashLeftOnTable: listing.profit - offer.profit,
    aboveBreakEven: offer.profit >= -1e-9,
    meetsTargetMargin: offer.margin + 1e-9 >= Number(input.targetMargin ?? 0),
    chanceOfFullPricePct: chancePct,
    expectedWaitProfit,
    acceptBeatsWait: extraKeptOnAccept > 1e-9,
    waitGap: extraKeptOnAccept,
    extraKeptOnAccept,
    waitChanceCeiling,
    winner,
  };
  comparison.rows = bestOfferRows(comparison);
  comparison.summary = bestOfferNote(comparison);
  return comparison;
}

export function bestOfferRows(comparison) {
  if (!comparison?.listing || !comparison?.offer || !comparison?.wait) {
    throw new Error('Best Offer comparison is missing rows');
  }
  const rows = [comparison.wait, {
    ...comparison.offer,
    id: 'offer',
    label: 'This offer',
    kind: 'offer',
    soldProfit: comparison.offer.profit,
    expectedProfit: comparison.offer.profit,
    sellThroughPct: 100,
    expectedProfitDelta: comparison.extraKeptOnAccept,
  }];
  if (
    comparison.midpoint
    && comparison.midpoint.price !== comparison.offer.price
    && comparison.midpoint.price !== comparison.listing.price
  ) {
    rows.push({
      ...comparison.midpoint,
      id: 'midpoint',
      label: 'Midpoint counter',
      kind: 'midpoint',
      soldProfit: comparison.midpoint.profit,
      expectedProfit: comparison.midpoint.profit,
      sellThroughPct: 100,
      expectedProfitDelta: comparison.midpoint.profit - comparison.expectedWaitProfit,
    });
  }
  if (
    comparison.target
    && comparison.target.price !== comparison.offer.price
    && comparison.target.price !== comparison.listing.price
  ) {
    rows.push({
      ...comparison.target,
      id: 'target',
      label: 'Holds your target margin',
      kind: 'target',
      soldProfit: comparison.target.profit,
      expectedProfit: comparison.target.profit,
      sellThroughPct: 100,
      expectedProfitDelta: comparison.target.profit - comparison.expectedWaitProfit,
    });
  }
  return rows;
}

export function bestOfferNote(comparison) {
  if (!comparison?.listing || !comparison?.offer || comparison.extraKeptOnAccept === undefined) {
    throw new Error('Best Offer comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const wait = comparison.acceptBeatsWait
    ? ` Accepting keeps ${money(Math.abs(comparison.extraKeptOnAccept))} more than waiting if you only have a ${comparison.chanceOfFullPricePct}% chance of the list price.`
    : ` Waiting still has the higher expected leftover if you really have a ${comparison.chanceOfFullPricePct}% chance of selling at list.`;
  const ceiling = Number.isFinite(comparison.waitChanceCeiling) && comparison.waitChanceCeiling >= 0
    ? ` Waiting still ties at about a ${comparison.waitChanceCeiling.toFixed(1)}% chance of selling at list.`
    : comparison.offer.profit < 0
      ? ' No chance of list makes this losing offer match waiting.'
      : '';
  if (!comparison.aboveBreakEven) {
    const floor = Number.isFinite(comparison.listing.breakEvenPrice)
      ? money(comparison.listing.breakEvenPrice)
      : 'a price that covers your fees';
    return `This ${money(comparison.offer.price)} offer loses ${money(-comparison.offer.profit)}. Counter at least ${floor} to stop losing money.${wait}${ceiling}`;
  }
  if (!comparison.meetsTargetMargin && comparison.target) {
    return `This ${money(comparison.offer.price)} offer still pays ${money(comparison.offer.profit)} but misses your target margin. Counter ${money(comparison.target.price)} to hold it.${wait}${ceiling}`;
  }
  return `This ${money(comparison.offer.price)} offer still leaves ${money(comparison.offer.profit)} (${comparison.offer.margin.toFixed(1)}% margin), ${money(comparison.cashLeftOnTable)} less than list.${wait}${ceiling}`;
}

export function bestOfferSummary(comparison) {
  return bestOfferNote(comparison);
}

/**
 * Illustrative free-shipping extras. 55% vs 70% is a 15-point
 * search-rank lift — both typed, not scraped from Seller Hub.
 * Leaving freeShipPrice empty bakes the typed shipping charged
 * into the item, which on eBay is cash-identical per completed
 * sale. Forty listings is a placeholder volume, not a forecast.
 */
export const DEFAULT_BUYER_PAYS_SHIP_SELL_THROUGH = 55;
export const DEFAULT_FREE_SHIP_SELL_THROUGH = 70;
export const DEFAULT_MONTHLY_FREE_SHIP_LISTINGS = 40;

function freeShipRow({
  id,
  label,
  price,
  shippingCharged,
  sellThroughPct,
  sold,
}) {
  return {
    id,
    label,
    price,
    shippingCharged,
    buyerPays: price + shippingCharged,
    sellThroughPct,
    completedProfit: sold.profit,
    soldExpectedProfit: sold.expectedProfit,
    soldFees: sold.feeTotal,
    expectedProfit: sold.expectedProfit * (sellThroughPct / 100),
    expectedProfitDelta: 0,
  };
}

/**
 * Same SKU, two ways to handle outbound postage: charge the
 * buyer the typed shipping, or offer free shipping at a typed
 * free-ship list and still buy the label.
 *
 * eBay final-value fee sits on item plus shipping. Folding the
 * exact shipping charged into the item therefore leaves the
 * same completed-sale leftover — unlike Reverb, where marketplace
 * fee sits on the item only. The decision is sell-through versus
 * under-baking the list.
 *
 * Complementary to local pickup (meetup vs the label, no-show),
 * combined shipping (two already-sold items), Standard Envelope
 * (tracked vs ESE), quantity discount (N units, one box), and
 * seller coupon (public code, not postage). Global Shipping (#1671) is a hub label versus you-ship
 * international postage. Store subscription (#1672) is a monthly fee
 * versus the no-store rate. Incoming Best Offer (#1673) is take-the-offer
 * versus waiting. Domestic vs worldwide (#1676) is the extra international fee and postage you absorb — not whether to bake shipping into a domestic list. Rates are inputs, not eBay search
 * ranking.
 */
export function compareFreeShipping(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const shippingCharged = optionalNumber(input.shippingCharged, 'Shipping charged', 0);
  const bakeInPrice = Math.round((listedPrice + shippingCharged) * 100) / 100;
  const freeShipPrice = optionalNumber(
    input.freeShipPrice,
    'Free-shipping list price',
    bakeInPrice,
  );
  const buyerPaysSellThroughPct = requiredPercent(
    input.buyerPaysSellThroughPct,
    'Buyer-pays sell-through',
    DEFAULT_BUYER_PAYS_SHIP_SELL_THROUGH,
  );
  const freeShipSellThroughPct = requiredPercent(
    input.freeShipSellThroughPct,
    'Free-shipping sell-through',
    DEFAULT_FREE_SHIP_SELL_THROUGH,
  );
  const monthlyFreeShipListings = optionalNumber(
    input.monthlyFreeShipListings,
    'Monthly free-shipping listings',
    DEFAULT_MONTHLY_FREE_SHIP_LISTINGS,
  );

  const buyerSold = calculateOrder({ ...input, quantity: 1 });
  const freeSold = calculateOrder({
    ...input,
    quantity: 1,
    price: freeShipPrice,
    shippingCharged: 0,
  });

  const buyerPays = freeShipRow({
    id: 'buyer_pays',
    label: 'Buyer pays shipping',
    price: listedPrice,
    shippingCharged,
    sellThroughPct: buyerPaysSellThroughPct,
    sold: buyerSold,
  });
  const freeShip = freeShipRow({
    id: 'free_ship',
    label: 'Offer free shipping',
    price: freeShipPrice,
    shippingCharged: 0,
    sellThroughPct: freeShipSellThroughPct,
    sold: freeSold,
  });
  buyerPays.expectedProfitDelta = buyerPays.expectedProfit - freeShip.expectedProfit;
  freeShip.expectedProfitDelta = freeShip.expectedProfit - buyerPays.expectedProfit;

  const extraKeptOnFreeShip = freeShip.expectedProfit - buyerPays.expectedProfit;
  const winner = extraKeptOnFreeShip > 1e-9
    ? 'free_ship'
    : extraKeptOnFreeShip < -1e-9
      ? 'buyer_pays'
      : 'tie';

  const breakEvenFreeShipSellThroughPct = breakEvenScaledRate(buyerPays.expectedProfit, freeSold.expectedProfit);

  const targetSoldExpected = freeShipSellThroughPct <= 1e-12
    ? Infinity
    : buyerPays.expectedProfit / (freeShipSellThroughPct / 100);
  const promotedRate = optionalNumber(input.promotedRate, 'Promoted listings rate', 0);
  const breakEvenFreeShipPrice = !Number.isFinite(targetSoldExpected)
    ? Infinity
    : priceForExpectedProfit(
      { ...input, shippingCharged: 0 },
      promotedRate,
      targetSoldExpected,
    );

  const comparison = {
    rows: [buyerPays, freeShip],
    buyerPays,
    freeShip,
    winner,
    bakeInPrice,
    freeShipPrice,
    underBake: bakeInPrice - freeShipPrice,
    buyerPaysSellThroughPct,
    freeShipSellThroughPct,
    monthlyFreeShipListings,
    extraKeptOnFreeShip,
    extraPackedOnFreeShip: freeShip.soldExpectedProfit - buyerPays.soldExpectedProfit,
    monthlyExtraOnFreeShip: extraKeptOnFreeShip * monthlyFreeShipListings,
    breakEvenFreeShipSellThroughPct,
    breakEvenFreeShipPrice,
    freeShipPays: extraKeptOnFreeShip > 1e-9,
  };
  comparison.summary = freeShippingNote(comparison);
  return comparison;
}

export function freeShippingNote(comparison) {
  if (!comparison?.buyerPays || !comparison?.freeShip) {
    throw new Error('Free-shipping comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { buyerPays, freeShip } = comparison;
  const stGap = money(Math.abs(freeShip.expectedProfit - buyerPays.expectedProfit));
  const stAhead = freeShip.expectedProfit >= buyerPays.expectedProfit ? 'more' : 'less';
  const packedGap = money(Math.abs(freeShip.soldExpectedProfit - buyerPays.soldExpectedProfit));
  const packedAhead = freeShip.soldExpectedProfit >= buyerPays.soldExpectedProfit ? 'more' : 'less';
  const baked = Math.abs(comparison.underBake) <= 1e-9;
  const bakeLine = baked
    ? ` Free shipping at ${money(freeShip.price)} bakes in the ${money(comparison.bakeInPrice - buyerPays.price)} charged, so a completed sale still expects ${money(freeShip.soldExpectedProfit)} — the same leftover, because eBay final-value fee sits on item plus shipping.`
    : ` Free shipping at ${money(freeShip.price)} is ${money(Math.abs(comparison.underBake))} ${comparison.underBake > 0 ? 'under' : 'over'} the ${money(comparison.bakeInPrice)} bake-in, so a completed sale expects ${money(freeShip.soldExpectedProfit)} — ${packedGap} ${packedAhead}.`;
  const buyerLine = `Buyer-pays shipping at ${money(buyerPays.price)} plus ${money(buyerPays.shippingCharged)}, with ${buyerPays.sellThroughPct}% sell-through, expects ${money(buyerPays.expectedProfit)} leftover after the typed return rate.`;
  const freeLine = ` At ${freeShip.sellThroughPct}% free-shipping sell-through, free shipping expects ${money(freeShip.expectedProfit)} — ${stGap} ${stAhead}.`;
  const stFloor = Number.isFinite(comparison.breakEvenFreeShipSellThroughPct)
    ? ` Free shipping has to convert about ${comparison.breakEvenFreeShipSellThroughPct.toFixed(1)}% of the time before it matches buyer-pays after sell-through.`
    : ' No free-shipping sell-through on these rates can match buyer-pays.';
  const priceFloor = Number.isFinite(comparison.breakEvenFreeShipPrice)
    ? ` The free-ship list that matches buyer-pays leftover at ${comparison.freeShipSellThroughPct}% sell-through is ${money(comparison.breakEvenFreeShipPrice)}.`
    : '';
  return `${buyerLine}${bakeLine}${freeLine}${stFloor}${priceFloor}`;
}

/**
 * Illustrative international-fee and extra-postage defaults.
 * Sellers overwrite both from their own fee preview and label
 * quotes. The form starts the headline international fee at 0
 * so a domestic order stays the result until they type a rate;
 * the comparison then uses 1.65% so "what if I turn worldwide
 * on" is a number instead of a blank row. $12 extra postage is
 * a small-parcel add-on, not a live rate table.
 */
export const ILLUSTRATIVE_INTL_FEE_RATE = 1.65;
export const DEFAULT_INTL_EXTRA_SHIPPING = 12;

function priceForCompletedProfit(input, targetProfit) {
  const atZero = calculateOrder({ ...input, price: 0 });
  const atHundred = calculateOrder({ ...input, price: 100 });
  const slope = (atHundred.profit - atZero.profit) / 100;
  if (Math.abs(slope) <= 1e-12) return Infinity;
  const price = (targetProfit - atZero.profit) / slope;
  if (!Number.isFinite(price)) return Infinity;
  return Math.max(0, Math.round(price * 100) / 100);
}

/**
 * Same SKU, three ways to treat worldwide shipping.
 *
 *   - Domestic only — headline order with the international fee
 *     forced to 0. The completed-sale leftover stays the
 *     baseline the other rows have to beat.
 *   - International, buyer pays postage — same label cost, the
 *     typed (or illustrative) international fee on the order
 *     total. The buyer pays the extra postage themselves, so
 *     your box cost does not change.
 *   - International, you pay extra postage — same fee, plus the
 *     typed extra label cost. Free-shipping-worldwide and
 *     "I'll eat the label" both land here.
 *
 * Complementary to Global Shipping (an international buyer
 * already wants the item; the question is who buys the label)
 * and Standard Envelope (cheap domestic postage vs a claim).
 * Salvaged from #1564 onto current main. Rates and postage are
 * inputs, not eBay's live international schedule.
 */
export function compareInternational(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const extraShipping = optionalNumber(
    input.intlExtraShipping,
    'Extra international shipping',
    DEFAULT_INTL_EXTRA_SHIPPING,
  );
  const typedIntl = optionalNumber(input.intlFeeRate, 'International fee rate', 0);
  const intlFeeRate = typedIntl > 0 ? typedIntl : ILLUSTRATIVE_INTL_FEE_RATE;
  const shippingCost = optionalNumber(input.shippingCost, 'Shipping cost', 0);

  const domestic = calculateOrder({ ...input, intlFeeRate: 0 });
  const buyerPays = calculateOrder({ ...input, intlFeeRate });
  const youShip = calculateOrder({
    ...input,
    intlFeeRate,
    shippingCost: shippingCost + extraShipping,
  });

  const holdBuyerPays = priceForCompletedProfit({ ...input, intlFeeRate }, domestic.profit);
  const holdYouShip = priceForCompletedProfit({
    ...input,
    intlFeeRate,
    shippingCost: shippingCost + extraShipping,
  }, domestic.profit);

  const rows = [
    {
      id: 'domestic',
      label: 'Domestic only',
      pathIntlFeeRate: 0,
      pathShippingCost: shippingCost,
      extraShipping: 0,
      profit: domestic.profit,
      expectedProfit: domestic.expectedProfit,
      feeTotal: domestic.feeTotal,
      profitDelta: 0,
      expectedProfitDelta: 0,
      holdPrice: null,
    },
    {
      id: 'intl_buyer_pays',
      label: 'International, buyer pays postage',
      pathIntlFeeRate: intlFeeRate,
      pathShippingCost: shippingCost,
      extraShipping: 0,
      profit: buyerPays.profit,
      expectedProfit: buyerPays.expectedProfit,
      feeTotal: buyerPays.feeTotal,
      profitDelta: buyerPays.profit - domestic.profit,
      expectedProfitDelta: buyerPays.expectedProfit - domestic.expectedProfit,
      holdPrice: holdBuyerPays,
    },
    {
      id: 'intl_you_ship',
      label: 'International, you pay extra postage',
      pathIntlFeeRate: intlFeeRate,
      pathShippingCost: shippingCost + extraShipping,
      extraShipping,
      profit: youShip.profit,
      expectedProfit: youShip.expectedProfit,
      feeTotal: youShip.feeTotal,
      profitDelta: youShip.profit - domestic.profit,
      expectedProfitDelta: youShip.expectedProfit - domestic.expectedProfit,
      holdPrice: holdYouShip,
    },
  ];

  const bestExpected = Math.max(...rows.map((row) => row.expectedProfit));
  const winners = rows.filter((row) => Math.abs(row.expectedProfit - bestExpected) <= 1e-9);
  const winner = winners.length === 1 ? winners[0].id : 'tie';

  const result = {
    intlFeeRate,
    extraShipping,
    usedIllustrativeIntlRate: typedIntl === 0,
    domesticProfit: domestic.profit,
    domesticExpectedProfit: domestic.expectedProfit,
    buyerPaysProfit: buyerPays.profit,
    youShipProfit: youShip.profit,
    extraKeptOnBuyerPays: buyerPays.expectedProfit - domestic.expectedProfit,
    extraKeptOnYouShip: youShip.expectedProfit - domestic.expectedProfit,
    winner,
    rows: rows.map((row) => ({
      ...row,
      winner: Math.abs(row.expectedProfit - bestExpected) <= 1e-9,
    })),
  };
  result.summary = internationalNote(result);
  return result;
}

export function internationalNote(comparison) {
  if (!comparison?.rows?.length) {
    throw new Error('International comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const buyer = comparison.rows.find((row) => row.id === 'intl_buyer_pays');
  const youShip = comparison.rows.find((row) => row.id === 'intl_you_ship');
  const rateLine = comparison.usedIllustrativeIntlRate
    ? ` Using the illustrative ${comparison.intlFeeRate}% international fee — overwrite it from your fee preview.`
    : ` Using the ${comparison.intlFeeRate}% international fee you typed.`;
  const buyerLine = ` Buyer-pays worldwide keeps ${money(Math.abs(comparison.extraKeptOnBuyerPays))} ${comparison.extraKeptOnBuyerPays >= 0 ? 'more' : 'less'} than domestic after returns (${money(buyer.profit)} if they keep it).`;
  const holdBuyer = Number.isFinite(buyer.holdPrice)
    ? ` List ${money(buyer.holdPrice)} to hold the domestic leftover when they pay postage.`
    : '';
  const youLine = ` Absorbing ${money(comparison.extraShipping)} extra postage keeps ${money(Math.abs(comparison.extraKeptOnYouShip))} ${comparison.extraKeptOnYouShip >= 0 ? 'more' : 'less'} (${money(youShip.profit)} if they keep it).`;
  const holdYou = Number.isFinite(youShip.holdPrice)
    ? ` List ${money(youShip.holdPrice)} to hold the domestic leftover if you buy the extra label.`
    : '';
  return `Domestic only expects ${money(comparison.domesticExpectedProfit)} after returns and ${money(comparison.domesticProfit)} on a completed sale.${rateLine}${buyerLine}${holdBuyer}${youLine}${holdYou}`;
}

export function internationalSummary(comparison) {
  return internationalNote(comparison);
}

/**
 * Illustrative package-protection defaults. A $1.80 third-party
 * premium and a $3.45 signature add-on are typical quotes on a
 * $40–$50 parcel, not a live carrier table. The skip claim rate
 * is the item-not-received / lost-in-transit share on an already
 * tracked label — not the Standard Envelope claim rate, which
 * is about untracked mail. Sellers overwrite every figure from
 * their own Shipsurance / USPS / UPS quote and Seller Hub INR
 * rate.
 */
export const DEFAULT_SKIP_CLAIM_RATE = 2.5;
export const DEFAULT_INSURANCE_PREMIUM = 1.8;
export const DEFAULT_INSURANCE_CLAIM_RATE = 0.6;
export const DEFAULT_SIGNATURE_FEE = 3.45;
export const DEFAULT_SIGNATURE_CLAIM_RATE = 0.4;
export const DEFAULT_PROTECTION_FEE_REFUND_ON_CLAIM = 100;
export const DEFAULT_MONTHLY_PROTECTION_SHIPMENTS = 40;

function protectionRow({
  id,
  label,
  extraCost,
  claimRatePercent,
  payout,
  completedProfit,
  soldExpectedProfit,
  claimProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    extraCost,
    claimRatePercent,
    payout,
    completedProfit,
    soldExpectedProfit,
    claimProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

function packageClaimProfit({
  sold,
  extraCost,
  payout,
  feeRefundOnClaim,
  costOfGoods,
  shippingCost,
  packagingCost,
  otherCost,
}) {
  const quantity = sold.quantity;
  const unrefundedFees = sold.feeTotal * (1 - feeRefundOnClaim / 100);
  const sunk = (costOfGoods + shippingCost + packagingCost + otherCost + extraCost) * quantity;
  return -sunk - unrefundedFees + payout * quantity;
}

function packagePathExpected({
  input,
  extraCost,
  claimRatePercent,
  payout,
  feeRefundOnClaim,
}) {
  const shippingCost = optionalNumber(input.shippingCost, 'Shipping cost', 0);
  const packagingCost = optionalNumber(input.packagingCost, 'Packaging cost', 0);
  const costOfGoods = optionalNumber(input.costOfGoods, 'Cost of goods', 0);
  const otherCost = optionalNumber(input.otherCost, 'Other cost', 0);
  const sold = calculateOrder({
    ...input,
    otherCost: otherCost + extraCost,
  });
  const claimProfit = packageClaimProfit({
    sold,
    extraCost,
    payout,
    feeRefundOnClaim,
    costOfGoods,
    shippingCost,
    packagingCost,
    otherCost,
  });
  const claimFrac = claimRatePercent / 100;
  const expectedProfit = (1 - claimFrac) * sold.expectedProfit + claimFrac * claimProfit;
  return {
    sold,
    claimProfit,
    expectedProfit,
  };
}

/**
 * Same already-sold tracked shipment, three ways to treat a
 * lost-in-transit / item-not-received claim.
 *
 *   - Skip — pay nothing extra. The typed skip claim rate is
 *     a full loss: buyer refunded, item gone, fees usually
 *     come back. A return restocks the item; a claim does not.
 *   - Insure — pay a typed premium on every label. Remaining
 *     claims pay a typed payout that defaults to cost of goods
 *     plus postage and pack (replacement value, not retail).
 *   - Signature — pay a typed add-on on every label. Claims
 *     drop; leftover claims are still a full loss. Signature
 *     is deterrence, not reimbursement.
 *
 * Complementary to Standard Envelope (cheap untracked mail vs
 * a tracked label) and Authenticity Guarantee (a hub inspects
 * the item). Premium, signature fee, payout, and both claim
 * rates are inputs, not carrier or eBay seller-protection
 * policy.
 */
export function comparePackageProtection(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const skipClaimRate = requiredPercent(
    input.skipClaimRatePercent,
    'Skip claim rate',
    DEFAULT_SKIP_CLAIM_RATE,
  );
  const insurancePremium = optionalNumber(
    input.insurancePremium,
    'Insurance premium',
    DEFAULT_INSURANCE_PREMIUM,
  );
  const insuranceClaimRate = requiredPercent(
    input.insuranceClaimRatePercent,
    'Insurance claim rate',
    DEFAULT_INSURANCE_CLAIM_RATE,
  );
  const costOfGoods = optionalNumber(input.costOfGoods, 'Cost of goods', 0);
  const shippingCost = optionalNumber(input.shippingCost, 'Shipping cost', 0);
  const packagingCost = optionalNumber(input.packagingCost, 'Packaging cost', 0);
  const defaultPayout = costOfGoods + shippingCost + packagingCost;
  const insurancePayout = optionalNumber(
    input.insurancePayout,
    'Insurance payout',
    defaultPayout,
  );
  const signatureFee = optionalNumber(
    input.signatureFee,
    'Signature fee',
    DEFAULT_SIGNATURE_FEE,
  );
  const signatureClaimRate = requiredPercent(
    input.signatureClaimRatePercent,
    'Signature claim rate',
    DEFAULT_SIGNATURE_CLAIM_RATE,
  );
  const feeRefundOnClaim = requiredPercent(
    input.protectionFeeRefundOnClaimPercent,
    'Fee refund on protection claim',
    DEFAULT_PROTECTION_FEE_REFUND_ON_CLAIM,
  );
  const monthlyShipments = optionalNumber(
    input.monthlyProtectionShipments,
    'Monthly protection shipments',
    DEFAULT_MONTHLY_PROTECTION_SHIPMENTS,
  );
  if (monthlyShipments === 0) throw new Error('Monthly protection shipments must be greater than zero');

  const skipPath = packagePathExpected({
    input,
    extraCost: 0,
    claimRatePercent: skipClaimRate,
    payout: 0,
    feeRefundOnClaim,
  });
  const insurePath = packagePathExpected({
    input,
    extraCost: insurancePremium,
    claimRatePercent: insuranceClaimRate,
    payout: insurancePayout,
    feeRefundOnClaim,
  });
  const signaturePath = packagePathExpected({
    input,
    extraCost: signatureFee,
    claimRatePercent: signatureClaimRate,
    payout: 0,
    feeRefundOnClaim,
  });

  const skip = protectionRow({
    id: 'skip',
    label: 'Skip protection',
    extraCost: 0,
    claimRatePercent: skipClaimRate,
    payout: 0,
    completedProfit: skipPath.sold.profit,
    soldExpectedProfit: skipPath.sold.expectedProfit,
    claimProfit: skipPath.claimProfit,
    expectedProfit: skipPath.expectedProfit,
  });
  const insure = protectionRow({
    id: 'insure',
    label: 'Buy shipping insurance',
    extraCost: insurancePremium,
    claimRatePercent: insuranceClaimRate,
    payout: insurancePayout,
    completedProfit: insurePath.sold.profit,
    soldExpectedProfit: insurePath.sold.expectedProfit,
    claimProfit: insurePath.claimProfit,
    expectedProfit: insurePath.expectedProfit,
  });
  const signature = protectionRow({
    id: 'signature',
    label: 'Add signature confirmation',
    extraCost: signatureFee,
    claimRatePercent: signatureClaimRate,
    payout: 0,
    completedProfit: signaturePath.sold.profit,
    soldExpectedProfit: signaturePath.sold.expectedProfit,
    claimProfit: signaturePath.claimProfit,
    expectedProfit: signaturePath.expectedProfit,
  });
  skip.expectedProfitDelta = 0;
  insure.expectedProfitDelta = insure.expectedProfit - skip.expectedProfit;
  signature.expectedProfitDelta = signature.expectedProfit - skip.expectedProfit;

  const rows = [skip, insure, signature];
  const bestExpected = Math.max(...rows.map((row) => row.expectedProfit));
  const winners = rows.filter((row) => Math.abs(row.expectedProfit - bestExpected) <= 1e-9);
  const winner = winners.length === 1 ? winners[0].id : 'tie';

  const skipGap = skip.soldExpectedProfit - skip.claimProfit;
  let breakEvenSkipClaimRate = Infinity;
  if (skipGap > 1e-12) {
    const rate = (skip.soldExpectedProfit - insure.expectedProfit) / skipGap * 100;
    breakEvenSkipClaimRate = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  const skipAtPremium = (premium) => packagePathExpected({
    input,
    extraCost: premium,
    claimRatePercent: insuranceClaimRate,
    payout: insurancePayout,
    feeRefundOnClaim,
  }).expectedProfit;
  const atZeroPremium = skipAtPremium(0);
  const atTenPremium = skipAtPremium(10);
  const premiumSlope = (atTenPremium - atZeroPremium) / 10;
  let breakEvenInsurancePremium = Infinity;
  if (Math.abs(premiumSlope) > 1e-12) {
    const needed = (skip.expectedProfit - atZeroPremium) / premiumSlope;
    breakEvenInsurancePremium = needed < -1e-9 ? Infinity : needed;
  }

  const signatureGap = signature.soldExpectedProfit - signature.claimProfit;
  let breakEvenSignatureClaimRate = Infinity;
  if (signatureGap > 1e-12) {
    const rate = (signature.soldExpectedProfit - skip.expectedProfit) / signatureGap * 100;
    breakEvenSignatureClaimRate = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  const extraKeptOnInsure = insure.expectedProfit - skip.expectedProfit;
  const extraKeptOnSignature = signature.expectedProfit - skip.expectedProfit;

  const result = {
    rows,
    skip,
    insure,
    signature,
    winner,
    skipClaimRate,
    insurancePremium,
    insuranceClaimRate,
    insurancePayout,
    usedDefaultPayout: input.insurancePayout === undefined
      || input.insurancePayout === null
      || input.insurancePayout === '',
    signatureFee,
    signatureClaimRate,
    feeRefundOnClaim,
    monthlyShipments,
    extraKeptOnInsure,
    extraKeptOnSignature,
    monthlyExtraOnInsure: extraKeptOnInsure * monthlyShipments,
    monthlyExtraOnSignature: extraKeptOnSignature * monthlyShipments,
    breakEvenSkipClaimRate,
    breakEvenInsurancePremium,
    breakEvenSignatureClaimRate,
  };
  result.summary = packageProtectionNote(result);
  return result;
}

export function packageProtectionNote(comparison) {
  if (!comparison?.skip || !comparison?.insure || !comparison?.signature) {
    throw new Error('Package-protection comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { skip, insure, signature } = comparison;
  const skipLine = `Skip protection at a ${skip.claimRatePercent}% item-not-received claim rate expects ${money(skip.expectedProfit)} after the typed return mix — a claim on that path leaves ${money(skip.claimProfit)}.`;
  const insureGap = money(Math.abs(insure.expectedProfit - skip.expectedProfit));
  const insureAhead = insure.expectedProfit >= skip.expectedProfit ? 'more' : 'less';
  const insureLine = ` Buying ${money(insure.extraCost)} insurance that pays ${money(insure.payout)} at a ${insure.claimRatePercent}% leftover-claim rate expects ${money(insure.expectedProfit)} — ${insureGap} ${insureAhead}.`;
  const sigGap = money(Math.abs(signature.expectedProfit - skip.expectedProfit));
  const sigAhead = signature.expectedProfit >= skip.expectedProfit ? 'more' : 'less';
  const sigLine = ` A ${money(signature.extraCost)} signature add-on at a ${signature.claimRatePercent}% claim rate expects ${money(signature.expectedProfit)} — ${sigGap} ${sigAhead}.`;
  const claimFloor = Number.isFinite(comparison.breakEvenSkipClaimRate)
    ? ` Skip claims have to reach about ${comparison.breakEvenSkipClaimRate.toFixed(1)}% before insurance matches skip.`
    : ' No skip claim rate on these premiums can match insurance.';
  const premiumCeil = Number.isFinite(comparison.breakEvenInsurancePremium)
    ? ` Insurance has to stay at about ${money(comparison.breakEvenInsurancePremium)} before it matches skip.`
    : '';
  return `${skipLine}${insureLine}${sigLine}${claimFloor}${premiumCeil}`;
}

export function packageProtectionSummary(comparison) {
  return packageProtectionNote(comparison);
}

/**
 * Illustrative third-party / carrier-account label when the
 * seller has not typed one. Edit it from a Pirate Ship, Shippo,
 * or UPS quote — not a published eBay Shipping rate.
 */
export const DEFAULT_THIRD_PARTY_LABEL_COST = 4.25;
export const DEFAULT_EBAY_LABEL_CLAIM_RATE = 0.8;
export const DEFAULT_THIRD_PARTY_CLAIM_RATE = 2.5;
export const DEFAULT_LABEL_UPLOAD_MINUTES = 4;
export const DEFAULT_LABEL_UPLOAD_WAGE = 18;
export const DEFAULT_LABEL_FEE_REFUND_ON_CLAIM = 100;
export const DEFAULT_MONTHLY_LABEL_SHIPMENTS = 40;

function labelUploadTimeCost(minutes, hourlyWage) {
  return minutes * (hourlyWage / 60);
}

function labelPathExpected({
  input,
  shippingCost,
  extraCost,
  claimRatePercent,
  feeRefundOnClaim,
}) {
  return packagePathExpected({
    input: { ...input, shippingCost },
    extraCost,
    claimRatePercent,
    payout: 0,
    feeRefundOnClaim,
  });
}

function labelRow({
  id,
  label,
  labelCost,
  extraCost,
  claimRatePercent,
  completedProfit,
  soldExpectedProfit,
  claimProfit,
  expectedProfit,
}) {
  return {
    id,
    label,
    labelCost,
    extraCost,
    claimRatePercent,
    completedProfit,
    soldExpectedProfit,
    claimProfit,
    expectedProfit,
    expectedProfitDelta: 0,
  };
}

/**
 * Same already-sold tracked shipment, three ways to buy the label.
 *
 *   - eBay label — pay the eBay Shipping quote. Tracking
 *     auto-uploads. The typed eBay claim rate is the leftover
 *     item-not-received share after seller protection that
 *     usually rides with an eBay-purchased label.
 *   - Third-party label — Pirate Ship, Shippo, or a carrier
 *     account. Postage is often cheaper. Tracking is uploaded
 *     by hand, so a typed upload-time cost sits on every box.
 *     The typed third-party claim rate is usually higher
 *     because eBay seller protection is thinner when the label
 *     was bought elsewhere.
 *   - Third-party, no extra time — same postage and claim rate
 *     with the upload minutes zeroed. Isolates whether the
 *     claim-rate gap, not the four minutes, is the leak.
 *
 * Complementary to package protection (an add-on on a label
 * already bought), Standard Envelope (untracked mail vs a
 * tracked label), and free shipping (what you charge vs baking
 * postage into the list). Label quotes, claim rates, and
 * upload time are inputs, not a carrier table or eBay
 * seller-protection policy.
 */
export function compareEbayLabels(input) {
  const listedPrice = optionalNumber(input.price, 'Item price');
  if (listedPrice === undefined) {
    throw new Error('Item price must be a non-negative number');
  }

  const typedShippingCost = optionalNumber(input.shippingCost, 'Shipping cost', 0);
  const ebayLabelCost = optionalNumber(input.ebayLabelCost, 'eBay label', typedShippingCost);
  const thirdPartyLabelCost = optionalNumber(
    input.thirdPartyLabelCost,
    'Third-party label',
    DEFAULT_THIRD_PARTY_LABEL_COST,
  );
  const ebayClaimRate = requiredPercent(
    input.ebayLabelClaimRatePercent,
    'eBay label claim rate',
    DEFAULT_EBAY_LABEL_CLAIM_RATE,
  );
  const thirdPartyClaimRate = requiredPercent(
    input.thirdPartyClaimRatePercent,
    'Third-party claim rate',
    DEFAULT_THIRD_PARTY_CLAIM_RATE,
  );
  const uploadMinutes = optionalNumber(
    input.labelUploadMinutes,
    'Label upload minutes',
    DEFAULT_LABEL_UPLOAD_MINUTES,
  );
  const uploadWage = optionalNumber(
    input.labelUploadWage,
    'Label upload hourly wage',
    DEFAULT_LABEL_UPLOAD_WAGE,
  );
  const feeRefundOnClaim = requiredPercent(
    input.labelFeeRefundOnClaimPercent,
    'Fee refund on label claim',
    DEFAULT_LABEL_FEE_REFUND_ON_CLAIM,
  );
  const monthlyShipments = optionalNumber(
    input.monthlyLabelShipments,
    'Monthly label shipments',
    DEFAULT_MONTHLY_LABEL_SHIPMENTS,
  );
  if (monthlyShipments === 0) throw new Error('Monthly label shipments must be greater than zero');

  const uploadTimeCost = labelUploadTimeCost(uploadMinutes, uploadWage);

  const ebayPath = labelPathExpected({
    input,
    shippingCost: ebayLabelCost,
    extraCost: 0,
    claimRatePercent: ebayClaimRate,
    feeRefundOnClaim,
  });
  const thirdPath = labelPathExpected({
    input,
    shippingCost: thirdPartyLabelCost,
    extraCost: uploadTimeCost,
    claimRatePercent: thirdPartyClaimRate,
    feeRefundOnClaim,
  });
  const postagePath = labelPathExpected({
    input,
    shippingCost: thirdPartyLabelCost,
    extraCost: 0,
    claimRatePercent: thirdPartyClaimRate,
    feeRefundOnClaim,
  });

  const ebay = labelRow({
    id: 'ebay',
    label: 'eBay label',
    labelCost: ebayLabelCost,
    extraCost: 0,
    claimRatePercent: ebayClaimRate,
    completedProfit: ebayPath.sold.profit,
    soldExpectedProfit: ebayPath.sold.expectedProfit,
    claimProfit: ebayPath.claimProfit,
    expectedProfit: ebayPath.expectedProfit,
  });
  const third = labelRow({
    id: 'third_party',
    label: 'Third-party label',
    labelCost: thirdPartyLabelCost,
    extraCost: uploadTimeCost,
    claimRatePercent: thirdPartyClaimRate,
    completedProfit: thirdPath.sold.profit,
    soldExpectedProfit: thirdPath.sold.expectedProfit,
    claimProfit: thirdPath.claimProfit,
    expectedProfit: thirdPath.expectedProfit,
  });
  const postageOnly = labelRow({
    id: 'third_party_no_time',
    label: 'Third-party, no extra time',
    labelCost: thirdPartyLabelCost,
    extraCost: 0,
    claimRatePercent: thirdPartyClaimRate,
    completedProfit: postagePath.sold.profit,
    soldExpectedProfit: postagePath.sold.expectedProfit,
    claimProfit: postagePath.claimProfit,
    expectedProfit: postagePath.expectedProfit,
  });
  ebay.expectedProfitDelta = 0;
  third.expectedProfitDelta = third.expectedProfit - ebay.expectedProfit;
  postageOnly.expectedProfitDelta = postageOnly.expectedProfit - ebay.expectedProfit;

  const rows = [ebay, third, postageOnly];
  const bestExpected = Math.max(...rows.map((row) => row.expectedProfit));
  const winners = rows.filter((row) => Math.abs(row.expectedProfit - bestExpected) <= 1e-9);
  const winner = winners.length === 1 ? winners[0].id : 'tie';

  const thirdGap = third.soldExpectedProfit - third.claimProfit;
  let breakEvenThirdPartyClaimRate = Infinity;
  if (thirdGap > 1e-12) {
    const rate = (third.soldExpectedProfit - ebay.expectedProfit) / thirdGap * 100;
    breakEvenThirdPartyClaimRate = rate < -1e-9 || rate > 100 + 1e-9
      ? Infinity
      : Math.max(0, Math.min(100, rate));
  }

  const thirdAtLabel = (labelCost) => labelPathExpected({
    input,
    shippingCost: labelCost,
    extraCost: uploadTimeCost,
    claimRatePercent: thirdPartyClaimRate,
    feeRefundOnClaim,
  }).expectedProfit;
  const atZeroLabel = thirdAtLabel(0);
  const atTenLabel = thirdAtLabel(10);
  const labelSlope = (atTenLabel - atZeroLabel) / 10;
  let breakEvenThirdPartyLabelCost = Infinity;
  if (Math.abs(labelSlope) > 1e-12) {
    const needed = (ebay.expectedProfit - atZeroLabel) / labelSlope;
    breakEvenThirdPartyLabelCost = needed < -1e-9 ? Infinity : needed;
  }

  const thirdAtMinutes = (minutes) => labelPathExpected({
    input,
    shippingCost: thirdPartyLabelCost,
    extraCost: labelUploadTimeCost(minutes, uploadWage),
    claimRatePercent: thirdPartyClaimRate,
    feeRefundOnClaim,
  }).expectedProfit;
  const atZeroMinutes = thirdAtMinutes(0);
  const atTenMinutes = thirdAtMinutes(10);
  const minuteSlope = (atTenMinutes - atZeroMinutes) / 10;
  let breakEvenUploadMinutes = Infinity;
  if (Math.abs(minuteSlope) > 1e-12) {
    const needed = (ebay.expectedProfit - atZeroMinutes) / minuteSlope;
    breakEvenUploadMinutes = needed < -1e-9 ? Infinity : needed;
  }

  const extraKeptOnThird = third.expectedProfit - ebay.expectedProfit;
  const extraKeptOnPostageOnly = postageOnly.expectedProfit - ebay.expectedProfit;

  const result = {
    rows,
    ebay,
    third,
    postageOnly,
    winner,
    ebayLabelCost,
    thirdPartyLabelCost,
    ebayClaimRate,
    thirdPartyClaimRate,
    uploadMinutes,
    uploadWage,
    uploadTimeCost,
    feeRefundOnClaim,
    monthlyShipments,
    extraKeptOnThird,
    extraKeptOnPostageOnly,
    monthlyExtraOnThird: extraKeptOnThird * monthlyShipments,
    monthlyExtraOnPostageOnly: extraKeptOnPostageOnly * monthlyShipments,
    breakEvenThirdPartyClaimRate,
    breakEvenThirdPartyLabelCost,
    breakEvenUploadMinutes,
    usedDefaultEbayLabel: input.ebayLabelCost === undefined
      || input.ebayLabelCost === null
      || input.ebayLabelCost === '',
    usedDefaultThirdPartyLabel: input.thirdPartyLabelCost === undefined
      || input.thirdPartyLabelCost === null
      || input.thirdPartyLabelCost === '',
  };
  result.summary = ebayLabelsNote(result);
  return result;
}

export function ebayLabelsNote(comparison) {
  if (!comparison?.ebay || !comparison?.third || !comparison?.postageOnly) {
    throw new Error('Label comparison is missing rows');
  }
  const money = (value) => {
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toFixed(2)}`;
  };
  const { ebay, third, postageOnly } = comparison;
  const ebayLine = `The ${money(ebay.labelCost)} eBay label at a ${ebay.claimRatePercent}% item-not-received claim rate expects ${money(ebay.expectedProfit)} after the typed return mix — a claim on that path leaves ${money(ebay.claimProfit)}.`;
  const thirdGap = money(Math.abs(third.expectedProfit - ebay.expectedProfit));
  const thirdAhead = third.expectedProfit >= ebay.expectedProfit ? 'more' : 'less';
  const timeBit = third.extraCost > 1e-9
    ? ` after ${money(third.extraCost)} of upload time`
    : '';
  const thirdLine = ` A ${money(third.labelCost)} third-party label at a ${third.claimRatePercent}% claim rate${timeBit} expects ${money(third.expectedProfit)} — ${thirdGap} ${thirdAhead}.`;
  const postageGap = money(Math.abs(postageOnly.expectedProfit - ebay.expectedProfit));
  const postageAhead = postageOnly.expectedProfit >= ebay.expectedProfit ? 'more' : 'less';
  const postageLine = ` The same third-party postage with no extra time expects ${money(postageOnly.expectedProfit)} — ${postageGap} ${postageAhead}.`;
  const claimCeil = Number.isFinite(comparison.breakEvenThirdPartyClaimRate)
    ? ` Third-party claims have to stay at about ${comparison.breakEvenThirdPartyClaimRate.toFixed(1)}% before that path matches the eBay label.`
    : ' No third-party claim rate on these labels can match the eBay label.';
  const labelCeil = Number.isFinite(comparison.breakEvenThirdPartyLabelCost)
    ? ` The third-party quote has to stay at about ${money(comparison.breakEvenThirdPartyLabelCost)} before it matches the eBay label.`
    : '';
  return `${ebayLine}${thirdLine}${postageLine}${claimCeil}${labelCeil}`;
}

export function ebayLabelsSummary(comparison) {
  return ebayLabelsNote(comparison);
}
