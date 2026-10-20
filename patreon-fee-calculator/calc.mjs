// Deterministic payout arithmetic for a Patreon creator's monthly income
// from membership pledges — not a general creator-sponsorship rate
// calculator (see `podcast-sponsorship-rate-calculator`,
// `brand-deal-rate-calculator`, `newsletter-sponsorship-rate-calculator` for
// those) and not a tip-jar or one-time-purchase estimator: Patreon is
// recurring membership pledges billed on a schedule, which is the one thing
// this module prices.
//
// The dashboard number a creator sees ("$1,850 pledged this month") is not
// what lands in the bank account, because two fees come out before the
// creator ever sees it, and which plan the page is on changes both fees at
// once — a distinction confirmed by web search 2026-09-25 against Patreon's
// own Help Center, since this changed structurally in 2025 and an older
// three-tier-for-everyone model would now be wrong for most pages:
//
//   - **Pages created after August 4, 2025 are on the Standard plan**: a
//     single 10% platform fee, and payment processing at one flat rate
//     (about 2.9% + $0.30) on every charge regardless of size — there is no
//     discounted rate for a small charge on this plan.
//   - **Pages created on or before August 4, 2025 keep their legacy plan**:
//     Lite (5%), Pro (8%), or Premium (12%) platform fee, and a
//     *micropayment* processing rate (about 5% + $0.10) on any charge under
//     $3 instead of the standard rate — because the flat $0.30 alone would
//     eat an outsized share of a small pledge. This is the only case where
//     charge size changes the processing rate at all.
//   - **Payment processing is always charged per CHARGE, not per patron or
//     per month**, on both plans. Billing frequency decides how many
//     charges a pledge produces this month: "monthly" charges a patron once
//     for the whole pledge; "per creation" charges once per post instead,
//     for whatever the patron pledged per creation. Splitting the same
//     total monthly pledge into more, smaller per-creation charges pays the
//     fixed part of the processing fee more times for identical revenue —
//     worse still on a legacy plan if it also pushes each charge under the
//     $3 micropayment line. See `compareBillingFrequency` for the worked
//     comparison on both plan shapes.
//
// Not modeled, and not invented: currency conversion (about 2.5% when a
// patron pays in a currency other than the creator's payout currency) and
// per-method payout fees. Fold either into "other monthly income" as a
// negative adjustment if they apply to you, or verify the exact figure on
// your own Patreon dashboard — this tool has no live connection to it.
//
// Same two-layer shape as this portfolio's other per-tier-then-roll-up
// calculators (`twitch-payout-calculator`, `stockx-seller-payout-calculator`):
//
//   calculate(input)            — this month's net payout from three pledge
//                                  tiers, the plan fee, and processing fees.
//   payoutGap(...)               — compare that total to a target and say how
//                                  many more tier-1 patrons close the gap.
//   compareBillingFrequency(...) — hold one patron's total monthly pledge
//                                  constant and compare monthly vs
//                                  per-creation billing's fee bill.

export const PLAN_PRESETS = Object.freeze([
  { id: 'standard', label: 'Standard — 10% (pages created after Aug 4, 2025)', feePct: 10, microDiscount: false },
  { id: 'legacy-lite', label: 'Legacy Lite — 5% (pages created on/before Aug 4, 2025)', feePct: 5, microDiscount: true },
  { id: 'legacy-pro', label: 'Legacy Pro — 8% (pages created on/before Aug 4, 2025)', feePct: 8, microDiscount: true },
  { id: 'legacy-premium', label: 'Legacy Premium — 12% (pages created on/before Aug 4, 2025)', feePct: 12, microDiscount: true },
]);

export const BILLING_PRESETS = Object.freeze([
  { id: 'monthly', label: 'Monthly — charged once a month' },
  { id: 'per-creation', label: 'Per creation — charged once per post' },
]);

