// Pure Whatnot sale arithmetic. No network, no stored live schedule.
//
// Every rate is an input. The category presets below are illustrative
// starting points taken from Whatnot's published US help article (commission
// on the item price, processing on the checkout total) — a seller is
// expected to replace them with the numbers on their own payout statement.
// The result is a transparent calculation from those inputs, not Whatnot's
// live schedule and not advice about what to list or what to charge.
//
// The product exists because the headline "8%" (or the "about 6%" figure
// that drops processing) is not the number that decides whether a lot
// makes money. Commission is on the hammer. Processing is on what the
// buyer actually paid — item + shipping + tax — plus a flat 30 cents. A
// $20 card with $5 buyer-paid shipping looks like $1.60 in fees and is
// $3.025. The $1,500 cap on TCG / comics / sports / toys is the other
// half: a $2,400 graded lot is not 8% of $2,400.

export const CATEGORY_PRESETS = Object.freeze({
  standard: {
    id: 'standard',
    label: 'All other categories (US default)',
    short: '8%, no cap',
    note: 'Whatnot’s published US default for categories that are not on the limited-time cap list. Confirm on the lot.',
    commissionRate: 8,
    commissionCap: '',
  },
  tcg: {
    id: 'tcg',
    label: 'Comics, TCG, sports singles, toys & hobbies',
    short: '8% up to $1,500',
    note: 'Published limited-time US shape: 8% on the hammer up to $1,500, 0% on the portion above. Expires; confirm on the lot.',
    commissionRate: 8,
    commissionCap: 1500,
  },
  coins: {
    id: 'coins',
    label: 'Coins & money',
    short: '4% up to $1,500',
    note: 'Published limited-time US shape: 4% on the hammer up to $1,500, 0% on the portion above.',
    commissionRate: 4,
    commissionCap: 1500,
  },
  pallets: {
    id: 'pallets',
    label: 'Pallets (wholesale)',
    short: '4%, no cap',
    note: 'Published limited-time US wholesale/pallet rate. No $1,500 cap on this row.',
    commissionRate: 4,
    commissionCap: '',
  },
});

export const INPUT_IDS = Object.freeze([
  'salePrice',
  'shippingCharged',
  'taxCharged',
  'shippingCost',
  'itemCost',
  'otherCost',
  'commissionRate',
  'commissionCap',
  'paymentRate',
  'paymentFixed',
  'lotsPerShow',
  'targetLeftover',
]);

function isBlank(value) {
  return value === '' || value === null || value === undefined || String(value).trim() === '';
}

function number(value, name, { min = 0, allowBlank = false, blankValue = 0 } = {}) {
  if (isBlank(value)) {
    if (allowBlank) return blankValue;
    throw new Error(`${name} is required`);
  }
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  return result;
}

export function applyCategoryPreset(input, presetId) {
  const preset = CATEGORY_PRESETS[presetId];
  if (!preset) throw new Error(`Unknown category preset: ${presetId}`);
  return {
    ...input,
    commissionRate: preset.commissionRate,
    commissionCap: preset.commissionCap,
  };
}

function commissionOn(salePrice, commissionRate, commissionCap) {
  const taxable = commissionCap === null ? salePrice : Math.min(salePrice, commissionCap);
  return taxable * (commissionRate / 100);
}

/**
 * One Whatnot sale, priced the way a payout statement actually lands.
 *
 * @param {object} input
 * @param {number} input.salePrice          Hammer / BIN — Whatnot's commission base.
 * @param {number} [input.shippingCharged]  Shipping the buyer paid at checkout.
 * @param {number} [input.taxCharged]       Sales tax collected at checkout.
 * @param {number} [input.shippingCost]     What the outbound label actually costs you.
 * @param {number} [input.itemCost]         What the lot cost you.
 * @param {number} [input.otherCost]        Supplies, inserts, show props on this lot.
 * @param {number} input.commissionRate     Commission % of the hammer.
 * @param {number|string} [input.commissionCap] Hammer dollars above which commission is 0. Blank = no cap.
 * @param {number} [input.paymentRate]      Processing % of checkout total. Default 2.9.
 * @param {number} [input.paymentFixed]     Flat processing fee. Default 0.30.
 * @param {number} [input.lotsPerShow]      For the show roll-up. Default 1.
 * @param {number} [input.targetLeftover]   Desired leftover after fees and costs. Default 0.
 * @param {boolean} [input.giveaway]        Force commission to $0 (Whatnot's giveaway shape).
 */
