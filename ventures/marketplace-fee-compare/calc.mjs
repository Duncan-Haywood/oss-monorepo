// Compares what one item nets across seven selling channels at once.
//
// Why this exists
// ---------------
// This repo already ships a deep calculator for eBay, Etsy, Amazon, Walmart,
// Shopify, TikTok Shop and Faire. Each one answers its channel thoroughly and
// none of them answers the question a multi-channel seller actually starts
// with: *of the places I can list this, which one leaves the most in my
// pocket?* Today that means opening six tabs, retyping the same item six
// times, and comparing six numbers by hand — which is exactly the moment a
// seller gives up and guesses.
//
// So this is a triage tool, not a seventh fee engine. It models each channel's
// *headline* fee structure — the percentage on the order, the fixed per-order
// charges, and any subscription amortised over the seller's own order volume —
// and then points at the deep calculator for the parts a headline rate cannot
// carry (Amazon FBA size tiers, Etsy Offsite Ads, Shopify plan upgrades,
// TikTok's affiliate commission, eBay's promoted-listing rate).
//
// The fee defaults below are lifted from those shipped calculators rather than
// re-researched here, so the two agree by construction: a seller who triages
// with this page and then opens the deep tool sees the same starting numbers.
// Every one of them is an *input* with a default, not a live fee schedule —
// rates change, categories differ, and a seller's own statement wins.

/**
 * Referral rates differ per marketplace *for the same item*, which is half the
 * reason this comparison is worth running at all: "jewelry" is 20% on both
 * Amazon and Walmart but 6.5% on Etsy and 13.25% on eBay.
 *
 * Amazon and Walmart rates are the category presets from their own calculators
 * (`ventures/amazon-fba-calculator/calc.mjs`,
 * `ventures/walmart-marketplace-calculator/calc.mjs`). Where the two spell a
 * category differently, the nearest equivalent is used and named here so the
 * mapping is reviewable rather than implied.
 */
export const CATEGORY_PRESETS = {
  everything_else: { label: "Everything else", amazon: 15, walmart: 15 },
  clothing: { label: "Clothing & accessories", amazon: 17, walmart: 15 },
  jewelry: { label: "Jewelry", amazon: 20, walmart: 20 },
  electronics: { label: "Electronics", amazon: 8, walmart: 8 },
  grocery: { label: "Grocery & gourmet", amazon: 8, walmart: 8 },
  beauty: { label: "Beauty & personal care", amazon: 8, walmart: 12 },
  home: { label: "Home & kitchen", amazon: 15, walmart: 15 },
  toys: { label: "Toys & games", amazon: 15, walmart: 15 },
  sports: { label: "Sports & outdoors", amazon: 15, walmart: 15 },
};

export const CATEGORY_IDS = Object.freeze(Object.keys(CATEGORY_PRESETS));

/**
 * The channels, in the order they are offered.
 *
 * `percentRate` is charged on the whole order the buyer pays (item price plus
 * whatever shipping they were charged). That is how all seven of these actually
 * bill — a seller who "gives free shipping" by folding postage into the price
 * still pays the percentage on it, which is the single most common way a
 * per-item margin quietly goes negative.
 *
 * `monthlyFee` is a subscription, not an order charge. It is amortised over the
 * seller's own monthly order count rather than ignored, because ignoring it is
 * what makes Shopify look free and Amazon Professional look cheaper than
 * Individual at low volume. `monthlyFeeNote` explains the charge on the page.
 *
 * `demandIncluded: false` marks a channel that sends the seller no buyers.
 * Without it this comparison would recommend an own-store checkout to nearly
 * everyone on fee arithmetic alone, which would be true and useless: a Shopify
 * store with no traffic nets 0.
 */
