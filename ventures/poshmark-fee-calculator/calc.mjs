// Pure Poshmark seller-payout arithmetic. No network, no stored live schedule.
//
// Poshmark's published US commission schedule is two rules, not one:
//
//   - Sale price under $15.00: Poshmark keeps a flat $2.95. You keep the rest.
//   - Sale price $15.00 or more: Poshmark keeps 20% of the sale price.
//
// That is a genuine cliff, not a marginal rate — the whole sale price is
// taxed at whichever rule applies, not just the portion above $15. Two things
// follow from it that a flat "Poshmark takes 20%" page misses, and that this
// tool exists to make visible:
//
// 1. The flat $2.95 fee is a *worse* deal than 20% would be on almost every
//    item it applies to. 20% of $2.95 is $14.75 — call it the break-even
//    price. Above $14.75 (and below $15, where the flat fee still applies),
//    $2.95 is a bargain against what 20% would have charged. Below $14.75 the
//    flat fee costs more than 20% would, and the gap widens fast as price
//    drops: a $10 item pays a 29.5% effective rate, a $5 item pays 59%. Sold
//    for cost is common in a Poshmark closet clearing out low-value pieces —
//    this is the arithmetic that says whether that price is worth listing at
//    all.
// 2. Because the switch happens at exactly $15.00, negotiating an offer or a
//    bundle discount that drops the final price from $15+ to under $15 can
//    cost the seller more than the discount itself: the fee jumps from 20% of
//    the higher price to a flat $2.95, and near the boundary $2.95 can be
//    close to — or even more than — the discount just given away.
//
// Every rate is a constant lifted from Poshmark's own published US seller
// fee schedule (poshmark.com "Selling — How Poshmark Works"), not a live
// fetch. Poshmark does not take any cut of the buyer-paid shipping charge —
// that flat fee funds a prepaid USPS label and never touches seller payout —
// so shipping is deliberately not an input to this arithmetic, unlike a
// marketplace that commissions the checkout total.

export const COMMISSION_THRESHOLD = 15;
export const FLAT_FEE = 2.95;
export const PERCENT_RATE = 20;

/** The sale price at which 20% of the price equals the flat $2.95 fee. */
export const BREAK_EVEN_PRICE = Math.round((FLAT_FEE / (PERCENT_RATE / 100)) * 100) / 100;

export const INPUT_IDS = Object.freeze([
  'salePrice',
  'itemCost',
  'otherCost',
  'targetProfit',
]);

