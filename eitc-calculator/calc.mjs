// Core arithmetic for the federal Earned Income Tax Credit (EITC) estimator
// -- IRC 32, as reflected in IRS Publication 596 and its EIC worksheets. No
// network calls: this applies published federal rules to numbers the user
// supplies. It is not a full tax return -- see README "What this does not
// cover".
//
// Verified 2026-09-25 via WebSearch against multiple independent CPA/
// payroll-firm summaries of IRS Revenue Procedure 2025-32's 2026 inflation
// adjustments, cross-checked against each other for the figures below
// (search snippets for two of the raw dollar figures disagreed -- "$664"
// vs. "$649" for the no-children maximum -- and $664 was the figure
// repeated by five independent sources against one, so $664 was used):
//
//   - The credit has three phases against EARNED INCOME (wages,
//     self-employment income -- not investment income, Social Security,
//     or unemployment): it phases IN at a fixed rate per dollar from $0,
//     plateaus at a maximum once earned income reaches the "earned income
//     amount," then phases OUT at a second fixed rate once income (see
//     below) clears a threshold, reaching $0 at a completed-phaseout
//     ceiling.
//   - All four figures (max credit, phase-in rate, earned income amount,
//     phase-out rate) depend on the number of qualifying children (0, 1,
//     2, or 3+, capped at 3+ since 3 and 4+ children share one bracket):
//     0 children: $664 max, 7.65% phase-in, $8,680 earned income amount,
//     7.65% phase-out. 1 child: $4,427 max, 34% phase-in, $13,020, 15.98%
//     phase-out. 2 children: $7,316 max, 40% phase-in, $18,290, 21.06%
//     phase-out. 3+ children: $8,231 max, 45% phase-in, $18,290 (same as
//     2 children), 21.06% phase-out (same rate as 2 children -- only the
//     max credit and phase-in rate differ from 2 children).
//   - The phase-out THRESHOLD (where phase-out begins) is the same for
//     every "has children" category (1, 2, or 3+) -- $23,890 single/head
//     of household/qualifying surviving spouse, $31,160 married filing
//     jointly -- and only the 0-children category has its own, lower
//     threshold ($10,860 single, $18,140 joint). What differs afterward is
//     the phase-out RATE and the max credit being phased out, so each
//     category still reaches $0 at a different ceiling: $19,540 (0
//     children), $51,593 (1), $58,629 (2), $62,974 (3+) single; $26,820,
//     $58,863, $65,899, $70,224 joint.
//   - The comparison most hand calculations skip: the credit is computed
//     TWICE -- once from earned income, once from adjusted gross income
//     (AGI) -- using the identical phase-in/plateau/phase-out formula for
//     each, and the FINAL credit is the SMALLER of the two results. This
//     is IRS Publication 596's own EIC Worksheet method, not a heuristic:
//     a filer with low earned income but high AGI (investment income,
//     unemployment, a working spouse's income on a joint return) can be
//     phased out by AGI even though their earned-income-only lookup would
//     suggest a much larger credit.
//   - Investment income limit: $12,200 for 2026. Exceeding it (interest,
//     dividends, capital gains, rental income) disqualifies the filer from
//     the EITC entirely, regardless of how low earned income or AGI is.
//   - No qualifying children: filer (or, on a joint return, at least one
//     spouse) must be age 25-64 at year-end, not claimed as a dependent,
//     and have lived in the US more than half the year.
//   - Married filing separately: generally NOT eligible at all -- the
//     opposite of this portfolio's own auto-loan-interest-deduction-
//     calculator, where MFS is explicitly allowed. The one exception: a
//     filer with a qualifying child who lived with them more than half the
//     year AND who lived apart from their spouse for the last six months
//     of the year (or is legally separated) CAN claim it as if single,
//     using the single/HoH thresholds -- a narrow carve-out easy to miss
//     entirely by hand.
//
// This module does not verify age, residency, relationship, or investment
// income itself -- the user enters counts and confirms checkboxes, the
// same self-reported pattern this portfolio's own child-tax-credit-
// calculator and senior-deduction-calculator use for their eligibility
// checklists.