export const CHANNELS = [
  {
    id: "ebay",
    label: "eBay",
    percentRate: 13.25,
    fixedFee: 0.3,
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Final value fee",
    deepTool: "ebay-fee-calculator",
    deepToolLabel: "eBay fee calculator",
    notCovered: "Promoted Listings, international fees, and store subscriptions.",
  },
  {
    id: "etsy",
    label: "Etsy",
    percentRate: 9.5, // 6.5% transaction + 3% payment processing
    fixedFee: 0.45, // $0.20 listing + $0.25 payment processing
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Transaction + payment",
    deepTool: "etsy-profit-calculator",
    deepToolLabel: "Etsy profit calculator",
    notCovered: "Offsite Ads (12–15% when they fire), Etsy Plus, and on-site Ads.",
  },
  {
    id: "amazon",
    label: "Amazon (seller-fulfilled)",
    percentRate: null, // category-driven, resolved by resolveChannels()
    fixedFee: 0,
    monthlyFee: 39.99,
    demandIncluded: true,
    rateLabel: "Referral fee",
    categoryKey: "amazon",
    monthlyFeeNote: "Professional selling plan.",
    deepTool: "amazon-fba-calculator",
    deepToolLabel: "Amazon FBA vs FBM calculator",
    notCovered: "FBA fulfilment and storage fees, which depend on size tier and weight.",
  },
  {
    id: "walmart",
    label: "Walmart Marketplace",
    percentRate: null,
    fixedFee: 0,
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Referral fee",
    categoryKey: "walmart",
    deepTool: "walmart-marketplace-calculator",
    deepToolLabel: "Walmart marketplace calculator",
    notCovered: "WFS fulfilment and storage fees.",
  },
  {
    id: "tiktok",
    label: "TikTok Shop",
    percentRate: 6,
    fixedFee: 0,
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Referral fee",
    deepTool: "tiktok-shop-fee-calculator",
    deepToolLabel: "TikTok Shop fee calculator",
    notCovered:
      "Creator/affiliate commission, and the announced 1 Oct 2026 move to 8% plus 1.5% facilitation.",
  },
  {
    id: "mercari",
    label: "Mercari",
    percentRate: 10, // current (6 Jan 2025 onward) schedule: one selling fee on item + buyer-paid shipping
    fixedFee: 0,
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Selling fee",
    deepTool: "mercari-fee-calculator",
    deepToolLabel: "Mercari fee calculator",
    notCovered:
      "The legacy pre-2025 schedule (10% plus 2.9% and $0.50 processing) that older listings keep until edited, and Mercari's buyer-side protection fee.",
  },
  {
    id: "shopify",
    label: "Your own Shopify store",
    percentRate: 2.9,
    fixedFee: 0.3,
    monthlyFee: 39,
    demandIncluded: false,
    rateLabel: "Payment processing",
    monthlyFeeNote: "Basic plan.",
    deepTool: "shopify-fee-calculator",
    deepToolLabel: "Shopify fee calculator",
    notCovered:
      "Apps, themes, and the cost of the advertising that has to replace marketplace demand.",
  },
];

export const CHANNEL_IDS = Object.freeze(CHANNELS.map((channel) => channel.id));

/**
 * Faire, Whatnot, and Reverb are deliberately not in the comparison above.
 *
 * Faire is wholesale: the buyer is a shop buying at roughly half retail, on a
 * commission and payout-timing structure that has no per-retail-order
 * equivalent. Putting it in a retail per-item table would produce a number that
 * looks comparable and is not — a brand would read "Faire nets least" when the
 * real question is volume per order and reorder rate.
 *
 * Whatnot is a livestream auction: commission sits on the hammer and payment
 * processing sits on the checkout total (item plus buyer-paid shipping and
 * tax), with published category caps a flat retail referral rate cannot
 * express. Ranking it beside seven fixed-fee retail channels would produce a
 * number that looks comparable and is not.
 *
 * Reverb is different from the other two: its fee shape (a marketplace
 * percentage plus payment processing) is genuinely comparable to eBay's or
 * Etsy's. It is excluded anyway because it is category-restricted rather than
 * general retail — it only accepts musical instruments and gear, where the six
 * channels above sell almost anything. A general "which marketplace" table
 * that seats a single-category channel beside seven general ones would read as a
 * recommendation to list *any* item there, which is not true for the vast
 * majority of what this page's other sellers carry.
 *
 * Each gets a pointer instead of a row.
 */
export const EXCLUDED_CHANNELS = [
  {
    label: "Faire (wholesale)",
    deepTool: "faire-wholesale-calculator",
    deepToolLabel: "Faire wholesale calculator",
    why:
      "Faire is wholesale, not retail: the buyer is a shop paying about half your retail price, and the economics turn on order size and reorders rather than one item. Comparing it here would be an unfair number rather than a useful one.",
  },
  {
    label: "Whatnot (livestream auction)",
    deepTool: "whatnot-seller-payout",
    deepToolLabel: "Whatnot seller payout calculator",
    why:
      "Whatnot is a livestream auction, not a fixed-fee retail listing: commission is on the hammer and processing is on the checkout total (item plus buyer-paid shipping and tax), with category caps that do not map to one referral percentage. Comparing it here would be an unfair number rather than a useful one.",
  },
  {
    label: "Reverb (musical instruments & gear)",
    deepTool: "reverb-fee-calculator",
    deepToolLabel: "Reverb fee calculator",
    why:
      "Reverb only accepts musical instruments and gear, where the seven channels above sell almost anything — so seating it in a general-purpose ranking would read as a recommendation to list any item there, which is true for none of the other rows' inventory. Its fee shape (marketplace percentage plus payment processing) is genuinely close to eBay's, which the deep tool compares directly on the same guitar or pedal.",
  },
];

