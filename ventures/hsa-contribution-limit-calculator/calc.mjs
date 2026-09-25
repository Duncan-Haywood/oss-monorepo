// Core arithmetic for the 2026 HSA (Health Savings Account) contribution
// limit. No network calls: this applies published IRS figures to the
// numbers the user supplies. It is NOT tax advice -- see README "What this
// does not cover".
//
// Verified 2026-09-25 via WebSearch against Fidelity's "HSA contribution
// limits and eligibility rules for 2026 and 2027", Thomson Reuters Tax's
// "IRS Announces 2026 HSA and EBHRA Contribution Limits, HDHP Minimum
// Deductibles, and HDHP Out-of-Pocket Maximums", Mercer's "2026 HSA, HDHP
// and excepted-benefit HRA figures set", and IRS Rev. Proc. 2025-19,
// cross-checked against each other:
//
//   - 2026 annual HSA contribution limit: $4,400 for self-only HDHP
//     coverage, $8,750 for family coverage.
//   - Catch-up contribution for age 55+ (not yet enrolled in Medicare):
//     an additional $1,000, fixed by statute (IRC 223(b)(3)) rather than
//     indexed for inflation, so it does not change year to year the way
//     the base limits do.
//   - 2026 HDHP qualification minimums: deductible at least $1,700
//     self-only / $3,400 family. A plan whose deductible or out-of-pocket
//     maximum falls outside these bounds is not HSA-qualified regardless
//     of what it is marketed as.
//   - 2026 HDHP out-of-pocket maximum ceiling: $8,500 self-only / $17,000
//     family. A plan's own out-of-pocket max may be lower than the
//     ceiling (that is fine); it may not exceed it.
//   - Mid-year eligibility (not eligible the whole year): the contribution
//     limit is normally prorated by whole months of HDHP-eligible
//     coverage (the "monthly proration method"), annual limit x (eligible
//     months / 12), rountripped through each month's coverage status
//     rather than a day count.
//   - The "last-month rule": an individual who is HSA-eligible on
//     December 1 of the tax year may contribute the FULL annual limit for
//     that year even if eligible for only part of it. Using this rule
//     imposes a "testing period" through December 31 of the FOLLOWING
//     year -- if HDHP eligibility lapses (other than by death or
//     disability) before that date, the extra amount contributed beyond
//     what monthly proration would have allowed becomes taxable income
//     in the year eligibility lapsed, plus a 10% additional tax.
//
// This module does not verify a filer's actual HDHP enrollment, other
// disqualifying coverage (e.g. a general-purpose FSA, Medicare
// enrollment, or being claimed as a dependent), or month-by-month
// coverage history -- the user supplies each, and the page points at
// IRS Publication 969 and a tax professional as the source to verify
// against.

export const LIMITS_2026 = {
  self: { annual: 4_400, hdhpMinDeductible: 1_700, hdhpMaxOutOfPocket: 8_500 },
  family: { annual: 8_750, hdhpMinDeductible: 3_400, hdhpMaxOutOfPocket: 17_000 },
};

export const CATCH_UP_55_PLUS = 1_000;

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
 * Checks whether a plan's own deductible and out-of-pocket maximum satisfy
 * the 2026 HDHP-qualification bounds for the given coverage type.
 */
export function hdhpQualifies({ coverage = "self", deductible = 0, outOfPocketMax = 0 } = {}) {
  const bounds = LIMITS_2026[coverage] ?? LIMITS_2026.self;
  const deductibleOk = num(deductible) >= bounds.hdhpMinDeductible;
  const outOfPocketOk = num(outOfPocketMax) <= bounds.hdhpMaxOutOfPocket;
  return {
    qualifies: deductibleOk && outOfPocketOk,
    deductibleOk,
    outOfPocketOk,
    requiredMinDeductible: bounds.hdhpMinDeductible,
    requiredMaxOutOfPocket: bounds.hdhpMaxOutOfPocket,
  };
}

