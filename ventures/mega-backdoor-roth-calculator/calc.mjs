/**
 * Mega backdoor Roth 401(k) headroom, as a deterministic module.
 *
 * A 401(k) plan that allows **after-tax (non-Roth) employee contributions**
 * on top of the ordinary elective-deferral limit lets a saver put far more
 * into the plan than the number everyone quotes ($23,500 for 2025 /
 * $24,500 for 2026) -- up to the much larger IRC Section 415(c) "annual
 * additions" ceiling that also caps employer contributions. Converting
 * that after-tax money to Roth (in-plan, or via an in-service withdrawal
 * to a Roth IRA) is the "mega backdoor Roth". Two numbers get confused
 * constantly, and this tool exists because of that confusion:
 *
 * 1. **402(g) elective deferral limit** -- what you and your paycheck
 *    withholding control directly (pre-tax + Roth 401(k) combined). This
 *    limit is an aggregate across *every* employer's plan you contributed
 *    to during the calendar year, related or not.
 * 2. **415(c) overall limit** -- elective deferral + employer match/profit
 *    sharing + after-tax contributions, all combined, capped per employer
 *    plan (or per controlled group of employers), not aggregated across
 *    unrelated employers the way the 402(g) limit is. A saver who changed
 *    jobs mid-year gets a *second* 415(c) ceiling at the new employer, but
 *    still only one shared 402(g) ceiling across both.
 *
 * The after-tax headroom this module computes is (2) minus what has
 * already gone in from every source at *this* employer's plan. It is
 * arithmetic against the IRS's own published figures and whatever the
 * saver enters about their own plan and paycheck -- not a determination
 * that a plan actually offers after-tax contributions or in-plan Roth
 * conversion at all. Most plans do not; the saver's own plan document
 * and SPD are the source of truth for whether this strategy is even
 * available, and this tool says so on every page.
 *
 * IRS figures sourced 2026-09-24 via WebSearch cross-checking
 * irs.gov Notice 2024-80 (2025) and Notice 2025-67 (2026) as summarized by
 * Thomson Reuters, Employee Fiduciary, and BSK -- see VENTURE.yaml for the
 * full sourcing note.
 */

export const LIMITS = Object.freeze({
  2025: Object.freeze({
    electiveDeferral: 23500,
    catchUp5059: 7500,
    catchUp6063: 11250,
    overall415c: 70000,
  }),
  2026: Object.freeze({
    electiveDeferral: 24500,
    catchUp5059: 8000,
    catchUp6063: 11250,
    overall415c: 72000,
  }),
});

export const YEARS = Object.freeze(Object.keys(LIMITS).map(Number).sort());

export const DEFAULTS = Object.freeze({
  year: 2026,
  age: 35,
  payPeriodsPerYear: 26,
  payPeriodsRemaining: 13,
  ytdElectiveDeferral: 12000,
  ytdEmployerContributions: 6000,
  expectedAdditionalEmployerContributions: 6000,
  afterTaxContributedYTD: 0,
  planAfterTaxCapPercent: '',
  eligibleCompensation: '',
  conversionFrequency: 'automatic',
  estimatedGrowthBeforeConversion: 0,
  marginalTaxRatePercent: 24,
});

function num(value, fallback = 0) {
  if (value === '' || value === null || value === undefined) return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, n) : fallback;
}

function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * The catch-up band an age falls into for a given calendar year. SECURE
 * 2.0's enhanced catch-up applies to a saver who turns 60, 61, 62, or 63
 * at any point during the year; everyone else 50+ (including 64 and
 * older) gets the standard catch-up. Age is the age the saver will be on
 * December 31 of the year being planned for, not today's age.
 */
export function catchUpBand(age) {
  const a = num(age, 0);
  if (a >= 60 && a <= 63) return 'enhanced';
  if (a >= 50) return 'standard';
  return 'none';
}

function catchUpAmount(year, band) {
  const limits = LIMITS[year];
  if (band === 'enhanced') return limits.catchUp6063;
  if (band === 'standard') return limits.catchUp5059;
  return 0;
}

export function electiveDeferralLimit(year, age) {
  const limits = LIMITS[year];
  if (!limits) return null;
  return limits.electiveDeferral + catchUpAmount(year, catchUpBand(age));
}

export function overall415cLimit(year, age) {
  const limits = LIMITS[year];
  if (!limits) return null;
  return limits.overall415c + catchUpAmount(year, catchUpBand(age));
}

