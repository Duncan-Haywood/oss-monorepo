// Carries this sale's numbers into the where-to-sell calculator, with StockX
// already switched on, so comparing the same pair against eBay, Poshmark, a
// direct sale or an own store does not mean retyping price, cost and postage.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs, which
// carries a comparison *into* this page (that module's `stockx` entry).
// Before this module existed the link ran only one way — and for StockX it
// did not run at all, because StockX was not a channel on that page. A
// reseller who landed here first, from a search for "how much does StockX
// take from sellers", and then wanted to know whether the same pair nets more
// on eBay had to retype everything. That is the exact failure
// where-to-sell-calculator's own VENTURE.yaml names as its first untested
// hypothesis: the handoff, not the depth of the second tool, decides whether
// the deeper scenarios ever get opened. `ebay-fee-calculator`,
// `poshmark-fee-calculator` and five siblings already close it in this
// direction; this is the same fix for StockX.
//
// Only the numbers every channel shares travel: sale price, what the item
// cost, the label to the verification centre, and the other-per-sale bucket.
// StockX's own schedule — the seller-level fee percentage, the Fast Shipping
// discount, the processing rate — is not sent, because the receiving page
// already carries a StockX preset built by importing this venture's own
// `DEFAULTS` (its `channel-parity.test.mjs` asserts the two stay equal).
// Sending a second copy in a link is how this repository has twice shipped a
// stale copy of a rule it should have imported.
//
// Nothing about shipping *charged* travels, and that is a fact about StockX
// rather than a gap: it is a bid/ask marketplace where the buyer pays StockX
// for delivery, so no postage the buyer pays ever reaches the seller and this
// page has no input for it. The receiving StockX preset pins `shippingCharged`
// to zero for the same reason, so the comparison arrives consistent with this
// page instead of crediting the seller with revenue they never see.
//
// The wire format is where-to-sell-calculator's own `#c=` shared-link payload
// (see its share.mjs: `decodeComparison`), not the flat `field=value` format
// this page's own share links use. `to-where-to-sell.test.mjs` imports that
// decoder directly so a change to its shape fails a test here instead of
// arriving as a silently wrong number there.

// This page's own field name -> where-to-sell-calculator's shared field name.
const FIELD_MAP = {
  salePrice: 'price',
  itemCostBasis: 'itemCost',
  shippingCost: 'shippingCost',
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
  // No per-channel rate values: the StockX preset on the receiving side
  // already carries the fee shape, and enabling the channel with no override
  // is exactly what a fresh visit that turns StockX on already does.
  return { shared, channels: [{ id: 'stockx', enabled: true, values: {} }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const payload = whereToSellPayload(input);
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
