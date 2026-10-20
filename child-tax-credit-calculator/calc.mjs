// Core arithmetic for the federal Child Tax Credit (CTC) / Credit for Other
// Dependents (ODC) / refundable Additional Child Tax Credit (ACTC)
// estimator, under the One Big Beautiful Bill Act (OBBBA, enacted 2025) --
// IRC 24, as reflected on Schedule 8812 (Form 1040). No network calls: this
// applies published federal rules to numbers the user supplies. It is not a
// full tax return -- see README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against the IRS's own newsroom release
// ("IRS releases tax inflation adjustments for tax year 2026, including
// amendments from the One, Big, Beautiful Bill"), Kiplinger, Jackson
// Hewitt, the Tax Policy Center, Congress.gov's CRS product on taxpayer ID
// requirements, and several independent CPA/payroll-firm summaries,
// cross-checked against each other:
//
//   - CTC: $2,200 per qualifying child under age 17 (by year-end) WITH a
//     Social Security number valid for employment -- OBBBA permanently
//     raised this from $2,000 starting tax year 2025, now inflation-indexed
//     (unchanged for 2026: still $2,200, Rev. Proc. 2025-32).
//   - ODC ("credit for other dependents"): $500 per OTHER dependent who
//     does not meet the CTC's age/SSN test -- a child with only an ITIN
//     instead of an SSN, a dependent who turned 17 during the year, or a
//     qualifying relative (e.g. an aging parent). Entirely nonrefundable,
//     unlike the CTC's ACTC portion below.
//   - Filer SSN requirement (the OBBBA change most likely to surprise a
//     visitor): the TAXPAYER (and, on a joint return, at least one spouse)
//     must also have a valid SSN to claim EITHER credit -- a couple filing
//     jointly where both spouses hold only an ITIN cannot claim the CTC or
//     ODC at all, even for a child who has a valid SSN.
//   - Phase-out: the COMBINED CTC + ODC total is reduced $50 for every
//     $1,000 (or part of $1,000) of MAGI above $200,000 (single, head of
//     household, qualifying surviving spouse, OR married filing separately)
//     or $400,000 (married filing jointly) -- the same stepped, round-up
//     rounding rule as this portfolio's own
//     auto-loan-interest-deduction-calculator, but a flat $50/$1,000 rate
//     here rather than that calculator's $200/$1,000.
//   - Refundable ACTC: the CTC portion (never the ODC portion) not used to
//     offset tax liability can be refunded, capped at the SMALLEST of (a)
//     $1,700 per qualifying child, (b) 15% of earned income over $2,500,
//     and (c) the CTC actually remaining after the phase-out above. This
//     tool does not model total tax liability (no other income, deductions,
//     or credits are collected), so the figure it reports is a CEILING --
//     the most that could be refunded if the entire post-phase-out CTC was
//     unneeded to offset tax owed -- not a guaranteed refund amount.
//   - Unlike the senior deduction, MFS is NOT excluded here -- each MFS
//     spouse claims their own dependents, phasing out against the
//     single/HoH threshold rather than being denied outright.
//   - Permanent under OBBBA (unlike the temporary 2025-2028 senior
//     deduction and auto-loan-interest deduction) -- no sunset year.
//
// How the combined phase-out reduction splits between the CTC and ODC
// pools below (needed only to isolate how much of the surviving credit is
// CTC-eligible for the ACTC refund, since ODC is never refundable): the
// dollar reduction is a flat function of MAGI and filing status alone, the
// SAME number regardless of how the total is composed between CTC and ODC.
// That means it is mathematically equivalent to the IRS's own "Credit
// Limit Worksheet B" residual method (which isolates the CTC-only share by
// computing what the credit would have been with zero qualifying children)
// to instead apply the reduction against the ODC pool first, then any
// leftover against the CTC pool -- not an approximation, an identity: for
// any split of one flat deduction across two pools, reducing pool A first
// and spilling the remainder into pool B always yields the same combined
// total as reducing the sum directly, and matches the worksheet's ODC-only
// counterfactual exactly because ODC-only and combined share the same flat
// reduction number.
//
// This module does not verify SSNs, ITINs, ages, or relationships itself
// -- the user enters counts and confirms the filer-SSN checkbox, the same
// self-reported pattern this portfolio's own senior-deduction-calculator
// and auto-loan-interest-deduction-calculator use for their eligibility
// checklists.

