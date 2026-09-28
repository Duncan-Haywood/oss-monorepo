// Core arithmetic for the 2026 self-employed health insurance deduction
// (IRC section 162(l); Form 1040 Schedule 1 line 17; Form 7206) for a
// sole proprietor or single-member LLC filing Schedule C. No network calls:
// this applies published figures to the numbers the user supplies. It is
// NOT tax advice -- see README "What this does not cover".
//
// Verified 2026-09-28 via WebSearch/WebFetch:
//
//   - 2026 Social Security taxable wage base: $184,500 (SSA's own FAQ and
//     Contribution and Benefit Base page, ssa.gov/oact/cola/cbb.html).
//   - 2026 eligible long-term-care premium limits under IRC 213(d)(10),
//     Rev. Proc. 2025-32 section 4.27 (irs.gov/pub/irs-drop/rp-25-32.pdf,
//     read via the Internal Revenue Bulletin 2025-45 text and matched by a
//     second summary source), by attained age before the close of the tax
//     year: 40 or less $500; 41-50 $930; 51-60 $1,860; 61-70 $4,960;
//     over 70 $6,200. Per person, not per return.
//   - The deduction cannot exceed earned income from the business under
//     which the insurance plan is established; earned income for this
//     purpose is net profit less the deductible half of SE tax less the
//     taxpayer's own SEP/SIMPLE/qualified-plan contribution (Form 7206 and
//     its instructions; IRS "Self-employed individuals: calculating your
//     own retirement plan contribution").
//   - No deduction for any month the taxpayer (or spouse) was eligible for
//     an employer-subsidized health plan, even if not enrolled; the test is
//     applied separately to plans that include long-term-care coverage and
//     plans that do not (Instructions for Form 7206).
//   - Medicare premiums voluntarily paid may be included (Instructions for
//     Form 7206).
//
// Self-employment tax: 92.35% of net profit is the base; 12.4% Social
// Security applies to the base up to the wage base (less any W-2 Social
// Security wages already taxed), 2.9% Medicare applies with no cap. The
// additional 0.9% Medicare tax is not part of the deductible half and is
// not modelled. SE tax applies only when net earnings from self-employment
// are $400 or more (IRC 1402(b)(2)).
//
// The retirement-contribution figure is a user-supplied input. The true
// SEP/Solo 401(k) contribution and the deduction interact through plan
// compensation (a circular calculation IRS worksheets solve by
// iteration); this module does NOT solve that circularity.
//
// Proration assumption, stated on the page: months of eligibility for an
// employer-subsidized plan remove that fraction (months/12) of the
// premiums, which assumes premiums were paid evenly across the year. For
// long-term care the prorated premium is then compared to the age limit.

export const SOCIAL_SECURITY_WAGE_BASE_2026 = 184_500;
export const SE_NET_EARNINGS_FACTOR = 0.9235;
export const SE_MINIMUM_NET_EARNINGS = 400;

/** [maximum attained age inclusive, annual limit] -- Rev. Proc. 2025-32 sec. 4.27. */
export const LTC_LIMITS_2026 = [
  { maxAge: 40, limit: 500 },
  { maxAge: 50, limit: 930 },
  { maxAge: 60, limit: 1_860 },
  { maxAge: 70, limit: 4_960 },
  { maxAge: Infinity, limit: 6_200 },
];

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

/** Whole months 0-12 (clamped, rounded down). */
export function clampMonths(v) {
  return Math.min(12, Math.max(0, Math.floor(num(v))));
}

/** The 2026 LTC premium limit for a person of this attained age (age before year end). */
export function ltcLimitFor(age) {
  const a = Math.floor(num(age));
  if (a <= 0) return 0;
  return LTC_LIMITS_2026.find((row) => a <= row.maxAge).limit;
}

/**
 * Self-employment tax on `netProfit` (Schedule C net profit), and the
 * deductible half of it. `w2SocialSecurityWages` reduces the room left
 * under the Social Security wage base. Floors at zero.
 */
export function selfEmploymentTaxOutcome(
  netProfit,
  { wageBase = SOCIAL_SECURITY_WAGE_BASE_2026, w2SocialSecurityWages = 0 } = {},
) {
  const profit = Math.max(0, num(netProfit));
  const taxableBase = profit * SE_NET_EARNINGS_FACTOR;
  if (taxableBase < SE_MINIMUM_NET_EARNINGS) {
    return { profit, taxableBase, socialSecurity: 0, medicare: 0, total: 0, deductibleHalf: 0 };
  }
  const room = Math.max(0, Math.max(0, num(wageBase)) - Math.max(0, num(w2SocialSecurityWages)));
  const socialSecurity = Math.min(taxableBase, room) * 0.124;
  const medicare = taxableBase * 0.029;
  const total = socialSecurity + medicare;
  return { profit, taxableBase, socialSecurity, medicare, total, deductibleHalf: total / 2 };
}

/**
 * One long-term-care insured person: premium prorated for months of
 * eligibility for an employer-subsidized LTC plan, then capped at the age limit.
 */