export function calculateSale(input) {
  const errors = [];
  const read = (id, label, opts) => {
    try {
      return number(input[id], label, opts);
    } catch (error) {
      errors.push({ id, message: error.message });
      return 0;
    }
  };

  const salePrice = read('salePrice', 'Sale price');
  const shippingCharged = read('shippingCharged', 'Shipping charged', { allowBlank: true });
  const taxCharged = read('taxCharged', 'Tax charged', { allowBlank: true });
  const shippingCost = read('shippingCost', 'Shipping cost', { allowBlank: true });
  const itemCost = read('itemCost', 'What you paid for the lot', { allowBlank: true });
  const otherCost = read('otherCost', 'Other per-lot cost', { allowBlank: true });
  const commissionRate = read('commissionRate', 'Commission rate');
  const paymentRate = read('paymentRate', 'Payment processing rate', { allowBlank: true, blankValue: 2.9 });
  const paymentFixed = read('paymentFixed', 'Payment fixed fee', { allowBlank: true, blankValue: 0.3 });
  const lotsPerShow = read('lotsPerShow', 'Lots in this show', { allowBlank: true, blankValue: 1, min: 0 });
  const targetLeftover = read('targetLeftover', 'Target leftover', { allowBlank: true });

  let commissionCap = null;
  if (!isBlank(input.commissionCap)) {
    try {
      commissionCap = number(input.commissionCap, 'Commission cap', { min: 0 });
    } catch (error) {
      errors.push({ id: 'commissionCap', message: error.message });
    }
  }

  if (commissionRate + paymentRate >= 100) {
    errors.push({
      id: 'commissionRate',
      message: 'Combined percentage fees must stay below 100%',
    });
  }

  if (errors.length) return { ok: false, errors };

  const giveaway = Boolean(input.giveaway);
  const commission = giveaway ? 0 : commissionOn(salePrice, commissionRate, commissionCap);
  const checkoutTotal = salePrice + shippingCharged + taxCharged;
  const processingPercent = checkoutTotal * (paymentRate / 100);
  const processing = processingPercent + paymentFixed;
  const fees = commission + processing;
  const payout = salePrice - fees;
  const leftover = payout + shippingCharged - shippingCost - itemCost - otherCost;
  const takeRateOnHammer = salePrice > 0 ? (fees / salePrice) * 100 : 0;
  const takeRateOnCheckout = checkoutTotal > 0 ? (fees / checkoutTotal) * 100 : 0;
  const processingOnShippingAndTax = (shippingCharged + taxCharged) * (paymentRate / 100);
  const commissionOnCappedPortion = commissionCap !== null && salePrice > commissionCap
    ? (salePrice - commissionCap) * (commissionRate / 100)
    : 0;

  const notes = [];
  if (giveaway) {
    notes.push('Giveaway: commission is $0. Processing still applies to whatever the buyer paid at checkout, and you still pay the label.');
  }
  if (processingOnShippingAndTax > 0) {
    notes.push(
      `Processing is on the checkout total, not just the hammer — $${processingOnShippingAndTax.toFixed(2)} of the processing fee is from buyer-paid shipping and tax.`,
    );
  }
  if (commissionOnCappedPortion > 0) {
    notes.push(
      `The $${(salePrice - commissionCap).toFixed(2)} above the $${commissionCap.toFixed(0)} cap is not commissioned — that is $${commissionOnCappedPortion.toFixed(2)} the headline ${commissionRate}% would have taken.`,
    );
  }
  if (shippingCharged === 0 && shippingCost > 0) {
    notes.push('Free shipping: the label comes out of leftover and processing is only on the hammer (plus any tax).');
  }
  if (leftover < 0) {
    notes.push('This lot loses money after fees, the label, and what you paid for it.');
  }

  return {
    ok: true,
    errors: [],
    salePrice,
    shippingCharged,
    taxCharged,
    shippingCost,
    itemCost,
    otherCost,
    commissionRate,
    commissionCap,
    paymentRate,
    paymentFixed,
    lotsPerShow,
    targetLeftover,
    giveaway,
    checkoutTotal,
    commission,
    processingPercent,
    processing,
    fees,
    payout,
    leftover,
    takeRateOnHammer,
    takeRateOnCheckout,
    processingOnShippingAndTax,
    commissionOnCappedPortion,
    showLeftover: leftover * lotsPerShow,
    hammerForTarget: hammerForTarget({
      targetLeftover,
      shippingCharged,
      taxCharged,
      shippingCost,
      itemCost,
      otherCost,
      commissionRate: giveaway ? 0 : commissionRate,
      commissionCap,
      paymentRate,
      paymentFixed,
    }),
    notes,
  };
}

/**
 * The hammer that produces exactly `targetLeftover` after the same fees and
 * costs. Shipping charged, tax, and the label stay as typed — only the
 * hammer moves. Returns null when the percentage fees leave no solvable
 * remainder.
 */
export function hammerForTarget({
  targetLeftover,
  shippingCharged,
  taxCharged,
  shippingCost,
  itemCost,
  otherCost,
  commissionRate,
  commissionCap,
  paymentRate,
  paymentFixed,
}) {
  const fixedCosts = paymentFixed - shippingCharged + shippingCost + itemCost + otherCost
    + (shippingCharged + taxCharged) * (paymentRate / 100);
  const needed = targetLeftover + fixedCosts;

  const uncappedShare = 1 - commissionRate / 100 - paymentRate / 100;
  if (uncappedShare <= 0) return null;
  const uncapped = needed / uncappedShare;
  if (commissionCap === null || uncapped <= commissionCap) return uncapped;

  const cappedShare = 1 - paymentRate / 100;
  if (cappedShare <= 0) return null;
  const cappedFixed = needed + commissionCap * (commissionRate / 100);
  return cappedFixed / cappedShare;
}

/**
 * The same lot with buyer-paid shipping zeroed, so a seller can see whether
 * eating the label is cheaper than paying processing on the postage.
 */
export function compareFreeShipping(input) {
  const charged = calculateSale(input);
  const free = calculateSale({ ...input, shippingCharged: 0 });
  return {
    charged,
    free,
    leftoverDelta: free.ok && charged.ok ? free.leftover - charged.leftover : null,
  };
}
