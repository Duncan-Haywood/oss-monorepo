// Pure fee/payout arithmetic for a Discogs Marketplace sale. No network, no
// live schedule beyond the constants below.
//
// What Discogs publishes (Discogs Help Center, "What Are The Fees For Selling
// On Discogs?", and the 2023 "Selling Fee FAQ"): a 9% selling fee, charged on
// the item price PLUS the shipping the buyer pays, with a minimum of $0.10 and
// a maximum of $150 per order. Listing is free. The 9% took effect on
// May 22, 2023 (it was 8% before).
//
// What Discogs does not publish as one number: the payment processing fee the
// seller's payment provider takes on the same order. It differs by country and
// by account, and the figures quoted by third parties disagree (2.7% + $0.25,
// 2.9% + $0.30, 3.49% + $0.49). So the processing rate and fixed amount are
// two inputs the seller can overwrite from their own payout statement; the
// defaults below are a starting point, not Discogs' rate.
//
// Two things this tool exists to make visible that a flat "Discogs takes 9%"
// page misses:
//
// 1. The 9% reaches shipping. A $20 record with $6 shipping pays 9% of $26,
//    and so does the processing fee. Charging postage above what the label
//    costs is taxed like price, not passed through.
// 2. The fixed processing amount is per order, so on a $3 single it is most of
//    the take. `effectiveRate` is the whole cut as a share of what the buyer
//    paid; the fee ladder shows where it flattens out.

/** Selling fee, percent of item + buyer-paid shipping. */
export const SELLING_FEE_RATE = 9;
/** Smallest selling fee on one order, dollars. */
export const SELLING_FEE_MIN = 0.10;
/** Largest selling fee on one order, dollars. */
export const SELLING_FEE_MAX = 150;
/** Default payment processing percent, of item + shipping. Overwritable: not a Discogs-published rate. */
export const DEFAULT_PROCESSING_RATE = 2.9;
/** Default payment processing flat amount per order. Overwritable: not a Discogs-published rate. */
export const DEFAULT_PROCESSING_FIXED = 0.30;

// Every seller-supplied numeric field, in the order the form presents them.
// The page and the share-link encoder both read this rather than keeping
// their own copies.
export const INPUT_IDS = Object.freeze([
  'itemPrice',
  'buyerShipping',
  'labelCost',
  'itemCost',
  'otherCost',
  'targetProfit',
  'processingRate',
  'processingFixed',
]);

// No checkboxes: Discogs has one schedule. Kept so share.mjs stays the same
// shape as the portfolio's other fee calculators.
export const TOGGLE_IDS = Object.freeze([]);

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

/** Discogs' selling fee on an order total (item + buyer-paid shipping). */
export function sellingFeeOn(combined) {
  if (!(combined > 0)) return 0;
  return Math.min(SELLING_FEE_MAX, Math.max(SELLING_FEE_MIN, combined * (SELLING_FEE_RATE / 100)));
}

/** Discogs' cut of one order: selling fee plus processing. */
export function feeFor({ itemPrice, buyerShipping = 0, processingRate = DEFAULT_PROCESSING_RATE, processingFixed = DEFAULT_PROCESSING_FIXED }) {
  const combined = itemPrice + buyerShipping;
  const sellingFee = sellingFeeOn(combined);
  const processingFee = combined > 0 ? combined * (processingRate / 100) + processingFixed : 0;
  return { sellingFee, processingFee, discogsFee: sellingFee + processingFee };
}

function payoutAt(combined, { labelCost, processingRate, processingFixed }) {
  const { discogsFee } = feeFor({ itemPrice: combined, buyerShipping: 0, processingRate, processingFixed });
  return combined - discogsFee - labelCost;
}

/**
 * The item price that nets exactly `targetPayout` after the fee and a label
 * you paid for, at a fixed buyer-paid shipping amount. Payout rises with the
 * order total at every point (the combined rates are well under 100%), so a
 * bisection finds the single answer even across the $0.10 floor and the $150
 * cap, where a closed form would be wrong on one side of each.
 */
export function priceForTargetPayout(targetPayout, { buyerShipping = 0, labelCost = 0, processingRate = DEFAULT_PROCESSING_RATE, processingFixed = DEFAULT_PROCESSING_FIXED } = {}) {
  if (!Number.isFinite(targetPayout)) return null;
  const opts = { labelCost, processingRate, processingFixed };
  let low = 0;
  let high = 1e7;
  if (payoutAt(high, opts) < targetPayout) return null;
  for (let i = 0; i < 200; i += 1) {
    const mid = (low + high) / 2;
    if (payoutAt(mid, opts) < targetPayout) low = mid;
    else high = mid;
  }
  const price = high - buyerShipping;
  return price >= 0 ? price : null;
}

