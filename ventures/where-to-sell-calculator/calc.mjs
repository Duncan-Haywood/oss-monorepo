// Cross-marketplace net-profit arithmetic for one item sold on several
// channels. No network, no state, no stored rate schedule: every fee is an
// input, and the presets below are illustrative starting points a seller is
// expected to replace with the numbers on their own statements. That keeps the
// output a transparent calculation the seller can check rather than a claim
// about any marketplace's current published fees.

/**
 * Illustrative defaults for the channels a small seller most often chooses
 * between. Fee *shapes* differ between them in ways that flat "X% fee"
 * comparisons hide, which is the whole reason this tool exists:
 *
 *   - a per-listing fee is charged whether or not the item sells (Etsy),
 *   - a monthly subscription only makes sense amortised over orders (Amazon
 *     Professional, an own store on Shopify),
 *   - some channels bundle payment processing into the commission (eBay's
 *     final value fee), others bill it separately (Etsy Payments).
 *
 * `commissionRate`, `paymentRate` and `adRate` all apply to the order total
 * (item price + shipping charged), which is how the major marketplaces
 * compute them. A seller whose channel differs can zero one field and fold the
 * rate into another.
 */
/**
 * Days an item typically waits before selling. Shipped identical for every
 * channel on purpose: how fast a channel moves *your* category is an
 * observation only the seller has, and inventing per-marketplace figures here
 * would be exactly the kind of stale published-schedule claim the rest of this
 * file refuses to make. Until the seller edits it, the time-weighted ranking
 * agrees with the profit ranking and tells them nothing they did not know.
 */
export const DEFAULT_DAYS_TO_SELL = 21;

export const CHANNEL_PRESETS = [
  {
    id: "ebay",
    label: "eBay",
    note: "The final value fee normally covers payment processing, so the separate processor rate is 0 here.",
    commissionRate: 13.25,
    paymentRate: 0,
    paymentFixed: 0.3,
    perListingFee: 0,
    monthlyFee: 0,
    adRate: 0,
  },
  {
    id: "etsy",
    label: "Etsy",
    note: "Listing fee is charged per listing whether or not it sells; transaction fee and Etsy Payments are billed separately.",
    commissionRate: 6.5,
    paymentRate: 3,
    paymentFixed: 0.25,
    perListingFee: 0.2,
    monthlyFee: 0,
    adRate: 0,
  },
  {
    id: "amazon",
    label: "Amazon (Professional)",
    note: "Referral fee plus the monthly Professional plan. Put FBA or pick-and-pack under fulfilment cost, not here.",
    commissionRate: 15,
    paymentRate: 0,
    paymentFixed: 0,
    perListingFee: 0,
    monthlyFee: 39.99,
    adRate: 0,
  },
  {
    id: "own-store",
    label: "Own store (Shopify Basic)",
    note: "No marketplace commission — you pay the plan and card processing, and you supply the traffic.",
    commissionRate: 0,
    paymentRate: 2.9,
    paymentFixed: 0.3,
    perListingFee: 0,
    monthlyFee: 39,
    adRate: 0,
  },
  {
    id: "local",
    label: "Local / direct",
    note: "No platform fee and usually no shipping — the cost is your time and a smaller audience.",
    commissionRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
    perListingFee: 0,
    monthlyFee: 0,
    adRate: 0,
    // A hand-to-hand sale has no postage on either side, so it starts with
    // shipping zeroed rather than inheriting the shared shipping numbers.
    shippingCharged: 0,
    shippingCost: 0,
  },
  {
    id: "other",
    label: "Other channel",
    note: "Blank and switched off by default. Turn it on and enter the rates of any channel not listed — Mercari, Poshmark, Depop, a craft fair, a wholesale account.",
    commissionRate: 0,
    paymentRate: 0,
    paymentFixed: 0,
    perListingFee: 0,
    monthlyFee: 0,
    adRate: 0,
    // Off until the seller fills it in: a channel with every rate at zero
    // would otherwise win every comparison by default and say nothing.
    enabled: false,
  },
];

