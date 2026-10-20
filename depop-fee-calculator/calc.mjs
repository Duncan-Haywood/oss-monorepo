// Pure fee/payout arithmetic for a Depop sale. No network, no stored live
// schedule beyond the constants below -- each lifted from Depop's own
// published Help Centre article ("Seller fees and charges") and corroborated
// against multiple independent third-party fee breakdowns, not a live fetch.
//
// Depop runs three different seller fee schedules at once, by region:
//
//   - US: 0% selling fee. A Depop Payments processing fee of 3.3% of the
//     item price plus buyer-paid shipping, plus a flat $0.45 per sale.
//   - UK: 0% selling fee. A processing fee of 2.9% of the item price plus
//     buyer-paid shipping, plus a flat £0.30 per sale.
//   - Rest of world (selling in a currency other than USD or GBP): a flat
//     10% selling fee on the item price plus buyer-paid shipping, with no
//     separate processing fee broken out.
//
// The thing this tool exists to correct: Depop ran a flat 10% selling fee
// worldwide for years, and "Depop takes 10%" is still the number most
// sellers -- and most old blog posts -- quote. For a US or UK seller today
// that is wrong on both ends: the *selling* fee is 0%, but a processing fee
// still applies, and it lands closer to 3-4% for a typical sale rather than
// 10% or 0%. Getting this backwards in either direction (assuming you still
// pay 10%, or assuming "0% selling fee" means no fee at all) means pricing a
// listing on a payout number that will not match the deposit.
//
// A second, separate confusion this tool keeps apart: Depop also charges the
// BUYER a Marketplace fee at checkout (up to 5% + $1 of the item and
// shipping cost, on a sliding scale Depop has not published in full). That
// fee is added on top of what the buyer pays -- it is never deducted from
// the seller's payout, and this tool does not compute a dollar figure for it
// (a sliding scale we cannot see precisely) because a specific wrong number
// is worse than a plainly-labelled unknown.
//
// Boosted Listings add a further 12% fee on top, charged only on sales that
// went through while the listing was boosted; this tool models that fee's
// base as the item price alone, since Depop's own description ties it to
// "the sale price" rather than the shipping-inclusive processing-fee base --
// verify against your own boosted-sale payout, since Depop has not published
// the exact base to the same level of detail as the processing fee.

/** One region's fee schedule: percentage rates in whole numbers (3.3 means 3.3%). */
export const REGIONS = Object.freeze({
  us: { label: 'United States (USD)', currency: '$', sellingRate: 0, processingRate: 3.3, processingFixed: 0.45 },
  uk: { label: 'United Kingdom (GBP)', currency: '£', sellingRate: 0, processingRate: 2.9, processingFixed: 0.30 },
  row: { label: 'Rest of world (flat fee, local currency)', currency: '$', sellingRate: 10, processingRate: 0, processingFixed: 0 },
});

/** Boosted Listings fee, percent of the item price (not shipping), on a sale made while boosted. */
export const BOOST_RATE = 12;

// Every seller-supplied numeric field, in the order the form presents them.
export const INPUT_IDS = Object.freeze([
  'itemPrice',
  'buyerShipping',
  'labelCost',
  'itemCost',
  'otherCost',
  'targetProfit',
]);

export const TOGGLE_IDS = Object.freeze(['boosted']);
export const SELECT_IDS = Object.freeze(['region']);

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

function regionOf(region) {
  return REGIONS[region] && Object.prototype.hasOwnProperty.call(REGIONS, region) ? REGIONS[region] : REGIONS.us;
}

/** Depop's own cut of one sale in a given region: selling fee, processing fee, boost fee. */
export function feeFor({ itemPrice, buyerShipping = 0, region = 'us', boosted = false }) {
  const { sellingRate, processingRate, processingFixed } = regionOf(region);
  const base = itemPrice + buyerShipping;
  const sellingFee = base * (sellingRate / 100);
  const processingFee = itemPrice > 0 || buyerShipping > 0 ? base * (processingRate / 100) + processingFixed : 0;
  const boostFee = boosted ? itemPrice * (BOOST_RATE / 100) : 0;
  return { sellingFee, processingFee, boostFee, depopFee: sellingFee + processingFee + boostFee };
}

/**
 * The item price that nets exactly `targetPayout`, at a fixed buyer-paid
 * shipping amount. Every region's fee is linear in item price, so there is
 * exactly one solution:
 *   payout = price*(1 - itemRate) + shipping*(1 - shipRate) - fixed - label
 * where itemRate also carries the boost fee (charged on the item price only)
 * and shipRate does not.
 */
