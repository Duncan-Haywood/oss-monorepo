// Pure fee/payout arithmetic for a Facebook Marketplace sale. No network, no
// stored live schedule beyond the constants below -- each corroborated
// against Facebook's own Commerce/Seller Help pages and multiple independent
// third-party fee breakdowns from mid-2026, not a live fetch.
//
// Facebook Marketplace runs one seller-facing selling fee, but it only
// applies to one of the two ways an item can sell:
//
//   - Shipped checkout: a 10% selling fee on the buyer-paid total (item
//     price plus any buyer-paid shipping, and sales tax where Facebook
//     collects it), with an $0.80 minimum fee per sale.
//   - Local pickup: $0. Facebook charges no selling fee, listing fee, or
//     subscription cost on a locally-arranged sale.
//
// The thing this tool exists to correct: Facebook's shipped-order fee has
// changed more than once in the last two years, and older blog posts,
// forum threads, and cached help pages still quote a flat percentage with
// no minimum, a different rate, or a separate processing-fee line that most
// current, independently-corroborated sources no longer show as a distinct
// charge on top of the 10%. Pricing a shipped listing on a stale number
// means a payout that comes in lower (or, more rarely, higher) than the
// number budgeted for.
//
// A second thing kept separate: a chargeback penalty. If a shipped order
// ends in a payment dispute that Facebook rules against the seller, a flat
// $20 penalty is deducted from the seller's payout ledger on top of losing
// the sale. This tool models it as an optional toggle, not something to
// assume by default.

export const FEE_RATE = 10; // percent, shipped orders only
export const MIN_FEE = 0.80; // dollars, shipped orders only
export const DISPUTE_PENALTY = 20; // dollars, only on a disputed order ruled against the seller

// Every seller-supplied numeric field, in the order the form presents them.
export const INPUT_IDS = Object.freeze([
  'itemPrice',
  'buyerShipping',
  'taxCollected',
  'labelCost',
  'itemCost',
  'otherCost',
  'targetProfit',
]);

export const TOGGLE_IDS = Object.freeze(['disputed']);
export const SELECT_IDS = Object.freeze(['channel']);

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

/** Facebook's own cut of one sale: the selling fee plus any dispute penalty. */
export function feeFor({ itemPrice, buyerShipping = 0, taxCollected = 0, channel = 'shipped', disputed = false }) {
  const base = itemPrice + buyerShipping + taxCollected;
  const sellingFee = channel === 'shipped' && base > 0 ? Math.max(base * (FEE_RATE / 100), MIN_FEE) : 0;
  const disputePenalty = channel === 'shipped' && disputed ? DISPUTE_PENALTY : 0;
  return { sellingFee, disputePenalty, marketplaceFee: sellingFee + disputePenalty };
}

/**
 * The item price that nets exactly `targetPayout`, at a fixed buyer-paid
 * shipping and tax amount. Below the $0.80 minimum-fee floor the relationship
 * is not linear in the rate, so this solves both branches and picks the one
 * whose own fee is consistent with which branch produced it.
 */
export function priceForTargetPayout(targetPayout, { buyerShipping = 0, taxCollected = 0, labelCost = 0, channel = 'shipped', disputed = false } = {}) {
  if (!Number.isFinite(targetPayout)) return null;
  const disputePenalty = channel === 'shipped' && disputed ? DISPUTE_PENALTY : 0;
  const need = targetPayout + labelCost + disputePenalty;

  if (channel !== 'shipped') {
    const price = need;
    return price >= 0 ? price : null;
  }

  // Branch A: the 10% rate applies (base large enough that the rate beats the floor).
  const baseA = need / (1 - FEE_RATE / 100);
  if (baseA * (FEE_RATE / 100) >= MIN_FEE) {
    const price = baseA - buyerShipping - taxCollected;
    return price >= 0 ? price : null;
  }

  // Branch B: the $0.80 minimum fee applies instead.
  const baseB = need + MIN_FEE;
  const price = baseB - buyerShipping - taxCollected;
  return price >= 0 ? price : null;
}

/**
 * One Facebook Marketplace sale, priced the way a payout deposit actually
 * lands.
 *
 * @param {object} input
 * @param {number} input.itemPrice        What the buyer paid for the item (not shipping or tax).
 * @param {number} [input.buyerShipping]  Shipping the buyer paid, for a shipped-checkout sale.
 * @param {number} [input.taxCollected]   Sales tax Facebook collected on this order, if any.
 * @param {number} [input.labelCost]      A shipping label you bought yourself (not a Facebook fee).
 * @param {number} [input.itemCost]       What you originally paid for the item.
 * @param {number} [input.otherCost]      Packaging / prep cost on this sale.
 * @param {number} [input.targetProfit]   Desired profit above cost; used to solve for an item price.
 * @param {string} [input.channel]        'shipped' or 'local'.
 * @param {boolean} [input.disputed]      Whether this sale ended in a dispute ruled against the seller.
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
  const taxCollected = read('taxCollected', 'Sales tax Facebook collected', { allowBlank: true });
  const labelCost = read('labelCost', 'Shipping label you paid for', { allowBlank: true });
  const itemCost = read('itemCost', 'What you paid for the item', { allowBlank: true });
  const otherCost = read('otherCost', 'Packaging / prep cost', { allowBlank: true });
  const targetProfit = read('targetProfit', 'Target profit', { allowBlank: true });
  const channel = input.channel === 'local' ? 'local' : 'shipped';
  const disputed = Boolean(input.disputed);

  if (errors.length) return { ok: false, errors };

  const base = itemPrice + buyerShipping + taxCollected;
  const { sellingFee, disputePenalty, marketplaceFee } = feeFor({ itemPrice, buyerShipping, taxCollected, channel, disputed });
  const payout = base - marketplaceFee - labelCost;
  const profit = payout - itemCost - otherCost;
  const effectiveRate = base > 0 ? (marketplaceFee / base) * 100 : 0;

  const targetPayout = targetProfit + itemCost + otherCost;
  const priceForTarget = priceForTargetPayout(targetPayout, { buyerShipping, taxCollected, labelCost, channel, disputed });

  const notes = [];
  if (channel === 'local') {
    notes.push('Local pickup sales carry no Facebook Marketplace selling fee, listing fee, or subscription cost — the full item price (minus your own costs) is the payout.');
  } else {
    notes.push(
      `Shipped orders pay 10% of the buyer-paid total (item price, buyer-paid shipping, and any sales tax Facebook collected), with an $0.80 minimum fee per sale${sellingFee === MIN_FEE ? ' — this sale is small enough that the $0.80 minimum applies instead of the 10% rate' : ''}.`,
    );
  }
  if (disputed) {
    notes.push(`This sale is modelled with a payment dispute ruled against the seller: a flat $${DISPUTE_PENALTY.toFixed(2)} chargeback penalty on top of losing the sale, deducted from the seller's payout ledger.`);
  }
  if (profit < 0) {
    notes.push('This sale loses money after Facebook’s fee, your shipping label, what you paid for the item, and packaging.');
  }

  return {
    ok: true,
    errors: [],
    itemPrice,
    buyerShipping,
    taxCollected,
    labelCost,
    itemCost,
    otherCost,
    targetProfit,
    channel,
    disputed,
    sellingFee,
    disputePenalty,
    marketplaceFee,
    payout,
    profit,
    effectiveRate,
    priceForTarget,
    notes,
  };
}