function number(value, name, fallback = 0) {
  const raw = value === undefined || value === null || value === "" ? fallback : value;
  const result = Number(raw);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${name} must be a non-negative number`);
  return result;
}

function wholeNumber(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (!Number.isInteger(result)) throw new Error(`${name} must be a whole number`);
  return result;
}

/**
 * Net result for one channel, given the shared item facts.
 *
 * `shared` carries what does not change with the channel (what the item cost
 * you, packaging, other per-unit cash) plus the fallbacks for the per-channel
 * fields, so a seller can enter a price once and still override it for the
 * one channel where they list higher.
 */
export function calculateChannel(channel, shared = {}) {
  if (!channel || typeof channel !== "object") throw new Error("A channel is required");
  const label = channel.label ?? channel.id ?? "Channel";

  const price = number(channel.price, `${label} price`, shared.price);
  const shippingCharged = number(channel.shippingCharged, `${label} shipping charged`, shared.shippingCharged ?? 0);
  const shippingCost = number(channel.shippingCost, `${label} shipping you pay`, shared.shippingCost ?? 0);
  const fulfilmentCost = number(channel.fulfilmentCost, `${label} fulfilment cost`, 0);

  const commissionRate = number(channel.commissionRate, `${label} commission rate`, 0);
  const paymentRate = number(channel.paymentRate, `${label} payment rate`, 0);
  const adRate = number(channel.adRate, `${label} ads rate`, 0);
  const paymentFixed = number(channel.paymentFixed, `${label} payment fixed fee`, 0);
  const perListingFee = number(channel.perListingFee, `${label} listing fee`, 0);
  const monthlyFee = number(channel.monthlyFee, `${label} monthly fee`, 0);
  // How long the item typically sits before it sells here. Optional, and
  // deliberately shipped identical on every channel (see DEFAULT_DAYS_TO_SELL)
  // so it changes nothing until a seller enters what they have actually seen.
  const daysToSell = number(channel.daysToSell, `${label} days to sell`, shared.daysToSell ?? DEFAULT_DAYS_TO_SELL);

  const itemCost = number(shared.itemCost, "What you paid for the item", 0);
  const packagingCost = number(shared.packagingCost, "Packaging cost", 0);
  const otherCost = number(shared.otherCost, "Other per-item cost", 0);
  const monthlyOrders = wholeNumber(shared.monthlyOrders, "Orders per month", 0);
  const includeSubscription = shared.includeSubscription !== false;

  // A subscription is only a per-order cost once it is spread over the orders
  // it carries. Comparing a $39/month store against a per-sale marketplace
  // without that share is the mistake this line exists to prevent — and with
  // no order volume to spread it over the question has no answer, so say so
  // instead of quietly dividing by zero.
  let subscriptionShare = 0;
  if (includeSubscription && monthlyFee > 0) {
    if (monthlyOrders < 1) {
      throw new Error("Enter how many orders a month you expect, so monthly fees can be spread over them");
    }
    subscriptionShare = monthlyFee / monthlyOrders;
  }

  const revenue = price + shippingCharged;
  const percentRate = (commissionRate + paymentRate + adRate) / 100;
  if (percentRate >= 1) {
    throw new Error(`${label}: commission, payment and ad rates add up to 100% or more of the order`);
  }

  const fees = {
    commission: (revenue * commissionRate) / 100,
    payment: (revenue * paymentRate) / 100 + paymentFixed,
    ads: (revenue * adRate) / 100,
    listing: perListingFee,
    subscription: subscriptionShare,
  };
  const feeTotal = Object.values(fees).reduce((sum, value) => sum + value, 0);

  // Cash you lay out to source, pack and ship. Fees come out of the sale
  // proceeds rather than your pocket, so they stay out of invested cash and
  // return-on-investment stays honest.
  const cashInvested = itemCost + packagingCost + otherCost + shippingCost + fulfilmentCost;
  const profit = revenue - feeTotal - cashInvested;

  // Cash that must be recovered before any percentage fee is covered. Used for
  // both break-even and the price that reaches a given profit.
  const fixedCash = paymentFixed + perListingFee + subscriptionShare + cashInvested;

  return {
    id: channel.id ?? null,
    label,
    note: channel.note ?? null,
    price,
    shippingCharged,
    revenue,
    fees,
    feeTotal,
    cashInvested,
    profit,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    // Undefined rather than infinite when nothing was invested (a giveaway, a
    // digital item with no per-unit cost).
    roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
    percentRate: percentRate * 100,
    fixedCash,
    daysToSell,
    // Profit is per *sale*; these are per *day of waiting for one*. A reseller
    // with finite cash cares about the second: $8 in a week beats $12 in a
    // quarter, because the week's cash goes round the loop six more times.
    // Null rather than Infinity when no holding period was given, which is
    // "unknown", not "instant".
    profitPerDay: daysToSell > 0 ? profit / daysToSell : null,
    // How many times a year the same cash completes this buy-sell loop. Stated
    // as a turnover count rather than an annualised percentage on purpose: a
    // three-day flip annualises to four figures, which is arithmetically true,
    // reads as a promise, and would be the one dishonest number on the page.
    // "Your cash goes round 122 times a year" is the same fact without the
    // implied compounding.
    cashTurnsPerYear: daysToSell > 0 ? 365 / daysToSell : null,
    breakEvenPrice: Math.max(0, fixedCash / (1 - percentRate) - shippingCharged),
    /**
     * Item price this channel needs, holding shipping charged constant, to
     * clear `targetProfit`. This is the number that turns a comparison into a
     * decision: "to keep the same $12.40, this channel has to be listed at
     * $54.80."
     */
    priceForProfit(targetProfit) {
      const target = Number(targetProfit);
      if (!Number.isFinite(target)) throw new Error("Target profit must be a number");
      return Math.max(0, (fixedCash + target) / (1 - percentRate) - shippingCharged);
    },
  };
}

/**
 * Rank every channel on the same item and say what each one costs relative to
 * the best. `channels` are preset-shaped objects; anything a seller edited is
 * already on them, anything they left alone falls back to `shared`. A channel
 * carrying `enabled: false` is one the seller has switched off — it is left
 * out of the ranking entirely rather than shown as an unreachable option.
 */
export function compareChannels(channels, shared = {}) {
  if (!Array.isArray(channels) || channels.length === 0) {
    throw new Error("At least one channel is required");
  }
  const active = channels.filter((channel) => channel?.enabled !== false);
  if (active.length === 0) throw new Error("Switch on at least one channel to compare");
  const results = active.map((channel) => calculateChannel(channel, shared));
  const best = results.reduce((winner, result) => (result.profit > winner.profit ? result : winner));

  // Ranking by profit stays the default: it is the question people arrive with.
  // `rankBy: "profitPerDay"` re-sorts on what the cash earns while it waits.
  // A channel with no holding period sorts last there rather than winning on an
  // unknown, and ties fall back to profit so the order stays stable.
  const rankBy = shared.rankBy === "profitPerDay" ? "profitPerDay" : "profit";
  const perDay = (result) => (result.profitPerDay === null ? -Infinity : result.profitPerDay);
  const order = rankBy === "profitPerDay"
    ? (a, b) => perDay(b) - perDay(a) || b.profit - a.profit
    : (a, b) => b.profit - a.profit;
  const ranked = [...results].sort(order);
  const rankById = new Map(ranked.map((result, index) => [result, index + 1]));

  // The winner on speed, computed whichever way the table is sorted, because
  // the interesting case is the two disagreeing: a channel that nets less per
  // sale but turns the cash over faster.
  const timed = results.filter((result) => result.profitPerDay !== null);
  const fastestReturn = timed.length
    ? timed.reduce((winner, result) => (result.profitPerDay > winner.profitPerDay ? result : winner))
    : null;

  return {
    results: results.map((result) => ({
      ...result,
      rank: rankById.get(result),
      isBest: result === best,
      // Negative or zero for the winner; for everyone else, the cash this
      // channel gives up on the same item.
      gapVsBest: best.profit - result.profit,
      // What this channel would have to charge to match the winner's profit.
      // Null on the winner itself, where the question is meaningless.
      priceToMatchBest: result === best ? null : result.priceForProfit(best.profit),
    })),
    ranked: ranked.map((result) => result.label),
    rankBy,
    best: {
      id: best.id,
      label: best.label,
      profit: best.profit,
      margin: best.margin,
    },
    // Null when no active channel has a holding period to divide by.
    fastestReturn: fastestReturn && {
      id: fastestReturn.id,
      label: fastestReturn.label,
      profit: fastestReturn.profit,
      daysToSell: fastestReturn.daysToSell,
      profitPerDay: fastestReturn.profitPerDay,
      cashTurnsPerYear: fastestReturn.cashTurnsPerYear,
    },
    // True only when the extra column changes the answer — the one moment this
    // feature is worth a seller's attention. It also requires the profit winner
    // to have a holding period of its own: "sells faster than" is not a
    // comparison that can be made against an unknown, and claiming it would
    // rank a channel the seller never timed.
    speedChangesTheAnswer:
      Boolean(fastestReturn) && fastestReturn.id !== best.id && best.profitPerDay !== null,
    // How much the channel choice is worth on this one item, before any
    // difference in how many buyers each channel actually reaches.
    spread: best.profit - ranked[ranked.length - 1].profit,
  };
}
