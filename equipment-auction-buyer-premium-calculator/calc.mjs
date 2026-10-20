/**
 * Total out-the-door cost of winning a lot at a farm, construction, or
 * heavy-equipment auction, as a deterministic module.
 *
 * A bidder who mentally adds "10% buyer's premium" to a hammer price and
 * stops there is usually wrong in one of four directions, all of them
 * measured from real published auction terms rather than assumed:
 *
 * 1. **The buyer's premium is often capped per lot.** A house that charges
 *    10% "capped at $2,500" on a $45,000 tractor owes $2,500, not $4,500 --
 *    a flat-percent mental model overstates the bill on any expensive lot
 *    once the cap binds.
 * 2. **Bidding online costs more than bidding in the yard.** Auctioneers
 *    that run a live online-bidding platform alongside the floor commonly
 *    add a separate 2-3% "internet premium" on top of the buyer's premium
 *    for anyone who bids through it -- a real, stacking fee, not the same
 *    line item counted twice.
 * 3. **Paying by card costs more than paying by ACH or check.** A card
 *    processing surcharge, where charged, is usually a further 2-3% on the
 *    total invoice, not the hammer price alone.
 * 4. **Sales tax, where it applies, is normally charged on the full
 *    purchase price -- hammer price plus every premium -- not the hammer
 *    price alone**, and many states exempt qualifying farm equipment from
 *    it entirely. Missing either direction moves the total by real money.
 *
 * This module prices the actual stack -- buyer's premium (with its cap),
 * online-bidding premium, card surcharge, sales tax, and a flat doc/title
 * fee -- for a known hammer price, and can also work backward from a
 * target all-in budget to the highest hammer price that stays inside it,
 * so a bidder can set a paddle (or online max-bid) number before the
 * auction starts rather than doing this arithmetic while the price is
 * moving.
 *
 * Every input is a number the bidder gets from the auction house's own
 * published terms and their own budget -- nothing here is scraped or
 * looked up on the bidder's behalf.
 */