function number(value, name, fallback = 0) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return result;
}

/**
 * Read the item the seller described.
 *
 * `monthlyOrders` has a floor of 1 rather than 0: amortising a subscription
 * over zero orders is a division by zero, and the honest reading of "I sell
 * nothing there" is that the whole subscription lands on the first order.
 */
export function loadItem(input = {}) {
  const item = {
    price: number(input.price, "Item price"),
    shippingCharged: number(input.shippingCharged, "Shipping charged to the buyer"),
    itemCost: number(input.itemCost, "Item cost"),
    shippingCost: number(input.shippingCost, "Shipping cost you pay"),
    otherCost: number(input.otherCost, "Packaging and other costs"),
    monthlyOrders: Math.max(1, number(input.monthlyOrders, "Orders per month", 50)),
    categoryId: input.categoryId ?? "everything_else",
  };
  if (!(item.categoryId in CATEGORY_PRESETS)) {
    throw new Error(`Unknown category: ${item.categoryId}`);
  }
  return item;
}

/**
 * Resolve each channel's effective percentage for this item.
 *
 * Split out from `compareChannels` so the page can render the rate a seller is
 * about to be judged on *before* they trust the ranking, and so an override
 * (their own negotiated rate, a category this table does not carry) is a
 * first-class input rather than a fork of the model.
 */
export function resolveChannels(item, overrides = {}) {
  const category = CATEGORY_PRESETS[item.categoryId];
  return CHANNELS.map((channel) => {
    const fallback = channel.categoryKey ? category[channel.categoryKey] : channel.percentRate;
    const override = overrides[channel.id];
    const percentRate =
      override === undefined || override === null || override === ""
        ? fallback
        : number(override, `${channel.label} rate`);
    if (percentRate >= 100) {
      throw new Error(`${channel.label} rate must be below 100%`);
    }
    return { ...channel, percentRate };
  });
}

/**
 * One channel's result for this item.
 *
 * `cashInvested` excludes marketplace fees on purpose, matching the split the
 * eBay and Etsy calculators already use: fees come out of the proceeds, not out
 * of the seller's pocket up front, so counting them as invested cash would
 * understate ROI on every channel by a different amount and make the ranking
 * meaningless.
 */
export function calculateChannel(channel, item) {
  const revenue = item.price + item.shippingCharged;
  const percentFee = (revenue * channel.percentRate) / 100;
  const subscriptionPerOrder = channel.monthlyFee / item.monthlyOrders;
  const channelFees = percentFee + channel.fixedFee + subscriptionPerOrder;
  const cashInvested = item.itemCost + item.shippingCost + item.otherCost;
  const profit = revenue - channelFees - cashInvested;
  return {
    id: channel.id,
    label: channel.label,
    percentRate: channel.percentRate,
    rateLabel: channel.rateLabel,
    demandIncluded: channel.demandIncluded,
    deepTool: channel.deepTool,
    deepToolLabel: channel.deepToolLabel,
    notCovered: channel.notCovered,
    monthlyFee: channel.monthlyFee,
    monthlyFeeNote: channel.monthlyFeeNote ?? null,
    revenue,
    percentFee,
    fixedFee: channel.fixedFee,
    subscriptionPerOrder,
    channelFees,
    cashInvested,
    profit,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
    // The item price at which this channel breaks even, holding the buyer's
    // shipping contribution and every cost fixed. Percentage fees apply to
    // shipping revenue too, so solve on the whole order and subtract it back.
    breakEvenPrice: Math.max(
      0,
      (channel.fixedFee + subscriptionPerOrder + cashInvested) / (1 - channel.percentRate / 100) -
        item.shippingCharged,
    ),
  };
}

/**
 * The list price a channel needs for this item to net `targetProfit`,
 * holding the buyer's shipping contribution and every cost fixed. This is the
 * repricing question a multi-channel seller actually asks once the table shows
 * a gap: "what do I have to charge on Walmart to keep what I keep on eBay?"
 *
 * Solves `(price + shipping) * (1 - rate) - fixed - subscription - cost =
 * target` for price. Floors at 0 because a negative list price is not an
 * answer; the page shows such a row as free-to-match rather than a number.
 */
