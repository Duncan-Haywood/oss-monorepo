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
  // Comparison-only: ignored by calculateOrder, carried by save/share so a
  // "should I take this offer?" link opens with the same offer the sender saw.
  'bestOffer',
  'listChance',
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

function asMoneyAmount(value, name) {
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function pricedOrder(input, price) {
  const rounded = Math.round(price * 100) / 100;
  return { price: rounded, ...calculateOrder({ ...input, price: rounded }) };
}

// A buyer sent a Best Offer. Compare taking it now against the list price,
// a midpoint counter, the target-margin price, and the expected profit of
// waiting (list profit × the seller's guessed chance the item still sells
// at list). Waiting treats a miss as $0 this cycle — the item is still
// sitting, cash still tied up — rather than assuming a later offer.
export function compareBestOffer(input, offerAmount = input.bestOffer, listChance = input.listChance ?? 50) {
  const offerPrice = asMoneyAmount(offerAmount, 'Best offer');
  const chancePct = asMoneyAmount(listChance, 'Chance of selling at list');
  if (chancePct > 100) throw new Error('Chance of selling at list must be at most 100%');

  const listing = pricedOrder(input, Number(input.price));
  const offer = pricedOrder(input, offerPrice);
  const midpoint = pricedOrder(input, (listing.price + offerPrice) / 2);
  const target = Number.isFinite(listing.targetMarginPrice)
    ? pricedOrder(input, listing.targetMarginPrice)
    : null;
  const expectedWaitProfit = listing.profit * (chancePct / 100);
  return {
    listing,
    offer,
    midpoint,
    target,
    cashLeftOnTable: listing.profit - offer.profit,
    aboveBreakEven: offer.profit >= 0,
    meetsTargetMargin: offer.margin + 1e-9 >= Number(input.targetMargin ?? 0),
    chanceOfFullPricePct: chancePct,
    expectedWaitProfit,
    acceptBeatsWait: offer.profit > expectedWaitProfit,
    waitGap: offer.profit - expectedWaitProfit,
  };
}

export function bestOfferRows(comparison) {
  const rows = [
    { ...comparison.listing, label: 'List price', kind: 'listing' },
    { ...comparison.offer, label: 'This offer', kind: 'offer' },
  ];
  if (comparison.midpoint.price !== comparison.offer.price && comparison.midpoint.price !== comparison.listing.price) {
    rows.push({ ...comparison.midpoint, label: 'Midpoint counter', kind: 'midpoint' });
  }
  if (
    comparison.target
    && comparison.target.price !== comparison.offer.price
    && comparison.target.price !== comparison.listing.price
  ) {
    rows.push({ ...comparison.target, label: 'Holds your target margin', kind: 'target' });
  }
  return rows;
}

export function bestOfferSummary(comparison) {
  const money = value => `$${value.toFixed(2)}`;
  const wait = comparison.acceptBeatsWait
    ? `Accepting beats waiting if you only have a ${comparison.chanceOfFullPricePct}% chance of the list price.`
    : `Waiting still has the higher expected profit if you really have a ${comparison.chanceOfFullPricePct}% chance of selling at list.`;
  if (!comparison.aboveBreakEven) {
    const floor = Number.isFinite(comparison.listing.breakEvenPrice)
      ? money(comparison.listing.breakEvenPrice)
      : 'a price that covers your fees';
    return `This offer loses ${money(-comparison.offer.profit)}. Counter at least ${floor} to stop losing money. ${wait}`;
  }
  if (!comparison.meetsTargetMargin && comparison.target) {
    return `This offer still pays ${money(comparison.offer.profit)} but misses your target margin. Counter ${money(comparison.target.price)} to hold it. ${wait}`;
  }
  return `This offer still leaves ${money(comparison.offer.profit)} (${comparison.offer.margin.toFixed(1)}% margin), ${money(comparison.cashLeftOnTable)} less than list. ${wait}`;
}
