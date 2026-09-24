// Core arithmetic for the "Auto Loan Interest Deduction" (new "qualified
// passenger vehicle loan interest", QPVLI) estimator. No network calls: this
// applies published One Big Beautiful Bill Act (OBBBA, enacted 2025) federal
// income-tax deduction rules -- new IRC 163(h)(4) -- to numbers the user
// supplies. It is not a full tax return -- see README "What this does not
// cover".
//
// A new, above-the-line federal deduction for tax years 2025-2028: up to
// $10,000/year of interest paid on a loan for a new, personal-use passenger
// vehicle finally assembled in the United States. Verified 2026-09-24 via
// WebSearch against RSM, H&R Block, Thomson Reuters Tax & Accounting, the
// Federal Register's own proposed-regulations notice (2026-01-02), and
// several independent CPA-firm summaries, cross-checked against each other:
//
//   - Cap: $10,000/year of QUALIFIED INTEREST (not principal, not the loan
//     amount) -- and, unlike the "no tax on tips/overtime" deductions this
//     portfolio's own sibling calculator applies, the cap does NOT double
//     for a joint return. A married couple filing jointly shares ONE
//     $10,000 limit.
//   - Phase-out: reduced by $200 for every $1,000 (or part of $1,000) of
//     MAGI above $100,000 (single, head of household, OR married filing
//     separately) or $200,000 (married filing jointly) -- fully phased out
//     at $150,000 single/HoH/MFS, $250,000 joint (the statute's own
//     zero-crossing points: $10,000 / $200 per $1,000 = $50,000 of
//     headroom above each threshold).
//   - Eligibility (all required; failing ANY one zeroes the deduction):
//     the vehicle is NEW (original use begins with the taxpayer), final
//     assembly occurred in the United States, it is for PERSONAL use (not
//     a fleet purchase or a vehicle used in a trade or business), the loan
//     is secured by a first lien on the vehicle (a purchase-money auto
//     loan -- not a HELOC, credit card, or unsecured loan), it is a LOAN
//     not a LEASE, the vehicle does not carry a salvage title and was not
//     bought for scrap or parts, the vehicle is a car, minivan, van, SUV,
//     pickup truck, or motorcycle with a gross vehicle weight rating under
//     14,000 lbs (RVs and campers do NOT qualify, even when used as a
//     primary residence), and the debt was incurred after 2024-12-31.
//
// The MFS (married filing separately) treatment is the part most likely to
// be assumed wrong by anyone who has used this portfolio's own
// no-tax-on-tips-overtime-calculator first: THAT deduction excludes MFS
// entirely. This one does not -- each MFS spouse gets their own $10,000 cap,
// using the SAME $100,000/$150,000 thresholds as a single filer, on their
// own separate return. Confirmed independently via WebSearch against Drake
// Software's own practitioner knowledge base and Thomson Reuters Tax &
// Accounting, both describing per-spouse caps on separate MFS returns
// against the single-filer threshold.
//
// This module does not attempt to verify final-assembly location or GVWR
// itself -- the user confirms each eligibility item, and the page points at
// the vehicle's own window sticker / NHTSA VIN decoder, the primary sources
// a filer would actually check.

export const QPVLI_CAP = 10000;

export const PHASEOUT_THRESHOLD_OTHER = 100000; // single, head of household, MFS
export const PHASEOUT_THRESHOLD_JOINT = 200000;
export const PHASEOUT_RATE_PER_1000 = 200;

export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'joint', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
];

