// Pure fee/payout arithmetic for a TCGplayer marketplace order. No network and
// no stored live schedule beyond the constants below. They come from
// TCGplayer's published fee table and worked examples as reported in a search
// on 2026-10-18 (see README.md, "Where the numbers come from"); the help
// centre itself could not be fetched from the build environment, so check one
// real payout before you reprice a binder.
//
// TCGplayer charges a seller two things per order (no listing fee):
//
//   1. A marketplace commission, charged per product sold on the order
//      subtotal -- the cards PLUS the shipping the buyer pays -- and capped
//      per product:
//        Marketplace Level 1-4 : 10.75%, capped at $75 per product
//        Pro seller            : 9.25% commission + a 2.5% Pro fee, each
//                                capped at $75 per product
//        before 10 Feb 2026    : 10.25%, capped at $50 per product
//   2. A transaction (payment processing) fee of 2.5% of the whole order
//      total -- cards, shipping AND the sales tax the buyer paid -- plus a
//      flat $0.30 per ORDER, not per card.
//
// Two consequences a flat "TCGplayer takes ~13%" figure hides, and the reason
// this tool exists:
//   * The $0.30 is per order, so it is a large share of a one-card $1 sale and
//     almost nothing on a 20-card cart. What the seller can act on is the
//     order size, not the card price.
//   * The processing fee is charged on tax the seller never receives, and the
//     shipping the buyer pays is inside the commission base, so "free
//     shipping" and "$1.31 shipping" are not just a postage decision.
//
// The cap only matters above a commission base of about $697.67 (10.75% of it
// is $75), so it governs graded slabs and sealed boxes, not singles.
//
// TCGplayer Direct is deliberately not modelled: its published schedule (a
// per-card fee, a different commission, fulfilment by TCGplayer) is described
// differently by different sources, and a number the seller would act on
// should not rest on a guess.

/** Commission cap per product sold, dollars. */
export const COMMISSION_CAP = 75;
export const TRANSACTION_RATE = 2.5;
export const TRANSACTION_FIXED = 0.3;

/**
 * One schedule: the commission lines (percent in whole numbers, cap in
 * dollars per product) and the order-level transaction fee.
 */
export const SCHEDULES = Object.freeze({
  standard: {
    label: 'Marketplace Level 1-4 (current)',
    lines: [{ name: 'Commission', rate: 10.75, cap: 75 }],
  },
  pro: {
    label: 'Pro seller (9.25% + 2.5% Pro fee)',
    lines: [
      { name: 'Commission', rate: 9.25, cap: 75 },
      { name: 'Pro fee', rate: 2.5, cap: 75 },
    ],
  },
  old: {
    label: 'Old rate (10.25%, $50 cap, before 10 Feb 2026)',
    lines: [{ name: 'Commission', rate: 10.25, cap: 50 }],
  },
});

// Every seller-supplied numeric field, in the order the form presents them.
export const INPUT_IDS = Object.freeze([
  'itemPrice',
  'quantity',
  'buyerShipping',
  'salesTaxRate',
  'shippingCost',
  'itemCost',
  'otherCost',
  'targetProfit',
]);

export const TOGGLE_IDS = Object.freeze([]);
export const SELECT_IDS = Object.freeze(['schedule']);

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

function scheduleOf(schedule) {
  return Object.prototype.hasOwnProperty.call(SCHEDULES, schedule) ? SCHEDULES[schedule] : SCHEDULES.standard;
}

/**
 * TCGplayer's cut of one order.
 *
 * @param {object} order
 * @param {number} order.subtotal   Cards plus buyer-paid shipping (the commission base).
 * @param {number} order.quantity   Products sold on the order; each has its own commission cap.
 * @param {number} order.salesTax   Sales tax the buyer paid on the order (it is in the processing base).
 * @param {string} [order.schedule]
 */
export function feeFor({ subtotal, quantity = 1, salesTax = 0, schedule = 'standard' }) {
  const { lines } = scheduleOf(schedule);
  const breakdown = lines.map(({ name, rate, cap }) => {
    const uncapped = subtotal * (rate / 100);
    const capTotal = cap * quantity;
    return { name, uncapped, amount: Math.min(uncapped, capTotal), capped: uncapped > capTotal };
  });
  const commission = breakdown.reduce((sum, line) => sum + line.amount, 0);
  const uncappedCommission = breakdown.reduce((sum, line) => sum + line.uncapped, 0);
  const processingFee = subtotal > 0 ? (subtotal + salesTax) * (TRANSACTION_RATE / 100) + TRANSACTION_FIXED : 0;
  return { commission, uncappedCommission, breakdown, processingFee, tcgplayerFee: commission + processingFee };
}

/**
 * The item price (per card) that nets exactly `targetPayout` before item cost
 * and shipping label, or `null` when none does. Payout rises with price and is
 * continuous across the cap, so a bisection on the subtotal is exact where a
 * closed form would need one branch per cap combination.
 */