// Patreon's published processing rates: a standard charge, and — on a
// legacy plan only — a "micropayment" charge for anything under
// MICRO_THRESHOLD. Both fees are deducted from the creator's payout, not
// added on top of what the patron pays. Verify against Patreon's current
// published rates before relying on these — payment-processor terms change
// over time and this tool has no live connection to them.
export const MICRO_THRESHOLD = 3;
export const STANDARD_PROCESSING = Object.freeze({ pct: 2.9, fixed: 0.30 });
export const MICRO_PROCESSING = Object.freeze({ pct: 5, fixed: 0.10 });

export const DEFAULTS = {
  planTier: 'standard',
  tier1Patrons: 200,
  tier1Pledge: 3,
  tier2Patrons: 100,
  tier2Pledge: 5,
  tier3Patrons: 30,
  tier3Pledge: 10,
  billingFrequency: 'monthly',
  postsPerMonth: 4,
  otherMonthlyIncome: 0,
  targetMonthlyPayout: 2000,
};

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new Error(`${name} must be a number`);
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

function requirePreset(presets, id, label) {
  const found = presets.find((item) => item.id === id);
  if (!found) throw new Error(`Unknown ${label}`);
  return found;
}

/**
 * Which processing rate a single charge of this amount pays. The
 * micropayment rate under MICRO_THRESHOLD only exists on a legacy plan —
 * `microDiscount` is `false` for the Standard plan, so every charge there
 * pays the standard rate regardless of size.
 */
export function processingRate(chargeAmount, microDiscount) {
  return microDiscount && chargeAmount < MICRO_THRESHOLD ? MICRO_PROCESSING : STANDARD_PROCESSING;
}

/**
 * Processing fee, in dollars, for one charge of this amount.
 */
export function chargeFeeDollars(chargeAmount, microDiscount) {
  const rate = processingRate(chargeAmount, microDiscount);
  return chargeAmount * (rate.pct / 100) + rate.fixed;
}

/**
 * One pledge tier's revenue and processing fees for the month.
 *
 * @param {number} patrons Patrons on this tier.
 * @param {number} pledge What one charge costs a patron on this tier.
 * @param {number} chargesPerMonth How many times each patron is charged
 *   this month — 1 under monthly billing, or the post count under
 *   per-creation billing.
 * @param {boolean} microDiscount Whether this plan offers the under-$3
 *   micropayment rate (legacy plans only).
 */
export function tierBreakdown(patrons, pledge, chargesPerMonth, microDiscount) {
  const patronCount = number(patrons, 'Patrons');
  const chargeAmount = number(pledge, 'Pledge amount');
  const charges = number(chargesPerMonth, 'Charges per month', { allowZero: false });
  const totalCharges = patronCount * charges;
  const grossRevenue = totalCharges * chargeAmount;
  const rate = processingRate(chargeAmount, microDiscount);
  const processingFeeTotal = totalCharges * chargeFeeDollars(chargeAmount, microDiscount);
  return {
    patrons: patronCount,
    pledge: chargeAmount,
    totalCharges,
    grossRevenue,
    processingFeeTotal,
    isMicro: Boolean(microDiscount) && chargeAmount < MICRO_THRESHOLD,
    ratePct: rate.pct,
    rateFixed: rate.fixed,
  };
}

/**
 * Net revenue one additional patron on a given pledge/billing shape
 * contributes after processing and platform fees — the unit `payoutGap`
 * divides by to say how many more tier-1 patrons close a gap.
 */
function netPerPatron(pledge, chargesPerMonth, plan) {
  const grossPerPatron = pledge * chargesPerMonth;
  const processingPerPatron = chargesPerMonth * chargeFeeDollars(pledge, plan.microDiscount);
  const platformPerPatron = grossPerPatron * (plan.feePct / 100);
  return grossPerPatron - processingPerPatron - platformPerPatron;
}