function num(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export const DEFAULTS = Object.freeze({
  hammerPrice: 45000,
  buyerPremiumPercent: 10,
  buyerPremiumCap: 2500,
  biddingOnline: false,
  onlinePremiumPercent: 2.5,
  payingByCard: false,
  cardSurchargePercent: 3,
  taxExempt: false,
  taxRate: 6,
  docFee: 25,
  maxBudget: 0,
});

/**
 * The full cost stack for one hammer price: buyer's premium (capped if a
 * cap is set), the online-bidding premium (only if bidding online), sales
 * tax on the resulting purchase price (unless exempt), a card surcharge on
 * the resulting invoice (only if paying by card), and a flat doc/title fee
 * added after tax.
 */
function costStack(hammerPrice, terms) {
  const {
    buyerPremiumPercent, buyerPremiumCap, biddingOnline, onlinePremiumPercent,
    payingByCard, cardSurchargePercent, taxExempt, taxRate, docFee,
  } = terms;

  const uncappedPremium = hammerPrice * (buyerPremiumPercent / 100);
  const capApplies = buyerPremiumCap > 0 && uncappedPremium > buyerPremiumCap;
  const buyerPremium = capApplies ? buyerPremiumCap : uncappedPremium;

  const onlinePremium = biddingOnline ? hammerPrice * (onlinePremiumPercent / 100) : 0;

  const purchasePrice = hammerPrice + buyerPremium + onlinePremium;

  // Sales tax is charged on the full purchase price (hammer price plus
  // every premium) under most published auction terms, not the hammer
  // price alone -- see the `tax-base-assumption` finding, which always
  // fires so this cannot be mistaken for a determination about a specific
  // auction's own terms or state's rules.
  const salesTax = taxExempt ? 0 : round2(purchasePrice * (taxRate / 100));

  const invoiceBeforeCard = purchasePrice + salesTax + docFee;
  const cardSurcharge = payingByCard ? round2(invoiceBeforeCard * (cardSurchargePercent / 100)) : 0;

  const total = round2(invoiceBeforeCard + cardSurcharge);

  return {
    hammerPrice: round2(hammerPrice),
    uncappedPremium: round2(uncappedPremium),
    buyerPremium: round2(buyerPremium),
    capApplies,
    onlinePremium: round2(onlinePremium),
    purchasePrice: round2(purchasePrice),
    salesTax,
    docFee: round2(docFee),
    cardSurcharge,
    total,
  };
}

/**
 * Highest hammer price whose full cost stack does not exceed `maxBudget`.
 * Solved in closed form rather than by search: the cost stack is linear in
 * hammer price on either side of the premium cap, so there are exactly two
 * candidate solutions (premium uncapped, premium capped) and exactly one of
 * them is consistent with its own assumption.
 */
function maxHammerPriceFor(maxBudget, terms) {
  const {
    buyerPremiumPercent, buyerPremiumCap, biddingOnline, onlinePremiumPercent,
    payingByCard, cardSurchargePercent, taxExempt, taxRate, docFee,
  } = terms;

  const premiumRate = buyerPremiumPercent / 100;
  const onlineRate = biddingOnline ? onlinePremiumPercent / 100 : 0;
  const taxMultiple = taxExempt ? 1 : 1 + taxRate / 100;
  const cardMultiple = payingByCard ? 1 + cardSurchargePercent / 100 : 1;

  const budgetForPurchaseAndTax = maxBudget / cardMultiple - docFee;

  // Case A: premium uncapped. purchasePrice = H * (1 + premiumRate + onlineRate).
  const uncappedDenominator = (1 + premiumRate + onlineRate) * taxMultiple;
  const hammerUncapped = uncappedDenominator > 0 ? budgetForPurchaseAndTax / uncappedDenominator : 0;
  const impliedPremiumUncapped = hammerUncapped * premiumRate;
  const capBinds = buyerPremiumCap > 0 && impliedPremiumUncapped > buyerPremiumCap;

  let hammerPrice;
  if (!capBinds) {
    hammerPrice = hammerUncapped;
  } else {
    // Case B: premium capped at buyerPremiumCap (a constant, not scaling
    // with H). purchasePrice = H * (1 + onlineRate) + buyerPremiumCap.
    const cappedDenominator = (1 + onlineRate) * taxMultiple;
    hammerPrice = cappedDenominator > 0
      ? (budgetForPurchaseAndTax - buyerPremiumCap * taxMultiple) / cappedDenominator
      : 0;
  }

  return Math.max(0, hammerPrice);
}

export function analyzeAuction(rawInputs = {}) {
  const inputs = { ...DEFAULTS, ...rawInputs };
  const terms = {
    buyerPremiumPercent: num(inputs.buyerPremiumPercent, DEFAULTS.buyerPremiumPercent),
    buyerPremiumCap: Math.max(0, num(inputs.buyerPremiumCap)),
    biddingOnline: Boolean(inputs.biddingOnline),
    onlinePremiumPercent: num(inputs.onlinePremiumPercent, DEFAULTS.onlinePremiumPercent),
    payingByCard: Boolean(inputs.payingByCard),
    cardSurchargePercent: num(inputs.cardSurchargePercent, DEFAULTS.cardSurchargePercent),
    taxExempt: Boolean(inputs.taxExempt),
    taxRate: Math.max(0, num(inputs.taxRate)),
    docFee: Math.max(0, num(inputs.docFee)),
  };
  const hammerPrice = Math.max(0, num(inputs.hammerPrice));
  const maxBudget = Math.max(0, num(inputs.maxBudget));

  const findings = [];

  const stack = costStack(hammerPrice, terms);

  if (stack.capApplies) {
    findings.push({
      severity: 'info',
      title: 'The buyer’s premium cap applied',
      detail: `At ${terms.buyerPremiumPercent}% this lot's premium would be $${stack.uncappedPremium.toLocaleString()}, but the $${terms.buyerPremiumCap.toLocaleString()} per-lot cap you entered brings it down to $${stack.buyerPremium.toLocaleString()}. Confirm the cap actually applies per lot (not per sale or per day) in this auction's printed terms.`,
    });
  }

  if (terms.biddingOnline) {
    findings.push({
      severity: 'info',
      title: 'Online-bidding premium is separate from the buyer’s premium',
      detail: 'Most houses that run a live online-bidding platform charge this on top of the standard buyer’s premium for anyone bidding through it, not instead of it — bidding from the floor in person usually avoids it.',
    });
  }

  if (terms.payingByCard) {
    findings.push({
      severity: 'info',
      title: 'Card surcharge is on the full invoice',
      detail: 'This applies the card surcharge to the hammer price plus every premium, tax, and the doc fee — the amount actually charged to the card — not to the hammer price alone.',
    });
  }

  if (terms.taxExempt) {
    findings.push({
      severity: 'medium',
      title: 'Tax exemption is assumed, not verified',
      detail: 'Some states exempt qualifying farm or agricultural equipment from sales tax, usually only for a buyer who holds the right exemption certificate and only for equipment used in a qualifying way. This tool takes your word for it — confirm eligibility with the auctioneer or your state’s revenue department before relying on a $0 tax line.',
    });
  } else {
    findings.push({
      severity: 'info',
      title: 'Sales tax is assumed to apply to the full purchase price',
      detail: 'This taxes the hammer price plus the buyer’s premium and any online-bidding premium, which is how most published auction terms define the taxable purchase price. A few states or auctioneers tax the hammer price alone — check this specific auction’s printed terms if the tax line looks off.',
    });
  }

  let maxBid = null;
  if (maxBudget > 0) {
    const solvedHammerPrice = maxHammerPriceFor(maxBudget, terms);
    const solvedStack = costStack(solvedHammerPrice, terms);
    maxBid = {
      maxBudget: round2(maxBudget),
      hammerPrice: round2(solvedHammerPrice),
      ...solvedStack,
      unreachable: solvedHammerPrice <= 0 && maxBudget > 0,
    };
    if (maxBid.unreachable) {
      findings.push({
        severity: 'high',
        title: 'This budget does not cover the fixed costs',
        detail: `The doc fee${terms.taxExempt ? '' : ' and tax on the buyer’s premium'} alone would exceed your $${maxBudget.toLocaleString()} budget before you bid a dollar on the hammer price. Raise the budget or re-check the fixed fees.`,
      });
    }
  }

  return {
    inputs: { ...terms, hammerPrice, maxBudget },
    ...stack,
    effectiveCostPercent: hammerPrice > 0 ? round2(((stack.total - hammerPrice) / hammerPrice) * 100) : 0,
    maxBid,
    findings,
  };
}
