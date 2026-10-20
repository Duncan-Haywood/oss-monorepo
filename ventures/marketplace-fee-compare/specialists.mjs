// Specialist channels: marketplaces that only take one kind of item.
//
// Why they are not in the ten-row table
// -------------------------------------
// `calc.mjs` explains why Reverb and its kind are kept out of the general
// ranking: seating a single-category channel beside eBay would read as "list
// anything here", which is false. The cost of keeping them out entirely was
// the opposite error, though. A seller of a guitar pedal, a streetwear jacket
// or a binder of cards saw a table that ranked the wrong ten places and
// pointed at the right one in a footnote.
//
// So a specialist row appears only when the item's category is one that
// channel accepts, is shown apart from the general ranking, and is compared
// to the best general channel for the same item. For every other category
// this module returns nothing.
//
// The schedules are copied from the sibling calculators (reverb-fee-calculator,
// grailed-fee-calculator, tcgplayer-fee-calculator), which carry their sources
// and dates, and a test asserts the two agree. They are defaults for a
// headline comparison, not a live fee schedule: check one real payout.

const nonNegative = (value) => (Number.isFinite(value) && value > 0 ? value : 0);

export const SPECIALIST_CHANNELS = [
  {
    id: "reverb",
    label: "Reverb",
    categories: ["music_gear"],
    accepts: "musical instruments and gear",
    rateLabel: "5% selling fee (max $500) + payment",
    deepTool: "reverb-fee-calculator",
    deepToolLabel: "Reverb fee calculator",
    notCovered: "Reverb Gives, bump fees, Safe Shipping labels, and the Preferred Seller programme.",
    // Selling fee on the item price, capped; card processing on item plus shipping.
    fee: ({ price, shippingCharged }) =>
      Math.min(price * 0.05, 500) + (price + shippingCharged) * 0.0319 + 0.49,
  },
  {
    id: "grailed",
    label: "Grailed",
    categories: ["clothing"],
    accepts: "menswear, streetwear and sneakers (not women's clothing)",
    rateLabel: "6% under $120, 9% from $120 + processing",
    deepTool: "grailed-fee-calculator",
    deepToolLabel: "Grailed fee calculator",
    notCovered: "International-buyer processing (4.99%) and Grailed-provided labels. Check the $120 step: 9% applies to the whole sale once it is reached.",
    fee: ({ price, shippingCharged }) => {
      const base = price + shippingCharged;
      if (!(base > 0)) return 0;
      const commission = base >= 120 ? base * 0.09 : Math.max(base * 0.06, 1.99);
      return commission + base * 0.0349 + 0.49;
    },
  },
  {
    id: "tcgplayer",
    label: "TCGplayer",
    categories: ["trading_cards"],
    accepts: "trading cards and sealed product",
    rateLabel: "10.75% (max $75) + 2.5% and $0.30 per order",
    deepTool: "tcgplayer-fee-calculator",
    deepToolLabel: "TCGplayer fee calculator",
    notCovered: "Pro-seller rates, multi-card orders (the $0.30 is per order, so it shrinks per card), TCGplayer Direct, and sales tax in the processing base.",
    fee: ({ price, shippingCharged }) => {
      const subtotal = price + shippingCharged;
      if (!(subtotal > 0)) return 0;
      return Math.min(subtotal * 0.1075, 75) + subtotal * 0.025 + 0.3;
    },
  },
  {
    id: "whatnot",
    label: "Whatnot",
    categories: ["trading_cards"],
    accepts: "cards, comics, coins, toys and other collectibles sold in live shows",
    rateLabel: "8% on the first $1,500 of the sale + 2.9% and $0.30 on what the buyer pays",
    deepTool: "whatnot-seller-payout",
    deepToolLabel: "Whatnot seller payout calculator",
    notCovered: "Other category rates (coins 4%, pallets 4%), giveaway lots, sales tax in the processing base, and show-level roll-ups.",
    // Commission is on the hammer (nothing above $1,500 for this category);
    // processing is on item plus buyer-paid shipping.
    fee: ({ price, shippingCharged }) =>
      Math.min(price, 1500) * 0.08 + (price + shippingCharged) * 0.029 + 0.3,
  },
  {
    id: "stockx",
    label: "StockX",
    categories: ["clothing"],
    accepts: "sneakers, streetwear and other authenticated resale goods",
    rateLabel: "9% seller fee + 3% processing on the sale price",
    deepTool: "stockx-seller-payout-calculator",
    deepToolLabel: "StockX seller payout calculator",
    notCovered: "Your own Seller Level rate (it falls as you sell more), the Fast Shipping discount, and the cost of shipping to a verification centre.",
    // The buyer pays StockX for shipping, so none of `shippingCharged` reaches
    // the seller: the fee adds it back to cancel it out of revenue.
    fee: ({ price, shippingCharged }) => price * 0.12 + shippingCharged,
  },
  {
    id: "poshmark",
    label: "Poshmark",
    categories: ["clothing"],
    accepts: "fashion, shoes and accessories",
    rateLabel: "flat $2.95 under $15, 20% from $15",
    deepTool: "poshmark-fee-calculator",
    deepToolLabel: "Poshmark fee calculator",
    notCovered: "Offer and bundle discounts that cross the $15 line, and your own label cost: the shipping buyers pay funds Poshmark's prepaid label, so none of it reaches you.",
    // The buyer-paid shipping funds Poshmark's label, so it never reaches the
    // seller: add it back to cancel it out of revenue, as StockX does.
    fee: ({ price, shippingCharged }) => (price < 15 ? Math.min(2.95, price) : price * 0.2) + shippingCharged,
  },
  {
    id: "mercari",
    label: "Mercari",
    categories: ["clothing"],
    accepts: "used fashion and shoes (Mercari sells more than clothing; it sits with the fashion resale sites here because that is where sellers weigh it against Poshmark and Depop)",
    rateLabel: "10% of item plus buyer-paid shipping, no separate processing fee",
    deepTool: "mercari-fee-calculator",
    deepToolLabel: "Mercari fee calculator",
    notCovered: "Listings made before 6 January 2025 and never edited keep the old schedule (10% of the item plus 2.9% and $0.50 processing). The buyer's 3.6% protection fee is not yours.",
    fee: ({ price, shippingCharged }) => (price + shippingCharged) * 0.1,
  },
  {
    id: "depop",
    label: "Depop",
    categories: ["clothing"],
    accepts: "fashion, vintage and streetwear",
    rateLabel: "0% selling fee, 3.3% + $0.45 processing (US)",
    deepTool: "depop-fee-calculator",
    deepToolLabel: "Depop fee calculator",
    notCovered: "UK and rest-of-world schedules, the 12% Boosted Listings fee on boosted sales, and the buyer-side marketplace fee (paid by the buyer, never deducted from you).",
    fee: ({ price, shippingCharged }) => (price + shippingCharged) * 0.033 + 0.45,
  },
  {
    id: "discogs",
    label: "Discogs",
    categories: ["records_media"],
    accepts: "records, CDs, tapes and music media",
    rateLabel: "9% of item plus shipping (min $0.10, max $150) + processing",
    deepTool: "discogs-fee-calculator",
    deepToolLabel: "Discogs fee calculator",
    notCovered: "Your real processing rate (Discogs does not publish one number; 2.9% + $0.30 is a placeholder to check against a payout) and the 8% rate on pre-May-2023 history.",
    fee: ({ price, shippingCharged }) => {
      const combined = price + shippingCharged;
      if (!(combined > 0)) return 0;
      return Math.min(Math.max(combined * 0.09, 0.1), 150) + combined * 0.029 + 0.3;
    },
  },
];

