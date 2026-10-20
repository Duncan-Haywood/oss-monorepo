// Carries this item's numbers into the where-to-sell calculator, with
// Facebook Marketplace already switched on, so ranking the same item against
// eBay, Etsy, Mercari and a direct sale does not mean retyping it.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs. Item numbers
// travel under the receiving page's field names. The receiving Marketplace row
// prices shipped checkout at this page's FEE_RATE; a local-pickup sale costs
// nothing here, so for that channel the commission is sent as 0 rather than
// letting the item arrive priced at 10%. The $0.80 minimum fee and the dispute
// penalty have no field over there and are left out, not guessed at.

import { FEE_RATE } from './calc.mjs';

const SHARED_FIELDS = ['itemPrice', 'buyerShipping', 'labelCost', 'itemCost', 'otherCost'];
const TARGET_NAME = {
  itemPrice: 'price',
  buyerShipping: 'shippingCharged',
  labelCost: 'shippingCost',
};

function cleanNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** The `#c=` payload for where-to-sell-calculator's own decoder. */
export function whereToSellPayload(input = {}) {
  const shared = {};
  for (const field of SHARED_FIELDS) {
    const value = cleanNumber(input[field]);
    if (value !== null) shared[TARGET_NAME[field] ?? field] = value;
  }
  const values = input.channel === 'local' ? { commissionRate: 0 } : { commissionRate: FEE_RATE };
  return { shared, channels: [{ id: 'facebook-marketplace', enabled: true, values }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const encoded = encodeURIComponent(JSON.stringify(whereToSellPayload(input)));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
