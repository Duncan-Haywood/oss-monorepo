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
 * `paymentRate` and `adRate` apply to the order total (item price + shipping
 * charged). `commissionRate` does too by default (`commissionBase: "order"`),
 * which is how eBay, Etsy and Amazon compute their selling fees. Reverb is
 * the exception: its selling fee applies to the item price only
 * (`commissionBase: "item"`), matching `ventures/reverb-fee-calculator`. A
 * seller whose channel differs can zero one field and fold the rate into
 * another.
 *
 * One channel's schedule is not a rate at all. Poshmark charges a flat $2.95
 * on a sale under $15 and 20% at $15 or more — a cliff, where the *whole*
 * sale is taxed by whichever rule applies rather than a marginal band. A
 * channel can say so with `commissionThreshold` (the price the rule switches
 * at) and `commissionFlatBelow` (the flat fee charged below it), and
 * `calculateChannel` then prices, breaks even and solves for a target on
 * whichever side of the cliff the item actually sits. A channel that omits
 * both fields is unaffected, down to the arithmetic: every coefficient below
 * collapses to what it was before the cliff existed.
 */

export const CHANNEL_PRESETS = [
  {
    id: "ebay",
    label: "eBay",
    note: "The final value fee normally covers payment processing, so the separate processor rate is 0 here. Sell-through and days to sell are illustrative starting points, not a claim about how fast eBay actually sells.",
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
    // Illustrative shelf-time assumptions. A fixed-price listing renews on a
    // 30-day cycle, which costs nothing while the per-listing fee is zero but
    // matters the moment a seller enters an insertion fee above their free
    // allowance.
    sellThroughPct: 65,
    daysToSell: 21,
    listingRenewalDays: 30,
  },
  {
    id: "etsy",
    label: "Etsy",
    note: "Listing fee is charged per listing whether or not it sells; transaction fee and Etsy Payments are billed separately. Sell-through and days to sell are illustrative starting points, not a claim about Etsy sell-through.",
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
    // An Etsy listing expires after four months and is charged again when it
    // renews, so a slow-selling item pays the listing fee more than once.
    sellThroughPct: 35,
    daysToSell: 45,
    listingRenewalDays: 120,
  },
  {
    id: "amazon",
    label: "Amazon (Professional)",
    note: "Referral fee plus the monthly Professional plan. Put FBA or pick-and-pack under fulfilment cost, not here. Sell-through and days to sell are illustrative starting points, not a claim about Amazon velocity.",
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
    sellThroughPct: 55,
    daysToSell: 28,
    listingRenewalDays: 0,
  },
  {
    id: "reverb",
    label: "Reverb (musical gear)",
    note: "Off by default because it only applies to instruments and audio gear — turn it on if that is what you sell. Reverb bills the selling fee on the item price only (not on shipping charged) and payment processing separately, which is why the processor rate is not zero here the way it is for eBay. Sell-through and days to sell are illustrative starting points, not a claim about Reverb velocity.",
    // Matches ventures/reverb-fee-calculator's own defaults (5% selling fee
    // on the item price, 3.19% + $0.49 Reverb Payments on the order total, as
    // of September 2026). Two tools in one portfolio printing different fee
    // assumptions for the same marketplace is a credibility problem, so
    // `channel-parity.test.mjs` asserts these stay equal by importing that
    // calculator's defaults rather than restating them — including that the
    // selling fee is charged on the item, not on shipping.
    commissionRate: 5,
    commissionBase: "item",
    paymentRate: 3.19,
    paymentFixed: 0.49,
    perListingFee: 0,
    monthlyFee: 0,
    // Bumps are optional and priced per listing rather than as a rate, so they
    // are left at zero here; the dedicated calculator is where that decision
    // gets made (it has a whole page on whether a bump pays for itself).
    adRate: 0,
    // Illustrative return assumptions. Gear buyers inspect on arrival and
    // Reverb's protection means a rejected item usually comes back; the fee is
    // normally refunded with it.
    returnRate: 6,
    returnShippingCost: 18,
    resellableRate: 90,
    feeRefundRate: 100,
    // A Reverb listing does not expire on a cycle, so there is no renewal to
    // charge — but gear is a considered purchase and sits longer than a
    // general-marketplace item of the same price.
    sellThroughPct: 50,
    daysToSell: 35,
    listingRenewalDays: 0,
    // Off until the seller says this is gear: enabled by default it would add
    // a channel most sellers cannot list on to every comparison, and a channel
    // that does not apply is noise in a ranking, not information.
    enabled: false,
  },
  {
    id: "own-store",
    label: "Own store (Shopify Basic)",
    note: "No marketplace commission — you pay the plan and card processing, and you supply the traffic. Sell-through starts low here for the same reason: you bring the buyers.",
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
    // No marketplace demand behind the listing: the same item sits longer and
    // more often does not sell at all. This is the cost the fee comparison
    // never shows, and it is why an own store can win on fees and lose on cash.
    sellThroughPct: 20,
    daysToSell: 40,
    listingRenewalDays: 0,
  },
  {
    id: "local",
    label: "Local / direct",
    note: "No platform fee and usually no shipping — the cost is your time and a smaller audience. Sell-through is illustrative: the audience is whoever you can reach yourself.",
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
    sellThroughPct: 45,
    daysToSell: 14,
    listingRenewalDays: 0,
  },
  {
    id: "tiktok",
    label: "TikTok Shop",
    note: "Off by default because it only applies to sellers running TikTok Shop. Referral fee applies to the order total (matching `ventures/tiktok-shop-fee-calculator`'s U.S. standard rate as of September 2026), and processing is already bundled into it, which is why the separate processor rate is 0 here — the same shape as eBay. Creator affiliate commission and facilitation fees are not modelled on this page; the dedicated calculator is where that decision gets made. Sell-through and days to sell are illustrative starting points, not a claim about TikTok Shop velocity.",
    // Matches ventures/tiktok-shop-fee-calculator's own `FEE_SCHEDULE_PRESETS.us_standard`
    // (6% referral, processing bundled in, as of September 2026). Two tools in
    // one portfolio printing different fee assumptions for the same channel is
    // a credibility problem, so `channel-parity.test.mjs` asserts these stay
    // equal by importing that calculator's own presets rather than restating
    // them.
    commissionRate: 6,
    paymentRate: 0,
    paymentFixed: 0,
    perListingFee: 0,
    monthlyFee: 0,
    adRate: 0,
    // Illustrative return assumptions. Live and short-video commerce skews
    // toward impulse buys, so this starts a little above eBay's.
    returnRate: 12,
    returnShippingCost: 6,
    resellableRate: 85,
    feeRefundRate: 100,
    // Illustrative shelf-time assumptions: a live show or a viral video can
    // sell an item in days, far faster than a static listing, and there is no
    // renewal cycle to charge while it waits.
    sellThroughPct: 55,
    daysToSell: 10,
    listingRenewalDays: 0,
    // Off until the seller says they sell there: enabled by default it would
    // add a channel most sellers cannot list on to every comparison, and a
    // channel that does not apply is noise in a ranking, not information.
    enabled: false,
  },
  {
    id: "whatnot",
    label: "Whatnot (live auction)",
    note: "Off by default because it only applies to sellers running live shows. Commission is on the hammer price only, not shipping (matching `ventures/whatnot-seller-payout`'s standard, uncapped category as of September 2026); processing is billed separately on the full checkout total, the same split as Reverb. The $1,500 commission cap on some categories (TCG, coins, pallets) is not modelled on this page — the dedicated calculator is where that decision gets made. Sell-through and days to sell are illustrative starting points, not a claim about Whatnot velocity.",
    // Matches ventures/whatnot-seller-payout's own `CATEGORY_PRESETS.standard`
    // commission rate and `DEFAULT_PAYMENT_RATE` / `DEFAULT_PAYMENT_FIXED`, as
    // of September 2026. `channel-parity.test.mjs` imports those constants
    // directly rather than restating them, for the same reason as the Reverb
    // and TikTok Shop rows above.
    commissionRate: 8,
    commissionBase: "item",
    paymentRate: 2.9,
    paymentFixed: 0.3,
    perListingFee: 0,
    monthlyFee: 0,
    adRate: 0,
    // Illustrative return assumptions. A live auction is watched in real time
    // and often shipped fast, so this starts a little below eBay's.
    returnRate: 5,
    returnShippingCost: 6,
    resellableRate: 90,
    feeRefundRate: 100,
    // Illustrative shelf-time assumptions: a lot sells (or does not) inside
    // one show, not over weeks, and there is no renewal cycle to charge.
    sellThroughPct: 45,
    daysToSell: 3,
    listingRenewalDays: 0,
    // Off until the seller says they run live shows there: enabled by default
    // it would add a channel most sellers cannot list on to every comparison.
    enabled: false,
  },
  {
    id: "poshmark",
    label: "Poshmark (fashion resale)",
    note: "Off by default because it only applies to clothing, shoes and accessories. Poshmark's fee is a cliff, not a rate: a flat $2.95 on a sale under $15 and 20% at $15 or more, charged on the item price only — the buyer pays a prepaid label that never reaches your payout, so shipping charged and shipping you pay both start at zero here. Below $14.75 the flat fee costs more than 20% would (a $10 sale pays an effective 29.5%), which is the arithmetic a per-item comparison can show and a headline-rate table cannot. Sell-through and days to sell are illustrative starting points, not a claim about Poshmark velocity.",
    // Matches ventures/poshmark-fee-calculator's own PERCENT_RATE, FLAT_FEE
    // and COMMISSION_THRESHOLD as of September 2026. `channel-parity.test.mjs`
    // imports those constants directly rather than restating them, for the
    // same reason as the Reverb, TikTok Shop and Whatnot rows above.
    commissionRate: 20,
    commissionBase: "item",
    commissionThreshold: 15,
    commissionFlatBelow: 2.95,
    // Poshmark's commission covers payment processing; there is no separate
    // processor line and no per-listing or monthly charge.
    paymentRate: 0,
    paymentFixed: 0,
    perListingFee: 0,
    monthlyFee: 0,
    adRate: 0,
    // The buyer buys the prepaid USPS label from Poshmark at checkout. It is
    // not seller revenue and not a seller cost, so both sides start at zero
    // rather than inheriting the shared figures — override them on this
    // channel if you cover a label upgrade yourself.
    shippingCharged: 0,
    shippingCost: 0,
    // Illustrative return assumptions. Poshmark has no buyer's-remorse
    // return: a buyer must open a not-as-described case and Poshmark rules on
    // it, so returns are rarer than on eBay and the return label is Poshmark's
    // rather than the seller's.
    returnRate: 2,
    returnShippingCost: 0,
    resellableRate: 90,
    feeRefundRate: 100,
    // Illustrative shelf-time assumptions: a closet listing does not expire
    // and is never charged again, but fashion resale sits longer than a
    // general-marketplace item of the same price.
    sellThroughPct: 30,
    daysToSell: 60,
    listingRenewalDays: 0,
    // Off until the seller says this is apparel: enabled by default it would
    // add a channel most sellers cannot list on to every comparison, the same
    // reason Reverb and Whatnot start off.
    enabled: false,
  },
  {
    id: "other",
    label: "Other channel",
    note: "Blank and switched off by default. Turn it on and enter the rates of any channel not listed — Mercari, Depop, a craft fair, a wholesale account. Poshmark has its own row above.",
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
    sellThroughPct: 50,
    daysToSell: 30,
    listingRenewalDays: 0,
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

// Days-to-sell is optional for cash-per-day. Empty or zero means "I do not
// know yet" and profit-per-day stays null rather than inventing a pace. A
// negative value is a real mistake and is refused. Shelf-time still reads
// the same field as a number (zero when unset) so a missing pace does not
// invent sell-through either.
function optionalPositive(value, name) {
  if (value === undefined || value === null || value === "") return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
  return result === 0 ? null : result;
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
  // A fee cliff, for a channel whose commission is not a rate below some
  // price. Zero threshold means "no cliff", which is every channel but
  // Poshmark, and leaves every coefficient below exactly as it was.
  const commissionThreshold = number(channel.commissionThreshold, `${label} commission threshold`, 0);
  const commissionFlatBelow = number(channel.commissionFlatBelow, `${label} flat commission`, 0);
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
  const daysToSellInput = channel.daysToSell !== undefined && channel.daysToSell !== ""
    ? channel.daysToSell
    : shared.daysToSell;
  const daysToSell = optionalPositive(daysToSellInput, `${label} days to sell`);

  // Expected sales on THIS channel. Empty falls back to the shared monthly
  // figure, so existing comparisons stay unchanged. When a seller overrides
  // it, that number is also what a monthly plan is spread over — otherwise a
  // $39 Shopify plan amortized over 100 "portfolio" orders then multiplied by
  // 20 own-store sales would understate the plan by 5×.
  const rawChannelVolume = channel.expectedMonthlySales;
  const hasChannelVolume = rawChannelVolume !== undefined && rawChannelVolume !== null && rawChannelVolume !== "";
  const expectedMonthlySales = hasChannelVolume
    ? wholeNumber(rawChannelVolume, `${label} expected monthly sales`)
    : monthlyOrders;

  // A subscription is only a per-order cost once it is spread over the orders
  // it carries. Comparing a $39/month store against a per-sale marketplace
  // without that share is the mistake this line exists to prevent — and with
  // no order volume to spread it over the question has no answer, so say so
  // instead of quietly dividing by zero.
  let subscriptionShare = 0;
  let unamortizedMonthlyFee = 0;
  if (includeSubscription && monthlyFee > 0) {
    if (expectedMonthlySales < 1) {
      if (hasChannelVolume) {
        // Explicit zero volume on this channel: there is no per-sale share,
        // but the plan is still paid that month.
        unamortizedMonthlyFee = monthlyFee;
      } else {
        throw new Error("Enter how many orders a month you expect, so monthly fees can be spread over them");
      }
    } else {
      subscriptionShare = monthlyFee / expectedMonthlySales;
    }
  }

  const revenue = price + shippingCharged;
  // Most marketplaces take the selling fee on the order total. Reverb takes
  // it on the item price only; payment processing still runs on the order.
  // Splitting the two bases is what keeps this page's Reverb row equal to
  // `reverb-fee-calculator` when shipping charged is non-zero.
  const commissionBase = channel.commissionBase === "item" ? "item" : "order";

  // Below a fee cliff the percentage is not charged at all — a flat fee stands
  // in its place — so the rate leaves the coefficients entirely and the flat
  // fee joins the fixed cash instead. Every price-solving closed form below is
  // therefore written against *one side* of the cliff, and the two solvers pick
  // the side whose answer actually lands in its own price range.
  const hasFeeCliff = commissionThreshold > 0;
  const commissionBaseAt = (itemPrice) =>
    commissionBase === "item" ? itemPrice : itemPrice + shippingCharged;
  // `chargesRate` false is the flat-fee side of the cliff.
  const branchRates = (chargesRate) => {
    const rate = chargesRate ? commissionRate : 0;
    return {
      orderRate: (paymentRate + adRate + (commissionBase === "order" ? rate : 0)) / 100,
      itemRate: (commissionBase === "item" ? rate : 0) / 100,
    };
  };
  const flatCommissionOn = (chargesRate) => (chargesRate ? 0 : commissionFlatBelow);

  const commissionBaseAmount = commissionBaseAt(price);
  // Which side this item is actually on. Poshmark's switch is at exactly
  // $15.00 and the higher rule owns the boundary: a $15.00 sale pays 20%, not
  // the flat fee.
  const chargesRate = !(hasFeeCliff && commissionBaseAmount < commissionThreshold);
  const { orderRate, itemRate } = branchRates(chargesRate);
  const percentRate = orderRate + itemRate;
  if (percentRate >= 1) {
    throw new Error(`${label}: commission, payment and ad rates add up to 100% or more of the order`);
  }

  const fees = {
    commission: chargesRate
      ? (commissionBaseAmount * commissionRate) / 100
      // A flat fee cannot take more than the sale it is charged on, which is
      // how `poshmark-fee-calculator`'s own `commissionFor` caps it. Only
      // reachable below the flat fee itself, and never inside a break-even
      // answer: the solved flat-branch price is at least the flat fee
      // whenever there is any cash to recover.
      : Math.min(commissionFlatBelow, commissionBaseAmount),
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
  // both break-even and the price that reaches a given profit. Below a fee
  // cliff the flat commission is exactly that kind of cash, so it belongs
  // here — and is zero on the percentage side and for every channel with no
  // cliff at all.
  const fixedCashOn = (chargesRateOnBranch) =>
    paymentFixed + perListingFee + subscriptionShare + cashInvested
    + flatCommissionOn(chargesRateOnBranch);
  const fixedCash = fixedCashOn(chargesRate);

  // profit = price*(1 - orderRate - itemRate) + shippingCharged*(1 - orderRate) - fixedCash
  // Collapses to the familiar fixedCash/(1 - percentRate) - shippingCharged
  // whenever commission also runs on the order (itemRate === 0). The
  // coefficient is taken per branch below rather than once here, because a
  // cliff channel has a different one on each side.

  /**
   * Item price at which the *sold-sale* keep equals `target`, solved on one
   * side of a fee cliff. Null when the rates leave no reachable price.
   */
  const soldPriceOnBranch = (target, chargesRateOnBranch) => {
    const { orderRate: order, itemRate: item } = branchRates(chargesRateOnBranch);
    const coeff = 1 - order - item;
    if (coeff <= 0) return null;
    const solved = (fixedCashOn(chargesRateOnBranch) + target - shippingCharged * (1 - order)) / coeff;
    return Math.max(0, solved);
  };

  /**
   * Pick the side of the cliff a solved price actually belongs to.
   *
   * The flat branch only owns an answer that lands below the threshold; the
   * percentage branch owns everything else. Exactly one of them always does,
   * because the fee steps *up* at the threshold (Poshmark: $2.95 becomes 20%
   * of $15, i.e. $3.00), so a target the flat side cannot reach below the
   * cliff is one the percentage side reaches only above it. Without a cliff
   * this is one call with the same arithmetic as before.
   */
  const solveOnCliff = (onBranch) => {
    if (!hasFeeCliff) return onBranch(true);
    const flatSide = onBranch(false);
    if (flatSide !== null && commissionBaseAt(flatSide) < commissionThreshold) return flatSide;
    return onBranch(true);
  };

  const breakEvenPrice = solveOnCliff((onBranch) => soldPriceOnBranch(0, onBranch));
  // Profit already carries the amortized plan share. Adding it back answers
  // "how many whole sales of this item recover the monthly fee?" — 0 when
  // there is no plan, null when the unit economics cannot recover it.
  const profitBeforeSubscription = profit + subscriptionShare;
  const ordersToCoverPlan = monthlyFee > 0 && profitBeforeSubscription > 0
    ? Math.ceil(monthlyFee / profitBeforeSubscription)
    : monthlyFee > 0 ? null : 0;

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

  // expectedProfit is linear in the item price once shipping charged is held
  // constant, so break-even and a target expected profit have a closed form.
  // Commission-on-item (Reverb) and commission-on-order (everyone else) both
  // land in the same shape: the sold-sale price coefficient above, and the
  // weighted revCoeff below once returns are folded in. When the return rate
  // is zero this collapses to the sold-sale break-even already on
  // `breakEvenPrice`. Both are per branch, for the cliff reason above.
  const listingAndSub = fees.listing + fees.subscription;

  /**
   * The two coefficients of `expectedProfit(price)` on one side of a fee
   * cliff, so `expectedProfit = revCoeff * price + expectedConstant`.
   *
   * A flat commission below the cliff behaves like the fixed payment fee in
   * both places it appears: it is cash to recover on a sold sale (already
   * inside `fixedCashOn`), and it is a fee the channel keeps its unrefunded
   * share of when the item comes back. It carries no price coefficient,
   * which is exactly why the cliff cannot be folded into a rate.
   */
  const expectedCoeffsOn = (chargesRateOnBranch) => {
    const { orderRate: order, itemRate: item } = branchRates(chargesRateOnBranch);
    const flat = flatCommissionOn(chargesRateOnBranch);
    return {
      revCoeff: (1 - returnedShare) * (1 - order - item)
        - returnedShare * (1 - feeRefundShare) * (item + order),
      expectedConstant: (1 - returnedShare) * (shippingCharged * (1 - order) - fixedCashOn(chargesRateOnBranch))
        + returnedShare * (
          -listingAndSub
          - (1 - feeRefundShare) * (order * shippingCharged + paymentFixed + flat)
          - spentRegardless
          - returnShippingCost
          - unsellableLoss
        ),
    };
  };
  const { revCoeff, expectedConstant } = expectedCoeffsOn(chargesRate);

  /**
   * Item price at which the *expected* keep after returns equals `target`,
   * solved on one side of a fee cliff. Null when the rates leave no
   * reachable price.
   */
  const expectedPriceOnBranch = (target, chargesRateOnBranch) => {
    const coeffs = expectedCoeffsOn(chargesRateOnBranch);
    if (coeffs.revCoeff <= 0) return null;
    return Math.max(0, (target - coeffs.expectedConstant) / coeffs.revCoeff);
  };

  const expectedBreakEvenPrice = solveOnCliff((onBranch) => expectedPriceOnBranch(0, onBranch));

  // ---------------------------------------------------------------------
  // Shelf time: what a *listing* is worth, not what a sale is worth.
  //
  // Everything above answers "if this item sells here, what do I keep". That
  // is not the seller's question when the same item can go in more than one
  // place, because the channels do not sell it equally often or equally
  // quickly. A channel with the best keep and a 20% sell-through can be worth
  // less per listing than a worse-paying channel that clears the item in a
  // fortnight, and the fee table cannot show that.
  //
  // The overlay costs a listing three things the sale-side arithmetic misses:
  //   - listing fees charged again every renewal cycle while it sits,
  //   - the cash tied up in the item for as long as it is unsold,
  //   - the chance it never sells inside the horizon at all.
  // Sale-side costs (postage, packaging, fulfilment) are not double counted:
  // they are already inside `profit` / `expectedProfit` and only occur on the
  // sold branch.
  const horizonDays = number(shared.horizonDays, "How long you will leave it listed", 90);
  if (horizonDays <= 0) throw new Error("How long you will leave it listed must be more than zero days");
  const capitalCostPct = number(shared.capitalCostPct, "Annual cost of the cash tied up", 0);
  const unsoldRecoveryPct = ratePercent(shared.unsoldRecoveryPct, "Value kept if it does not sell", 100);
  const sellThroughPct = ratePercent(channel.sellThroughPct, `${label} sell-through rate`, 100);
  const shelfDaysToSell = number(daysToSellInput, `${label} days to sell`, 0);
  const listingRenewalDays = number(channel.listingRenewalDays, `${label} listing renewal days`, 0);

  // A listing cannot sell after you have taken it down, so a channel whose
  // typical time to sale is past the horizon effectively sells on the last day.
  const soldDays = Math.min(shelfDaysToSell, horizonDays);
  const listingCycles = (days) =>
    listingRenewalDays > 0 ? Math.max(1, Math.ceil(days / listingRenewalDays)) : 1;
  // Only the item cost is capital tied up while it waits — packaging, postage
  // and fulfilment are not spent until it sells.
  const holdingCost = (days) => (itemCost * (capitalCostPct / 100) * days) / 365;

  // The returns overlay is part of what a sale is worth, so the shelf-time
  // layer sits on whichever keep the caller is ranking on.
  const soldKeep = shared.includeReturns === false ? profit : expectedProfit;
  const renewalsWhileSelling = perListingFee * (listingCycles(soldDays) - 1);
  const soldValue = soldKeep - renewalsWhileSelling - holdingCost(soldDays);
  const unsoldValue = -perListingFee * listingCycles(horizonDays)
    - holdingCost(horizonDays)
    - itemCost * (1 - unsoldRecoveryPct / 100);

  const sellShare = sellThroughPct / 100;
  const listedValue = sellShare * soldValue + (1 - sellShare) * unsoldValue;
  // Days of shelf the listing occupies on average, sold or not. Turning the
  // per-listing figure into a rate is what lets a fast cheap channel outrank a
  // slow rich one on the same inventory dollar.
  const shelfDays = sellShare * soldDays + (1 - sellShare) * horizonDays;
  const valuePer30Days = shelfDays > 0 ? (listedValue / shelfDays) * 30 : listedValue;

  const velocity = {
    sellThroughPct,
    daysToSell: shelfDaysToSell,
    listingRenewalDays,
    horizonDays,
    soldDays,
    shelfDays,
    soldValue,
    unsoldValue,
    listedValue,
    valuePer30Days,
    renewalsWhileSelling,
    unsoldListingFees: perListingFee * listingCycles(horizonDays),
    holdingCostIfUnsold: holdingCost(horizonDays),
    // What the sell-through assumption costs versus a channel that always
    // sells at `daysToSell`. This is the shelf-time analogue of `returnDrag`.
    shelfDrag: soldKeep - listedValue,
    /**
     * Sell-through this channel would need to earn `target` per 30 days of
     * shelf time — the "how often would it have to sell here to catch up"
     * question, and the shelf-time analogue of `priceToMatchBest`.
     *
     * Both sides of the rate move with the sell-through share: selling more
     * often raises the value of a listing *and* shortens the shelf it
     * occupies. Writing rate(s) = 30·(u + s(v−u)) / (H + s(D−H)) and solving
     * for s gives the closed form below. Null when no share in 0–100% reaches
     * the target, which is the honest answer for a channel that cannot catch
     * the leader however reliably it sells.
     */
    sellThroughForRate(target) {
      const wanted = Number(target);
      if (!Number.isFinite(wanted)) throw new Error("Target value per 30 days must be a number");
      const denominator = 30 * (soldValue - unsoldValue) - wanted * (soldDays - horizonDays);
      if (denominator === 0) return null;
      const share = (wanted * horizonDays - 30 * unsoldValue) / denominator;
      if (!Number.isFinite(share) || share < 0 || share > 1) return null;
      return share * 100;
    },
  };

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
    velocity,
    margin: revenue === 0 ? 0 : (profit / revenue) * 100,
    expectedMargin: revenue === 0 ? 0 : (expectedProfit / revenue) * 100,
    // Undefined rather than infinite when nothing was invested (a giveaway, a
    // digital item with no per-unit cost).
    roi: cashInvested === 0 ? null : (profit / cashInvested) * 100,
    percentRate: percentRate * 100,
    fixedCash,
    ordersToCoverPlan,
    expectedMonthlySales,
    // When volume is at least one, the per-sale profit already carries its
    // share of the monthly plan, so multiplying recovers the plan once.
    // At zero volume the plan was not amortized, so subtract it here.
    monthlyProfit: expectedMonthlySales >= 1
      ? profit * expectedMonthlySales
      : -unamortizedMonthlyFee,
    breakEvenPrice,
    daysToSell,
    // Cash this sale leaves you per day it sits unsold. Null when the seller
    // has not given a pace — inventing one would rank channels on a guess
    // they never entered. 30-day month is a planning figure, not a calendar.
    profitPerDay: daysToSell === null ? null : profit / daysToSell,
    monthlyProfitAtVelocity: daysToSell === null ? null : profit * (30 / daysToSell),
    // How many times a year the same cash completes this buy-sell loop. Stated
    // as a turnover count rather than an annualised percentage on purpose: a
    // three-day flip annualises to four figures, which is arithmetically true,
    // reads as a promise, and would be the one dishonest number on the page.
    // "Your cash goes round 122 times a year" is the same fact without the
    // implied compounding.
    cashTurnsPerYear: daysToSell === null ? null : 365 / daysToSell,
    /**
     * Item price this channel needs, holding shipping charged constant, to
     * clear `targetProfit`. This is the number that turns a comparison into a
     * decision: "to keep the same $12.40, this channel has to be listed at
     * $54.80."
     */
    priceForProfit(targetProfit) {
      const target = Number(targetProfit);
      if (!Number.isFinite(target)) throw new Error("Target profit must be a number");
      const solved = solveOnCliff((onBranch) => soldPriceOnBranch(target, onBranch));
      if (solved === null) {
        throw new Error(`${label}: target profit cannot be solved at these fee rates`);
      }
      return solved;
    },
    /**
     * Item price this channel needs so the *expected* keep after returns
     * matches `targetProfit`. Same closed form as sold `priceForProfit`
     * when the return rate is zero.
     */
    priceForExpectedProfit(targetProfit) {
      const target = Number(targetProfit);
      if (!Number.isFinite(target)) throw new Error("Target profit must be a number");
      const solved = solveOnCliff((onBranch) => expectedPriceOnBranch(target, onBranch));
      if (solved === null) {
        throw new Error(`${label}: expected profit cannot be solved at these return and fee rates`);
      }
      return solved;
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
  // A seller-entered profit goal, shared across every channel: "what would
  // each one have to charge to leave me exactly this much?" Blank, null or
  // absent means the question was not asked, so the field on every result
  // stays null rather than solving for a target nobody gave.
  const hasTargetProfit = shared.targetProfit !== undefined && shared.targetProfit !== null && shared.targetProfit !== "";
  const targetProfit = hasTargetProfit ? number(shared.targetProfit, "Target profit") : null;
  // Rank on expected keep after returns unless the seller has turned that
  // overlay off. Sold-sale profit is still on every row so the table can
  // show the flip: a channel can win on a completed sale and lose once
  // returns are counted.
  const includeReturns = shared.includeReturns !== false;
  const score = (result) => (includeReturns ? result.expectedProfit : result.profit);
  const best = results.reduce((winner, result) => (score(result) > score(winner) ? result : winner));
  const withPace = results.filter((result) => result.profitPerDay !== null);
  const bestOnVelocity = withPace.length === 0
    ? null
    : withPace.reduce((winner, result) => (
      result.profitPerDay > winner.profitPerDay ? result : winner
    ));

  // Ranking by profit stays the default: it is the question people arrive with.
  // `rankBy: "profitPerDay"` re-sorts on what the cash earns while it waits.
  // A channel with no holding period sorts last there rather than winning on an
  // unknown, and ties fall back to the profit score (expected keep after
  // returns, unless that overlay is off) so the order stays stable.
  const rankBy = shared.rankBy === "profitPerDay" ? "profitPerDay" : "profit";
  const perDay = (result) => (result.profitPerDay === null ? -Infinity : result.profitPerDay);
  const order = rankBy === "profitPerDay"
    ? (a, b) => perDay(b) - perDay(a) || score(b) - score(a)
    : (a, b) => score(b) - score(a);
  const ranked = [...results].sort(order);
  const rankById = new Map(ranked.map((result, index) => [result, index + 1]));
  const bestScore = score(best);

  // Second, independent ranking: what one listing is worth per 30 days of
  // shelf time, which counts how often and how fast each channel actually
  // sells. It is reported alongside the keep ranking rather than replacing it
  // — the two disagreeing is the finding, not a problem to hide behind a
  // toggle. Ranking on the rate rather than the per-listing total is what
  // makes a fast channel win: the same inventory dollar turns more often.
  const shelfScore = (result) => result.velocity.valuePer30Days;
  const shelfRanked = [...results].sort((a, b) => shelfScore(b) - shelfScore(a));
  const shelfRankById = new Map(shelfRanked.map((result, index) => [result, index + 1]));
  const shelfBest = shelfRanked[0];
  const shelfBestScore = shelfScore(shelfBest);

  // Third ranking: expected monthly cash when channel volumes differ. A
  // cheaper-per-sale channel can lose the month when another simply sells
  // more units. Empty per-channel volume falls back to shared monthlyOrders
  // so existing comparisons stay unchanged.
  const bestMonthly = results.reduce(
    (winner, result) => (result.monthlyProfit > winner.monthlyProfit ? result : winner),
  );
  const monthlyRanked = [...results].sort((a, b) => b.monthlyProfit - a.monthlyProfit);
  const monthlyRankByResult = new Map(monthlyRanked.map((result, index) => [result, index + 1]));
  const volumesDiffer = results.some(
    (result) => result.expectedMonthlySales !== results[0].expectedMonthlySales,
  );

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
      monthlyRank: monthlyRankByResult.get(result),
      isBest: result === best,
      isBestMonthly: result === bestMonthly,
      isBestOnVelocity: result === bestOnVelocity,
      // Negative or zero for the velocity winner; for everyone else, the
      // cash-per-day this channel gives up against the fastest earner.
      gapVsBestPerDay: bestOnVelocity === null || result.profitPerDay === null
        ? null
        : bestOnVelocity.profitPerDay - result.profitPerDay,
      shelfRank: shelfRankById.get(result),
      isShelfBest: result === shelfBest,
      // Cash per 30 days of shelf this channel gives up against the fastest
      // earner, and the sell-through it would need to close that gap.
      shelfGapVsBest: shelfBestScore - shelfScore(result),
      sellThroughToMatchBest: result === shelfBest
        ? null
        : result.velocity.sellThroughForRate(shelfBestScore),
      // Negative or zero for the winner; for everyone else, the cash this
      // channel gives up on the same item (sold, or expected after returns).
      gapVsBest: bestScore - score(result),
      monthlyGapVsBest: bestMonthly.monthlyProfit - result.monthlyProfit,
      // What this channel would have to charge to match the winner. Null on
      // the winner itself, where the question is meaningless.
      priceToMatchBest: result === best
        ? null
        : includeReturns
          ? result.priceForExpectedProfit(best.expectedProfit)
          : result.priceForProfit(best.profit),
      // Item price this channel needs to keep the seller's own target,
      // holding shipping charged constant. Solved on the sold-sale price
      // equation (not the after-returns one) so the number answers "if it
      // sells here, what would I have to charge" — the same question the
      // seller is asking, independent of the returns overlay.
      priceForTargetProfit: targetProfit === null ? null : result.priceForProfit(targetProfit),
    })),
    ranked: ranked.map((result) => result.label),
    rankBy,
    includeReturns,
    best: {
      id: best.id,
      label: best.label,
      profit: bestScore,
      soldProfit: best.profit,
      expectedProfit: best.expectedProfit,
      margin: includeReturns ? best.expectedMargin : best.margin,
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
    bestMonthly: {
      id: bestMonthly.id,
      label: bestMonthly.label,
      monthlyProfit: bestMonthly.monthlyProfit,
      expectedMonthlySales: bestMonthly.expectedMonthlySales,
    },
    bestOnVelocity: bestOnVelocity === null ? null : {
      id: bestOnVelocity.id,
      label: bestOnVelocity.label,
      profitPerDay: bestOnVelocity.profitPerDay,
      daysToSell: bestOnVelocity.daysToSell,
      monthlyProfitAtVelocity: bestOnVelocity.monthlyProfitAtVelocity,
    },
    /**
     * The shelf-time verdict. `agrees` is the headline: when the channel that
     * pays best per sale is not the channel that earns most per month of
     * shelf, the seller is choosing between margin and turnover, and the page
     * says so rather than picking for them.
     */
    shelf: {
      id: shelfBest.id,
      label: shelfBest.label,
      valuePer30Days: shelfBestScore,
      listedValue: shelfBest.velocity.listedValue,
      shelfDays: shelfBest.velocity.shelfDays,
      sellThroughPct: shelfBest.velocity.sellThroughPct,
      horizonDays: shelfBest.velocity.horizonDays,
      agrees: shelfBest === best,
      ranked: shelfRanked.map((result) => result.label),
      spread: shelfBestScore - shelfScore(shelfRanked[shelfRanked.length - 1]),
    },
    // How much the channel choice is worth on this one item if it sells
    // everywhere. `shelf.spread` is the same question once sell-through and
    // time to sale are counted. `monthlySpread` is the same question once
    // each channel's expected volume is counted.
    spread: bestScore - score(ranked[ranked.length - 1]),
    monthlySpread: bestMonthly.monthlyProfit - monthlyRanked[monthlyRanked.length - 1].monthlyProfit,
    volumesDiffer,
    // The decision the fee-only ranking cannot make: a cheaper-per-sale
    // channel loses the month when another one simply sells more units.
    rankingsDiverge: best.id !== bestMonthly.id,
  };
}