export function priceForProfit(channel, item, targetProfit) {
  const cashInvested = item.itemCost + item.shippingCost + item.otherCost;
  const subscriptionPerOrder = channel.monthlyFee / item.monthlyOrders;
  const needed = targetProfit + channel.fixedFee + subscriptionPerOrder + cashInvested;
  return Math.max(0, needed / (1 - channel.percentRate / 100) - item.shippingCharged);
}

/**
 * Every channel for this item, best net profit first.
 *
 * Ties break on channel order rather than arbitrarily, so a seller comparing
 * two identical-fee channels sees a stable table across recalculations instead
 * of two rows that swap places while they read.
 */
export function compareChannels(item, overrides = {}) {
  const channels = resolveChannels(item, overrides);
  const rows = channels.map((channel) => calculateChannel(channel, item));
  // Parity target: the best channel that actually sends buyers, so an own-store
  // row that "wins" on fees alone does not set the bar nobody can clear.
  const anchor = rows
    .filter((row) => row.demandIncluded)
    .reduce((best, row) => (best === null || row.profit > best.profit ? row : best), null);
  if (anchor) {
    rows.forEach((row, index) => {
      row.parityTarget = anchor.profit;
      row.parityAnchorLabel = anchor.label;
      row.parityPrice = priceForProfit(channels[index], item, anchor.profit);
    });
  }
  const order = new Map(CHANNEL_IDS.map((id, index) => [id, index]));
  return [...rows].sort(
    (a, b) => b.profit - a.profit || order.get(a.id) - order.get(b.id),
  );
}

/**
 * The one-sentence answer, written so it cannot be read as a recommendation to
 * move channels.
 *
 * The gap matters more than the winner: $0.40 between the top two is noise
 * against a category rate this table guessed, while $6 is a real decision. And
 * the winner is reported *with* its caveat when it is the own-store row,
 * because "your own store nets most" is arithmetically true for almost every
 * item here and operationally false for a seller with no audience.
 */
export function compareSummary(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return "";
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const best = rows[0];
  const runnerUp = rows[1];
  if (best.profit <= 0) {
    return `No channel here leaves a profit on this item: the best of them, ${best.label}, still loses ${money(Math.abs(best.profit))}. Raise the price, cut the landed cost, or drop the item.`;
  }
  const parts = [`${best.label} nets the most on this item: ${money(best.profit)} (${best.margin.toFixed(1)}% margin).`];
  if (runnerUp) {
    const gap = best.profit - runnerUp.profit;
    parts.push(
      gap < 0.5
        ? `${runnerUp.label} is within ${money(gap)} of it — close enough that a category rate or a promoted-listing fee would flip the order, so treat them as tied.`
        : `That is ${money(gap)} more than ${runnerUp.label}, the next best.`,
    );
  }
  if (!best.demandIncluded) {
    parts.push(
      "It also sends you no buyers: that figure holds only for a sale you brought yourself, and the cost of bringing it is not in this table.",
    );
  }
  return parts.join(" ");
}

/**
 * A plain-text version of the comparison the seller can paste into their own
 * notes or a supplier conversation. Built here rather than in the page so it
 * can be tested without a browser, same as the sibling calculators do it.
 */
export function comparisonText(item, rows, generatedDate = new Date().toISOString().slice(0, 10)) {
  const money = (value) => {
    const format = (value) => `$${value.toFixed(2)}`;
    const text = format(Math.abs(value));
    return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
  };
  const lines = [
    "MARKETPLACE NET-PROFIT COMPARISON",
    `Generated: ${generatedDate}`,
    "",
    `Item price: ${money(item.price)}`,
    `Shipping charged to buyer: ${money(item.shippingCharged)}`,
    `Landed cost (item + shipping + packaging): ${money(item.itemCost + item.shippingCost + item.otherCost)}`,
    `Category: ${CATEGORY_PRESETS[item.categoryId].label}`,
    `Orders per month used to spread subscriptions: ${item.monthlyOrders}`,
    "",
  ];
  for (const row of rows) {
    lines.push(
      `${row.label}: net ${money(row.profit)} (${row.margin.toFixed(1)}% margin) after ${money(row.channelFees)} in channel fees at ${row.percentRate}%`,
    );
  }
  lines.push(
    "",
    compareSummary(rows),
    "",
    "Fee rates are editable defaults, not a live fee schedule. Check your own statement before pricing against this.",
    "This is an arithmetic comparison, not tax, financial, or business advice.",
  );
  return lines.join("\n");
}
