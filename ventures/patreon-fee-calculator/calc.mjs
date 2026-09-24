// Deterministic take-home arithmetic for a Patreon creator's monthly
// membership income — not a general creator-sponsorship rate calculator
// (see `podcast-sponsorship-rate-calculator`, `brand-deal-rate-calculator`,
// `newsletter-sponsorship-rate-calculator` for those) and not a currency-
// conversion or payout-timing tool: this prices one month's pledges the way
// Patreon actually charges them, and nothing else.
//
// The product exists because the pledge total a creator sees on their
// dashboard is not what lands in their bank account, and two mechanics get
// routinely mixed up or missed entirely:
//
//   - **The platform fee depends on which plan the page is on, and that is
//     mostly out of the creator's hands.** Patreon's June 2025 pricing
//     change replaced the old Pro/Premium tiers with one flat Standard
//     plan at 10% for every page created after August 4, 2025. A page
//     published on or before that date keeps its legacy plan — Lite (5%),
//     Pro (8%), or Premium (12%) — unless the creator unpublishes and
//     republishes it, which forces the page onto Standard and cannot be
//     undone from the creator's side. So "switching plans" for a legacy
//     creator is not a menu choice to shop between; it is a one-way loss a
//     careless unpublish can trigger. See `planComparison` below.
//   - **Payment processing is a second, separate cut, and it gets sharply
//     worse on small pledges.** On top of the platform fee, Patreon passes
//     through payment processing at 2.9% + $0.30 per successful charge for
//     a US card — except for a charge of $3 or less, where processing
//     switches to 5% + $0.10 instead. A $1 tier is not charged a smaller
//     version of the standard rate; it is charged a *worse* rate on a
//     *smaller* base, which is the single most common thing a creator
//     running $1-3 tiers gets wrong about their own take-home. See
//     `why-your-1-dollar-tier-pays-you-less-than-you-think.html` for the
//     worked-through version of this.
//
// Both figures are cited from Patreon's own June 2025 pricing-change post
// and cross-checked against independent trade press — see README.md for
// the sources — and, like every platform fee schedule in this portfolio,
// they can change without notice: verify against Patreon's own current
// pricing page before relying on a result.
//
// Same two-layer shape as this portfolio's other per-tier-then-roll-up
// calculators (`twitch-payout-calculator`, `stockx-seller-payout-calculator`):
//
//   calculate(input)        — this month's gross pledge revenue, platform
//                              fee, processing fee (split correctly by the
//                              $3 micropayment threshold), and take-home
//                              under the selected plan.
//   planComparison(input)   — the same patron month priced under all four
//                              plans, and what a legacy creator would lose
//                              by reverting to Standard.
//
// Currency conversion and Patreon's payout-timing/holdback mechanics exist
// but are out of scope for a static calculator and are not modeled here —
// see README.md.

export const PLANS = {
  standard: { label: 'Standard (10%) — every page created after Aug 4, 2025', ratePct: 10 },
  legacyLite: { label: 'Legacy Lite (5%)', ratePct: 5 },
  legacyPro: { label: 'Legacy Pro (8%)', ratePct: 8 },
  legacyPremium: { label: 'Legacy Premium (12%)', ratePct: 12 },
};

export const PLAN_KEYS = Object.keys(PLANS);

// A charge of $3.00 or less is billed at the worse "micropayment" rate; a
// charge above $3.00 is billed at the standard rate. Both figures are per
// successful charge, not per creator or per month.
export const MICROPAYMENT_THRESHOLD = 3;
export const STANDARD_PROCESSING = { pct: 2.9, fixed: 0.3 };
export const MICRO_PROCESSING = { pct: 5, fixed: 0.1 };

