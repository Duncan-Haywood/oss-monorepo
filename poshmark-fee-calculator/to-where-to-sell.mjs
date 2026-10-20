// Carries this item's numbers into the where-to-sell calculator, with
// Poshmark already switched on, so comparing the same piece against eBay,
// Etsy, Amazon and a direct sale does not mean retyping price and cost.
//
// This is the reverse of ../where-to-sell-calculator/handoff.mjs, which
// carries a comparison *into* this page. Before this module existed the link
// ran only one way: the where-to-sell calculator could hand its numbers down
// into this page, but a reseller who landed here first (from a search for
// "how much does Poshmark take", say) and then wanted to check whether the
// same top would net more on eBay had to retype everything. That is the exact
// failure where-to-sell-calculator's own VENTURE.yaml names as its first
// untested hypothesis: the handoff, not the depth of the second tool, decides
// whether the deeper scenarios ever get opened.
//
// Only the numbers every channel shares travel: sale price, what the item
// cost, and the packaging/prep bucket. Poshmark's own schedule — the flat
// $2.95, the $15 cliff, the 20% — is not sent, because the receiving page
// already carries it on its Poshmark preset (imported from this module's own
// constants, and asserted equal by its `channel-parity.test.mjs`). Sending it
// would be restating a rule the other side already holds, which is how this
// repository has twice shipped a stale copy of a rule it should have
// imported.
//
// Nothing about shipping travels either, and that is a fact about Poshmark
// rather than a gap: the buyer buys a prepaid label at checkout, so postage
// is neither seller revenue nor a seller cost, and this page has no input for
// it. The receiving Poshmark preset starts both shipping fields at zero for
// the same reason, so the comparison arrives consistent with this page.
//
// The wire format is where-to-sell-calculator's own `#c=` shared-link payload
// (see its share.mjs: `decodeComparison`), not this page's own share format.
// `to-where-to-sell.test.mjs` imports that decoder directly so a change to
// its shape fails a test here instead of arriving as a silently wrong number
// there.

const SHARED_FIELDS = ['salePrice', 'itemCost', 'otherCost'];
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
  // No per-channel rate values: the Poshmark preset on the receiving side
  // already carries the two-tier schedule, and enabling the channel with no
  // override is exactly what a fresh visit that turns Poshmark on already
  // does.
  return { shared, channels: [{ id: 'poshmark', enabled: true, values: {} }] };
}

/** A relative link into where-to-sell-calculator, carrying this item. */
export function whereToSellUrl(input = {}) {
  const payload = whereToSellPayload(input);
  const encoded = encodeURIComponent(JSON.stringify(payload));
  return `../where-to-sell-calculator/#c=${encoded}`;
}