/**
 * Compute this year's after-tax ("mega backdoor") headroom and the
 * per-paycheck contribution that would use it up by year-end.
 *
 * All dollar inputs are what the saver already has from their own
 * paystub or plan portal for *this* employer's plan; nothing here is
 * looked up or estimated on their behalf.
 */
export function computeHeadroom(input = {}) {
  const year = Object.hasOwn(LIMITS, input.year) ? input.year : DEFAULTS.year;
  const age = num(input.age, DEFAULTS.age);
  const payPeriodsRemaining = num(input.payPeriodsRemaining, 0);
  const ytdElectiveDeferral = num(input.ytdElectiveDeferral, 0);
  const ytdEmployerContributions = num(input.ytdEmployerContributions, 0);
  const expectedAdditionalEmployerContributions = num(
    input.expectedAdditionalEmployerContributions,
    0
  );
  const afterTaxContributedYTD = num(input.afterTaxContributedYTD, 0);
  const planAfterTaxCapPercent =
    input.planAfterTaxCapPercent === '' || input.planAfterTaxCapPercent == null
      ? null
      : num(input.planAfterTaxCapPercent, 0);
  const eligibleCompensation =
    input.eligibleCompensation === '' || input.eligibleCompensation == null
      ? null
      : num(input.eligibleCompensation, 0);
  const conversionFrequency = input.conversionFrequency === 'periodic' ? 'periodic' : 'automatic';
  const estimatedGrowthBeforeConversion = num(input.estimatedGrowthBeforeConversion, 0);
  const marginalTaxRatePercent = num(input.marginalTaxRatePercent, 0);

  const deferralLimit = electiveDeferralLimit(year, age);
  const overallLimit = overall415cLimit(year, age);

  const projectedEmployerContributions =
    ytdEmployerContributions + expectedAdditionalEmployerContributions;
  const alreadyCounted = ytdElectiveDeferral + projectedEmployerContributions + afterTaxContributedYTD;

  const irsAfterTaxHeadroom = round2(Math.max(0, overallLimit - alreadyCounted));

  let planAfterTaxHeadroom = null;
  if (planAfterTaxCapPercent !== null && eligibleCompensation !== null) {
    const planCapDollars = (eligibleCompensation * planAfterTaxCapPercent) / 100;
    planAfterTaxHeadroom = round2(Math.max(0, planCapDollars - afterTaxContributedYTD));
  }

  const maxAdditionalAfterTax = round2(
    planAfterTaxHeadroom === null
      ? irsAfterTaxHeadroom
      : Math.min(irsAfterTaxHeadroom, planAfterTaxHeadroom)
  );

  const bindingConstraint =
    maxAdditionalAfterTax === 0
      ? 'none'
      : planAfterTaxHeadroom !== null && planAfterTaxHeadroom < irsAfterTaxHeadroom
      ? 'plan'
      : 'irs';

  const perPaycheckAmount =
    payPeriodsRemaining > 0 ? round2(maxAdditionalAfterTax / payPeriodsRemaining) : null;

  const estimatedConversionTax =
    conversionFrequency === 'periodic'
      ? round2((estimatedGrowthBeforeConversion * marginalTaxRatePercent) / 100)
      : 0;

  const findings = [];
  if (ytdElectiveDeferral > deferralLimit) {
    findings.push('elective-deferral-exceeds-limit');
  }
  if (alreadyCounted > overallLimit) {
    findings.push('already-over-415c');
  }
  if (planAfterTaxHeadroom !== null && planAfterTaxHeadroom < irsAfterTaxHeadroom) {
    findings.push('plan-caps-below-irs');
  }
  if (payPeriodsRemaining <= 0 && maxAdditionalAfterTax > 0) {
    findings.push('no-pay-periods-remaining');
  }
  if (conversionFrequency === 'periodic' && estimatedGrowthBeforeConversion > 0) {
    findings.push('periodic-conversion-has-a-tax-cost');
  }

  return {
    year,
    age,
    catchUpBand: catchUpBand(age),
    electiveDeferralLimit: deferralLimit,
    overall415cLimit: overallLimit,
    alreadyCounted: round2(alreadyCounted),
    irsAfterTaxHeadroom,
    planAfterTaxHeadroom,
    maxAdditionalAfterTax,
    bindingConstraint,
    perPaycheckAmount,
    estimatedConversionTax,
    findings,
  };
}
