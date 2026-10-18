// Pure fee/payout arithmetic for a Mercari sale. No network, no stored live
// schedule beyond the constants below — each one a constant lifted from
// Mercari's own published US Help Center article ("Fees on Mercari",
// mercari.com/us/help_center/article/169/, and "FAQs about our new fee
// structure", .../article/2518/), not a live fetch.
//
// Mercari changed its fee structure for listings created or updated on or
// after January 6, 2025, and the old one is not merely history — a listing
// made before that date keeps its old fee structure until the seller edits
// it (Mercari's own FAQ), so both schedules are live and this tool models
// both rather than assuming every seller has already been switched over.
//
//   - CURRENT (Jan 6, 2025 onward): a single 10% selling fee, charged on the
//     item price PLUS any shipping the buyer pays — not the item price
//     alone. There is no separate payment processing fee.
//   - LEGACY (a listing made before Jan 6, 2025 that has not since been
//     edited): a 10% selling fee on the item price only, PLUS a payment
//     processing fee of 2.9% of (item price + buyer-paid shipping) plus a
//     flat $0.50.
//
// Two things this tool exists to make visible that a flat "Mercari takes
// 10%" page misses:
//
// 1. Under the current schedule, the fee is charged on the SHIPPING too. A
//    seller who lists an item at $20 with $6 buyer-paid shipping pays 10%
//    of $26 ($2.60), not 10% of $20 ($2.00) — easy to miss coming from a
//    marketplace, or from Mercari's own older schedule, that fee-exempts
//    shipping.
// 2. Mercari's separate 3.6% "Buyer Protection Fee" is charged to the
//    BUYER, added on top of what they pay, and never reduces what the
//    seller receives — easy to mistake for a second seller-side cut
//    because Mercari announced it in the same breath as the seller fee
//    change.
//
// Shipping a seller pays for out of pocket (buying their own label, or
// Mercari deducting a prepaid-label cost from earnings) is a real cost but
// not a Mercari *fee* — `labelCost` below is kept as a separate input from
// the two schedules' percentage fees for exactly that reason: it is a
// number the seller already knows from their own shipping choice, not one
// Mercari's published fee schedule sets.

/** Current (Jan 6, 2025 onward) selling fee, percent of item + buyer-paid shipping. */
export const SELLING_FEE_RATE = 10;
/** Legacy selling fee, percent of item price only. */
export const LEGACY_SELLING_FEE_RATE = 10;
/** Legacy payment processing fee, percent of item + buyer-paid shipping. */
export const LEGACY_PROCESSING_RATE = 2.9;
/** Legacy payment processing fee, flat per order. */
export const LEGACY_PROCESSING_FIXED = 0.50;
/** Buyer Protection Fee, percent of item + buyer-paid shipping — paid by the buyer, never the seller. */
export const BUYER_PROTECTION_RATE = 3.6;

// Every seller-supplied numeric field, in the order the form presents them.
// The page and the share-link encoder both read this rather than keeping
// their own copies — see share.mjs for why a second copy of a field list is
// how a shared link silently drops a field.
export const INPUT_IDS = Object.freeze([
  'itemPrice',
  'buyerShipping',
  'labelCost',
  'itemCost',
  'otherCost',
  'targetProfit',
]);

// The one checkbox: which fee schedule this listing is actually on.
export const TOGGLE_IDS = Object.freeze(['legacySchedule']);

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

/** Mercari's own cut of one sale — selling fee, plus the legacy processing fee when it applies. */
export function feeFor({ itemPrice, buyerShipping = 0, legacySchedule = false }) {
  const combined = itemPrice + buyerShipping;
  if (legacySchedule) {
    const sellingFee = itemPrice * (LEGACY_SELLING_FEE_RATE / 100);
    const processingFee = itemPrice > 0 || buyerShipping > 0
      ? combined * (LEGACY_PROCESSING_RATE / 100) + LEGACY_PROCESSING_FIXED
      : 0;
    return { sellingFee, processingFee, mercariFee: sellingFee + processingFee };
  }
  const sellingFee = combined * (SELLING_FEE_RATE / 100);
  return { sellingFee, processingFee: 0, mercariFee: sellingFee };
}

/**
 * The item price that nets exactly `targetPayout` after Mercari's fee and a
 * self-bought shipping label, at a fixed buyer-paid-shipping amount.
 *
 * Both schedules are linear in item price, so each has exactly one solution:
 *   current: payout = 0.9*(price + shipping) - label
 *   legacy:  payout = price*(1 - 0.10 - 0.029) + shipping*(1 - 0.029) - 0.50 - label
 */
