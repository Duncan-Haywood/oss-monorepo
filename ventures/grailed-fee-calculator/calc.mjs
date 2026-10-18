// Pure fee/payout arithmetic for a Grailed sale. No network and no stored live
// schedule beyond the constants below. They come from third-party fee guides
// that agree with each other (see README.md, "Where the numbers come from"),
// not from a fetch of Grailed's own help centre, which no session here can
// reach -- so check them against a real payout before pricing a whole closet.
//
// Grailed charges the seller two things and nothing else (no listing fee, no
// subscription, no buyer fee):
//
//   1. A commission. Since 20 May 2026 it is tiered on the sale amount:
//        under $120  -> 6%, with a $1.99 minimum
//        $120 or over -> 9%
//      Before that it was a flat 9% for every sale. "Grailed takes 9%" is
//      still what most blog posts and most other fee calculators say.
//   2. Payment processing: 3.49% + $0.49 on a domestic sale (4.99% + $0.49
//      when the buyer is international).
//
// The commission's base is the item price, plus any shipping the buyer pays
// you directly (your own label). With a Grailed-provided label the buyer's
// shipping goes to the carrier, not to you, so leave "buyer-paid shipping"
// blank and the base is the item price alone.
//
// The thing this tool exists to show: because the tier is a step, not a
// slope, the 9% rate applies to the WHOLE sale the moment it reaches $120. A
// jacket listed at $120 nets about $3.60 less than the same jacket at
// $119.99, and you must list somewhere around $124 to net the same. The
// "cliff" below computes that gap for the sale on screen. If Grailed ever
// moves to a marginal schedule (6% on the first $120, 9% above) the cliff
// disappears and the constants here are the only thing to change.
//
// The commission is not shown to the buyer; the buyer pays the listed price
// plus shipping and any sales tax. Neither tax nor the buyer's side of the
// checkout is modelled -- it never touches the seller payout.

/** Commission tiers, percent in whole numbers (6 means 6%), threshold in dollars. */
export const TIER_THRESHOLD = 120;
export const LOW_RATE = 6;
export const HIGH_RATE = 9;
export const MIN_COMMISSION = 1.99;

/** One schedule: how commission is charged, and the payment-processing fee. */
export const SCHEDULES = Object.freeze({
  us: { label: 'Domestic sale, tiered commission (current)', tiered: true, processingRate: 3.49, processingFixed: 0.49 },
  intl: { label: 'International buyer, tiered commission', tiered: true, processingRate: 4.99, processingFixed: 0.49 },
  legacy: { label: 'Old flat 9% commission (before 20 May 2026)', tiered: false, processingRate: 3.49, processingFixed: 0.49 },
});