export function priceForTargetPayout(targetPayout, { buyerShipping = 0, labelCost = 0, region = 'us', boosted = false } = {}) {
  if (!Number.isFinite(targetPayout)) return null;
  const { sellingRate, processingRate, processingFixed } = regionOf(region);
  const shipRate = (sellingRate + processingRate) / 100;
  const itemRate = shipRate + (boosted ? BOOST_RATE / 100 : 0);
  if (itemRate >= 1) return null;
  const price = (targetPayout - buyerShipping * (1 - shipRate) + processingFixed + labelCost) / (1 - itemRate);
  return price >= 0 ? price : null;
}

/**
 * One Depop sale, priced the way a payout deposit actually lands.
 *
 * @param {object} input
 * @param {number} input.itemPrice        What the buyer paid for the item (not shipping).
 * @param {number} [input.buyerShipping]  Shipping the buyer paid on top of the item price, if any.
 * @param {number} [input.labelCost]      A shipping label you bought yourself (not a Depop fee).
 * @param {number} [input.itemCost]       What you originally paid for the item.
 * @param {number} [input.otherCost]      Packaging / prep cost on this sale.
 * @param {number} [input.targetProfit]   Desired profit above cost; used to solve for an item price.
 * @param {string} [input.region]         'us', 'uk', or 'row'.
 * @param {boolean} [input.boosted]       Whether this sale came through a Boosted Listing.
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
  const region = Object.prototype.hasOwnProperty.call(REGIONS, input.region) ? input.region : 'us';
  const boosted = Boolean(input.boosted);

  if (errors.length) return { ok: false, errors };

  const base = itemPrice + buyerShipping;
  const { sellingFee, processingFee, boostFee, depopFee } = feeFor({ itemPrice, buyerShipping, region, boosted });
  const payout = base - depopFee - labelCost;
  const profit = payout - itemCost - otherCost;
  const effectiveRate = base > 0 ? (depopFee / base) * 100 : 0;
  const currency = REGIONS[region].currency;

  const targetPayout = targetProfit + itemCost + otherCost;
  const priceForTarget = priceForTargetPayout(targetPayout, { buyerShipping, labelCost, region, boosted });

  const notes = [];
  if (region !== 'row' && REGIONS[region].sellingRate === 0) {
    notes.push(
      `Depop's selling fee for ${REGIONS[region].label} sellers is 0% -- the ${processingFee.toFixed(2) === '0.00' ? '' : `${currency}${processingFee.toFixed(2)} `}fee above is entirely payment processing, not a "Depop cut" on top of that. If you are still budgeting for the old flat 10% selling fee, this sale keeps more than that number implies.`,
    );
  }
  if (region === 'row') {
    notes.push(
      `Rest-of-world listings still run Depop's older flat ${REGIONS.row.sellingRate}% selling fee on the item price plus buyer-paid shipping, with no separate processing fee broken out.`,
    );
  }
  if (boosted) {
    notes.push(
      `This sale is modelled as coming from a Boosted Listing: an extra ${BOOST_RATE}% of the ${currency}${itemPrice.toFixed(2)} item price (${currency}${boostFee.toFixed(2)}), on top of the region's normal fee. Boost fees only apply to a sale that happened while the listing was boosted.`,
    );
  }
  notes.push(
    'Depop separately charges the buyer a Marketplace fee at checkout (up to 5% + $1 of the item and shipping cost, on a sliding scale Depop has not published in full). That fee is paid by the buyer on top of your price -- it is never deducted from this payout, so it is not computed here.',
  );
  if (profit < 0) {
    notes.push('This sale loses money after Depop’s fee, your shipping label, what you paid for the item, and packaging.');
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
    region,
    currency,
    boosted,
    sellingFee,
    processingFee,
    boostFee,
    depopFee,
    payout,
    profit,
    effectiveRate,
    priceForTarget,
    notes,
  };
}

/**
 * The same sale priced in all three regions, so a seller who is not sure
 * which schedule actually applies to their account -- or who is curious
 * whether the old "10% everywhere" reputation still holds anywhere -- can
 * see the spread on one specific sale rather than three separate lookups.
 */
export function compareRegions(input) {
  const results = {};
  for (const region of Object.keys(REGIONS)) {
    const result = calculateSale({ ...input, region });
    if (!result.ok) return { ok: false, errors: result.errors };
    results[region] = result;
  }
  const best = Object.entries(results).reduce((a, b) => (b[1].payout > a[1].payout ? b : a));
  return { ok: true, errors: [], results, bestRegion: best[0] };
}