export const DEFAULTS = {
  tier1Patrons: 120,
  tier1Amount: 1,
  tier2Patrons: 40,
  tier2Amount: 5,
  tier3Patrons: 15,
  tier3Amount: 15,
  otherMonthlyIncome: 0,
  plan: 'standard',
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

function planKey(value) {
  const key = typeof value === 'string' ? value : String(value ?? '');
  if (!PLAN_KEYS.includes(key)) {
    throw new Error(`Plan must be one of: ${PLAN_KEYS.join(', ')}.`);
  }
  return key;
}

/**
 * Patreon's processing fee for one charge of the given amount — the
 * standard 2.9% + $0.30, or the worse 5% + $0.10 "micropayment" rate for a
 * charge at or below $3.
 */
function processingFeeForCharge(amount) {
  const rates = amount > 0 && amount <= MICROPAYMENT_THRESHOLD ? MICRO_PROCESSING : STANDARD_PROCESSING;
  return amount * (rates.pct / 100) + rates.fixed;
}

/**
 * Reads the three patron-tier fields off `input`, validating each, and
 * returns the plan-independent totals every plan is priced against: gross
 * pledge revenue, total processing fee (correctly split by the $3
 * threshold), and how much of both came from a tier priced at or below $3.
 *
 * Shared by `calculate` and `planComparison` so the tier-parsing and
 * micropayment split live in exactly one place.
 */
function tierTotals(input) {
  const tiers = [1, 2, 3].map((n) => ({
    patrons: number(input[`tier${n}Patrons`], `Tier ${n} patron count`),
    amount: number(input[`tier${n}Amount`], `Tier ${n} pledge amount`),
  }));

  let grossPledgeRevenue = 0;
  let processingFee = 0;
  let microTierPatrons = 0;
  let microTierRevenue = 0;
  for (const { patrons, amount } of tiers) {
    grossPledgeRevenue += patrons * amount;
    processingFee += patrons * processingFeeForCharge(amount);
    if (amount > 0 && amount <= MICROPAYMENT_THRESHOLD) {
      microTierPatrons += patrons;
      microTierRevenue += patrons * amount;
    }
  }
  return { grossPledgeRevenue, processingFee, microTierPatrons, microTierRevenue };
}

/**
 * This month's gross pledge revenue, platform fee, processing fee, and
 * take-home under the selected plan.
 *
 * @param {object} input
 * @param {number} input.tier1Patrons Patrons pledging at the Tier 1 amount
 *   this month.
 * @param {number} input.tier1Amount What a Tier 1 patron pledges per
 *   charge, in dollars. A pledge at or below $3 is charged Patreon's worse
 *   micropayment processing rate — see the module note above.
 * @param {number} input.tier2Patrons Patrons pledging at the Tier 2 amount.
 * @param {number} input.tier2Amount What a Tier 2 patron pledges per charge.
 * @param {number} input.tier3Patrons Patrons pledging at the Tier 3 amount.
 * @param {number} input.tier3Amount What a Tier 3 patron pledges per charge.
 * @param {number} input.otherMonthlyIncome Shop sales, merch, or income
 *   outside membership pledges this month — a figure you supply, never
 *   computed here, since Patreon does not publish a single fee schedule for
 *   every non-membership income source.
 * @param {string} input.plan One of `PLAN_KEYS`: `standard`, `legacyLite`,
 *   `legacyPro`, or `legacyPremium`. Read which one applies off your own
 *   Patreon payout settings — it is not a free choice for an existing page.
 */
export function calculate(input) {
  const otherMonthlyIncome = number(input.otherMonthlyIncome, 'Other monthly income');
  const plan = planKey(input.plan);
  const { grossPledgeRevenue, processingFee, microTierPatrons, microTierRevenue } = tierTotals(input);

  const platformFeeRatePct = PLANS[plan].ratePct;
  const platformFee = grossPledgeRevenue * (platformFeeRatePct / 100);
  const netMembershipIncome = grossPledgeRevenue - platformFee - processingFee;
  const takeHome = netMembershipIncome + otherMonthlyIncome;
  const effectiveTakeRatePct = grossPledgeRevenue > 0 ? (netMembershipIncome / grossPledgeRevenue) * 100 : null;

  return {
    grossPledgeRevenue, platformFee, processingFee, netMembershipIncome, takeHome,
    plan, platformFeeRatePct, effectiveTakeRatePct,
    microTierPatrons, microTierRevenue,
  };
}

/**
 * Prices the same patron month under all four plans and reports what a
 * legacy creator would lose per month by reverting to Standard — the real
 * "switching plans" event most legacy creators actually face, since an
 * unpublish/republish forces Standard and cannot be undone from their side.
 */
export function planComparison(input) {
  const otherMonthlyIncome = number(input.otherMonthlyIncome, 'Other monthly income');
  const currentPlan = planKey(input.plan);
  const { grossPledgeRevenue, processingFee } = tierTotals(input);

  const byPlan = {};
  for (const key of PLAN_KEYS) {
    const platformFee = grossPledgeRevenue * (PLANS[key].ratePct / 100);
    const takeHome = grossPledgeRevenue - platformFee - processingFee + otherMonthlyIncome;
    byPlan[key] = { platformFeeRatePct: PLANS[key].ratePct, platformFee, takeHome };
  }

  const lossIfMovedToStandard = currentPlan === 'standard'
    ? 0
    : Math.max(0, byPlan[currentPlan].takeHome - byPlan.standard.takeHome);

  return { currentPlan, byPlan, lossIfMovedToStandard };
}