// Every one of these must be true or the deduction is $0. Order matches the
// checklist on the page.
export const ELIGIBILITY_CRITERIA = [
  {
    key: 'isNew',
    label: 'The vehicle is new — original use began with you (not previously titled or leased by anyone else)',
  },
  {
    key: 'finalAssemblyUs',
    label: 'Final assembly took place in the United States (check the window sticker or decode the VIN)',
  },
  {
    key: 'personalUse',
    label: 'The vehicle is for personal use — not a fleet purchase and not used in a trade or business',
  },
  {
    key: 'securedFirstLien',
    label: 'The loan is secured by a first lien on the vehicle — a purchase-money auto loan, not a HELOC, credit card, or unsecured personal loan',
  },
  {
    key: 'isLoanNotLease',
    label: 'You financed a purchase — this is a loan, not a lease',
  },
  {
    key: 'notSalvageOrParts',
    label: 'The vehicle does not have a salvage title and was not bought for scrap or parts',
  },
  {
    key: 'vehicleTypeOk',
    label: 'The vehicle is a car, minivan, van, SUV, pickup truck, or motorcycle with a gross vehicle weight rating under 14,000 lbs — RVs and campers do not qualify, even as a primary residence',
  },
  {
    key: 'debtAfter2024',
    label: 'The loan originated (debt was incurred) after December 31, 2024',
  },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function phaseoutThreshold(filingStatus) {
  return filingStatus === 'joint' ? PHASEOUT_THRESHOLD_JOINT : PHASEOUT_THRESHOLD_OTHER;
}

// $200 reduction per $1,000 of MAGI over the threshold, rounding UP to the
// next $1,000 (the statute's "or fraction thereof") -- so $100,001 of MAGI
// already costs the first $200, not $0.
export function phaseOutReduction(magi, filingStatus) {
  const threshold = phaseoutThreshold(filingStatus);
  const excess = num(magi) - threshold;
  if (excess <= 0) return 0;
  const thousands = Math.ceil(excess / 1000);
  return thousands * PHASEOUT_RATE_PER_1000;
}

function reducedCap(magi, filingStatus) {
  return Math.max(0, QPVLI_CAP - phaseOutReduction(magi, filingStatus));
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function unmetCriteria(criteria = {}) {
  return ELIGIBILITY_CRITERIA.filter((c) => !criteria[c.key]);
}

export function computeQualifiedVehicleInterestDeduction({
  interestPaid,
  filingStatus,
  magi,
  criteria = {},
  marginalRatePercent = 0,
} = {}) {
  const findings = [];
  const interest = num(interestPaid);
  const missing = unmetCriteria(criteria);

  if (missing.length > 0) {
    for (const c of missing) {
      findings.push({
        severity: 'high',
        title: `Not eligible: ${c.label.split(' — ')[0].split(' (')[0]}`,
        detail: `${c.label}. This requirement was not confirmed, so none of the interest paid qualifies for this deduction.`,
      });
    }
    return {
      deduction: 0,
      cappedByPhaseOut: false,
      estimatedSavings: 0,
      unmetCriteria: missing.map((c) => c.key),
      findings,
    };
  }

  const cap = reducedCap(magi, filingStatus);
  const cappedByPhaseOut = cap < QPVLI_CAP;

  if (cappedByPhaseOut && cap === 0) {
    findings.push({
      severity: 'high',
      title: 'Fully phased out at this income',
      detail: `At a MAGI of ${money(magi)}, the deduction is reduced to $0 (the phase-out removes $200 per $1,000 of MAGI over ${money(phaseoutThreshold(filingStatus))}).`,
    });
  } else if (cappedByPhaseOut) {
    findings.push({
      severity: 'medium',
      title: 'Reduced by the income phase-out',
      detail: `The $${QPVLI_CAP.toLocaleString()} cap is reduced by ${money(phaseOutReduction(magi, filingStatus))} at this MAGI, to a maximum of ${money(cap)}.`,
    });
  }

  const deduction = Math.min(interest, cap);

  if (interest > 0 && deduction === interest && !cappedByPhaseOut) {
    findings.push({
      severity: 'info',
      title: 'Full amount deductible before the cap or phase-out bind',
      detail: `${money(interest)} of qualified interest is under both the $${QPVLI_CAP.toLocaleString()} cap and the phase-out threshold for this filing status.`,
    });
  }

  if (filingStatus === 'mfs') {
    findings.push({
      severity: 'info',
      title: 'MFS is eligible here — unlike some other new deductions',
      detail: 'Married filing separately CAN claim this deduction (unlike the separate "no tax on tips" and "no tax on overtime" deductions, which exclude MFS entirely). Each spouse gets their own $10,000 cap on their own return, phased out using the $100,000-$150,000 single-filer thresholds.',
    });
  }

  if (filingStatus === 'joint') {
    findings.push({
      severity: 'info',
      title: 'One shared $10,000 cap for the joint return',
      detail: 'Unlike deductions that double for married filing jointly, this cap does not: a married couple filing jointly shares one $10,000 limit between them, not $10,000 each.',
    });
  }

  findings.push({
    severity: 'info',
    title: 'Federal income tax only',
    detail: 'This deduction lowers federal taxable income only. It does not reduce payroll (FICA/SECA) tax, and most states still tax the same income in full unless that state has separately chosen to conform to this federal deduction — check your state.',
  });

  const estimatedSavings = estimateTaxSavings(deduction, marginalRatePercent);

  return { deduction, cappedByPhaseOut, estimatedSavings, unmetCriteria: [], findings };
}

export function estimateTaxSavings(totalDeduction, marginalRatePercent) {
  const rate = Math.max(0, Math.min(100, num(marginalRatePercent))) / 100;
  return Math.max(0, num(totalDeduction)) * rate;
}
