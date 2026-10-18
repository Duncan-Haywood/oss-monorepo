// Carry the item you just compared into the channel's own calculator.
//
// This page answers "which channel?" and stops there. The follow-up question —
// "so what does a promoted listing / free shipping / a return actually do to
// that number on eBay?" — is answered by a separate calculator in this
// portfolio with twenty-odd scenarios in it. Until now the only way through was
// to retype the item: price, postage, what you paid, packaging, everything.
// Most people do not, so the deep tool goes unused and the comparison ends at a
// ranking nobody acts on.
//
// So each channel that has a dedicated calculator *and* can accept inputs from
// a link gets a "continue with these numbers" link, built from what is on
// screen. Nothing is uploaded: this is the same in-page URL mechanism the
// "Copy share link" button already uses, and the values only ever travel
// inside the reader's own browser as they follow the link.
//
// The mapping is the fragile part. Each calculator named its inputs for its own
// niche — what this page calls `itemCost` is `costOfGoods` on eBay and
// `materialCost` on Etsy — and a name that does not match is *silently dropped*
// by the receiving decoder. The failure is a wrong number on arrival, not an
// error, which is exactly the bug `share.mjs` shipped once already (a link that
// dropped `quantity` and `targetMargin`, so the recipient computed a different
// profit than the sender saw). `handoff.test.mjs` therefore imports each
// target's own field list and asserts every name here is one it accepts.

/**
 * Channels with a deeper calculator that accepts inputs from a link.
 *
 * `fields` maps this page's shared-input id to the target's id. A channel
 * absent from this table simply gets no link — deliberately, since a link that
 * silently arrives with default numbers is worse than no link at all.
 */
