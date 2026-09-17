// Carries this listing's item numbers into the where-to-sell calculator, with
// eBay already switched on, so comparing this item against Etsy, Amazon,
// Reverb and an own store does not mean retyping price, shipping and cost.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs, which
// carries a comparison *into* this page (that module's `ebay` entry). Before
// this file existed the link only ran one way: the where-to-sell calculator
// could hand its numbers down into this page, but a seller who landed here
// first — from a search for "eBay fee calculator", say — and then wanted to
// rank the same item against Etsy or Amazon had to retype everything. That is
// the exact failure where-to-sell-calculator's own VENTURE.yaml names as its
// first untested hypothesis: the handoff, not the depth of the second tool,
// decides whether the deeper scenarios ever get opened. `reverb-fee-
// calculator/to-where-to-sell.mjs` closed this same gap for Reverb first;
// this is the same fix for eBay.
//
// Only the numbers every channel shares travel: price, shipping charged,
// shipping paid, item cost, packaging, and the otherCost bucket. eBay's own
// fee rates (final value, promoted, international) have no matching field on
// the where-to-sell side, so they are left out rather than guessed at — the
// same rule handoff.mjs itself follows for a field a target has no home for.
//
// The wire format is where-to-sell-calculator's own `#c=` shared-link
// payload (see its share.mjs: `decodeComparison`), not the flat
// `field=value` format this page's own share links use. `to-where-to-sell.
// test.mjs` imports that decoder directly so a change to its shape fails a
// test here instead of arriving as a silently wrong number there.

// This page's own field name -> where-to-sell-calculator's shared field name.
const FIELD_MAP = {
  price: 'price',
  shippingCharged: 'shippingCharged',
  shippingCost: 'shippingCost',
  costOfGoods: 'itemCost',
  packagingCost: 'packagingCost',
  otherCost: 'otherCost',
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
  for (const [source, target] of Object.entries(FIELD_MAP)) {
    const value = cleanNumber(input[source]);
    if (value !== null) shared[target] = value;
  }
  // No per-channel rate values: where-to-sell-calculator's own eBay preset
  // already carries an illustrative final-value rate, and nothing here maps
  // cleanly onto its generic commissionRate/paymentRate shape without
  // guessing. Enabling the channel with no rate override is exactly what a
  // fresh visit that turns eBay on already does.
  return { shared, channels: [{ id: 'ebay', enabled: true, values: {} }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const payload = whereToSellPayload(input);
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