/**
 * Price one month's Patreon payout from three pledge tiers, a plan tier,
 * and a billing frequency.
 *
 * @param {object} input
 * @param {string} input.planTier 'standard' | 'legacy-lite' | 'legacy-pro' |
 *   'legacy-premium' — sets the platform fee percentage and whether the
 *   under-$3 micropayment processing rate applies, for the whole page.
 * @param {number} input.tier1Patrons Patrons on the first (lowest) tier.
 * @param {number} input.tier1Pledge What tier 1 costs per charge.
 * @param {number} input.tier2Patrons Patrons on the second tier.
 * @param {number} input.tier2Pledge What tier 2 costs per charge.
 * @param {number} input.tier3Patrons Patrons on the third (highest) tier.
 * @param {number} input.tier3Pledge What tier 3 costs per charge.
 * @param {string} input.billingFrequency 'monthly' | 'per-creation'.
 * @param {number} input.postsPerMonth Posts published this month — only
 *   used when billingFrequency is 'per-creation'.
 * @param {number} input.otherMonthlyIncome Merch, affiliate, or other
 *   income outside Patreon pledges — a figure you supply, added after fees
 *   since it is never run through Patreon's processing.
 */
export function calculate(input) {
  const plan = requirePreset(PLAN_PRESETS, input.planTier, 'plan');
  const billing = requirePreset(BILLING_PRESETS, input.billingFrequency, 'billing frequency');
  const postsPerMonth = number(input.postsPerMonth ?? 1, 'Posts per month', { allowZero: false });
  const chargesPerMonth = billing.id === 'per-creation' ? postsPerMonth : 1;
  const otherMonthlyIncome = number(input.otherMonthlyIncome ?? 0, 'Other monthly income');

  const tier1 = tierBreakdown(input.tier1Patrons, input.tier1Pledge, chargesPerMonth, plan.microDiscount);
  const tier2 = tierBreakdown(input.tier2Patrons, input.tier2Pledge, chargesPerMonth, plan.microDiscount);
  const tier3 = tierBreakdown(input.tier3Patrons, input.tier3Pledge, chargesPerMonth, plan.microDiscount);

  const grossRevenue = tier1.grossRevenue + tier2.grossRevenue + tier3.grossRevenue;
  const totalCharges = tier1.totalCharges + tier2.totalCharges + tier3.totalCharges;
  const processingFees = tier1.processingFeeTotal + tier2.processingFeeTotal + tier3.processingFeeTotal;
  const platformFee = grossRevenue * (plan.feePct / 100);
  const totalFees = processingFees + platformFee;
  const netPatreonPayout = grossRevenue - totalFees;
  const netPayout = netPatreonPayout + otherMonthlyIncome;
  const effectiveTakeRatePct = grossRevenue > 0 ? (netPatreonPayout / grossRevenue) * 100 : null;

  const tier1NetPerPatron = netPerPatron(tier1.pledge, chargesPerMonth, plan);

  return {
    plan: plan.id,
    billingFrequency: billing.id,
    chargesPerMonth,
    postsPerMonth,
    tier1,
    tier2,
    tier3,
    grossRevenue,
    totalCharges,
    processingFees,
    platformFee,
    totalFees,
    netPatreonPayout,
    otherMonthlyIncome,
    netPayout,
    effectiveTakeRatePct,
    tier1NetPerPatron,
  };
}

/**
 * Compare net monthly payout to a target and say how many more tier-1
 * patrons, at the same pledge and billing shape, close the gap.
 */
export function payoutGap(targetMonthlyPayout, netPayout, tier1NetPerPatron) {
  const target = number(targetMonthlyPayout, 'Target monthly payout');
  const payout = number(netPayout, 'Net monthly payout', { min: -Infinity });
  const perPatron = number(tier1NetPerPatron, 'Tier 1 net per patron', { min: -Infinity });
  const gap = Math.max(0, target - payout);
  const additionalTier1PatronsNeeded = gap === 0 ? 0 : (perPatron > 0 ? Math.ceil(gap / perPatron) : null);
  return { gap, additionalTier1PatronsNeeded, meetsTarget: payout >= target };
}

