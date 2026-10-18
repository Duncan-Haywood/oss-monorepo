// Core arithmetic for the "Trump Account" (federal child savings account,
// One Big Beautiful Bill Act / OBBBA, IRC 26 U.S.C. 530A) growth and
// withdrawal-tax estimator. No network calls: this applies published federal
// rules to numbers the user supplies. It is not a full tax return -- see
// README "What this does not cover".
//
// Verified 2026-09-24 via WebSearch against Ameriprise Financial, Sikich,
// BDO's summary of the IRS's initial Trump Account guidance, Surgent CPE,
// Alloy Silverstein, the Journal of Accountancy's and The Tax Adviser's
// coverage of the proposed section 128 employer-contribution regulations,
// Mercer Advisors, Seyfarth Shaw, the Treasury Department's own press
// release on employer contributions, and TaxSharkInc's worked withdrawal
// examples, cross-checked against each other:
//
//   - A federal $1,000 pilot deposit is credited once per eligible child --
//     a US citizen born 2025 through 2028 -- and does NOT count against the
//     annual contribution cap below.
//   - Anyone (parents, grandparents, other relatives, friends) may
//     contribute up to $5,000/year combined, for 2026 and 2027, indexed for
//     inflation in $100 increments starting 2028. This calculator applies
//     the $5,000 figure to every projected year, which understates future
//     caps once indexing begins -- a conservative simplification, not an
//     error in either direction that would overstate what a saver can put
//     in.
//   - An employer may contribute up to $2,500/year per employee, excluded
//     from that employee's federal taxable income (though still subject to
//     payroll tax) under new IRC section 128 -- and that $2,500 counts
//     *inside*, not on top of, the $5,000 total annual cap.
//   - No distributions of any kind are permitted before the account owner
//     turns 18. From 18 on, the account is taxed like a traditional IRA:
//     the 10% early-withdrawal penalty applies until age 59 1/2, unless the
//     withdrawal is for a use the traditional-IRA penalty exceptions
//     already recognize (qualified higher education expenses, a first home
//     purchase, certain disability, birth/adoption expenses, and similar).
//   - Withdrawals follow the IRA pro-rata basis rule, and this is the
//     mechanic most likely to surprise someone comparing this account to a
//     529 plan: money contributed by parents, grandparents, or other
//     individuals is "basis" and comes out tax-free. The $1,000 federal
//     seed deposit and any employer (section 128) contributions create NO
//     basis -- every dollar of those, plus ALL investment growth on the
//     entire account, is taxed as ordinary income when withdrawn. Every
//     withdrawal is part tax-free and part taxable, in the same ratio as
//     basis is to the total account value -- a saver cannot choose to
//     withdraw "just the basis" first.
//
// This module does not attempt to verify citizenship, birth year, or
// eligibility itself -- the user confirms each item, and the page points at
// the IRS's own published guidance as the primary source to check.

export const SEED_DEPOSIT = 1000;
export const SEED_ELIGIBLE_BIRTH_YEAR_MIN = 2025;
export const SEED_ELIGIBLE_BIRTH_YEAR_MAX = 2028;

// 2026-2027 figure; Congress indexes this in $100 increments starting 2028.
// Applying it flat to every projected year is deliberately conservative.
export const ANNUAL_CONTRIBUTION_CAP = 5000;
export const EMPLOYER_CONTRIBUTION_CAP = 2500; // counts INSIDE the cap above

export const EARLY_WITHDRAWAL_PENALTY_RATE = 0.10;
export const PENALTY_FREE_AGE = 59.5;
export const MINIMUM_DISTRIBUTION_AGE = 18;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function clampInt(v, lo, hi, fallback) {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, n));
}

