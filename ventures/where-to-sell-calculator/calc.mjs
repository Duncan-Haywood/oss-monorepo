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
    // Illustrative return assumptions, not a published marketplace rate.
    // eBay buyers usually pay outbound; sellers often eat return postage and
    // get the final-value fee back. Replace with your own return report.
    returnRate: 8,
    returnShippingCost: 6,
    resellableRate: 90,
    feeRefundRate: 100,
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
    returnRate: 4,
    returnShippingCost: 6,
    resellableRate: 85,
    feeRefundRate: 100,
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
    // Amazon return rates run higher than most channels, especially apparel.
    returnRate: 18,
    returnShippingCost: 7,
    resellableRate: 80,
    feeRefundRate: 100,
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
    // Card processors often keep the processing fee on a refunded order.
    returnRate: 10,
    returnShippingCost: 6,
    resellableRate: 90,
    feeRefundRate: 0,
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
    returnRate: 2,
    returnShippingCost: 0,
    resellableRate: 95,
    feeRefundRate: 100,
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
    returnRate: 0,
    returnShippingCost: 0,
    resellableRate: 100,
    feeRefundRate: 100,
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

function ratePercent(value, name, fallback = 0) {
  const result = number(value, name, fallback);
  if (result > 100) throw new Error(`${name} must be between 0 and 100`);
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

  // Expected value of one listing attempt once some share of orders come back.
  // A completed sale keeps `profit`. A return refunds the buyer, may refund a
  // share of percentage and fixed payment fees, and still costs outbound
  // postage, packaging, fulfilment, return postage, the listing / plan share,
  // and any unit that cannot be sold again. Listing fees and the monthly-plan
  // share are treated as not refunded — that is how the major channels bill.
  const returnRate = ratePercent(channel.returnRate, `${label} return rate`, 0);
  const returnShippingCost = number(channel.returnShippingCost, `${label} return shipping`, 0);
  const resellableRate = ratePercent(channel.resellableRate, `${label} still-sellable rate`, 100);
  const feeRefundRate = ratePercent(channel.feeRefundRate, `${label} fee refund rate`, 100);
  const returnedShare = returnRate / 100;
  const feeRefundShare = feeRefundRate / 100;
  const refundableFees = fees.commission + fees.payment + fees.ads;
  const keptFeesOnReturn = fees.listing + fees.subscription + refundableFees * (1 - feeRefundShare);
  const spentRegardless = packagingCost + otherCost + shippingCost + fulfilmentCost;
  const unsellableLoss = itemCost * (1 - resellableRate / 100);
  const returnedProfit = -keptFeesOnReturn - spentRegardless - returnShippingCost - unsellableLoss;
  const expectedProfit = (1 - returnedShare) * profit + returnedShare * returnedProfit;
  const returnDrag = profit - expectedProfit;

  // expectedProfit is linear in revenue, so break-even and a target expected
  // profit have a closed form. When the return rate is zero this collapses
  // to the sold-sale break-even already on `breakEvenPrice`.
  const listingAndSub = fees.listing + fees.subscription;
  const revCoeff = (1 - returnedShare) * (1 - percentRate)
    - returnedShare * (1 - feeRefundShare) * percentRate;
  const expectedConstant = (1 - returnedShare) * (-paymentFixed - listingAndSub - cashInvested)
    + returnedShare * (
      -listingAndSub
      - paymentFixed * (1 - feeRefundShare)
      - spentRegardless
      - returnShippingCost
      - unsellableLoss
    );
  const expectedBreakEvenPrice = revCoeff > 0
    ? Math.max(0, -expectedConstant / revCoeff - shippingCharged)
    : null;

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
    expectedProfit,
    returnedProfit,
    returnDrag,
    returnRate,
    returnShippingCost,
    resellableRate,
    feeRefundRate,
    expectedBreakEvenPrice,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    expectedMargin: revenue === 0 ? 0 : (expectedProfit / revenue) * 100,
    // Undefined rather than infinite when nothing was invested (a giveaway, a
    // digital item with no per-unit cost).
    roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
    percentRate: percentRate * 100,
    fixedCash,
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
    /**
     * Item price this channel needs so the *expected* keep after returns
     * matches `targetProfit`. Same closed form as sold `priceForProfit`
     * when the return rate is zero.
     */
    priceForExpectedProfit(targetProfit) {
      const target = Number(targetProfit);
      if (!Number.isFinite(target)) throw new Error("Target profit must be a number");
      if (revCoeff <= 0) {
        throw new Error(`${label}: expected profit cannot be solved at these return and fee rates`);
      }
      return Math.max(0, (target - expectedConstant) / revCoeff - shippingCharged);
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
  // Rank on expected keep after returns unless the seller has turned that
  // overlay off. Sold-sale profit is still on every row so the table can
  // show the flip: a channel can win on a completed sale and lose once
  // returns are counted.
  const includeReturns = shared.includeReturns !== false;
  const score = (result) => (includeReturns ? result.expectedProfit : result.profit);
  const best = results.reduce((winner, result) => (score(result) > score(winner) ? result : winner));

  const ranked = [...results].sort((a, b) => score(b) - score(a));
  const rankById = new Map(ranked.map((result, index) => [result, index + 1]));
  const bestScore = score(best);

  return {
    results: results.map((result) => ({
      ...result,
      rank: rankById.get(result),
      isBest: result === best,
      // Negative or zero for the winner; for everyone else, the cash this
      // channel gives up on the same item (sold, or expected after returns).
      gapVsBest: bestScore - score(result),
      // What this channel would have to charge to match the winner. Null on
      // the winner itself, where the question is meaningless.
      priceToMatchBest: result === best
        ? null
        : includeReturns
          ? result.priceForExpectedProfit(best.expectedProfit)
          : result.priceForProfit(best.profit),
    })),
    ranked: ranked.map((result) => result.label),
    includeReturns,
    best: {
      id: best.id,
      label: best.label,
      profit: bestScore,
      soldProfit: best.profit,
      expectedProfit: best.expectedProfit,
      margin: includeReturns ? best.expectedMargin : best.margin,
    },
    // How much the channel choice is worth on this one item, before any
    // difference in how many buyers each channel actually reaches.
    spread: bestScore - score(ranked[ranked.length - 1]),
  };
}