export const HANDOFFS = [
  {
    channel: 'ebay',
    slug: 'ebay-fee-calculator',
    label: 'eBay fee & profit calculator',
    // What it adds: promoted listings, returns, Top Rated Plus, store
    // subscription, offers, international, and twenty more decisions.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'costOfGoods',
      packagingCost: 'packagingCost',
      otherCost: 'otherCost',
    },
  },
  {
    channel: 'etsy',
    slug: 'etsy-profit-calculator',
    label: 'Etsy profit calculator',
    // Etsy has no separate packaging input; it belongs with materials, which
    // is what that field means there. Summed rather than dropped — see
    // `combine` below.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'materialCost',
      otherCost: 'otherCost',
    },
    combine: { materialCost: ['itemCost', 'packagingCost'] },
  },
  {
    channel: 'amazon',
    slug: 'amazon-fba-calculator',
    label: 'Amazon FBA vs FBM calculator',
    // What it adds: the FBA-versus-FBM split this page cannot make (it prices
    // Amazon as one channel), plus size-tier fulfilment, storage by month,
    // inbound placement, returns, Low-Price FBA, coupons, Subscribe & Save,
    // Vine, and Seller Fulfilled Prime.
    //
    // `shippingCharged` has no home here and is deliberately dropped rather
    // than mapped: Amazon's referral fee is charged on the order total, but
    // this calculator takes the sale price and derives fulfilment from the
    // size tier instead of from what the buyer was charged for postage.
    // Folding postage into `salePrice` would inflate the referral fee and
    // print a worse number than the seller will actually see.
    fields: {
      price: 'salePrice',
      itemCost: 'costOfGoods',
      shippingCost: 'fbmShippingCost',
      packagingCost: 'packagingCost',
      otherCost: 'otherCost',
    },
  },
  {
    channel: 'mercari',
    slug: 'mercari-fee-calculator',
    label: 'Mercari fee calculator',
    // What it adds: the pre-January 6, 2025 legacy schedule compared
    // side-by-side with the current one, the note that buyer-paid shipping
    // sits inside the current fee base, and Mercari's separate Buyer
    // Protection Fee, which is a buyer-side charge this page does not model.
    //
    // Mercari has no separate packaging input -- its own `otherCost` field is
    // documented there as "packaging / prep cost" -- so packaging is folded
    // in rather than dropped, the same rule `combine` follows for every
    // other target with fewer inputs than this page.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'buyerShipping',
      shippingCost: 'labelCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'reverb',
    slug: 'reverb-fee-calculator',
    label: 'Reverb fee & profit calculator',
    // What it adds: the decisions this page prices as one flat channel — an
    // offer to accept or counter, whether a bump pays for itself, Safe
    // Shipping against self-insuring a claim, consigning to a shop instead of
    // listing, eating the postage versus charging it, and what a return
    // actually costs once the fee refund is counted.
    //
    // The field names line up one-for-one, which is not luck: both tools were
    // written for the same shape of item. `packagingCost` is the one exception
    // — Reverb's calculator has no packaging input because gear packing (a
    // case, foam, a double box) is not a flat per-order cost there, so it
    // belongs in the general `otherCost` bucket rather than being dropped.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'itemCost',
    },
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'own-store',
    slug: 'shopify-fee-calculator',
    label: 'Shopify fee & profit calculator',
    // What it adds: the question this page cannot ask, which is *which
    // processor*. An own store has no marketplace commission, so the whole
    // decision is Shopify Payments against PayPal or Stripe — and Shopify
    // charges an extra third-party transaction fee on top of the outside
    // processor's own rate, which generic fee pages leave out. Plus promos,
    // Shop Pay Installments, shipping labels, POS, refunds and chargebacks.
    //
    // `monthlyOrders` travels because the Shopify plan is a monthly fee, and
    // amortising it is the whole reason an own store can win on fees and lose
    // on cash. Arriving without it would price the plan against this page's
    // default order count rather than the seller's.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'costOfGoods',
      packagingCost: 'packagingCost',
      otherCost: 'otherCost',
      monthlyOrders: 'monthlyOrders',
    },
  },
  {
    channel: 'tiktok',
    slug: 'tiktok-shop-fee-calculator',
    label: 'TikTok Shop fee calculator',
    // What it adds: the decisions this page prices as one flat referral rate —
    // organic versus affiliate-sourced orders, creator facilitation, the
    // announced 1 Oct 2026 fee-schedule change, free-shipping thresholds, and
    // bundle discounts.
    //
    // TikTok Shop has no separate "what you pay for shipping" field; its
    // `fulfillmentCost` covers pick/pack/label however the seller ships
    // (TikTok-fulfilled, 3PL, or their own postage), which is the natural home
    // for this page's `shippingCost`. It also has no separate packaging
    // input — `otherPerOrder` is documented there as "packaging, inserts,
    // payment-out fees" — so packaging is folded in rather than dropped, the
    // same rule `combine` follows for every other target with fewer inputs.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'shippingCharged',
      shippingCost: 'fulfillmentCost',
      otherCost: 'otherPerOrder',
    },
    combine: { otherPerOrder: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'whatnot',
    slug: 'whatnot-seller-payout',
    label: 'Whatnot seller payout calculator',
    // What it adds: the category commission cap (TCG, coins, sports singles,
    // pallets), the giveaway shape, the per-show lot roll-up, and the price a
    // lot needs to clear a target leftover.
    //
    // Field names line up almost one-for-one — both tools were built for the
    // same shape of sale. Whatnot has no separate packaging input, so it is
    // folded into `otherCost`, which it does have, the same rule `combine`
    // follows for every other target with fewer inputs than this page.
    fields: {
      price: 'salePrice',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'poshmark',
    slug: 'poshmark-fee-calculator',
    label: 'Poshmark fee calculator',
    // What it adds: the two-tier schedule's effective rate on this exact
    // price, how much the flat $2.95 costs against what 20% would have
    // charged, the break-even price, and the offer-negotiation arithmetic —
    // whether accepting an offer that drops the price under $15 costs more
    // than the discount itself.
    //
    // Neither shipping field is mapped, and that is deliberate rather than an
    // omission: the buyer buys a prepaid label from Poshmark at checkout, so
    // it is neither seller revenue nor a seller cost, and the dedicated
    // calculator has no input for it at all. Mapping it anywhere would put
    // postage inside a payout that never sees it. This page's own Poshmark
    // preset starts both at zero for the same reason, so a comparison built
    // here has nothing to lose on the trip.
    fields: {
      price: 'salePrice',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'stockx',
    slug: 'stockx-seller-payout-calculator',
    label: 'StockX seller payout calculator',
    // What it adds: the two things this page prices as one flat rate and
    // cannot split — the seller-level fee band (two sellers moving the
    // identical pair at the identical price keep different amounts) and what
    // enrolling in Fast Shipping is worth against it — plus a month of flips
    // rolled up against a profit goal.
    //
    // `shippingCharged` is deliberately not mapped, and this is the one
    // channel where that is a fact about the marketplace rather than a
    // missing input: StockX is a bid/ask marketplace where the buyer pays
    // StockX for delivery, so no postage a buyer pays ever reaches the
    // seller. This page's own StockX preset pins the field to zero for the
    // same reason, so a comparison built here has nothing to lose on the
    // trip.
    fields: {
      price: 'salePrice',
      itemCost: 'itemCostBasis',
      shippingCost: 'shippingCost',
    },
    // Packaging is a real StockX cost (box, tape, a replacement lace bag) and
    // had nowhere to land until that calculator gained an `otherCost` bucket
    // alongside this handoff. Before it did, following this link would have
    // printed a *higher* profit than the comparison the seller had just read,
    // which is the silent-wrong-number failure this whole module exists to
    // prevent.
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'depop',
    slug: 'depop-fee-calculator',
    label: 'Depop fee calculator',
    // What it adds: the UK and rest-of-world schedules this page does not
    // price (the preset here is the US one), and Boosted Listings' extra 12%.
    // `region` is deliberately not sent: the receiving page defaults to the US
    // schedule, which is the one this page's preset prices, so the two agree.
    // Depop has no packaging input; packaging folds into `otherCost`.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'buyerShipping',
      shippingCost: 'labelCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'grailed',
    slug: 'grailed-fee-calculator',
    label: 'Grailed fee calculator',
    // What it adds: the $1.99 minimum commission, international buyers, the
    // old flat 9% for comparison, and the $120 cliff worked out for the
    // shipping on screen. `schedule` is not sent: the receiving page
    // defaults to the domestic tiered schedule this page's row prices.
    // Packaging folds into `otherCost`.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'buyerShipping',
      shippingCost: 'labelCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'facebook-marketplace',
    slug: 'facebook-marketplace-fee-calculator',
    label: 'Facebook Marketplace fee calculator',
    // What it adds: the $0.80 minimum fee (only bites under $8), the $20
    // dispute penalty, and the local-pickup case where the fee is zero.
    // `channel` is not sent: it defaults to shipped checkout, the case this
    // page's row prices. Packaging folds into `otherCost`.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'buyerShipping',
      shippingCost: 'labelCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    combine: { otherCost: ['otherCost', 'packagingCost'] },
  },
  {
    channel: 'walmart',
    slug: 'walmart-marketplace-calculator',
    label: 'Walmart Marketplace calculator',
    // What it adds: WFS versus shipping it yourself (fulfilment by size tier,
    // storage, aged-inventory removal), Walmart Connect ads, returns, the
    // Buy Box price match, and two-day shipping.
    //
    // `shippingCharged` is deliberately not mapped: Walmart shows one price
    // with shipping included, and the dedicated calculator has no input for
    // buyer-paid postage. This page's Walmart preset starts it at zero for
    // the same reason, so nothing is lost on the trip. Our `shippingCost`
    // is what the seller pays to ship it themselves, which is exactly its
    // `sellerShippingCost`. The page opens on WFS by default; the
    // seller-fulfilled number it compares against is the one priced here.
    fields: {
      price: 'salePrice',
      shippingCost: 'sellerShippingCost',
      itemCost: 'costOfGoods',
      packagingCost: 'packagingCost',
      otherCost: 'otherCost',
    },
  },
];

const bySlugSafe = (value) => /^[a-z0-9-]+$/.test(value);

/** The handoff for a channel id, or null if it has no prefillable calculator. */
export function handoffFor(channel) {
  return HANDOFFS.find((entry) => entry.channel === channel) ?? null;
}

/**
 * The values to hand over, as `{targetField: number}`.
 *
 * Only finite, non-negative numbers travel. A blank or nonsense input is left
 * out entirely so the target falls back to its own default, rather than
 * arriving as `NaN` or a silent zero that reads as a real answer.
 */
export function handoffValues(entry, shared = {}) {
  const out = {};
  if (!entry) return out;

  const clean = (value) => {
    // `Number('')` and `Number(null)` are both 0, so coercing first would turn
    // an untouched field into an explicit zero and override the target's own
    // default — the silent-wrong-number case this whole module is guarding.
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  };

  for (const [source, target] of Object.entries(entry.fields)) {
    const value = clean(shared[source]);
    if (value !== null) out[target] = value;
  }

  // A target with fewer inputs than this page folds two of ours into one of
  // theirs, so the total cost survives the trip instead of being dropped.
  for (const [target, sources] of Object.entries(entry.combine ?? {})) {
    const parts = sources.map((source) => clean(shared[source])).filter((v) => v !== null);
    if (parts.length > 0) out[target] = parts.reduce((a, b) => a + b, 0);
  }

  return out;
}

/**
 * A relative link to the channel's calculator, carrying the item.
 *
 * Relative on purpose: the same href has to work under the project path prefix
 * GitHub Pages serves from, under a custom domain later, and from a local
 * `python3 -m http.server`. The values ride in the fragment, which browsers do
 * not send to any server.
 */
export function handoffUrl(channel, shared = {}) {
  const entry = handoffFor(channel);
  if (!entry || !bySlugSafe(entry.slug)) return null;

  const values = handoffValues(entry, shared);
  const params = new URLSearchParams();
  for (const field of Object.keys(values).sort()) params.set(field, String(values[field]));

  const query = params.toString();
  return `../${entry.slug}/${query ? `#${query}` : ''}`;
}

/**
 * Every available handoff for a comparison, best channel first.
 *
 * Ordered by the ranking the reader is looking at rather than by this table,
 * so the link they most likely want is the one they read first.
 */
export function handoffsForResults(results = [], shared = {}) {
  return results
    .slice()
    .sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0))
    .map((result) => {
      const entry = handoffFor(result.id);
      if (!entry) return null;
      return {
        channel: result.id,
        label: entry.label,
        channelLabel: result.label ?? entry.channel,
        isBest: Boolean(result.isBest),
        href: handoffUrl(result.id, shared),
      };
    })
    .filter(Boolean);
}
