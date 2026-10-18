// Carry the item you just ranked into the winning channel's own calculator.
//
// This page ranks ten channels on headline fees and stops there, deliberately:
// its whole value is that one set of inputs produces a comparable table. Every
// channel on it then has a dedicated calculator in this portfolio that models
// the things a flat percentage cannot — Promoted Listings, FBA size tiers, WFS,
// creator commission, Shop Pay — and `CHANNELS` has always named that tool in
// `deepTool`.
//
// What it did not do is carry the item there. The link rendered as a bare
// `../<slug>/`, so a seller who had just typed price, postage, cost of goods
// and packaging into this page arrived at the deep tool facing an empty form
// and typed all four again. Most people do not, which is the measured shape of
// the problem this portfolio has: the ranking gets read, the deep tool never
// gets opened, and the depth that took the most work to build goes unused.
//
// `ventures/where-to-sell-calculator/handoff.mjs` solved the same problem for
// the other comparison page in this portfolio, and this is the same mechanism
// pointed at this page's ten channels. It is a separate table rather than an
// import because the two pages do not share an input vocabulary — this page
// folds packaging into one `otherCost`, where-to-sell keeps `packagingCost`
// separate — and a runtime import across ventures would make one page's link
// targets move when the other page's inputs are renamed. `handoff.test.mjs`
// asserts the two agree wherever they target the same calculator, so the
// duplication is checked rather than trusted.
//
// The mapping is the fragile part, for the reason where-to-sell records: each
// calculator named its inputs for its own niche — what this page calls
// `itemCost` is `costOfGoods` on eBay and Walmart, `materialCost` on Etsy and
// `cogs` on TikTok — and a name the target does not accept is *silently
// dropped* by the receiving decoder. The failure arrives as a wrong number, not
// an error. `handoff.test.mjs` therefore asserts every target name here is one
// that target's own page actually offers.

/**
 * The ten ranked channels, and how this page's item maps onto each deep tool.
 *
 * `fields` maps this page's item key to the target's input id. A channel absent
 * from this table gets no item-carrying link — deliberately, since a link that
 * silently arrives holding the target's defaults is worse than a bare one.
 *
 * `drops` records an input that is deliberately *not* carried, with the reason.
 * It is data rather than a comment so the test can assert the set is exactly
 * what is documented: a field quietly disappearing from `fields` in a later
 * edit would otherwise look identical to a field intentionally left behind.
 */
