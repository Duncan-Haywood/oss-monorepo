// Carries this sale's numbers into the where-to-sell calculator, so comparing
// a TCGplayer order against eBay, Etsy, Amazon and a direct sale does not mean
// retyping price, shipping and cost.
//
// where-to-sell-calculator has no TCGplayer row of its own, so the item
// arrives on its blank "Other channel" row, switched on, with this page's
// commission and transaction rates filled in. Those rates are read from
// ./calc.mjs's SCHEDULES, not restated here, so a rate change on this page
// changes the link with it.
//
// Two things do not travel, and the page says so next to the link:
//   - the per-product commission cap ($75 on the current schedule). The
//     receiving row has no cap field, so a very large single sale (graded
//     slabs, sealed boxes) is over-charged there. Singles under about $700 are
//     unaffected.
//   - multi-quantity orders. The $0.30 transaction fee is per order and the
//     receiving page prices one item, so with quantity above 1 only the rates
//     are sent and the seller re-enters the order total.
//
// The wire format is where-to-sell-calculator's own `#c=` shared-link payload
// (see its share.mjs: `decodeComparison`); `to-where-to-sell.test.mjs`
// imports that decoder so a change to its shape fails a test here instead of
// arriving as a silently wrong number there.

import { SCHEDULES, TRANSACTION_RATE, TRANSACTION_FIXED } from './calc.mjs';

const SHARED_FIELDS = ['itemPrice', 'buyerShipping', 'shippingCost', 'itemCost', 'otherCost'];
const TARGET_NAME = {
  itemPrice: 'price',
  buyerShipping: 'shippingCharged',
};

function cleanNumber(value) {
  // `Number('')` and `Number(null)` are both 0, so coercing first would turn
  // an untouched field into an explicit zero on arrival.
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function commissionRate(schedule) {
  const lines = (SCHEDULES[schedule] ?? SCHEDULES.standard).lines;
  return Math.round(lines.reduce((sum, line) => sum + line.rate, 0) * 100) / 100;
}

/** The `#c=` payload for where-to-sell-calculator's own decoder. */
export function whereToSellPayload(input = {}) {
  const shared = {};
  const quantity = cleanNumber(input.quantity);
  if (quantity === null || quantity <= 1) {
    for (const field of SHARED_FIELDS) {
      const value = cleanNumber(input[field]);
      if (value !== null) shared[TARGET_NAME[field] ?? field] = value;
    }
  }
  return {
    shared,
    channels: [{
      id: 'other',
      enabled: true,
      values: {
        commissionRate: commissionRate(input.schedule),
        paymentRate: TRANSACTION_RATE,
        paymentFixed: TRANSACTION_FIXED,
      },
    }],
  };
}

/** A relative link into where-to-sell-calculator, carrying this sale. */
export function whereToSellUrl(input = {}) {
  const encoded = encodeURIComponent(JSON.stringify(whereToSellPayload(input)));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