export function priceForTargetPayout(targetPayout, { buyerShipping = 0, labelCost = 0, legacySchedule = false } = {}) {
  if (!Number.isFinite(targetPayout)) return null;
  if (legacySchedule) {
    const rate = 1 - LEGACY_SELLING_FEE_RATE / 100 - LEGACY_PROCESSING_RATE / 100;
    const price = (targetPayout - buyerShipping * (1 - LEGACY_PROCESSING_RATE / 100) + LEGACY_PROCESSING_FIXED + labelCost) / rate;
    return price >= 0 ? price : null;
  }
  const rate = 1 - SELLING_FEE_RATE / 100;
  const price = (targetPayout + labelCost) / rate - buyerShipping;
  return price >= 0 ? price : null;
}

/**
 * One Mercari sale, priced the way a payout statement actually lands.
 *
 * @param {object} input
 * @param {number} input.itemPrice        What the buyer paid for the item (not shipping).
 * @param {number} [input.buyerShipping]  Shipping the buyer paid on top of the item price, if any.
 * @param {number} [input.labelCost]      A shipping label you bought yourself (not a Mercari fee).
 * @param {number} [input.itemCost]       What you originally paid for the item.
 * @param {number} [input.otherCost]      Packaging / prep cost on this sale.
 * @param {number} [input.targetProfit]   Desired profit above cost; used to solve for an item price.
 * @param {boolean} [input.legacySchedule] This listing predates Jan 6, 2025 and has not been edited since.
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
  const legacySchedule = Boolean(input.legacySchedule);

  if (errors.length) return { ok: false, errors };

  const combined = itemPrice + buyerShipping;
  const { sellingFee, processingFee, mercariFee } = feeFor({ itemPrice, buyerShipping, legacySchedule });
  const payout = combined - mercariFee - labelCost;
  const profit = payout - itemCost - otherCost;
  const effectiveRate = combined > 0 ? (mercariFee / combined) * 100 : 0;
  const buyerProtectionFee = combined * (BUYER_PROTECTION_RATE / 100);

  const targetPayout = targetProfit + itemCost + otherCost;
  const priceForTarget = priceForTargetPayout(targetPayout, { buyerShipping, labelCost, legacySchedule });

  const notes = [];
  if (!legacySchedule && buyerShipping > 0) {
    const feeOnShipping = buyerShipping * (SELLING_FEE_RATE / 100);
    notes.push(
      `Your $${buyerShipping.toFixed(2)} buyer-paid shipping is inside the 10% fee base — it costs $${feeOnShipping.toFixed(2)} in fee on its own, not just the item price.`,
    );
  }
  if (legacySchedule) {
    notes.push(
      `This listing is on Mercari's pre-January 6, 2025 schedule: 10% of the item price ($${sellingFee.toFixed(2)}) plus a payment processing fee of 2.9% of $${combined.toFixed(2)} plus $0.50 ($${processingFee.toFixed(2)}). Editing the listing moves it to the current all-in 10% schedule with no separate processing fee.`,
    );
  }
  notes.push(
    `Mercari also charges the buyer a separate ${BUYER_PROTECTION_RATE}% Buyer Protection Fee ($${buyerProtectionFee.toFixed(2)} on this sale) on top of what you charged — it comes out of the buyer's pocket, not yours, and never reduces this payout.`,
  );
  if (profit < 0) {
    notes.push('This sale loses money after Mercari’s fee, your shipping label, what you paid for the item, and packaging.');
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
    legacySchedule,
    sellingFee,
    processingFee,
    mercariFee,
    buyerProtectionFee,
    payout,
    profit,
    effectiveRate,
    priceForTarget,
    notes,
  };
}

/**
 * The same sale priced under both schedules, so a seller can see whether
 * editing an old listing (or waiting for Mercari's automatic one-week
 * update) actually helps — it depends on how much of the price is shipping.
 */
export function compareSchedules(input) {
  const current = calculateSale({ ...input, legacySchedule: false });
  const legacy = calculateSale({ ...input, legacySchedule: true });
  if (!current.ok || !legacy.ok) {
    return { ok: false, errors: current.ok ? legacy.errors : current.errors };
  }
  const payoutDifference = current.payout - legacy.payout;
  const notes = [];
  if (Math.abs(payoutDifference) < 0.005) {
    notes.push('Both schedules pay out almost the same on this sale.');
  } else if (payoutDifference > 0) {
    notes.push(`The current schedule pays $${payoutDifference.toFixed(2)} more on this sale than the legacy one would.`);
  } else {
    notes.push(`The legacy schedule pays $${Math.abs(payoutDifference).toFixed(2)} more on this sale than the current one would — usually because a large share of the price is buyer-paid shipping, which only the current schedule's 10% reaches.`);
  }
  return { ok: true, errors: [], current, legacy, payoutDifference, notes };
}
