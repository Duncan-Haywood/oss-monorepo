// Carries this item's numbers into the where-to-sell calculator, with
// Discogs already switched on, so comparing the same item against eBay,
// Etsy, Amazon and a direct sale does not mean retyping price and cost.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs, which
// carries a comparison *into* this page. Before this module existed the link
// ran only one way: the where-to-sell calculator could hand its numbers down
// into this page, but a seller who landed here first (from a search for
// "discogs fee calculator", say) and then wanted to check the same item on
// eBay or Etsy had to retype everything. That is the exact failure
// where-to-sell-calculator's own VENTURE.yaml names as its first untested
// hypothesis: the handoff, not the depth of the second tool, decides whether
// the deeper scenarios ever get opened.
//
// Only the numbers every channel shares travel: item price, buyer-paid
// shipping, the postage cost, what the item cost, and the packaging bucket.
// Discogs's own fee -- 9% on item plus shipping, and the processing rate -- is
// not sent, because the receiving page already carries it on its Discogs
// preset (asserted equal to this venture's constants by its
// `channel-parity.test.mjs`).
// Sending it would be restating a rule the other side already holds, which is
// how this repository has twice shipped a stale copy of a rule it should have
// imported.
//
// The wire format is where-to-sell-calculator's own `#c=` shared-link
// payload (see its share.mjs: `decodeComparison`), not this page's own share
// format. `to-where-to-sell.test.mjs` imports that decoder directly so a
// change to its shape fails a test here instead of arriving as a silently
// wrong number there.

const SHARED_FIELDS = ['itemPrice', 'buyerShipping', 'labelCost', 'itemCost', 'otherCost'];
const TARGET_NAME = {
  itemPrice: 'price',
  buyerShipping: 'shippingCharged',
  labelCost: 'shippingCost',
};

function cleanNumber(value) {
  // `Number('')` and `Number(null)` are both 0, so coercing first would turn
  // an untouched field into an explicit zero on arrival -- the silent-wrong-
  // number case this module exists to avoid.
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
  // No per-channel rate values: the Discogs preset on the receiving side
  // already carries the 9% fee and processing default, and enabling the channel with
  // no override is exactly what a fresh visit that turns Discogs on already
  // does.
  return { shared, channels: [{ id: 'discogs', enabled: true, values: {} }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const payload = whereToSellPayload(input);
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