function clampPercent(v, lo = 0, hi = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Splits a requested annual family + employer contribution into what the
 * statute actually allows: the employer's own $2,500 sub-cap first, then
 * whatever room is left under the shared $5,000 total for family money.
 */
export function clipAnnualContributions(familyAmount, employerAmount) {
  const requestedFamily = num(familyAmount);
  const requestedEmployer = num(employerAmount);
  const employer = Math.min(requestedEmployer, EMPLOYER_CONTRIBUTION_CAP);
  const familyRoom = Math.max(0, ANNUAL_CONTRIBUTION_CAP - employer);
  const family = Math.min(requestedFamily, familyRoom);
  return {
    family,
    employer,
    total: family + employer,
    familyClipped: requestedFamily > family,
    employerClipped: requestedEmployer > employer,
  };
}

export function projectTrumpAccount({
  currentAge = 0,
  withdrawalAge = 18,
  seedEligible = true,
  annualFamilyContribution = 0,
  annualEmployerContribution = 0,
  annualReturnPercent = 6,
  marginalTaxRatePercent = 0,
  qualifiedUse = false,
} = {}) {
  const findings = [];

  const startAge = clampInt(currentAge, 0, 18, 0);
  let withdrawal = clampInt(withdrawalAge, MINIMUM_DISTRIBUTION_AGE, 120, MINIMUM_DISTRIBUTION_AGE);
  if (Number(withdrawalAge) < MINIMUM_DISTRIBUTION_AGE) {
    findings.push({
      severity: 'high',
      title: 'Withdrawal age raised to 18',
      detail: 'Trump Accounts allow no distribution of any kind — not even of the account owner’s own contributions — before the account owner turns 18. The withdrawal age used below has been raised to 18.',
    });
  }
  if (withdrawal < startAge) withdrawal = startAge;

  const years = Math.max(0, withdrawal - startAge);

  const { family: familyPerYear, employer: employerPerYear, familyClipped, employerClipped } =
    clipAnnualContributions(annualFamilyContribution, annualEmployerContribution);

  if (familyClipped || employerClipped) {
    findings.push({
      severity: 'medium',
      title: 'Annual contribution reduced to the statutory cap',
      detail: `Family and employer money together cannot exceed ${money(ANNUAL_CONTRIBUTION_CAP)}/year (the 2026-2027 figure; indexed in $100 increments from 2028), and the employer portion alone cannot exceed ${money(EMPLOYER_CONTRIBUTION_CAP)}/year. This projects ${money(familyPerYear)} family + ${money(employerPerYear)} employer per year instead of what was entered.`,
    });
  }

  const rate = clampPercent(annualReturnPercent, -50, 50) / 100;

  let balance = 0;
  let basis = 0; // family/individual contributions only -- what comes out tax-free
  let nonBasis = 0; // seed + employer contributions -- fully taxable on the way out

  if (seedEligible) {
    balance += SEED_DEPOSIT;
    nonBasis += SEED_DEPOSIT;
  }

  for (let i = 0; i < years; i += 1) {
    balance += familyPerYear + employerPerYear;
    basis += familyPerYear;
    nonBasis += employerPerYear;
    balance *= 1 + rate;
  }

  const totalContributed = basis + nonBasis;
  const totalGrowth = Math.max(0, balance - totalContributed);

  const taxFreeFraction = balance > 0 ? Math.min(1, basis / balance) : 0;
  const taxFreeAmount = balance * taxFreeFraction;
  const taxableAmount = Math.max(0, balance - taxFreeAmount);

  const taxRate = clampPercent(marginalTaxRatePercent) / 100;
  const incomeTax = taxableAmount * taxRate;

  const isPenaltyFree = qualifiedUse || withdrawal >= PENALTY_FREE_AGE;
  const penalty = isPenaltyFree ? 0 : taxableAmount * EARLY_WITHDRAWAL_PENALTY_RATE;
  const netAfterTax = Math.max(0, balance - incomeTax - penalty);

  if (seedEligible) {
    findings.push({
      severity: 'info',
      title: 'Federal $1,000 seed deposit included',
      detail: `The one-time ${money(SEED_DEPOSIT)} federal pilot deposit is included and does not create basis — like the growth on the account, it is taxed as ordinary income when withdrawn, not tax-free.`,
    });
  } else {
    findings.push({
      severity: 'info',
      title: 'No federal seed deposit',
      detail: `Only a US citizen born ${SEED_ELIGIBLE_BIRTH_YEAR_MIN}-${SEED_ELIGIBLE_BIRTH_YEAR_MAX} receives the one-time ${money(SEED_DEPOSIT)} pilot deposit. A Trump Account can still be opened and funded for any US citizen under 18 without it.`,
    });
  }

  findings.push({
    severity: 'medium',
    title: 'Withdrawals are pro-rata, not "basis first"',
    detail: `${money(basis)} of the projected balance is basis (money contributed by individuals) and comes out tax-free. The rest — the ${money(nonBasis)} in seed/employer money plus ${money(totalGrowth)} of growth — is fully taxable. You cannot choose to withdraw the tax-free basis first: at this balance, ${(taxFreeFraction * 100).toFixed(1)}% of ANY withdrawal is tax-free and ${(100 - taxFreeFraction * 100).toFixed(1)}% is taxable, every time, until the account is empty.`,
  });

  if (!isPenaltyFree) {
    findings.push({
      severity: 'high',
      title: '10% early-withdrawal penalty applies',
      detail: `Withdrawing before age ${PENALTY_FREE_AGE} for a use that is not one of the recognized exceptions (qualified higher education, a first home purchase, certain disability, birth/adoption expenses, and similar) adds a 10% penalty on top of ordinary income tax — but only on the taxable ${money(taxableAmount)} portion, never on the tax-free basis.`,
    });
  } else if (qualifiedUse) {
    findings.push({
      severity: 'info',
      title: 'Penalty waived for a recognized use',
      detail: 'The 10% early-withdrawal penalty does not apply to a use the traditional-IRA penalty exceptions already recognize. Ordinary income tax on the taxable portion still applies — a waived penalty is not a tax-free withdrawal.',
    });
  } else {
    findings.push({
      severity: 'info',
      title: `No penalty — withdrawing at or after age ${PENALTY_FREE_AGE}`,
      detail: 'The 10% early-withdrawal penalty only applies before this age. Ordinary income tax on the taxable portion still applies.',
    });
  }

  if (employerPerYear > 0) {
    findings.push({
      severity: 'info',
      title: 'Employer contributions still owe payroll tax',
      detail: 'Section 128 excludes an employer’s Trump Account contribution from the employee’s federal INCOME tax, but it is still generally subject to payroll (FICA) tax, unlike a traditional pre-tax retirement contribution.',
    });
  }

  findings.push({
    severity: 'info',
    title: 'Federal income tax only, and no contributions before July 4, 2026',
    detail: 'This estimates federal income tax on withdrawal only — state tax treatment varies and most states have not yet ruled on it. Separately, by statute, no contribution of any kind (family, employer, or the federal seed) could be made to any Trump Account before July 4, 2026.',
  });

  return {
    years,
    withdrawalAgeUsed: withdrawal,
    familyPerYear,
    employerPerYear,
    balance,
    basis,
    nonBasis,
    totalContributed,
    totalGrowth,
    taxFreeFraction,
    taxFreeAmount,
    taxableAmount,
    incomeTax,
    penalty,
    netAfterTax,
    isPenaltyFree,
    findings,
  };
}