export const OFFER_INPUT_IDS = Object.freeze([
  'listedPrice',
  'offerPrice',
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

/** Which tier a sale price falls in, and the commission it pays. */
export function commissionFor(salePrice) {
  if (salePrice < COMMISSION_THRESHOLD) {
    return { tier: 'flat', commission: Math.min(FLAT_FEE, salePrice) };
  }
  return { tier: 'percent', commission: salePrice * (PERCENT_RATE / 100) };
}

/**
 * The listing price that nets exactly `targetPayout`, or null when no price
 * achieves it (a negative target with nothing to solve against).
 *
 * The two tiers are each monotonic in price, so within a tier there is at
 * most one solution: solve the flat tier first (payout = price - 2.95, valid
 * for price < $15, i.e. payout < $15 - $2.95), and fall back to the percent
 * tier (payout = 0.8 × price, valid for price >= $15, i.e. payout >= $12)
 * otherwise. A target in the narrow overlap ($12.00-$12.05) is achievable in
 * either tier; the flat-tier price (just under $15) is returned because it is
 * the lower of the two and therefore the easier sale.
 */
export function priceForTargetPayout(targetPayout) {
  if (!Number.isFinite(targetPayout)) return null;
  const flatPrice = targetPayout + FLAT_FEE;
  if (flatPrice >= 0 && flatPrice < COMMISSION_THRESHOLD) return flatPrice;
  const percentPrice = targetPayout / (1 - PERCENT_RATE / 100);
  if (percentPrice >= COMMISSION_THRESHOLD) return percentPrice;
  // Between the two: target payout is negative and below what the flat tier
  // can reach (minimum payout in that tier is -FLAT_FEE at price 0).
  return null;
}

/**
 * One Poshmark sale, priced the way a payout statement actually lands.
 *
 * @param {object} input
 * @param {number} input.salePrice    What the buyer paid for the item (not shipping).
 * @param {number} [input.itemCost]   What you originally paid for the item.
 * @param {number} [input.otherCost]  Poly mailers, tags, prep cost on this sale.
 * @param {number} [input.targetProfit] Desired profit above cost; used to solve for a listing price.
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
  const itemCost = read('itemCost', 'What you paid for the item', { allowBlank: true });
  const otherCost = read('otherCost', 'Packaging / prep cost', { allowBlank: true });
  const targetProfit = read('targetProfit', 'Target profit', { allowBlank: true });

  if (errors.length) return { ok: false, errors };

  const { tier, commission } = commissionFor(salePrice);
  const payout = salePrice - commission;
  const profit = payout - itemCost - otherCost;
  const effectiveRate = salePrice > 0 ? (commission / salePrice) * 100 : 0;
  const percentRateWouldBe = salePrice * (PERCENT_RATE / 100);
  const extraVersusPercent = tier === 'flat' ? commission - percentRateWouldBe : 0;

  const targetPayout = targetProfit + itemCost + otherCost;
  const priceForTarget = priceForTargetPayout(targetPayout);

  const notes = [];
  if (tier === 'flat' && salePrice > 0) {
    if (extraVersusPercent > 0) {
      notes.push(
        `The flat $${FLAT_FEE.toFixed(2)} fee costs $${extraVersusPercent.toFixed(2)} more than 20% would have — an effective rate of ${effectiveRate.toFixed(1)}% on this price. Below $${BREAK_EVEN_PRICE.toFixed(2)}, the flat fee is always the worse deal, and it gets worse the cheaper the item.`,
      );
    } else if (extraVersusPercent < 0) {
      notes.push(
        `Between $${BREAK_EVEN_PRICE.toFixed(2)} and $${COMMISSION_THRESHOLD.toFixed(2)}, the flat fee is a bargain against 20% — you save $${Math.abs(extraVersusPercent).toFixed(2)} versus the percent tier.`,
      );
    }
  }
  if (tier === 'percent' && salePrice < COMMISSION_THRESHOLD + 1) {
    notes.push(`At $${salePrice.toFixed(2)} you are just over the $${COMMISSION_THRESHOLD.toFixed(2)} line — $0.01 lower and the fee would drop to a flat $${FLAT_FEE.toFixed(2)}.`);
  }
  if (profit < 0) {
    notes.push('This sale loses money after the Poshmark fee, what you paid for the item, and packaging.');
  }

  return {
    ok: true,
    errors: [],
    salePrice,
    itemCost,
    otherCost,
    targetProfit,
    tier,
    commission,
    payout,
    profit,
    effectiveRate,
    percentRateWouldBe,
    extraVersusPercent,
    priceForTarget,
    notes,
  };
}

/**
 * Compares a full-price (listed) sale against a lower offer or bundle price,
 * so a seller can see how much of the discount actually comes out of their
 * own payout versus Poshmark's commission.
 *
 * Within one tier, Poshmark shares in every discount automatically: the
 * percent tier takes 20% *of whatever the buyer pays*, so a $1 discount
 * only costs the seller 80 cents, and the flat tier's commission has already
 * bottomed out at $2.95 so it does not move at all — a $1 discount there
 * costs the seller the full dollar.
 *
 * Crossing from the percent tier down into the flat tier is the one place
 * commission moves in a lump rather than proportionally, and the direction
 * is easy to get backwards by intuition: because 20% of anything at or above
 * $14.75 is at least $2.95, the switch to the flat fee is a one-time
 * *reduction* in commission, not an increase. That can even make the
 * seller's payout go *up* on a lower sale price — accepting one cent less
 * can be worth more in the pocket, because it is the cent that crosses the
 * line into the flat fee. `payoutDrop` below is deliberately signed rather
 * than clamped at zero so that case is visible rather than hidden.
 */
export function compareOffer(input) {
  const errors = [];
  const read = (id, label, opts) => {
    try {
      return number(input[id], label, opts);
    } catch (error) {
      errors.push({ id, message: error.message });
      return 0;
    }
  };

  const listedPrice = read('listedPrice', 'Listed price');
  const offerPrice = read('offerPrice', 'Offer price');
  const itemCost = read('itemCost', 'What you paid for the item', { allowBlank: true });
  const otherCost = read('otherCost', 'Packaging / prep cost', { allowBlank: true });

  if (errors.length) return { ok: false, errors };

  const listed = calculateSale({ salePrice: listedPrice, itemCost, otherCost });
  const offer = calculateSale({ salePrice: offerPrice, itemCost, otherCost });

  const priceDrop = listedPrice - offerPrice;
  const payoutDrop = listed.payout - offer.payout;
  const commissionDrop = listed.commission - offer.commission;
  const crossesThreshold = offerPrice < COMMISSION_THRESHOLD && listedPrice >= COMMISSION_THRESHOLD;

  const notes = [];
  if (crossesThreshold) {
    if (payoutDrop < 0) {
      notes.push(
        `Crossing under $${COMMISSION_THRESHOLD.toFixed(2)} drops the commission so much that you actually keep $${Math.abs(payoutDrop).toFixed(2)} more at the lower price.`,
      );
    } else {
      notes.push(
        `Of the $${priceDrop.toFixed(2)} discount, Poshmark's commission absorbed $${commissionDrop.toFixed(2)} (crossing into the flat $${FLAT_FEE.toFixed(2)} fee) and $${payoutDrop.toFixed(2)} came out of your own payout.`,
      );
    }
    notes.push(`Once you are under $${COMMISSION_THRESHOLD.toFixed(2)}, the fee is fixed at $${FLAT_FEE.toFixed(2)} no matter how low you go — Poshmark stops sharing in any further discount.`);
  } else if (priceDrop < 0) {
    notes.push(`The offer is $${Math.abs(priceDrop).toFixed(2)} above the listed price, so there is no discount to weigh. Check that the two prices are not swapped.`);
  } else if (priceDrop > 0) {
    const shareLabel = listedPrice >= COMMISSION_THRESHOLD
      ? `Poshmark absorbed $${commissionDrop.toFixed(2)} of the $${priceDrop.toFixed(2)} discount (20% of it) — you absorbed the other $${payoutDrop.toFixed(2)}.`
      : `The fee stayed flat at $${FLAT_FEE.toFixed(2)}, so the entire $${priceDrop.toFixed(2)} discount came out of your own payout.`;
    notes.push(shareLabel);
  }

  return {
    ok: true,
    errors: [],
    listed,
    offer,
    priceDrop,
    payoutDrop,
    commissionDrop,
    crossesThreshold,
    notes,
  };
}
