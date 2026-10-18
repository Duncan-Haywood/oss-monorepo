// Carries this listing's numbers into the where-to-sell calculator, with
// Walmart already switched on, so ranking this item against eBay, Etsy,
// Amazon and an own store does not mean retyping price, shipping and cost.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs, which
// carries a comparison *into* this page. Before this module existed the link
// ran one way only: a seller who landed here first (from a search for "WFS vs
// seller fulfilled", say) and then wanted to know whether Walmart beats eBay
// for the same item had to retype it. Walmart is also off by default over
// there (approval is invitation-based), so the payload must turn it on.
//
// Only the numbers every channel shares travel: sale price, the label the
// seller pays (`sellerShippingCost`), item cost, and one other-cost bucket
// (prep/packaging + other per-unit cost, summed -- the same `combine` rule
// handoff.mjs uses coming the other way). Buyer-paid shipping is left out on
// purpose: Walmart shows one price with shipping included and this page has
// no field for it. The referral rate has no home in the shared block, so
// the receiving page prices Walmart from its own 15% preset rather than a
// guessed override. WFS fees, storage and ads stay here: that comparison is
// the follow-up question once Walmart wins over there.
//
// The wire format is where-to-sell-calculator's own `#c=` payload (see its
// share.mjs: `decodeComparison`); `to-where-to-sell.test.mjs` imports that
// decoder so a change to its shape fails a test here.

function cleanNumber(value) {
  // `Number('')` and `Number(null)` are both 0; coercing first would turn an
  // untouched field into an explicit zero on arrival.
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

/** The `#c=` payload for where-to-sell-calculator's own decoder. */
export function whereToSellPayload(input = {}) {
  const shared = {};
  const price = cleanNumber(input.salePrice);
  const shippingCost = cleanNumber(input.sellerShippingCost);
  const itemCost = cleanNumber(input.costOfGoods);
  const packaging = cleanNumber(input.packagingCost);
  const other = cleanNumber(input.otherCost);
  if (price !== null) shared.price = price;
  if (shippingCost !== null) shared.shippingCost = shippingCost;
  if (itemCost !== null) shared.itemCost = itemCost;
  if (packaging !== null || other !== null) {
    shared.otherCost = Math.round(((packaging ?? 0) + (other ?? 0)) * 100) / 100;
  }
  return { shared, channels: [{ id: 'walmart', enabled: true, values: {} }] };
}

/** A relative link into where-to-sell-calculator, carrying this listing. */
export function whereToSellUrl(input = {}) {
  const encoded = encodeURIComponent(JSON.stringify(whereToSellPayload(input)));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