// Every seller-supplied numeric field, in the order the form presents them.
export const INPUT_IDS = Object.freeze([
  'itemPrice',
  'buyerShipping',
  'labelCost',
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
  return Object.prototype.hasOwnProperty.call(SCHEDULES, schedule) ? SCHEDULES[schedule] : SCHEDULES.us;
}

/** Commission on a sale amount (item price plus buyer-paid shipping) under one schedule. */
export function commissionFor(base, schedule = 'us') {
  if (!(base > 0)) return 0;
  if (!scheduleOf(schedule).tiered) return base * (HIGH_RATE / 100);
  if (base >= TIER_THRESHOLD) return base * (HIGH_RATE / 100);
  return Math.max(base * (LOW_RATE / 100), MIN_COMMISSION);
}

/** Grailed's own cut of one sale: commission, processing, and their sum. */
export function feeFor({ itemPrice, buyerShipping = 0, schedule = 'us' }) {
  const { processingRate, processingFixed } = scheduleOf(schedule);
  const base = itemPrice + buyerShipping;
  const commission = commissionFor(base, schedule);
  const processingFee = base > 0 ? base * (processingRate / 100) + processingFixed : 0;
  return { commission, processingFee, grailedFee: commission + processingFee };
}

/**
 * The item price that nets exactly `targetPayout` (before item cost), at a
 * fixed buyer-paid shipping amount, or the lowest of several when the step in
 * the commission makes more than one price qualify.
 *
 * Within each commission regime the payout is linear in the item price, so
 * each regime has one candidate; a candidate only counts if the price really
 * falls inside the regime it was solved for. The smallest valid one wins.
 */
export function priceForTargetPayout(targetPayout, { buyerShipping = 0, labelCost = 0, schedule = 'us' } = {}) {
  if (!Number.isFinite(targetPayout)) return null;
  const { tiered, processingRate, processingFixed } = scheduleOf(schedule);
  const pr = processingRate / 100;
  const regimes = tiered
    ? [
        { kind: 'min', valid: base => base < TIER_THRESHOLD && base * (LOW_RATE / 100) <= MIN_COMMISSION },
        { kind: 'low', rate: LOW_RATE / 100, valid: base => base < TIER_THRESHOLD && base * (LOW_RATE / 100) >= MIN_COMMISSION },
        { kind: 'high', rate: HIGH_RATE / 100, valid: base => base >= TIER_THRESHOLD },
      ]
    : [{ kind: 'high', rate: HIGH_RATE / 100, valid: () => true }];

  let best = null;
  for (const regime of regimes) {
    const price =
      regime.kind === 'min'
        ? (targetPayout + MIN_COMMISSION + processingFixed + labelCost) / (1 - pr) - buyerShipping
        : (targetPayout + processingFixed + labelCost) / (1 - regime.rate - pr) - buyerShipping;
    if (!(price >= 0) || !regime.valid(price + buyerShipping)) continue;
    if (best === null || price < best) best = price;
  }
  return best;
}

/**
 * The $120 step for the shipping on screen: the payout one cent below it, the
 * payout at it, and the smallest item price at or above it that nets as much
 * as the cent below. `null` when the schedule is flat, or buyer-paid shipping
 * alone already puts every sale at 9%.
 */
export function cliffFor({ buyerShipping = 0, labelCost = 0, schedule = 'us' } = {}) {
  if (!scheduleOf(schedule).tiered) return null;
  const baseBelow = TIER_THRESHOLD - 0.01;
  const priceBelow = baseBelow - buyerShipping;
  if (priceBelow <= 0) return null;
  const payoutOf = price => price + buyerShipping - feeFor({ itemPrice: price, buyerShipping, schedule }).grailedFee - labelCost;
  const priceAt = TIER_THRESHOLD - buyerShipping;
  const payoutBelow = payoutOf(priceBelow);
  const { processingRate, processingFixed } = scheduleOf(schedule);
  const recoverPrice = (payoutBelow + processingFixed + labelCost) / (1 - HIGH_RATE / 100 - processingRate / 100) - buyerShipping;
  return { priceBelow, priceAt, payoutBelow, payoutAt: payoutOf(priceAt), recoverPrice, loss: payoutBelow - payoutOf(priceAt) };
}

/**
 * One Grailed sale, priced the way a payout deposit actually lands.
 *
 * @param {object} input
 * @param {number} input.itemPrice        The listed price of the item (not shipping).
 * @param {number} [input.buyerShipping]  Shipping the buyer pays YOU on top of the price (your own label); blank with a Grailed label.
 * @param {number} [input.labelCost]      A shipping label you bought yourself.
 * @param {number} [input.itemCost]       What you originally paid for the item.
 * @param {number} [input.otherCost]      Packaging / prep / cleaning cost on this sale.
 * @param {number} [input.targetProfit]   Desired profit above cost; used to solve for a listing price.
 * @param {string} [input.schedule]       'us', 'intl' or 'legacy'.
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
  const labelCost = read('labelCost', 'Shipping label you paid for', { allowBlank: true });
  const itemCost = read('itemCost', 'What you paid for the item', { allowBlank: true });
  const otherCost = read('otherCost', 'Packaging / prep cost', { allowBlank: true });
  const targetProfit = read('targetProfit', 'Target profit', { allowBlank: true });
  const schedule = Object.prototype.hasOwnProperty.call(SCHEDULES, input.schedule) ? input.schedule : 'us';

  if (errors.length) return { ok: false, errors };

  const base = itemPrice + buyerShipping;
  const { commission, processingFee, grailedFee } = feeFor({ itemPrice, buyerShipping, schedule });
  const payout = base - grailedFee - labelCost;
  const profit = payout - itemCost - otherCost;
  const effectiveRate = base > 0 ? (grailedFee / base) * 100 : 0;

  const targetPayout = targetProfit + itemCost + otherCost;
  const priceForTarget = priceForTargetPayout(targetPayout, { buyerShipping, labelCost, schedule });
  const cliff = cliffFor({ buyerShipping, labelCost, schedule });

  const tiered = scheduleOf(schedule).tiered;
  const notes = [];
  if (tiered && base < TIER_THRESHOLD && base * (LOW_RATE / 100) < MIN_COMMISSION && base > 0) {
    notes.push(`The ${LOW_RATE}% commission would be under Grailed's $${MIN_COMMISSION.toFixed(2)} minimum on a sale this small, so the minimum applies: that is ${((MIN_COMMISSION / base) * 100).toFixed(1)}% of this sale rather than ${LOW_RATE}%.`);
  }
  if (tiered && cliff && base >= TIER_THRESHOLD && itemPrice < cliff.recoverPrice) {
    notes.push(
      `This sale is over the $${TIER_THRESHOLD} step, so ${HIGH_RATE}% applies to all of it. The same item one cent under would have paid you $${cliff.loss.toFixed(2)} more; you need to list at about $${cliff.recoverPrice.toFixed(2)} to net what $${cliff.priceBelow.toFixed(2)} does.`,
    );
  }
  if (tiered && base < TIER_THRESHOLD && cliff && base >= TIER_THRESHOLD - 15) {
    notes.push(`You are within $15 of the $${TIER_THRESHOLD} step where the commission rises from ${LOW_RATE}% to ${HIGH_RATE}% on the whole sale. A price just under it keeps the lower rate; see the cliff below.`);
  }
  if (!tiered) {
    notes.push('This is the old flat 9% schedule, shown so you can compare it with the current tiered one. Sales under $120 now pay less than this; sales of $120 and over pay the same.');
  }
  notes.push(
    'Grailed charges the buyer no separate fee, and sales tax is collected from the buyer on top of the price, so neither is deducted from this payout. If you ship with a Grailed label, leave buyer-paid shipping blank: the commission is then on the item price alone.',
  );
  if (profit < 0) {
    notes.push('This sale loses money after Grailed’s fees, your shipping label, what you paid for the item, and packaging.');
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
    schedule,
    commission,
    processingFee,
    grailedFee,
    payout,
    profit,
    effectiveRate,
    priceForTarget,
    cliff,
    notes,
  };
}

/**
 * The same sale under all three schedules, so a seller who has only seen the
 * old "Grailed takes 9%" figure can see what the tiered commission changed on
 * the specific piece in front of them -- and what an international buyer costs.
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