/**
 * Computes the 2026 HSA contribution limit for the entered facts: coverage
 * type, months of HDHP eligibility (monthly proration, unless the
 * last-month rule is used), age-55-catch-up eligibility, and whether the
 * last-month rule is being elected in place of proration.
 */
export function contributionLimitOutcome({
  coverage = "self",
  eligibleMonths = 12,
  age55Plus = false,
  useLastMonthRule = false,
} = {}) {
  const bounds = LIMITS_2026[coverage] ?? LIMITS_2026.self;
  const months = Math.max(0, Math.min(12, Math.round(num(eligibleMonths))));
  const fullYear = months >= 12;

  const proratedBase = fullYear ? bounds.annual : Math.round((bounds.annual * months) / 12);
  const proratedCatchUp = age55Plus
    ? fullYear
      ? CATCH_UP_55_PLUS
      : Math.round((CATCH_UP_55_PLUS * months) / 12)
    : 0;

  const lastMonthRuleEligible = !fullYear && months > 0 && useLastMonthRule;
  const baseLimit = lastMonthRuleEligible ? bounds.annual : proratedBase;
  const catchUpLimit = lastMonthRuleEligible ? (age55Plus ? CATCH_UP_55_PLUS : 0) : proratedCatchUp;
  const totalLimit = baseLimit + catchUpLimit;

  const findings = [];

  if (fullYear) {
    findings.push({
      severity: "info",
      title: "Eligible all 12 months: the full annual limit applies",
      detail: `No proration needed. The ${coverage === "family" ? "family" : "self-only"} limit for 2026 is ${money(bounds.annual)}${age55Plus ? `, plus the ${money(CATCH_UP_55_PLUS)} age-55 catch-up` : ""}.`,
    });
  } else if (months <= 0) {
    findings.push({
      severity: "high",
      title: "No months of HDHP eligibility entered",
      detail: "With zero eligible months, there is no HSA contribution limit to compute for this year.",
    });
  } else if (useLastMonthRule) {
    findings.push({
      severity: "medium",
      title: "Last-month rule elected: full annual limit, but a testing period now applies",
      detail: `Because you were (or will be) HSA-eligible on December 1, 2026, you may contribute the full annual limit as if you had been eligible all year. In exchange, you must remain HSA-eligible through December 31, 2027 (the "testing period"). If eligibility lapses before then for a reason other than death or disability, the amount contributed beyond what monthly proration would have allowed becomes taxable income in the year eligibility lapsed, plus a 10% additional tax.`,
    });
  } else {
    findings.push({
      severity: "medium",
      title: `Prorated for ${months} of 12 months`,
      detail: `Monthly proration: ${money(bounds.annual)} x ${months}/12 = ${money(proratedBase)}${age55Plus ? `, plus a prorated ${money(proratedCatchUp)} catch-up` : ""}. If you were (or will be) HSA-eligible on December 1, 2026, the "last-month rule" may let you contribute the full annual limit instead -- see the note below.`,
    });
  }

  if (!fullYear && months > 0 && !useLastMonthRule) {
    findings.push({
      severity: "info",
      title: "The last-month rule is an alternative to proration, not an addition to it",
      detail: "Electing it replaces the prorated limit with the full annual limit, but locks in a testing period through the end of the following year. It only helps if you were (or will be) eligible on December 1 of the contribution year.",
    });
  }

  findings.push({
    severity: "info",
    title: "This is a limit calculation, not a full eligibility determination",
    detail: "This tool does not check for other disqualifying coverage (a general-purpose FSA, Medicare enrollment, being claimed as a dependent, or coverage under a spouse's non-HDHP plan), which can eliminate HSA eligibility even during otherwise-eligible months.",
  });

  return {
    coverage,
    months,
    fullYear,
    age55Plus,
    useLastMonthRule: lastMonthRuleEligible,
    baseLimit,
    catchUpLimit,
    totalLimit,
    annualLimit: bounds.annual,
    findings,
  };
}
