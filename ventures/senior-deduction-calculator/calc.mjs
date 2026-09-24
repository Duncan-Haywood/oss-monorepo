// Core arithmetic for the OBBBA "senior bonus deduction" estimator. No
// network calls: this applies published federal income-tax rules -- the new
// IRC 63(f)(5)-style "additional deduction for seniors" enacted by the One
// Big Beautiful Bill Act (OBBBA, 2025) -- to numbers the user supplies. It is
// not a full tax return -- see README "What this does not cover".
//
// A new, temporary federal deduction for tax years 2025 through 2028: up to
// $6,000 per qualifying taxpayer age 65 or older, on top of (not instead of)
// the existing standard deduction and the existing extra standard deduction
// for age -- available whether or not the filer itemizes. Verified
// 2026-09-24 via WebSearch against Kiplinger, H&R Block, Thomson Reuters Tax
// & Accounting, CNBC, TurboTax, and several independent CPA-firm summaries,
// cross-checked against each other for the arithmetic that matters:
//
//   - Amount: $6,000 PER qualifying person age 65+ (by the last day of the
//     tax year), so up to $12,000 on a joint return when both spouses
//     qualify.
//   - Requirements per qualifying person: age 65 or older by December 31 of
//     the tax year, AND a work-eligible Social Security number.
//   - Married filing separately: NOT eligible, at all, regardless of income
//     or age -- a married couple must file a joint return for either spouse
//     to claim any of it. This is the OPPOSITE of this portfolio's own
//     auto-loan-interest-deduction-calculator, where MFS is explicitly
//     eligible with its own cap -- and the SAME direction as the
//     no-tax-on-tips-overtime-calculator, which also excludes MFS entirely.
//   - Phase-out: each qualifying person's $6,000 is independently reduced by
//     6% (6 cents per dollar) of MAGI above $75,000 (single, head of
//     household, or qualifying surviving spouse) or $150,000 (married
//     filing jointly) -- a continuous rate, not a stepped "per $1,000"
//     rounding rule like the auto-loan deduction's statutory language. Each
//     qualifying person's own $6,000 phases out against the SAME household
//     MAGI excess, so it reaches exactly $0 at the same MAGI regardless of
//     whether one or two spouses qualify: $175,000 single/HoH/QSS,
//     $250,000 joint (threshold + $6,000/0.06 = threshold + $100,000).
//   - Stacks with the standard deduction (or itemizing) -- this is not an
//     itemized deduction and is not conditioned on itemizing.
//   - Temporary: tax years 2025, 2026, 2027, and 2028 only, under current
//     law -- it expires afterward unless extended by a future law.
//
// This module does not verify age or Social Security number validity itself
// -- the user confirms each qualifying person, the same self-reported
// pattern this portfolio's own auto-loan-interest-deduction-calculator uses
// for its eligibility checklist.

export const SENIOR_DEDUCTION_PER_PERSON = 6000;

export const PHASEOUT_THRESHOLD_SINGLE = 75000; // single, head of household, qualifying surviving spouse
export const PHASEOUT_THRESHOLD_JOINT = 150000;
export const PHASEOUT_RATE = 0.06; // 6 cents per dollar of MAGI over the threshold