export const HANDOFFS = [
  {
    channel: 'ebay',
    slug: 'ebay-fee-calculator',
    label: 'eBay fee & profit calculator',
    // What it adds beyond the flat 13.6% here: Promoted Listings at whatever
    // you bid, returns, Top Rated Plus, store subscription tiers, offers and
    // international fees.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'costOfGoods',
      otherCost: 'otherCost',
    },
    drops: {
      // eBay's only monthly charge there is a Store subscription, amortised
      // over `monthlyStoreOrders` — orders on a *subscribed* account, not this
      // page's plain order count. This page ranks eBay with no monthly fee at
      // all, so sending our number would seed a subscription decision the
      // reader never made.
      monthlyOrders: 'its monthly input is Store-subscription orders, a different question',
    },
  },
  {
    channel: 'etsy',
    slug: 'etsy-profit-calculator',
    label: 'Etsy profit calculator',
    // Etsy's own calculator splits what this page merges: the 9.5% here is
    // 6.5% transaction plus 3% processing, and it prices Offsite Ads, which
    // fire on some orders and not others and so cannot sit in a flat rate.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'materialCost',
      otherCost: 'otherCost',
    },
    drops: {
      // Etsy's `monthlyOrders` input is not a plan-amortisation base: it reads
      // "Orders this month if you charge shipping", one arm of that page's
      // free-shipping A/B. Writing our order count into it would state a
      // demand assumption the reader never made, in a comparison they have not
      // opened yet.
      monthlyOrders: 'its monthly input is one arm of a free-shipping A/B, not a plan base',
    },
  },
  {
    channel: 'amazon',
    slug: 'amazon-fba-calculator',
    label: 'Amazon FBA vs FBM calculator',
    // What it adds: the FBA-versus-FBM split this page cannot make (it ranks
    // Amazon as seller-fulfilled only), plus size-tier fulfilment, monthly
    // storage and inbound placement.
    // `monthlyOrders` travels as `monthlyUnits` ("Units sold per month" there,
    // the same quantity this page calls orders per month). It matters more on
    // this row than anywhere else: Amazon is the one channel here carrying a
    // real subscription in the ranking — $39.99 for the Professional plan —
    // and arriving without the volume it was amortised over would re-spread
    // that plan across the deep tool's own default unit count instead.
    fields: {
      price: 'salePrice',
      itemCost: 'costOfGoods',
      shippingCost: 'fbmShippingCost',
      otherCost: 'otherCost',
      monthlyOrders: 'monthlyUnits',
    },
    drops: {
      // Same reasoning where-to-sell records for this target: Amazon's
      // referral fee is charged on the order total, but this calculator takes
      // the sale price and derives fulfilment from the size tier rather than
      // from what the buyer paid for postage. Folding postage into `salePrice`
      // would inflate the referral fee and print a worse number than the
      // seller will actually see.
      shippingCharged: 'no postage input; folding it into salePrice would inflate the referral fee',
    },
  },
  {
    channel: 'walmart',
    slug: 'walmart-marketplace-calculator',
    label: 'Walmart marketplace calculator',
    // What it adds: WFS fulfilment and storage, the referral-fee minimum, the
    // two-day shipping obligation and aged-inventory surcharges — none of
    // which a single referral percentage can express.
    //
    // `monthlyOrders` travels because that calculator amortises a monthly
    // seller fee over units, exactly as the Shopify row below does. Arriving
    // without it would spread any monthly charge over that page's own default
    // unit count rather than the seller's.
    fields: {
      price: 'salePrice',
      itemCost: 'costOfGoods',
      shippingCost: 'sellerShippingCost',
      otherCost: 'otherCost',
      monthlyOrders: 'monthlyUnits',
    },
    drops: {
      // Walmart is priced as a retail marketplace there: the referral fee sits
      // on the sale price and postage is a cost you carry, not a line the
      // buyer is billed. There is no `shippingCharged` input to receive it.
      shippingCharged: 'no buyer-postage input; the model bills referral on salePrice',
    },
  },
  {
    channel: 'tiktok',
    slug: 'tiktok-shop-fee-calculator',
    label: 'TikTok Shop fee calculator',
    // What it adds: the two things this page's own `notCovered` line names —
    // seller-set creator/affiliate commission, which is often not clawed back
    // on a return, and the announced 1 Oct 2026 move to 8% plus 1.5%
    // facilitation on affiliate-sourced orders.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'shippingCharged',
      shippingCost: 'fulfillmentCost',
      itemCost: 'cogs',
      otherCost: 'otherPerOrder',
    },
    drops: {
      // That page takes volume as `unitsPerDay` and derives the month from it.
      // Converting our monthly figure would mean dividing by its own
      // days-per-month constant and handing back a rounded daily rate that no
      // longer multiplies to what the seller typed here — a number that looks
      // like theirs and is not.
      monthlyOrders: 'it takes units per day; converting would hand back a rounded figure',
    },
  },
  {
    channel: 'mercari',
    slug: 'mercari-fee-calculator',
    label: 'Mercari fee calculator',
    // What it adds: the listing-date switch between Mercari's two fee
    // schedules (a listing created before 6 Jan 2025 and never edited still
    // pays the old 10% plus processing), and a target-profit price solver.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'buyerShipping',
      shippingCost: 'labelCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    drops: {
      // Mercari has no subscription, so there is nothing to amortise.
      monthlyOrders: 'no monthly fee there; nothing to spread over orders',
    },
  },
  {
    channel: 'depop',
    slug: 'depop-fee-calculator',
    label: 'Depop fee calculator',
    // What it adds: region switch (US, UK, rest of world), Boosted Listings, and a target-profit price solver.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'buyerShipping',
      shippingCost: 'labelCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    drops: {
      monthlyOrders: 'no monthly fee there; nothing to spread over orders',
    },
  },
  {
    channel: 'facebook',
    slug: 'facebook-marketplace-fee-calculator',
    label: 'Facebook Marketplace fee calculator',
    // What it adds: local pickup versus shipped, the dispute penalty, and a target-profit price solver.
    fields: {
      price: 'itemPrice',
      shippingCharged: 'buyerShipping',
      shippingCost: 'labelCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    drops: {
      monthlyOrders: 'no monthly fee there; nothing to spread over orders',
    },
  },
  {
    channel: 'poshmark',
    slug: 'poshmark-fee-calculator',
    label: 'Poshmark fee calculator',
    // What it adds: the offer-and-bundle arithmetic around the $15 cliff, the
    // break-even price either side of it, and a target-profit price solver.
    // Both shipping inputs stay behind: the buyer buys Poshmark's prepaid
    // label, so postage is neither revenue nor cost there.
    fields: {
      price: 'salePrice',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    drops: {
      shippingCharged: 'the buyer pays Poshmark for a prepaid label; it never reaches the seller',
      shippingCost: 'the buyer-paid prepaid label means the seller carries no postage',
      monthlyOrders: 'no monthly fee there; nothing to spread over orders',
    },
  },
  {
    channel: 'shopify',
    slug: 'shopify-fee-calculator',
    label: 'Shopify fee & profit calculator',
    // What it adds: which processor. An own store has no referral fee, so the
    // decision is Shopify Payments against PayPal or Stripe — and Shopify
    // charges an extra third-party transaction fee on top of the outside
    // processor's rate, which a flat 2.9% cannot show.
    //
    // `monthlyOrders` travels because the plan is a monthly fee, and
    // amortising it is the whole reason an own store can win on fees and lose
    // on cash.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'costOfGoods',
      otherCost: 'otherCost',
      monthlyOrders: 'monthlyOrders',
    },
    drops: {},
  },
];