export const INVESTMENT_INCOME_LIMIT = 12200;
export const MFS_MIN_AGE = 25;
export const MFS_MAX_AGE = 64;

export const EITC_PARAMS = [
  { children: 0, max: 664, phaseInRate: 0.0765, earnedIncomeAmount: 8680, phaseOutRate: 0.0765, thresholdSingle: 10860, thresholdJoint: 18140, ceilingSingle: 19540, ceilingJoint: 26820 },
  { children: 1, max: 4427, phaseInRate: 0.34, earnedIncomeAmount: 13020, phaseOutRate: 0.1598, thresholdSingle: 23890, thresholdJoint: 31160, ceilingSingle: 51593, ceilingJoint: 58863 },
  { children: 2, max: 7316, phaseInRate: 0.40, earnedIncomeAmount: 18290, phaseOutRate: 0.2106, thresholdSingle: 23890, thresholdJoint: 31160, ceilingSingle: 58629, ceilingJoint: 65899 },
  { children: 3, max: 8231, phaseInRate: 0.45, earnedIncomeAmount: 18290, phaseOutRate: 0.2106, thresholdSingle: 23890, thresholdJoint: 31160, ceilingSingle: 62974, ceilingJoint: 70224 },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function intCount(v) {
  const n = Math.floor(num(v));
  return n > 0 ? n : 0;
}

export function paramsFor(qualifyingChildren) {
  const capped = Math.min(3, Math.max(0, Math.floor(qualifyingChildren)));
  return EITC_PARAMS[capped];
}

// The phase-in/plateau/phase-out lookup, applied identically to earned
// income and to AGI per IRS Publication 596's EIC Worksheet method.
export function eicTableLookup(income, qualifyingChildren, isJoint) {
  const p = paramsFor(qualifyingChildren);
  const x = num(income);
  const threshold = isJoint ? p.thresholdJoint : p.thresholdSingle;
  const ceiling = isJoint ? p.ceilingJoint : p.ceilingSingle;
  if (x <= 0) return 0;
  if (x < p.earnedIncomeAmount) return x * p.phaseInRate;
  if (x <= threshold) return p.max;
  if (x >= ceiling) return 0;
  return Math.max(0, p.max - (x - threshold) * p.phaseOutRate);
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function computeEitc({
  filingStatus,
  earnedIncome,
  agi,
  investmentIncome,
  qualifyingChildren = 0,
  filerAge25to64 = false,
  livedApartFromSpouse = false,
} = {}) {
  const findings = [];
  const children = intCount(qualifyingChildren);
  const isJoint = filingStatus === 'joint';

  if (filingStatus === 'mfs') {
    const eligible = children > 0 && livedApartFromSpouse;
    if (!eligible) {
      findings.push({
        severity: 'high',
        title: 'Not eligible: married filing separately',
        detail:
          'Married filing separately generally cannot claim the EITC at all. The one exception -- a qualifying child lived with you more than half the year AND you lived apart from your spouse for the last six months of the year (or are legally separated) -- was not selected, so this return does not qualify.',
      });
      return zeroResult(findings);
    }
    findings.push({
      severity: 'info',
      title: 'Married filing separately, using the living-apart exception',
      detail:
        'Because you have a qualifying child who lived with you more than half the year and you lived apart from your spouse for the last six months of the year, this return is treated like a single filer for the EITC -- using the single/head-of-household phase-out thresholds, not the (higher) joint ones.',
    });
  }

  if (children === 0 && !filerAge25to64) {
    findings.push({
      severity: 'high',
      title: 'Not eligible: no qualifying children and outside the 25-64 age window',
      detail:
        'With no qualifying children, the filer (or, on a joint return, at least one spouse) must be age 25-64 at year-end, not claimed as a dependent, and have lived in the US more than half the year. That box was not checked, so this return does not qualify.',
    });
    return zeroResult(findings);
  }

  const investment = num(investmentIncome);
  if (investment > INVESTMENT_INCOME_LIMIT) {
    findings.push({
      severity: 'high',
      title: `Not eligible: investment income over ${money(INVESTMENT_INCOME_LIMIT)}`,
      detail: `Investment income of ${money(investment)} (interest, dividends, capital gains, rental income) exceeds the ${money(INVESTMENT_INCOME_LIMIT)} limit for 2026, which disqualifies this return from the EITC entirely -- regardless of how low earned income or AGI is.`,
    });
    return zeroResult(findings);
  }

  const earned = num(earnedIncome);
  const agiValue = num(agi) || earned;
  const useJointThresholds = isJoint;

  const creditFromEarned = eicTableLookup(earned, children, useJointThresholds);
  const creditFromAgi = agiValue === earned ? creditFromEarned : eicTableLookup(agiValue, children, useJointThresholds);
  const credit = Math.min(creditFromEarned, creditFromAgi);

  if (earned <= 0) {
    findings.push({
      severity: 'high',
      title: 'No earned income: the credit is $0',
      detail: 'The EITC is built entirely on earned income (wages or self-employment income). With none entered, there is nothing to phase in from.',
    });
    return zeroResult(findings);
  }

  if (agiValue !== earned && creditFromAgi < creditFromEarned) {
    findings.push({
      severity: 'medium',
      title: 'AGI, not earned income, is what limits this credit',
      detail: `Looked up from earned income alone, this would be ${money(creditFromEarned)}. But AGI of ${money(agiValue)} is higher than earned income and pushes the AGI-based lookup lower, to ${money(creditFromAgi)} -- and IRS Publication 596's own EIC Worksheet method takes the SMALLER of the two, so ${money(credit)} is the actual estimate. This is the detail a hand calculation using only earned income almost always misses.`,
    });
  } else {
    findings.push({
      severity: 'info',
      title: 'AGI does not reduce this credit further',
      detail: agiValue === earned
        ? 'AGI was not entered separately from earned income, so only the earned-income lookup applies.'
        : `AGI of ${money(agiValue)} does not push the credit below the earned-income lookup of ${money(creditFromEarned)}, so the earned-income figure stands.`,
    });
  }

  const p = paramsFor(children);
  const threshold = useJointThresholds ? p.thresholdJoint : p.thresholdSingle;
  const ceiling = useJointThresholds ? p.ceilingJoint : p.ceilingSingle;
  if (earned <= p.earnedIncomeAmount) {
    findings.push({
      severity: 'info',
      title: 'Still in the phase-in range',
      detail: `Earned income is below ${money(p.earnedIncomeAmount)}, so the credit is still growing at ${(p.phaseInRate * 100).toFixed(2)} cents per dollar earned -- it has not yet reached its ${money(p.max)} maximum for ${children === 3 ? '3 or more' : children} qualifying ${children === 1 ? 'child' : 'children'}.`,
    });
  } else if (earned <= threshold) {
    findings.push({
      severity: 'info',
      title: 'At the maximum credit (the plateau)',
      detail: `Earned income is between ${money(p.earnedIncomeAmount)} and ${money(threshold)}, the range where the credit stays flat at its ${money(p.max)} maximum before the income phase-out begins.`,
    });
  } else if (earned < ceiling) {
    findings.push({
      severity: 'medium',
      title: 'In the income phase-out range',
      detail: `Earned income is between ${money(threshold)} and ${money(ceiling)}, where the credit shrinks by ${(p.phaseOutRate * 100).toFixed(2)} cents for every dollar over ${money(threshold)}. It reaches $0 at ${money(ceiling)}.`,
    });
  } else {
    findings.push({
      severity: 'high',
      title: 'Fully phased out by earned income',
      detail: `Earned income of ${money(earned)} is at or above ${money(ceiling)}, where the credit for ${children === 3 ? '3 or more' : children} qualifying ${children === 1 ? 'child' : 'children'} reaches exactly $0.`,
    });
  }

  return {
    credit,
    creditFromEarned,
    creditFromAgi,
    qualifyingChildren: children,
    findings,
  };
}

function zeroResult(findings) {
  return {
    credit: 0,
    creditFromEarned: 0,
    creditFromAgi: 0,
    qualifyingChildren: 0,
    findings,
  };
}
