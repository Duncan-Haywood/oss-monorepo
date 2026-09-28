// Core arithmetic for the 2026 Solo 401(k) contribution limit for a sole
// proprietor or single-member LLC filing Schedule C. No network calls: this
// applies published IRS figures to the numbers the user supplies. It is NOT
// tax advice -- see README "What this does not cover".
//
// Verified 2026-09-28 via WebSearch and WebFetch against IRS.gov's own
// "Retirement Topics - 401(k) and Profit-Sharing Plan Contribution Limits"
// page, Fidelity's "Solo 401(k) contribution limits 2025 and 2026", and the
// Social Security Administration's own 2026 COLA fact sheet, cross-checked
// against each other:
//
//   - 2026 employee elective deferral limit: $24,500.
//   - Catch-up for age 50-59 or 64+: an additional $8,000 (total $32,500).
//   - SECURE 2.0 enhanced catch-up for ages 60-63: an additional $11,250
//     instead of (not in addition to) the standard catch-up (total
//     $35,750), if the plan document allows it.
//   - Overall Section 415(c) "annual additions" limit for 2026 (employee
//     deferral + employer contribution combined): $72,000, or $80,000 with
//     the standard catch-up, or $83,250 with the age-60-63 enhanced
//     catch-up.
//   - Section 401(a)(17) annual compensation limit for 2026: $360,000.
//   - 2026 Social Security taxable wage base (SSA's own announcement):
//     $184,500.
//
// For a sole proprietor or single-member LLC (no W-2 wages from the
// business), the employer profit-sharing contribution is bounded by net
// earnings from self-employment, not gross revenue or the stated 25% plan
// rate directly. IRS Publication 560's worksheet:
//
//   1. Net profit (Schedule C, before any retirement contribution).
//   2. Self-employment tax is computed on 92.35% of net profit (the
//      SE_NET_EARNINGS_FACTOR below) -- this removes the employer-equivalent
//      half of the tax from the base, the same adjustment
//      booth-rent-vs-commission's payroll.mjs documents for the same reason.
//      12.4% Social Security applies up to the wage base; 2.9% Medicare
//      applies with no cap. (The additional 0.9% Medicare surtax above
//      $200,000/$250,000 is out of scope here, same simplification as
//      booth-rent-vs-commission's payroll.mjs.)
//   3. Half of that self-employment tax is an above-the-line deduction.
//      Net earnings from self-employment = net profit - that half.
//   4. A plan stating a 25% contribution rate converts to an effective 20%
//      rate for a sole proprietor (25% / (1 + 25%) = 20%), because the
//      contribution is itself computed on earnings net of the contribution.
//      Applying 20% directly to step 3's result is the standard shortcut
//      that avoids solving the circular 25%-of-earnings-after-the-
//      contribution equation, and it is what commercial solo 401(k)
//      calculators (Fidelity, Vanguard, and others) use.
//   5. Net earnings from self-employment used in this calculation cannot
//      exceed the $360,000 (2026) compensation limit.
//
// This module does not compute self-employment tax on anything other than
// Schedule C sole-proprietor / single-member-LLC income (an S-corp or
// partnership uses W-2 wages or a K-1 allocation instead, a different
// formula entirely), does not account for a W-2 job's own 401(k) deferrals
// sharing the same annual elective-deferral limit, and does not model Roth
// vs. traditional or after-tax (mega-backdoor-style) contribution splits.
// The page states each of these explicitly.

export const LIMITS_2026 = {
  employeeDeferral: 24_500,
  catchUp50: 8_000,
  catchUp60to63: 11_250,
  annualAdditions: 72_000,
  compensationLimit: 360_000,
};

export const SOCIAL_SECURITY_WAGE_BASE_2026 = 184_500;

/**
 * Self-employment tax is charged on 92.35% of net profit, not on all of it.
 * The factor is `1 - 0.153/2`: it removes the employer-equivalent half of
 * the tax from the base, so a self-employed filer is not taxed on money a
 * W-2 employee would never have seen as wages in the first place.
 */
export const SE_NET_EARNINGS_FACTOR = 0.9235;

/** The sole-proprietor-equivalent rate for a plan stating a 25% employer rate. */
export const EMPLOYER_CONTRIBUTION_RATE = 0.2;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * The elective-deferral catch-up for the given age at year-end: the SECURE
 * 2.0 enhanced catch-up for ages 60-63 (which replaces, not adds to, the
 * standard catch-up), the standard catch-up for 50-59 or 64+, or none.
 */
export function catchUpFor(age) {
  const a = Math.floor(num(age));
  if (a >= 60 && a <= 63) return LIMITS_2026.catchUp60to63;
  if (a >= 50) return LIMITS_2026.catchUp50;
  return 0;
}

/**
 * Self-employment tax on `netProfit` (Schedule C net profit, before any
 * retirement contribution), and the above-the-line-deductible half of it.
 * Floors at zero: a loss-making business owes no self-employment tax and
 * has no net self-employment earnings to contribute from.
 */