/**
 * Hold one patron's intended total monthly pledge constant and compare the
 * fee bill under monthly billing (one charge of the full amount) against
 * per-creation billing (the same total split evenly across the month's
 * posts, charged separately for each one).
 *
 * This is the fee-side trap that a flat "Patreon takes 10%" estimate
 * cannot see: splitting the same pledge into more, smaller charges pays
 * the fixed part of the processing fee every time — and, on a legacy plan,
 * can also push each charge under the micropayment line into a worse
 * percentage rate.
 *
 * @param {number} monthlyPledgePerPatron Total the patron intends to pay
 *   in a month, however it gets billed.
 * @param {number} postsPerMonth Posts this creator publishes in a month —
 *   the number of charges under per-creation billing.
 * @param {number} patronCount Patrons on this pledge, for the whole-page
 *   dollar comparison.
 * @param {object} plan A PLAN_PRESETS entry (or `{ feePct, microDiscount }`
 *   alike) — both the platform fee and the micropayment eligibility matter.
 */
export function compareBillingFrequency(monthlyPledgePerPatron, postsPerMonth, patronCount, plan) {
  const monthlyPledge = number(monthlyPledgePerPatron, 'Monthly pledge per patron', { allowZero: false });
  const posts = number(postsPerMonth, 'Posts per month', { allowZero: false });
  const patrons = number(patronCount, 'Patron count');
  const feePct = number(plan?.feePct, 'Plan fee percentage');
  const microDiscount = Boolean(plan?.microDiscount);

  const monthly = tierBreakdown(patrons, monthlyPledge, 1, microDiscount);
  const perCreationCharge = monthlyPledge / posts;
  const perCreation = tierBreakdown(patrons, perCreationCharge, posts, microDiscount);

  const monthlyPlatformFee = monthly.grossRevenue * (feePct / 100);
  const perCreationPlatformFee = perCreation.grossRevenue * (feePct / 100);

  const monthlyTotalFees = monthly.processingFeeTotal + monthlyPlatformFee;
  const perCreationTotalFees = perCreation.processingFeeTotal + perCreationPlatformFee;

  return {
    monthly: { ...monthly, platformFee: monthlyPlatformFee, totalFees: monthlyTotalFees, netPayout: monthly.grossRevenue - monthlyTotalFees },
    perCreation: { ...perCreation, platformFee: perCreationPlatformFee, totalFees: perCreationTotalFees, netPayout: perCreation.grossRevenue - perCreationTotalFees },
    feeDifference: perCreationTotalFees - monthlyTotalFees,
  };
}

function money(value) {
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Format this month's numbers as a plain-text summary the creator can paste
 * into their own notes or a post to patrons about a plan-tier change.
 */
export function formatPayoutSummary(result) {
  const plan = PLAN_PRESETS.find((item) => item.id === result.plan)?.label ?? result.plan;
  const billing = BILLING_PRESETS.find((item) => item.id === result.billingFrequency)?.label ?? result.billingFrequency;
  return [
    'PATREON PAYOUT ESTIMATE',
    '',
    `Net monthly payout: ${money(result.netPayout)}`,
    `Plan: ${plan}`,
    `Billing: ${billing}`,
    `Gross pledge revenue: ${money(result.grossRevenue)}`,
    `Platform fee: ${money(result.platformFee)}`,
    `Processing fees: ${money(result.processingFees)} across ${result.totalCharges} charge(s)`,
    `Other income: ${money(result.otherMonthlyIncome)}`,
    '',
    'This is a planning estimate from the numbers you typed, not your actual payout statement. Verify every rate against your own current Patreon creator dashboard before relying on it.',
  ].join('\n');
}