export function priceForTargetPayout(targetPayout, { quantity = 1, buyerShipping = 0, salesTaxRate = 0, labelCost = 0, schedule = 'standard' } = {}) {
  if (!Number.isFinite(targetPayout) || !(quantity > 0)) return null;
  const payoutAt = price => {
    const subtotal = price * quantity + buyerShipping;
    const salesTax = subtotal * (salesTaxRate / 100);
    return subtotal - feeFor({ subtotal, quantity, salesTax, schedule }).tcgplayerFee - labelCost;
  };
  const wanted = targetPayout;
  if (payoutAt(0) > wanted) return null; // already above target at a free card (shipping alone covers it)
  let hi = Math.max(1, wanted + labelCost + 1);
  for (let i = 0; payoutAt(hi) < wanted && i < 60; i += 1) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 100; i += 1) {
    const mid = (lo + hi) / 2;
    if (payoutAt(mid) < wanted) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * One TCGplayer order, priced the way a payout actually lands.
 *
 * @param {object} input
 * @param {number} input.itemPrice      Price of one card (or product).
 * @param {number} [input.quantity]     How many of them are on the order (default 1).
 * @param {number} [input.buyerShipping] Shipping the buyer pays on the order.
 * @param {number} [input.salesTaxRate] Buyer's sales tax, percent; it only enters the processing base.
 * @param {number} [input.shippingCost] What the postage and mailer actually cost you.
 * @param {number} [input.itemCost]     What you paid for all the cards on the order.
 * @param {number} [input.otherCost]    Sleeves, toploader, bubble mailer, etc. for the order.
 * @param {number} [input.targetProfit] Profit wanted on the order; used to solve for a price.
 * @param {string} [input.schedule]     'standard', 'pro' or 'old'.
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

  const itemPrice = read('itemPrice', 'Card price');
  const quantity = read('quantity', 'Quantity', { min: 1, allowBlank: true, blankValue: 1 });
  const buyerShipping = read('buyerShipping', 'Shipping the buyer pays', { allowBlank: true });
  const salesTaxRate = read('salesTaxRate', 'Buyer sales tax', { allowBlank: true });
  const shippingCost = read('shippingCost', 'Postage and mailer cost', { allowBlank: true });
  const itemCost = read('itemCost', 'What you paid for the cards', { allowBlank: true });
  const otherCost = read('otherCost', 'Sleeves / toploader cost', { allowBlank: true });
  const targetProfit = read('targetProfit', 'Target profit', { allowBlank: true });
  const schedule = Object.prototype.hasOwnProperty.call(SCHEDULES, input.schedule) ? input.schedule : 'standard';

  if (errors.length) return { ok: false, errors };

  const subtotal = itemPrice * quantity + buyerShipping;
  const salesTax = subtotal * (salesTaxRate / 100);
  const { commission, uncappedCommission, breakdown, processingFee, tcgplayerFee } = feeFor({ subtotal, quantity, salesTax, schedule });
  const payout = subtotal - tcgplayerFee - shippingCost;
  const profit = payout - itemCost - otherCost;
  const effectiveRate = subtotal > 0 ? (tcgplayerFee / subtotal) * 100 : 0;
  const capSaving = uncappedCommission - commission;

  const targetPayout = targetProfit + itemCost + otherCost;
  const priceForTarget = priceForTargetPayout(targetPayout, { quantity, buyerShipping, salesTaxRate, labelCost: shippingCost, schedule });

  const notes = [];
  if (breakdown.some(line => line.capped)) {
    notes.push(`The commission cap applies: without it TCGplayer would take $${uncappedCommission.toFixed(2)} in commission, and you keep $${capSaving.toFixed(2)} more because it stops at $${(scheduleOf(schedule).lines[0].cap * quantity).toFixed(2)}.`);
  }
  if (subtotal > 0 && quantity === 1 && TRANSACTION_FIXED / subtotal > 0.05) {
    notes.push(`The flat $${TRANSACTION_FIXED.toFixed(2)} processing fee is ${((TRANSACTION_FIXED / subtotal) * 100).toFixed(1)}% of this one-item order. It is charged once per order, so a buyer who adds more cards to the same cart pays it only once.`);
  }
  if (quantity > 1) {
    notes.push(`The $${TRANSACTION_FIXED.toFixed(2)} processing fee is charged once for the whole order, not per card: that is $${(TRANSACTION_FIXED / quantity).toFixed(2)} a card here.`);
  }
  if (salesTax > 0) {
    notes.push(`The 2.5% processing fee is charged on the buyer's $${salesTax.toFixed(2)} sales tax too, which you never receive: that costs you $${(salesTax * (TRANSACTION_RATE / 100)).toFixed(2)} on this order.`);
  }
  if (buyerShipping > 0) {
    notes.push('Shipping the buyer pays is inside the commission base, so TCGplayer takes its percentage of the shipping you charge as well as of the cards.');
  }
  if (schedule === 'old') {
    notes.push('This is the old 10.25% / $50-cap schedule, shown so you can see what the 10 February 2026 change cost on this order.');
  }
  notes.push('Direct (fulfilled by TCGplayer) sales use a different schedule that is not modelled here.');
  if (profit < 0) {
    notes.push('This order loses money after TCGplayer’s fees, postage, what you paid for the cards, and supplies.');
  }

  return {
    ok: true,
    errors: [],
    itemPrice,
    quantity,
    buyerShipping,
    salesTaxRate,
    shippingCost,
    itemCost,
    otherCost,
    targetProfit,
    schedule,
    subtotal,
    salesTax,
    commission,
    commissionLines: breakdown,
    capSaving,
    processingFee,
    tcgplayerFee,
    payout,
    profit,
    effectiveRate,
    priceForTarget,
    notes,
  };
}

/**
 * The same order under every schedule, so a seller who is weighing a Pro
 * account, or who priced against last year's 10.25%, sees what each costs on
 * the order in front of them.
 */
export function compareSchedules(input) {
  const results = {};
  for (const schedule of Object.keys(SCHEDULES)) {
    const result = calculateSale({ ...input, schedule });
    if (!result.ok) return { ok: false, errors: result.errors };
    results[schedule] = result;
  }
  const best = Object.entries(results).reduce((a, b) => (b[1].payout > a[1].payout ? b : a));
  return { ok: true, errors: [], results, bestSchedule: best[0] };
}