export function selfEmploymentTaxOutcome(netProfit, { wageBase = SOCIAL_SECURITY_WAGE_BASE_2026 } = {}) {
  const profit = Math.max(0, num(netProfit));
  const cap = Math.max(0, num(wageBase));
  const taxableBase = profit * SE_NET_EARNINGS_FACTOR;
  const socialSecurity = Math.min(taxableBase, cap) * 0.124;
  const medicare = taxableBase * 0.029;
  const total = socialSecurity + medicare;
  return { profit, taxableBase, socialSecurity, medicare, total, deductibleHalf: total / 2 };
}

/**
 * Net earnings from self-employment for retirement-contribution purposes:
 * net profit minus half of self-employment tax, capped at the 2026
 * $360,000 compensation limit.
 */
export function netSelfEmploymentEarnings(netProfit, opts) {
  const se = selfEmploymentTaxOutcome(netProfit, opts);
  const earnings = Math.max(0, se.profit - se.deductibleHalf);
  return Math.min(earnings, LIMITS_2026.compensationLimit);
}

/**
 * Computes the 2026 Solo 401(k) contribution outcome for a sole proprietor
 * or single-member LLC: employee elective deferral (capped by the
 * statutory limit, net self-employment earnings, and any deferral already
 * made to a W-2 job's plan this year), employer profit-sharing
 * contribution (20% of net self-employment earnings), and the combined
 * total under the overall Section 415(c) annual-additions limit.
 */
export function solo401kContributionOutcome({
  netProfit = 0,
  age = 0,
  electiveDeferral = null,
  deferralUsedElsewhere = 0,
  wageBase,
} = {}) {
  const earnings = netSelfEmploymentEarnings(netProfit, { wageBase });
  const catchUp = catchUpFor(age);
  const statutoryDeferralLimit = LIMITS_2026.employeeDeferral + catchUp;
  const remainingDeferralRoom = Math.max(0, statutoryDeferralLimit - Math.max(0, num(deferralUsedElsewhere)));
  const maxDeferral = Math.min(remainingDeferralRoom, earnings);

  const requestedDeferral = electiveDeferral == null ? maxDeferral : Math.max(0, num(electiveDeferral));
  const deferral = Math.min(requestedDeferral, maxDeferral);

  const employerContributionRaw = earnings * EMPLOYER_CONTRIBUTION_RATE;
  const overallLimit = LIMITS_2026.annualAdditions + catchUp;
  const combinedCap = Math.min(overallLimit, earnings);

  let employerContribution = employerContributionRaw;
  let totalContribution = deferral + employerContributionRaw;
  if (totalContribution > combinedCap) {
    employerContribution = Math.max(0, combinedCap - deferral);
    totalContribution = deferral + employerContribution;
  }

  const findings = [];

  if (earnings <= 0) {
    findings.push({
      severity: "high",
      title: "No net self-employment earnings to contribute from",
      detail: "With zero or negative net profit after the self-employment tax deduction, there is no compensation this plan can use for either the employee or employer contribution this year.",
    });
  }

  if (deferralUsedElsewhere > 0) {
    findings.push({
      severity: "medium",
      title: "The elective-deferral limit is shared across every 401(k) you contribute to",
      detail: `The ${money(statutoryDeferralLimit)} elective-deferral limit applies per person across ALL 401(k) plans combined, including a separate W-2 employer's plan -- not per plan. With ${money(num(deferralUsedElsewhere))} already deferred elsewhere this year, only ${money(remainingDeferralRoom)} of elective-deferral room remains for this Solo 401(k).`,
    });
  }

  if (electiveDeferral != null && requestedDeferral > maxDeferral) {
    findings.push({
      severity: "medium",
      title: "Requested elective deferral reduced to the available room",
      detail: `You entered ${money(requestedDeferral)}, but only ${money(maxDeferral)} is available once the statutory limit, net self-employment earnings, and any deferral used elsewhere are applied.`,
    });
  }

  if (earnings > 0 && employerContributionRaw > employerContribution) {
    findings.push({
      severity: "info",
      title: "Employer contribution trimmed by the overall combined limit",
      detail: `20% of net self-employment earnings would be ${money(employerContributionRaw)}, but combined with the ${money(deferral)} elective deferral that would exceed the ${money(combinedCap)} overall limit for this year, so the employer contribution is capped at ${money(employerContribution)}.`,
    });
  }

  if (catchUp === LIMITS_2026.catchUp60to63) {
    findings.push({
      severity: "info",
      title: "Ages 60-63 get an enhanced catch-up, not a stacked one",
      detail: "The SECURE 2.0 enhanced catch-up for ages 60-63 (an extra $11,250 for 2026) replaces the standard $8,000 catch-up rather than adding to it, and your plan document must specifically permit it.",
    });
  }

  findings.push({
    severity: "info",
    title: "Sole proprietor / single-member LLC only",
    detail: "This applies the net-self-employment-earnings formula for a Schedule C filer with no W-2 wages from the business. An S-corp or partnership uses a different formula (W-2 wages or a K-1 allocation), not this one.",
  });

  return {
    netProfit: Math.max(0, num(netProfit)),
    earnings,
    age: Math.floor(num(age)),
    catchUp,
    statutoryDeferralLimit,
    remainingDeferralRoom,
    maxDeferral,
    deferral,
    employerContributionRaw,
    employerContribution,
    overallLimit,
    combinedCap,
    totalContribution,
    findings,
  };
}
