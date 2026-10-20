// Carries this item's numbers into the where-to-sell calculator, with Grailed
// already switched on, so ranking the same piece against eBay, Etsy, Mercari
// and a direct sale does not mean retyping price and cost.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs. Before this
// module the link ran one way only: a seller who landed here first (from a
// search for a Grailed fee calculator) and then wanted the same item on another
// channel had to retype it.
//
// Item numbers travel under the receiving page's field names. The rate
// schedule travels only when the receiving preset would be wrong for this
// seller: where-to-sell's Grailed row is the current domestic tiered schedule,
// so that seller sends nothing, and an international-buyer view sends the
// processing rates from this page's own SCHEDULES table, imported rather than
// restated.

import { SCHEDULES } from './calc.mjs';

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
  // Only the international-buyer processing rate can travel. The old flat 9%
  // schedule cannot: where-to-sell's link format carries rates but not the
  // $120 step, so a "flat" override would arrive still stepped and quietly
  // wrong. The old schedule is not current, so it hands over as the current
  // one and the receiving page says which it prices.
  if (input.schedule !== 'intl') return {};
  const { processingRate, processingFixed } = SCHEDULES.intl;
  return { paymentRate: processingRate, paymentFixed: processingFixed };
}

/** The `#c=` payload for where-to-sell-calculator's own decoder. */
export function whereToSellPayload(input = {}) {
  const shared = {};
  for (const field of SHARED_FIELDS) {
    const value = cleanNumber(input[field]);
    if (value !== null) shared[TARGET_NAME[field] ?? field] = value;
  }
  return { shared, channels: [{ id: 'grailed', enabled: true, values: rateOverrides(input) }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const encoded = encodeURIComponent(JSON.stringify(whereToSellPayload(input)));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
