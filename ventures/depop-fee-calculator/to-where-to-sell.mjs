// Carries this item's numbers into the where-to-sell calculator, with Depop
// already switched on, so ranking the same piece against eBay, Etsy, Mercari
// and a direct sale does not mean retyping price and cost.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs. Before this
// module the link ran one way only: a seller who landed here first (from a
// search for a Depop fee calculator) and then wanted the same item on another
// channel had to retype it.
//
// Item numbers travel under the receiving page's field names. The rate
// schedule travels only when the receiving preset would be wrong for this
// seller: where-to-sell's Depop row is the US schedule, so a US seller sends
// nothing and a UK or rest-of-world seller (or one selling from a Boosted
// Listing) sends the rates from this page's own REGIONS table, imported rather
// than restated.

import { REGIONS, BOOST_RATE } from './calc.mjs';

const SHARED_FIELDS = ['itemPrice', 'buyerShipping', 'labelCost', 'itemCost', 'otherCost'];
const TARGET_NAME = {
  itemPrice: 'price',
  buyerShipping: 'shippingCharged',
  labelCost: 'shippingCost',
};

function cleanNumber(value) {
  // `Number('')` is 0, so coercing first would turn an untouched field into an
  // explicit zero on arrival.
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function rateOverrides(input) {
  const region = Object.prototype.hasOwnProperty.call(REGIONS, input.region) ? input.region : 'us';
  const schedule = REGIONS[region];
  const boosted = input.boosted === true;
  if (region === 'us' && !boosted) return {};
  return {
    commissionRate: schedule.sellingRate + (boosted ? BOOST_RATE : 0),
    paymentRate: schedule.processingRate,
    paymentFixed: schedule.processingFixed,
  };
}

/** The `#c=` payload for where-to-sell-calculator's own decoder. */
export function whereToSellPayload(input = {}) {
  const shared = {};
  for (const field of SHARED_FIELDS) {
    const value = cleanNumber(input[field]);
    if (value !== null) shared[TARGET_NAME[field] ?? field] = value;
  }
  return { shared, channels: [{ id: 'depop', enabled: true, values: rateOverrides(input) }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const encoded = encodeURIComponent(JSON.stringify(whereToSellPayload(input)));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