function costOf(item) {
  return item.itemCost + item.otherCost + item.shippingCost;
}

function netAt(channel, item, price) {
  const priced = { ...item, price };
  return price + item.shippingCharged - channel.fee(priced) - costOf(item);
}

/** List price at which a specialist channel nets `target`; payout rises with price, so bisect. */
export function specialistPriceForProfit(channel, item, target = 0) {
  let lo = 0;
  let hi = Math.max(10, (target + costOf(item)) * 2 + 10);
  for (let i = 0; netAt(channel, item, hi) < target && i < 60; i += 1) hi *= 2;
  if (netAt(channel, item, 0) >= target) return 0;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (netAt(channel, item, mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * Specialist rows for this item, best first, each with its gap to `bestGeneral`
 * (the profit of the top general channel, so a seller sees whether the niche
 * site beats the places they would have listed anyway). Empty for categories no
 * specialist accepts.
 */
export function specialistRows(item, bestGeneralProfit = null) {
  return SPECIALIST_CHANNELS.filter((channel) => channel.categories.includes(item.categoryId))
    .map((channel) => {
      const channelFees = nonNegative(channel.fee(item));
      const revenue = item.price + item.shippingCharged;
      const profit = revenue - channelFees - costOf(item);
      return {
        id: channel.id,
        label: channel.label,
        accepts: channel.accepts,
        rateLabel: channel.rateLabel,
        deepTool: channel.deepTool,
        deepToolLabel: channel.deepToolLabel,
        notCovered: channel.notCovered,
        revenue,
        channelFees,
        profit,
        margin: revenue === 0 ? 0 : (profit / revenue) * 100,
        breakEvenPrice: specialistPriceForProfit(channel, item, 0),
        vsBestGeneral: bestGeneralProfit === null ? null : profit - bestGeneralProfit,
      };
    })
    .sort((a, b) => b.profit - a.profit);
}
