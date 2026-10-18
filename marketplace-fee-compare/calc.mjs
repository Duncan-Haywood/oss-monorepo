// Compares what one item nets across ten selling channels at once.
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
 * Amazon and Walmart but 6.5% on Etsy and 13.6% on eBay.
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
 * whatever shipping they were charged). That is how nine of these ten actually
 * bill (Poshmark commissions the price alone, see `buyerPaysLabel`) — a seller who "gives free shipping" by folding postage into the price
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
    percentRate: 13.6,
    fixedFee: 0.4, // $0.40 on orders over $10 ($0.30 at $10 or less; the 2.35% band above $7,500 is not modelled)
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
      "Creator/affiliate commission, and a possible move to 8%: as of 16 Oct 2026 third-party guides date it to 4 Aug 2026, TikTok's public table was reported still at 6%, and no source found confirms the announced 1.5% facilitation fee. Check Seller Center.",
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
    id: "depop",
    label: "Depop (US)",
    percentRate: 3.3, // US: 0% selling fee, Depop Payments processing on item + buyer-paid shipping
    fixedFee: 0.45,
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Payment processing",
    deepTool: "depop-fee-calculator",
    deepToolLabel: "Depop fee calculator",
    notCovered:
      "Boosted Listings (+12% on sales made while boosted), the UK and rest-of-world schedules, and the buyer-side Marketplace fee.",
  },
  {
    id: "facebook",
    label: "Facebook Marketplace (shipped)",
    percentRate: 10, // shipped checkout only; local pickup is $0 and is not modelled here
    fixedFee: 0,
    minFee: 0.8, // the selling fee is never below this per shipped order
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Selling fee",
    deepTool: "facebook-marketplace-fee-calculator",
    deepToolLabel: "Facebook Marketplace fee calculator",
    notCovered:
      "Local pickup (no fee at all), the dispute penalty on a lost chargeback, and sales tax Facebook collects.",
  },
  {
    id: "poshmark",
    label: "Poshmark",
    percentRate: 20, // US: 20% of the sale price at $15.00 or more
    fixedFee: 0,
    // Below $15.00 Poshmark keeps a flat $2.95 instead of a percentage, so the
    // fee is a cliff, not a rate: $14.99 pays $2.95 and $15.00 pays $3.00, and
    // a $5 item pays 59%. The commission is on the sale price only.
    flatBelow: { threshold: 15, fee: 2.95 },
    // The buyer pays Poshmark for a prepaid label, which never reaches the
    // seller. Postage is therefore neither revenue nor cost here, and the two
    // shipping inputs are ignored for this row rather than double counted.
    buyerPaysLabel: true,
    monthlyFee: 0,
    demandIncluded: true,
    rateLabel: "Commission at $15+",
    deepTool: "poshmark-fee-calculator",
    deepToolLabel: "Poshmark fee calculator",
    notCovered:
      "Offer and bundle arithmetic around the $15 cliff, and sales-tax handling. Shipping is left out on both sides because the buyer buys the prepaid label.",
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
 * Faire, Whatnot, Reverb, and StockX are deliberately not in the comparison above.
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
 * express. Ranking it beside ten fixed-fee retail channels would produce a
 * number that looks comparable and is not.
 *
 * Reverb is different from the other two: its fee shape (a marketplace
 * percentage plus payment processing) is genuinely comparable to eBay's or
 * Etsy's. It is excluded anyway because it is category-restricted rather than
 * general retail — it only accepts musical instruments and gear, where the channels above sell almost anything. A general "which marketplace" table
 * that seats a single-category channel beside the general ones would read as a
 * recommendation to list *any* item there, which is not true for the vast
 * majority of what this page's other sellers carry.
 *
 * StockX is excluded for the same category reason as Reverb: it only lists
 * sneakers, streetwear and graded cards, and it is a bid/ask marketplace where
 * the buyer pays StockX for delivery, so none of the postage a buyer pays ever
 * reaches the seller. Its seller fee also falls with the seller's own Seller
 * Level, which a single preset rate cannot express.
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
      "Reverb only accepts musical instruments and gear, where the ten channels above sell almost anything — so seating it in a general-purpose ranking would read as a recommendation to list any item there, which is true for none of the other rows' inventory. Its fee shape (marketplace percentage plus payment processing) is genuinely close to eBay's, which the deep tool compares directly on the same guitar or pedal.",
  },
  {
    label: "StockX (sneakers & streetwear)",
    deepTool: "stockx-seller-payout-calculator",
    deepToolLabel: "StockX seller payout calculator",
    why:
      "StockX only lists sneakers, streetwear and graded cards, and it is a bid/ask marketplace rather than a storefront: the buyer pays StockX for delivery, so no postage a buyer pays reaches you, and your fee rate falls as your own Seller Level rises. A preset rate in a general ranking would be a number that looks comparable and is not, so the dedicated calculator takes the rate from your own dashboard.",
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
 * With a minimum fee the fee is max(rate*order + fixed, minFee), so the
 * break-even order is the smaller consistent solution of the two branches: the
 * percentage branch when its fee clears the floor, otherwise the floor branch.
 */
function landedCost(channel, item) {
  return item.itemCost + item.otherCost + (channel.buyerPaysLabel ? 0 : item.shippingCost);
}

function breakEvenPrice(channel, item, subscriptionPerOrder, cashInvested, targetProfit = 0) {
  const need = subscriptionPerOrder + cashInvested + targetProfit;
  const rate = channel.percentRate / 100;
  if (channel.buyerPaysLabel) {
    // The fee sits on the price alone and is flat under the threshold, so the
    // answer is the cheaper consistent branch: the flat one when it lands
    // below the threshold, otherwise the percentage one, which cannot go
    // below the threshold without dropping back onto the flat fee.
    if (channel.flatBelow) {
      const flatPrice = need + channel.flatBelow.fee;
      if (flatPrice < channel.flatBelow.threshold) return flatPrice;
    }
    const percentPrice = (need + channel.fixedFee) / (1 - rate);
    return Math.max(0, channel.flatBelow ? Math.max(percentPrice, channel.flatBelow.threshold) : percentPrice);
  }
  let order = (channel.fixedFee + need) / (1 - rate);
  if (channel.minFee && order * rate + channel.fixedFee < channel.minFee) {
    order = channel.minFee + need;
  }
  return Math.max(0, order - item.shippingCharged);
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
  const revenue = channel.buyerPaysLabel ? item.price : item.price + item.shippingCharged;
  const feeBase = channel.buyerPaysLabel ? item.price : revenue;
  const percentFee = (feeBase * channel.percentRate) / 100;
  const subscriptionPerOrder = channel.monthlyFee / item.monthlyOrders;
  // `minFee` is a floor on the percentage-plus-fixed selling fee (Facebook's
  // $0.80 minimum), applied before the subscription share is added.
  // `flatBelow` replaces the whole percentage fee under a price (Poshmark).
  const orderFee = channel.flatBelow && feeBase < channel.flatBelow.threshold
    ? Math.min(channel.flatBelow.fee, feeBase)
    : Math.max(percentFee + channel.fixedFee, channel.minFee ?? 0);
  const channelFees = orderFee + subscriptionPerOrder;
  const cashInvested = landedCost(channel, item);
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
    breakEvenPrice: breakEvenPrice(channel, item, subscriptionPerOrder, cashInvested),
  };
}

/**
 * The list price a channel needs for this item to net `targetProfit`,
 * holding the buyer's shipping contribution and every cost fixed. This is the
 * repricing question a multi-channel seller actually asks once the table shows
 * a gap: "what do I have to charge on Walmart to keep what I keep on eBay?"
 *
 * Solves `(price + shipping) - fee - subscription - cost = target` for price,
 * where fee is the rate on the order plus fixed (or the channel's minimum). Floors at 0 because a negative list price is not an
 * answer; the page shows such a row as free-to-match rather than a number.
 */
export function priceForProfit(channel, item, targetProfit) {
  const cashInvested = landedCost(channel, item);
  const subscriptionPerOrder = channel.monthlyFee / item.monthlyOrders;
  // Same two-branch solve as the break-even price (it honours a minimum-fee
  // floor such as Facebook's), shifted by the profit the seller wants.
  return breakEvenPrice(channel, item, subscriptionPerOrder, cashInvested, targetProfit);
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
