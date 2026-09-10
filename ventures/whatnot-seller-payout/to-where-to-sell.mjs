// Carries this lot's numbers into the where-to-sell calculator, with Whatnot
// already switched on, so comparing this item against eBay, Etsy, Amazon,
// Reverb and an own store does not mean retyping price, shipping and cost.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs, which
// carries a comparison *into* this page. Before this module existed the link
// ran only one way: the where-to-sell calculator could hand its numbers down
// into this page, but a seller who landed here first (from a search for
// "Whatnot seller payout calculator", say) and then wanted to check the same
// item on eBay or Etsy had to retype everything. That is the exact failure
// where-to-sell-calculator's own VENTURE.yaml names as its first untested
// hypothesis: the handoff, not the depth of the second tool, decides whether
// the deeper scenarios ever get opened.
//
// Only the numbers every channel shares travel: sale price, shipping
// charged, shipping cost, item cost, and the other-cost bucket. Whatnot's own
// rates (commission, cap, processing) have no matching field on the
// where-to-sell side — it prices Whatnot from its own illustrative preset
// rather than asking for a rate schedule — so they are left out rather than
// guessed at, the same rule handoff.mjs itself follows for a field a target
// has no home for. Tax charged also has no home on the receiving side and is
// dropped for the same reason.
//
// The wire format is where-to-sell-calculator's own `#c=` shared-link
// payload (see its share.mjs: `decodeComparison`), not this page's own share
// format. `to-where-to-sell.test.mjs` imports that decoder directly so a
// change to its shape fails a test here instead of arriving as a silently
// wrong number there.

const SHARED_FIELDS = ['salePrice', 'shippingCharged', 'shippingCost', 'itemCost', 'otherCost'];
const TARGET_NAME = { salePrice: 'price' };

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
  // No per-channel rate values: Whatnot's own preset already carries the
  // illustrative commission and processing rates on the receiving side, and
  // nothing here maps cleanly onto its generic commissionRate/paymentRate
  // shape without guessing. Enabling the channel with no rate override is
  // exactly what a fresh visit that turns Whatnot on already does.
  return { shared, channels: [{ id: 'whatnot', enabled: true, values: {} }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const payload = whereToSellPayload(input);
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