export const CTC_PER_CHILD = 2200;
export const ODC_PER_DEPENDENT = 500;
export const ACTC_CAP_PER_CHILD = 1700;
export const EARNED_INCOME_FLOOR = 2500;
export const ACTC_RATE = 0.15;

export const PHASEOUT_THRESHOLD_OTHER = 200000; // single, head of household, qualifying surviving spouse, MFS
export const PHASEOUT_THRESHOLD_JOINT = 400000;
export const PHASEOUT_RATE_PER_1000 = 50;

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

function intCount(v) {
  const n = Math.floor(num(v));
  return n > 0 ? n : 0;
}

export function phaseoutThreshold(filingStatus) {
  return filingStatus === 'joint' ? PHASEOUT_THRESHOLD_JOINT : PHASEOUT_THRESHOLD_OTHER;
}

// $50 reduction per $1,000 (or part of $1,000) of MAGI over the threshold,
// rounding UP to the next whole $1,000 -- the statute's own "or fraction
// thereof" language, so even $1 over the threshold costs a full $50.
export function phaseOutReduction(magi, filingStatus) {
  const threshold = phaseoutThreshold(filingStatus);
  const excess = num(magi) - threshold;
  if (excess <= 0) return 0;
  const thousands = Math.ceil(excess / 1000);
  return thousands * PHASEOUT_RATE_PER_1000;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function computeChildTaxCredit({
  filingStatus,
  magi,
  earnedIncome,
  qualifyingChildren = 0,
  otherDependents = 0,
  filerHasSsn = false,
} = {}) {
  const findings = [];
  const children = intCount(qualifyingChildren);
  const others = intCount(otherDependents);

  if (!filerHasSsn) {
    findings.push({
      severity: 'high',
      title: 'Not eligible: no valid Social Security number on the return',
      detail:
        'The taxpayer (and, on a joint return, at least one spouse) must have a Social Security number valid for employment to claim either credit -- an OBBBA change. A couple where both spouses hold only an ITIN cannot claim the Child Tax Credit or the Credit for Other Dependents at all, even for a child who has a valid SSN.',
    });
    return zeroResult(findings);
  }

  const grossCtc = children * CTC_PER_CHILD;
  const grossOdc = others * ODC_PER_DEPENDENT;
  const grossTotal = grossCtc + grossOdc;

  if (grossTotal === 0) {
    findings.push({
      severity: 'high',
      title: 'No qualifying children or other dependents entered',
      detail: 'Enter at least one qualifying child (under 17, with an SSN) or other dependent to see an estimate.',
    });
    return zeroResult(findings);
  }

  const reduction = phaseOutReduction(magi, filingStatus);
  const odcAfter = Math.max(0, grossOdc - reduction);
  const remainingReduction = Math.max(0, reduction - grossOdc);
  const ctcAfter = Math.max(0, grossCtc - remainingReduction);
  const totalAfter = ctcAfter + odcAfter;
  const fullyPhasedOut = grossTotal > 0 && totalAfter === 0;

  if (fullyPhasedOut) {
    findings.push({
      severity: 'high',
      title: 'Fully phased out at this income',
      detail: `At a MAGI of ${money(magi)}, the combined ${money(grossTotal)} gross credit is reduced to $0 -- the phase-out subtracts $${PHASEOUT_RATE_PER_1000} for every $1,000, or part of $1,000, of MAGI over ${money(phaseoutThreshold(filingStatus))}, and this return's MAGI is far enough over that line to exhaust it.`,
    });
  } else if (reduction > 0) {
    findings.push({
      severity: 'medium',
      title: 'Reduced by the income phase-out',
      detail: `The combined credit is reduced by ${money(reduction)} at this MAGI (rounding up to the next $1,000 over the ${money(phaseoutThreshold(filingStatus))} threshold), from ${money(grossTotal)} to ${money(totalAfter)}.`,
    });
  } else {
    findings.push({
      severity: 'info',
      title: 'Full amount before the income phase-out binds',
      detail: `${money(grossTotal)} is under the phase-out threshold for this filing status -- no reduction applies.`,
    });
  }

  if (others > 0) {
    findings.push({
      severity: 'info',
      title: `${money(grossOdc)} of this is the Credit for Other Dependents, not the CTC`,
      detail:
        'The $500-per-dependent Credit for Other Dependents (children with only an ITIN, dependents who turned 17 during the year, or other qualifying relatives) is entirely nonrefundable -- unlike the Child Tax Credit, none of it can come back as a refund through the Additional Child Tax Credit below.',
    });
  }

  const earned = num(earnedIncome);
  const earnedIncomeBasis = Math.max(0, earned - EARNED_INCOME_FLOOR);
  const actcByEarnedIncome = earnedIncomeBasis * ACTC_RATE;
  const actcByChildCap = children * ACTC_CAP_PER_CHILD;
  const maxRefundable = Math.min(ctcAfter, actcByEarnedIncome, actcByChildCap);

  if (children > 0 && earned < EARNED_INCOME_FLOOR) {
    findings.push({
      severity: 'medium',
      title: 'No refundable Additional Child Tax Credit: earned income under $2,500',
      detail: `The refundable ACTC requires at least ${money(EARNED_INCOME_FLOOR)} of earned income for the year (wages, self-employment income -- not investment income or benefits). Below that floor, any unused Child Tax Credit is simply lost, not refunded.`,
    });
  } else if (children > 0 && maxRefundable > 0) {
    findings.push({
      severity: 'info',
      title: `Up to ${money(maxRefundable)} could be refundable (Additional Child Tax Credit)`,
      detail: `This is a CEILING, not a guaranteed refund: it is the smallest of $1,700 per qualifying child (${money(actcByChildCap)}), 15% of earned income over $2,500 (${money(actcByEarnedIncome)}), and the ${money(ctcAfter)} of Child Tax Credit remaining after the phase-out. The actual refund is whatever this leftover amount is AFTER first using as much of the credit as possible to offset tax owed -- this tool does not model total tax liability, so if you expect little or no tax owed, the real refund is closer to this ceiling; if you expect a large tax bill, most or all of the credit may be used nonrefundably instead and never reach this refundable step.`,
    });
  }

  findings.push({
    severity: 'info',
    title: 'Permanent under OBBBA -- no scheduled expiration',
    detail:
      'Unlike this portfolio\'s own temporary senior-deduction-calculator and auto-loan-interest-deduction-calculator (both sunset after 2028), the OBBBA changes to the Child Tax Credit have no scheduled expiration year.',
  });

  if (filingStatus === 'mfs') {
    findings.push({
      severity: 'info',
      title: 'Married filing separately is allowed here',
      detail:
        'Unlike this portfolio\'s own senior-deduction-calculator, which excludes married filing separately entirely, MFS filers CAN claim the Child Tax Credit and Credit for Other Dependents -- each spouse claims the dependents they support, phasing out against the same $200,000 threshold a single filer uses (not the $400,000 joint threshold).',
    });
  }

  return {
    grossCtc,
    grossOdc,
    grossTotal,
    reduction,
    ctcAfter,
    odcAfter,
    totalAfter,
    maxRefundable: children > 0 ? Math.max(0, maxRefundable) : 0,
    nonrefundableRemaining: Math.max(0, totalAfter - (children > 0 ? Math.max(0, maxRefundable) : 0)),
    qualifyingChildren: children,
    otherDependents: others,
    findings,
  };
}

function zeroResult(findings) {
  return {
    grossCtc: 0,
    grossOdc: 0,
    grossTotal: 0,
    reduction: 0,
    ctcAfter: 0,
    odcAfter: 0,
    totalAfter: 0,
    maxRefundable: 0,
    nonrefundableRemaining: 0,
    qualifyingChildren: 0,
    otherDependents: 0,
    findings,
  };
}