/**
 * The same courtesy for the channels this page deliberately does *not* rank.
 *
 * `EXCLUDED_CHANNELS` in `calc.mjs` names four marketplaces that would be an
 * unfair row here — Faire is wholesale, Whatnot is a livestream auction,
 * Reverb and StockX are category-restricted — and gives each "a pointer instead of a row".
 * That pointer was a bare `../<slug>/`, so it walked a seller into exactly the
 * empty form this module was written to stop: the fix above reached the six
 * ranked channels and left the same defect on the way out to these three.
 *
 * Keyed by slug rather than by a channel id because `EXCLUDED_CHANNELS` has no
 * ids — it is a pointer list, not a rate table — and `deepTool` is already the
 * value the page renders the link from.
 *
 * Faire is absent on purpose; `NO_ITEM_HANDOFF` says why.
 */
export const EXCLUDED_HANDOFFS = [
  {
    slug: 'whatnot-seller-payout',
    label: 'Whatnot seller payout calculator',
    // Safe to carry because the sale is still one item at one price: what
    // differs is where the fees land (commission on the hammer, processing on
    // the checkout total including buyer-paid shipping and tax), which is the
    // arithmetic the deep tool exists to do. The price basis is the same.
    //
    // Names match `where-to-sell-calculator`'s vetted Whatnot mapping, which
    // the sibling-agreement test below asserts rather than trusts.
    fields: {
      price: 'salePrice',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    drops: {
      monthlyOrders:
        'Whatnot charges no monthly subscription, so an order count has nothing '
        + 'to amortise. Its own roll-up input is lots per show, which this page '
        + 'never asks for.',
    },
  },
  {
    slug: 'reverb-fee-calculator',
    label: 'Reverb fee calculator',
    // Reverb's fee shape is a marketplace percentage plus payment processing —
    // `calc.mjs` says so where it explains the exclusion, which is on category
    // grounds rather than arithmetic ones. So a retail price means the same
    // thing on both sides and every field lines up one-for-one.
    fields: {
      price: 'price',
      shippingCharged: 'shippingCharged',
      shippingCost: 'shippingCost',
      itemCost: 'itemCost',
      otherCost: 'otherCost',
    },
    drops: {
      monthlyOrders:
        'Reverb has no monthly plan fee, so there is nothing for an order count '
        + 'to spread across, and the calculator offers no input for it.',
    },
  },  {
    slug: 'stockx-seller-payout-calculator',
    label: 'StockX seller payout calculator',
    // Names match `where-to-sell-calculator`'s vetted StockX mapping, which the
    // sibling-agreement test asserts rather than trusts. The sale is one item
    // at one price; what the deep tool adds is the Seller Level fee band and
    // Fast Shipping, which no single preset rate can express.
    fields: {
      price: 'salePrice',
      shippingCost: 'shippingCost',
      itemCost: 'itemCostBasis',
      otherCost: 'otherCost',
    },
    drops: {
      shippingCharged:
        'StockX is a bid/ask marketplace where the buyer pays StockX for '
        + 'delivery, so no postage a buyer pays ever reaches the seller. '
        + 'Sending it would credit revenue StockX never pays out.',
      monthlyOrders:
        'StockX has no monthly plan fee, so there is nothing for an order '
        + 'count to spread across, and the calculator offers no input for it.',
    },
  },
];

/**
 * Excluded channels that get a bare link on purpose, and the reason.
 *
 * Data rather than a comment for the same reason `drops` is: an entry missing
 * from `EXCLUDED_HANDOFFS` because nobody wrote it looks identical to one left
 * out deliberately, and the test asserts this list accounts for the difference.
 */
export const NO_ITEM_HANDOFF = [
  {
    slug: 'faire-wholesale-calculator',
    why:
      'Faire is wholesale, so `price` here and `unitWholesale` there are not the '
      + 'same quantity — a shop buys at roughly half retail. Carrying this '
      + "page's retail price over would land a plausible wrong number in the "
      + 'field the whole calculation turns on, and this module\'s rule is that '
      + 'such a link is worse than a bare one. Its per-unit cost would survive '
      + 'the trip, but a wholesale sheet holding a real cost against a default '
      + 'wholesale price reads as an answer too, so nothing is carried.',
  },
];

/** Slugs travel into an href, so keep them to a shape that cannot escape it. */
const slugIsSafe = (value) => /^[a-z0-9-]+$/.test(value);

/** The handoff for a channel id, or null if it has none. */
export function handoffFor(channel) {
  return HANDOFFS.find((entry) => entry.channel === channel) ?? null;
}

/**
 * The values to hand over, as `{targetField: number}`.
 *
 * Only finite, non-negative numbers travel. A blank or nonsense input is left
 * out entirely so the target falls back to its own default, rather than
 * arriving as `NaN` or as a silent zero that reads as a real answer — which is
 * the failure mode that makes a wrong handoff worse than no handoff.
 */
export function handoffValues(entry, item = {}) {
  const out = {};
  if (!entry) return out;

  const clean = (value) => {
    // `Number('')` and `Number(null)` are both 0, so coercing first would turn
    // an untouched field into an explicit zero and override the target's own
    // default.
    if (value === null || value === undefined) return null;
    if (typeof value === 'string' && value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  };

  for (const [source, target] of Object.entries(entry.fields)) {
    const value = clean(item[source]);
    if (value !== null) out[target] = value;
  }
  return out;
}

/**
 * A relative link to the channel's calculator, carrying the item.
 *
 * Relative on purpose: the same href has to work under the project path prefix
 * GitHub Pages serves from, under a custom domain later, and from a local
 * `python3 -m http.server`. The values ride in the fragment, which browsers do
 * not send to any server and do not put in a `Referer` header — the same
 * privacy property this page's own "Copy share link" button relies on.
 */
export function handoffUrl(channel, item = {}) {
  const entry = handoffFor(channel);
  if (!entry || !slugIsSafe(entry.slug)) return null;

  const values = handoffValues(entry, item);
  const params = new URLSearchParams();
  for (const field of Object.keys(values).sort()) params.set(field, String(values[field]));

  const query = params.toString();
  return `../${entry.slug}/${query ? `#${query}` : ''}`;
}

/** The excluded-channel handoff for a deep-tool slug, or null if it has none. */
export function excludedHandoffFor(slug) {
  return EXCLUDED_HANDOFFS.find((entry) => entry.slug === slug) ?? null;
}

/**
 * A relative link to an excluded channel's calculator, carrying the item.
 *
 * Returns the bare `../<slug>/` when the channel has no mapping, so a caller
 * rendering the pointer list never has to choose between a link that lies and
 * no link at all — Faire keeps the pointer it always had, minus the numbers.
 */
export function excludedHandoffUrl(slug, item = {}) {
  if (!slugIsSafe(slug)) return null;

  const entry = excludedHandoffFor(slug);
  if (!entry) return `../${slug}/`;

  const values = handoffValues(entry, item);
  const params = new URLSearchParams();
  for (const field of Object.keys(values).sort()) params.set(field, String(values[field]));

  const query = params.toString();
  return `../${slug}/${query ? `#${query}` : ''}`;
}

/**
 * Every available handoff for a ranked comparison, best channel first.
 *
 * Ordered by the ranking the reader is looking at rather than by the table
 * above, so the link they most likely want is the one they read first. `rows`
 * is `compareChannels()`'s output, which is already sorted best-first.
 */
export function handoffsForRows(rows = [], item = {}) {
  return rows
    .map((row, index) => {
      const entry = handoffFor(row.id);
      if (!entry) return null;
      return {
        channel: row.id,
        label: entry.label,
        channelLabel: row.label ?? entry.channel,
        isBest: index === 0,
        href: handoffUrl(row.id, item),
      };
    })
    .filter(Boolean);
}

/**
 * Inputs this page shares with `where-to-sell-calculator`, by that page's id.
 *
 * Its shared-input vocabulary matches this page's except that it keeps
 * packaging apart; this page folds packaging into `otherCost`, which it reads
 * as its own `otherCost`, so nothing is dropped. The category never travels:
 * where-to-sell has its own channel switches instead.
 */
export const WHERE_TO_SELL_FIELDS = [
  'price', 'shippingCharged', 'shippingCost', 'itemCost', 'otherCost', 'monthlyOrders',
];

/**
 * A relative link into the where-to-sell calculator carrying the item.
 *
 * That page reads `#c=<encoded JSON>` (`share.mjs` there). The payload is built
 * inline rather than imported so renaming that page's inputs cannot move this
 * link's target at runtime; `handoff.test.mjs` imports its decoder and checks
 * the round trip instead. A blank item gives the bare link.
 */
export function whereToSellUrl(item = {}) {
  const shared = {};
  for (const key of WHERE_TO_SELL_FIELDS) {
    const value = item[key];
    if (value === null || value === undefined) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed) && parsed >= 0) shared[key] = parsed;
  }
  const base = '../where-to-sell-calculator/';
  if (Object.keys(shared).length === 0) return base;
  return `${base}#c=${encodeURIComponent(JSON.stringify({ shared }))}`;
}