export function ltcAllowed({ premium = 0, age = 0, monthsEligible = 0 } = {}) {
  const paid = Math.max(0, num(premium));
  const months = clampMonths(monthsEligible);
  const afterEligibility = paid * (12 - months) / 12;
  const limit = ltcLimitFor(age);
  const allowed = Math.min(afterEligibility, limit);
  return { paid, limit, afterEligibility, allowed, capped: afterEligibility > limit };
}

/**
 * The full 2026 outcome. Inputs:
 *  - netProfit: Schedule C net profit before SE tax or retirement deductions
 *  - retirementContribution: own SEP/SIMPLE/Solo 401(k) contribution (user-supplied)
 *  - w2SocialSecurityWages: Social Security wages from any W-2 job
 *  - healthPremiums: medical/dental/vision (and Medicare) premiums paid, excluding LTC
 *  - healthMonthsEligible: months eligible for an employer-subsidized health plan
 *  - ltc: array of { premium, age, monthsEligible } (one per insured person)
 */
export function healthInsuranceDeductionOutcome({
  netProfit = 0,
  retirementContribution = 0,
  w2SocialSecurityWages = 0,
  healthPremiums = 0,
  healthMonthsEligible = 0,
  ltc = [],
  wageBase,
} = {}) {
  const se = selfEmploymentTaxOutcome(netProfit, { wageBase, w2SocialSecurityWages });
  const retirement = Math.max(0, num(retirementContribution));
  const earnedIncome = Math.max(0, se.profit - se.deductibleHalf - retirement);

  const healthPaid = Math.max(0, num(healthPremiums));
  const healthMonths = clampMonths(healthMonthsEligible);
  const healthQualifying = healthPaid * (12 - healthMonths) / 12;

  const ltcRows = (Array.isArray(ltc) ? ltc : []).map((p) => ltcAllowed(p));
  const ltcQualifying = ltcRows.reduce((sum, r) => sum + r.allowed, 0);
  const ltcPaid = ltcRows.reduce((sum, r) => sum + r.paid, 0);

  const qualifyingPremiums = healthQualifying + ltcQualifying;
  const deduction = Math.min(qualifyingPremiums, earnedIncome);
  const notDeducted = Math.max(0, healthPaid + ltcPaid - deduction);

  const findings = [];
  if (se.profit <= 0) {
    findings.push({
      severity: "high",
      title: "No net profit, no deduction",
      detail: "The deduction cannot exceed earned income from the business under which the insurance plan is established. With zero or negative net profit the deduction is zero.",
    });
  }
  if (qualifyingPremiums > earnedIncome && earnedIncome >= 0 && se.profit > 0) {
    findings.push({
      severity: "medium",
      title: "The earned-income cap limits your deduction",
      detail: `Qualifying premiums of ${money(qualifyingPremiums)} exceed earned income of ${money(earnedIncome)} (net profit minus the deductible half of self-employment tax minus your retirement contribution), so the deduction is limited to ${money(earnedIncome)}. Premiums not deducted here may still be usable as an itemized medical expense; that is outside this tool.`,
    });
  }
  if (healthMonths > 0 || ltcRows.some((r, i) => clampMonths(ltc[i] && ltc[i].monthsEligible) > 0)) {
    findings.push({
      severity: "medium",
      title: "Months eligible for an employer-subsidized plan are excluded",
      detail: "For any month you (or your spouse) could have joined an employer-subsidized health plan, that month's premiums do not qualify, even if you did not enroll. This tool removes months/12 of the premiums, which assumes you paid the same amount every month. The test is applied separately to plans that include long-term-care coverage and plans that do not. Check the month-by-month figures on Form 7206.",
    });
  }
  ltcRows.forEach((r, i) => {
    if (r.capped) {
      findings.push({
        severity: "info",
        title: `Long-term-care premium for person ${i + 1} capped at the age limit`,
        detail: `The 2026 limit for this attained age is ${money(r.limit)}; ${money(r.afterEligibility)} was entered, so ${money(r.allowed)} counts.`,
      });
    }
  });
  if (retirement > 0) {
    findings.push({
      severity: "info",
      title: "Your retirement contribution is a number you supplied",
      detail: "A SEP, SIMPLE, or Solo 401(k) contribution is figured from plan compensation, which itself depends on the deduction for one-half of self-employment tax and on the plan's own rules. This tool does not solve that circularity; it subtracts the contribution you entered. Use the contribution your plan computation actually produced.",
    });
  }
  findings.push({
    severity: "info",
    title: "Scope: sole proprietor / single-member LLC (Schedule C) only",
    detail: "Partners, LLC members taxed as partnerships, and more-than-2% S-corporation shareholders are treated differently (K-1 earnings, guaranteed payments, or premiums reported in W-2 wages) and are not modelled. Multiple businesses, the additional 0.9% Medicare tax, and Form 2555 are also out of scope.",
  });

  return {
    netProfit: se.profit,
    se,
    retirement,
    earnedIncome,
    healthPaid,
    healthMonths,
    healthQualifying,
    ltcRows,
    ltcQualifying,
    qualifyingPremiums,
    deduction,
    notDeducted,
    findings,
  };
}