/**
 * One Discogs sale, priced the way a payout statement lands.
 *
 * @param {object} input
 * @param {number} input.itemPrice        What the buyer paid for the item(s), not shipping.
 * @param {number} [input.buyerShipping]  Shipping the buyer paid on top.
 * @param {number} [input.labelCost]      The postage you paid to ship it.
 * @param {number} [input.itemCost]       What you originally paid for the record(s).
 * @param {number} [input.otherCost]      Mailer, sleeve, tape: packaging on this order.
 * @param {number} [input.targetProfit]   Desired profit; used to solve for an item price.
 * @param {number} [input.processingRate] Payment processing percent. Blank uses the default.
 * @param {number} [input.processingFixed] Payment processing flat amount. Blank uses the default.
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

  const itemPrice = read('itemPrice', 'Item price');
  const buyerShipping = read('buyerShipping', 'Buyer-paid shipping', { allowBlank: true });
  const labelCost = read('labelCost', 'Postage you paid', { allowBlank: true });
  const itemCost = read('itemCost', 'What you paid for the item', { allowBlank: true });
  const otherCost = read('otherCost', 'Packaging cost', { allowBlank: true });
  const targetProfit = read('targetProfit', 'Target profit', { allowBlank: true });
  const processingRate = read('processingRate', 'Processing rate (%)', { allowBlank: true, blankValue: DEFAULT_PROCESSING_RATE });
  const processingFixed = read('processingFixed', 'Processing flat fee ($)', { allowBlank: true, blankValue: DEFAULT_PROCESSING_FIXED });
  if (processingRate >= 90) errors.push({ id: 'processingRate', message: 'Processing rate (%) must be under 90' });

  if (errors.length) return { ok: false, errors };

  const combined = itemPrice + buyerShipping;
  const { sellingFee, processingFee, discogsFee } = feeFor({ itemPrice, buyerShipping, processingRate, processingFixed });
  const payout = combined - discogsFee - labelCost;
  const profit = payout - itemCost - otherCost;
  const effectiveRate = combined > 0 ? (discogsFee / combined) * 100 : 0;
  const priceForTarget = priceForTargetPayout(targetProfit + itemCost + otherCost, { buyerShipping, labelCost, processingRate, processingFixed });

  const notes = [];
  if (buyerShipping > 0) {
    const onShipping = buyerShipping * ((SELLING_FEE_RATE + processingRate) / 100);
    notes.push(
      `Your $${buyerShipping.toFixed(2)} buyer-paid shipping is inside the fee base: it costs $${onShipping.toFixed(2)} in selling and processing fees on its own. Whether you charge it as shipping or fold it into the item price, Discogs takes the same cut of the total.`,
    );
  }
  if (sellingFee >= SELLING_FEE_MAX) {
    notes.push(`The selling fee is at Discogs' $${SELLING_FEE_MAX} per-order maximum, so every further dollar of this order carries no selling fee (processing still applies).`);
  }
  if (combined > 0 && combined < 5 && processingFixed > 0) {
    notes.push(`On an order this small the flat $${processingFixed.toFixed(2)} processing amount is a large share of the take (${effectiveRate.toFixed(1)}% in all). Combining records into one order spreads it.`);
  }
  if (profit < 0) {
    notes.push('This sale loses money after Discogs’ fees, your postage, what you paid for the item, and packaging.');
  }

  return {
    ok: true,
    errors: [],
    itemPrice,
    buyerShipping,
    labelCost,
    itemCost,
    otherCost,
    targetProfit,
    processingRate,
    processingFixed,
    sellingFee,
    processingFee,
    discogsFee,
    payout,
    profit,
    effectiveRate,
    priceForTarget,
    notes,
  };
}

const LADDER_PRICES = Object.freeze([3, 5, 10, 20, 50, 100, 250, 1000, 2500]);

/**
 * The same shipping and costs at a ladder of item prices, so the seller can
 * see where the take per dollar flattens and where a record stops covering
 * its own fixed fee and postage. The seller's own price is not forced into
 * the ladder; the main result already shows it.
 */
export function feeLadder(input) {
  const base = calculateSale(input);
  if (!base.ok) return { ok: false, errors: base.errors, rows: [] };
  const rows = LADDER_PRICES.map((price) => {
    const sale = calculateSale({ ...input, itemPrice: price });
    return { itemPrice: price, discogsFee: sale.discogsFee, payout: sale.payout, profit: sale.profit, effectiveRate: sale.effectiveRate };
  });
  return { ok: true, errors: [], rows };
}
