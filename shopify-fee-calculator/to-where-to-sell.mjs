// Carries this order's item numbers into the where-to-sell calculator, with
// the own-store channel already switched on, so comparing this item against
// eBay, Etsy, Amazon and Reverb does not mean retyping price, shipping,
// cost and monthly order volume.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs, which
// carries a comparison *into* this page (that module's `own-store` entry).
// Before this file existed the link only ran one way: the where-to-sell
// calculator could hand its numbers down into this page, but a seller who
// landed here first — from a search for "Shopify fee calculator", say — and
// then wanted to rank the same item against eBay or Etsy had to retype
// everything. That is the exact failure where-to-sell-calculator's own
// VENTURE.yaml names as its first untested hypothesis: the handoff, not the
// depth of the second tool, decides whether the deeper scenarios ever get
// opened. `reverb-fee-calculator/to-where-to-sell.mjs` closed this same gap
// for Reverb first; this is the same fix for an own store.
//
// Only the numbers every channel shares travel: price, shipping charged,
// shipping paid, item cost, packaging, monthly orders and the otherCost
// bucket. `monthlyOrders` travels because an own store's whole draw is
// amortising a monthly plan, and arriving without it would price that plan
// against the receiving page's default order count rather than this
// seller's own. This page's payment-processor rates (Shopify Payments vs.
// PayPal or Stripe, the third-party transaction fee) have no matching field
// on the where-to-sell side, so they are left out rather than guessed at.
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
  monthlyOrders: 'monthlyOrders',
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
  // No per-channel rate values: where-to-sell-calculator's own own-store
  // preset already carries an illustrative monthly plan and payment rate,
  // and nothing here maps cleanly onto its generic shape without guessing.
  // Enabling the channel with no rate override is exactly what a fresh visit
  // that turns the own-store channel on already does.
  return { shared, channels: [{ id: 'own-store', enabled: true, values: {} }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const payload = whereToSellPayload(input);
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