export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'qss', label: 'Qualifying surviving spouse' },
  { value: 'joint', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function phaseoutThreshold(filingStatus) {
  return filingStatus === 'joint' ? PHASEOUT_THRESHOLD_JOINT : PHASEOUT_THRESHOLD_SINGLE;
}

// The reduction applied to ONE qualifying person's $6,000 -- a continuous 6%
// of the MAGI excess over the threshold, clamped so it never exceeds the
// $6,000 it would reduce to zero.
export function perPersonReduction(magi, filingStatus) {
  const threshold = phaseoutThreshold(filingStatus);
  const excess = num(magi) - threshold;
  if (excess <= 0) return 0;
  return Math.min(SENIOR_DEDUCTION_PER_PERSON, excess * PHASEOUT_RATE);
}

export function perPersonDeduction(magi, filingStatus) {
  return Math.max(0, SENIOR_DEDUCTION_PER_PERSON - perPersonReduction(magi, filingStatus));
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function computeSeniorDeduction({
  filingStatus,
  magi,
  selfQualifies = false,
  spouseQualifies = false,
  marginalRatePercent = 0,
} = {}) {
  const findings = [];

  if (filingStatus === 'mfs') {
    findings.push({
      severity: 'high',
      title: 'Not eligible: married filing separately',
      detail:
        'The senior deduction is not available to married filing separately filers, at any income and regardless of age -- a married couple must file a joint return for either spouse to claim it. This is the opposite of this portfolio\'s own auto-loan-interest-deduction-calculator, where MFS IS eligible -- check you have the right calculator for the deduction you mean.',
    });
    return { deduction: 0, qualifyingCount: 0, cappedByPhaseOut: false, estimatedSavings: 0, findings };
  }

  const spouseEligible = filingStatus === 'joint' && Boolean(spouseQualifies);
  const qualifyingCount = (selfQualifies ? 1 : 0) + (spouseEligible ? 1 : 0);

  if (qualifyingCount === 0) {
    findings.push({
      severity: 'high',
      title: 'Not eligible: nobody on this return is a qualifying senior',
      detail:
        'Nobody was marked as age 65 or older with a work-eligible Social Security number, so this return does not qualify for the deduction. If you or your spouse turn 65 by December 31 of the tax year, check the box for that person.',
    });
    return { deduction: 0, qualifyingCount: 0, cappedByPhaseOut: false, estimatedSavings: 0, findings };
  }

  const perPerson = perPersonDeduction(magi, filingStatus);
  const cappedByPhaseOut = perPerson < SENIOR_DEDUCTION_PER_PERSON;
  const deduction = perPerson * qualifyingCount;

  if (cappedByPhaseOut && perPerson === 0) {
    findings.push({
      severity: 'high',
      title: 'Fully phased out at this income',
      detail: `At a MAGI of ${money(magi)}, the deduction is reduced to $0 (each qualifying person's $6,000 is reduced 6 cents for every dollar of MAGI over ${money(phaseoutThreshold(filingStatus))}, and reaches $0 at ${money(phaseoutThreshold(filingStatus) + SENIOR_DEDUCTION_PER_PERSON / PHASEOUT_RATE)}).`,
    });
  } else if (cappedByPhaseOut) {
    findings.push({
      severity: 'medium',
      title: 'Reduced by the income phase-out',
      detail: `Each qualifying person's $${SENIOR_DEDUCTION_PER_PERSON.toLocaleString()} is reduced by ${money(perPersonReduction(magi, filingStatus))} at this MAGI, to ${money(perPerson)} per person (${money(deduction)} total for ${qualifyingCount} ${qualifyingCount === 1 ? 'person' : 'people'}).`,
    });
  } else {
    findings.push({
      severity: 'info',
      title: 'Full amount before the income phase-out binds',
      detail: `${money(deduction)} is under the phase-out threshold for this filing status -- no reduction applies.`,
    });
  }

  if (filingStatus === 'joint' && qualifyingCount === 2) {
    findings.push({
      severity: 'info',
      title: 'Both spouses qualify -- up to $12,000 combined',
      detail:
        'Each spouse\'s own $6,000 phases out independently against the SAME household MAGI, so the combined deduction reaches $0 at the same $250,000 MAGI a one-qualifying-spouse joint return would -- it does not take longer to phase out just because two people qualify.',
    });
  }

  findings.push({
    severity: 'info',
    title: 'Stacks on top of the standard deduction, or works alongside itemizing',
    detail:
      'This deduction is available whether you take the standard deduction or itemize -- it is not an itemized deduction and does not require giving up the standard deduction to claim it.',
  });

  findings.push({
    severity: 'info',
    title: 'Temporary: tax years 2025 through 2028 only',
    detail:
      'Under current law this deduction applies to the 2025, 2026, 2027, and 2028 tax years only, and expires afterward unless a future law extends it.',
  });

  findings.push({
    severity: 'info',
    title: 'Federal income tax only',
    detail:
      'This deduction lowers federal taxable income only. It does not change Social Security taxation rules directly, does not reduce payroll (FICA/SECA) tax, and most states still tax the same income in full unless that state has separately chosen to conform to this federal deduction -- check your state.',
  });

  const estimatedSavings = estimateTaxSavings(deduction, marginalRatePercent);

  return { deduction, qualifyingCount, cappedByPhaseOut, estimatedSavings, findings };
}

export function estimateTaxSavings(totalDeduction, marginalRatePercent) {
  const rate = Math.max(0, Math.min(100, num(marginalRatePercent))) / 100;
  return Math.max(0, num(totalDeduction)) * rate;
}
