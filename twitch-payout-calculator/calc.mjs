// Deterministic payout arithmetic for a Twitch streamer's monthly income
// from subscriptions and Bits — not a general creator-sponsorship rate
// calculator (see `podcast-sponsorship-rate-calculator`,
// `brand-deal-rate-calculator`, `newsletter-sponsorship-rate-calculator` for
// those) and not an ad-revenue estimator: Twitch publishes no ad CPM a
// static calculator could model honestly, so ad income is a manual
// "other monthly income" figure the streamer supplies themselves, never
// computed here.
//
// The product exists because the dashboard number a streamer sees ("$414.47
// in sub revenue this month") is not what lands in their bank account, and
// two common beliefs about why get the mechanics backwards:
//
//   - **The revenue split is real and does move payout.** Everyone starts at
//     50% of subscription revenue. Affiliates and Partners who sustain 100
//     Plus Points for three consecutive months move to 60%, and those who
//     reach 300 Plus Points move to 70%, under Twitch's Plus Program (a
//     2024 overhaul that also opened the program to Affiliates, not just
//     Partners, and removed the earlier $100k annual cap on the 70% tier).
//     Plus Points come from paid recurring subs only — 1 point per Tier 1,
//     2 per Tier 2, 6 per Tier 3; gifted and Prime subs earn none. That is
//     the one lever that actually changes take-home per sub, and it is a
//     three-way choice, not a binary one.
//   - **Purchase platform (web vs. the iOS/Android app) does not.** Twitch
//     charges a higher price for a mobile subscription specifically to
//     absorb Apple's and Google's in-app-purchase cut, so a streamer's
//     payout per sub is the same whether the viewer bought it on desktop or
//     in the app — Twitch's own leadership has said so directly. A
//     calculator that models a "mobile fee" reduction would be modeling a
//     belief Twitch deliberately priced out, not a real deduction. See
//     `does-a-mobile-subscription-pay-me-less.html` for the worked-through
//     version of this.
//   - **Bits are flat, not split.** A cheered Bit is worth exactly $0.01 to
//     the streamer no matter what the viewer paid for the Bits bundle or
//     what the streamer's subscription split is — Bits pricing already has
//     Twitch's cut built in before the streamer ever sees it.
//
// Same two-layer shape as this portfolio's other per-stream-then-roll-up
// calculators (`stockx-seller-payout-calculator`, `whatnot-seller-payout`):
//
//   calculate(input)  — this month's sub payout, Bits payout, and total
//                        take-home from tier counts, prices, the revenue
//                        split, Bits cheered, and any other income supplied.
//   payoutGap(...)    — compare that total to a target and say how many more
//                        Tier 1 subs, at the same split, close the gap.

export const DEFAULTS = {
  tier1Subs: 40,
  tier2Subs: 10,
  tier3Subs: 3,
  tier1Price: 5.99,
  tier2Price: 9.99,
  tier3Price: 24.99,
  splitPct: 50,
  bitsCheered: 8000,
  otherMonthlyIncome: 0,
  targetMonthlyPayout: 1500,
};

function number(value, label, { min = 0, max = null, exclusiveMax = false } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min) {
    throw new Error(min === 0 ? `${label} must be zero or greater.` : `${label} must be at least ${min}.`);
  }
  if (max !== null) {
    if (exclusiveMax && parsed >= max) throw new Error(`${label} must be below ${max}.`);
    if (!exclusiveMax && parsed > max) throw new Error(`${label} must be ${max} or less.`);
  }
  return parsed;
}

/**
 * This month's sub payout, Bits payout, and total take-home.
 *
 * @param {object} input
 * @param {number} input.tier1Subs Total Tier 1 subs this month, web and
 *   mobile combined — include gifted subs at the tier they were gifted at;
 *   the giver pays, but your payout works the same as any other sub.
 * @param {number} input.tier2Subs Total Tier 2 subs this month, same rule.
 * @param {number} input.tier3Subs Total Tier 3 subs this month, same rule.
 * @param {number} input.tier1Price What a Tier 1 sub costs (the web price;
 *   your payout per sub is the same on mobile — see the module note above).
 * @param {number} input.tier2Price What a Tier 2 sub costs.
 * @param {number} input.tier3Price What a Tier 3 sub costs.
 * @param {number} input.splitPct Your share of subscription revenue: 50 by
 *   default, or 60/70 under Twitch's Plus Program once you sustain 100/300
 *   Plus Points. Read it off your own Twitch dashboard — it is not a fixed
 *   published number for every channel.
 * @param {number} input.bitsCheered Total Bits cheered to you this month.
 *   Always worth $0.01 each to you, regardless of your subscription split.
 * @param {number} input.otherMonthlyIncome Ad revenue, sponsorships, or
 *   donations elsewhere this month — a figure you supply, never computed
 *   here, because Twitch publishes no ad rate a static tool could model
 *   honestly.
 */
export function calculate(input) {
  const tier1Subs = number(input.tier1Subs, 'Tier 1 subs');
  const tier2Subs = number(input.tier2Subs, 'Tier 2 subs');
  const tier3Subs = number(input.tier3Subs, 'Tier 3 subs');
  const tier1Price = number(input.tier1Price, 'Tier 1 price');
  const tier2Price = number(input.tier2Price, 'Tier 2 price');
  const tier3Price = number(input.tier3Price, 'Tier 3 price');
  const splitPct = number(input.splitPct, 'Revenue split percentage', { max: 100 });
  const bitsCheered = number(input.bitsCheered, 'Bits cheered');
  const otherMonthlyIncome = number(input.otherMonthlyIncome, 'Other monthly income');

  const tier1Revenue = tier1Subs * tier1Price;
  const tier2Revenue = tier2Subs * tier2Price;
  const tier3Revenue = tier3Subs * tier3Price;
  const grossSubRevenue = tier1Revenue + tier2Revenue + tier3Revenue;

  const subPayout = grossSubRevenue * (splitPct / 100);
  const bitsPayout = bitsCheered * 0.01;
  const totalPayout = subPayout + bitsPayout + otherMonthlyIncome;

  const tier1PayoutPerSub = tier1Price * (splitPct / 100);
  const effectiveSubTakeRatePct = grossSubRevenue > 0 ? (subPayout / grossSubRevenue) * 100 : null;

  return {
    tier1Revenue, tier2Revenue, tier3Revenue, grossSubRevenue,
    subPayout, bitsPayout, totalPayout,
    tier1PayoutPerSub, effectiveSubTakeRatePct,
  };
}

/**
 * Compare total monthly payout to a target and say how many more Tier 1
 * subs, at the same split, close the gap.
 */
export function payoutGap(targetMonthlyPayout, totalPayout, tier1PayoutPerSub) {
  const target = number(targetMonthlyPayout, 'Target monthly payout');
  const payout = number(totalPayout, 'Total monthly payout', { min: -Infinity });
  const perSub = number(tier1PayoutPerSub, 'Tier 1 payout per sub', { min: -Infinity });
  const gap = Math.max(0, target - payout);
  const additionalTier1SubsNeeded = gap === 0 ? 0 : (perSub > 0 ? Math.ceil(gap / perSub) : null);
  return { gap, additionalTier1SubsNeeded, meetsTarget: payout >= target };
}
