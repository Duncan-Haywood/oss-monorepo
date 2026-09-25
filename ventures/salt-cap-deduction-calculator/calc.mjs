// Core arithmetic for the SALT (state and local tax) deduction cap
// calculator. No network calls: this applies the published One Big
// Beautiful Bill Act (OBBBA, enacted 2025) amendment to IRC 164(b)(6) to
// numbers the user supplies. It is not a full tax return -- see README
// "What this does not cover".
//
// For tax years 2025 through 2029, the federal cap on the itemized
// deduction for state and local taxes (SALT) rises from the prior flat
// $10,000 to $40,000 ($20,000 married filing separately), then phases DOWN
// (not out) for high earners, then reverts to a flat $10,000 starting 2030.
// Verified 2026-09-25 via WebSearch against Kiplinger, Venable LLP, Thomson
// Reuters Tax & Accounting, the Bipartisan Policy Center, and several
// independent CPA-firm summaries (Anchin, HCVT, Creative Planning, Maxwell
// Locke & Ritter, Harper & Company Plus), cross-checked against the IRS's
// own tax-year-2026 inflation-adjustment release ("IRS releases tax
// inflation adjustments for tax year 2026, including amendments from the
// One, Big, Beautiful Bill", irs.gov/newsroom):
//
//   - Base cap: $40,000 for 2025 ($20,000 married filing separately, MFS).
//     The IRS's own 2026 release confirms $40,400 ($20,200 MFS) for 2026 --
//     exactly the 2025 figure plus 1%, matching the statute's own indexing
//     rule below.
//   - Phase-DOWN (never phases fully to $0): the cap is reduced by 30% of
//     the amount MAGI exceeds $500,000 ($250,000 MFS) for 2025, or $505,000
//     ($252,500 MFS) for 2026 -- but never below a FLOOR of $10,000 ($5,000
//     MFS), which is the pre-OBBBA cap. A taxpayer at or above roughly
//     $600,000 MAGI ($300,000 MFS) in 2025 gets no benefit from the
//     increase at all and is back to the flat $10,000 cap -- confirmed
//     independently by multiple sources' own worked examples.
//   - Both the cap and the MAGI threshold are indexed +1%/year for tax
//     years 2026 through 2029. The IRS has published official figures only
//     through 2026 as of this writing; 2027-2029 are PROJECTED here by
//     applying the statute's own 1%/year formula to the confirmed 2026
//     base and rounding to the nearest dollar. This module marks those
//     years `confirmed: false` and the page says so -- they are not an
//     authoritative IRS figure.
//   - The expanded cap and its phase-down both end after tax year 2029:
//     for 2030 and later, under current law, the cap reverts to a flat
//     $10,000 ($5,000 MFS) with NO income-based phase-down at all -- the
//     same cap the pre-2025 Tax Cuts and Jobs Act imposed.
//
// This module does not model state-level pass-through entity tax (PTET)
// workarounds, which many states offer separately to business owners on
// the business's own return, unaffected by this individual-return cap --
// see README "What this does not cover".

export const FIRST_YEAR = 2025;
export const LAST_PHASEDOWN_YEAR = 2029;
export const REVERT_YEAR = 2030;
export const PHASEDOWN_RATE = 0.30;
export const ANNUAL_INDEX_RATE = 0.01;

// IRS-confirmed cap/threshold/floor per tax year, joint/single/HoH figures.
// 2025 is the statute's own base year; 2026 is the IRS's own published
// inflation adjustment.
const CONFIRMED = {
  2025: { cap: 40000, threshold: 500000, floor: 10000 },
  2026: { cap: 40400, threshold: 505000, floor: 10000 },
};

// Married filing separately gets exactly half of every figure above, which
// the IRS's own 2026 release confirms exactly ($20,200 / $252,500).
const MFS_CONFIRMED = {
  2025: { cap: 20000, threshold: 250000, floor: 5000 },
  2026: { cap: 20200, threshold: 252500, floor: 5000 },
};

export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'joint', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
];

export const TAX_YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function round(n) {
  return Math.round(n);
}

function table(filingStatus) {
  return filingStatus === 'mfs' ? MFS_CONFIRMED : CONFIRMED;
}

function projectedParams(filingStatus, year) {
  const base = table(filingStatus)[2026];
  let cap = base.cap;
  let threshold = base.threshold;
  for (let y = 2027; y <= year; y++) {
    cap = round(cap * (1 + ANNUAL_INDEX_RATE));
    threshold = round(threshold * (1 + ANNUAL_INDEX_RATE));
  }
  return { cap, threshold, floor: base.floor };
}

/**
 * The cap, phase-down threshold, and floor for a given tax year and filing
 * status. `confirmed: false` means the year is beyond the IRS's own
 * published figures and this is a projection from the statute's formula.
 * `phaseDownApplies: false` means the year has reverted to the flat,
 * pre-OBBBA cap with no income test at all.
 */
export function saltCapParameters(year, filingStatus) {
  const y = Math.round(num(year)) || FIRST_YEAR;
  if (y >= REVERT_YEAR) {
    const floor = filingStatus === 'mfs' ? 5000 : 10000;
    return { cap: floor, threshold: null, floor, confirmed: true, phaseDownApplies: false };
  }
  const t = table(filingStatus);
  if (t[y]) {
    return { ...t[y], confirmed: true, phaseDownApplies: true };
  }
  const clamped = Math.min(Math.max(y, FIRST_YEAR), LAST_PHASEDOWN_YEAR);
  return { ...projectedParams(filingStatus, clamped), confirmed: false, phaseDownApplies: true };
}

/** Dollar reduction to the cap from the 30%-of-excess-MAGI phase-down, before the floor is applied. */
export function phaseDownReduction(magi, year, filingStatus) {
  const params = saltCapParameters(year, filingStatus);
  if (!params.phaseDownApplies) return 0;
  const excess = num(magi) - params.threshold;
  if (excess <= 0) return 0;
  return excess * PHASEDOWN_RATE;
}

/** The actual cap after phase-down and the floor -- what a filer can deduct up to. */
export function allowedSaltCap(magi, year, filingStatus) {
  const params = saltCapParameters(year, filingStatus);
  if (!params.phaseDownApplies) return params.floor;
  const reduction = phaseDownReduction(magi, year, filingStatus);
  return Math.max(params.floor, params.cap - reduction);
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function computeSaltCapDeduction({ saltPaid, magi, year, filingStatus } = {}) {
  const params = saltCapParameters(year, filingStatus);
  const cap = allowedSaltCap(magi, year, filingStatus);
  const paid = num(saltPaid);
  const deduction = Math.min(paid, cap);
  const disallowed = Math.max(0, paid - deduction);
  const findings = [];

  if (!params.phaseDownApplies) {
    findings.push({
      severity: 'medium',
      title: `The cap has reverted to a flat $${cap.toLocaleString()} for ${year}`,
      detail: `Under current law, the OBBBA's expanded SALT cap and its income phase-down apply only through tax year ${LAST_PHASEDOWN_YEAR}. For ${year}, the cap reverts to a flat $${params.floor.toLocaleString()} with no income-based reduction at all -- the same cap that applied before 2025.`,
    });
  } else {
    const reduction = phaseDownReduction(magi, year, filingStatus);
    if (cap === params.floor && reduction > 0) {
      findings.push({
        severity: 'high',
        title: 'Fully phased down to the floor',
        detail: `At a MAGI of ${money(magi)}, the 30%-of-excess phase-down reduces the ${money(params.cap)} cap all the way to its ${money(params.floor)} floor -- the same as the pre-2025 cap. Earning more MAGI does not reduce the cap any further; it stays at the floor.`,
      });
    } else if (reduction > 0) {
      findings.push({
        severity: 'medium',
        title: 'Reduced by the income phase-down',
        detail: `The ${money(params.cap)} cap is reduced by ${money(reduction)} at this MAGI (30% of the ${money(num(magi) - params.threshold)} over the ${money(params.threshold)} threshold), to a maximum of ${money(cap)}.`,
      });
    } else {
      findings.push({
        severity: 'info',
        title: 'Full cap available -- below the phase-down threshold',
        detail: `At a MAGI of ${money(magi)}, none of the ${money(params.cap)} cap is phased down. The phase-down only starts once MAGI exceeds ${money(params.threshold)}.`,
      });
    }
    if (!params.confirmed) {
      findings.push({
        severity: 'medium',
        title: `${year} figures are projected, not yet IRS-published`,
        detail: `The IRS has published official cap and threshold figures only through tax year 2026. This ${year} figure applies the statute's own 1%-per-year indexing formula to the confirmed 2026 base and rounds to the nearest dollar -- treat it as an estimate until the IRS publishes its own Revenue Procedure for ${year}.`,
      });
    }
  }

  if (disallowed > 0) {
    findings.push({
      severity: 'high',
      title: 'Some SALT paid is not deductible',
      detail: `You paid ${money(paid)} in state and local taxes, but only ${money(deduction)} is deductible under the ${money(cap)} cap at this MAGI and filing status -- ${money(disallowed)} is disallowed.`,
    });
  } else if (paid > 0) {
    findings.push({
      severity: 'info',
      title: 'All of your SALT paid is deductible this year',
      detail: `${money(paid)} of state and local tax paid is fully within the ${money(cap)} cap for this MAGI and filing status.`,
    });
  }

  return {
    deduction,
    disallowed,
    cap,
    capBeforePhaseDown: params.cap,
    threshold: params.threshold,
    cappedByPhaseDown: params.phaseDownApplies && cap < params.cap,
    reverted: !params.phaseDownApplies,
    confirmed: params.confirmed,
    findings,
  };
}

/**
 * How much of the SALT deduction is genuinely additive tax benefit, versus
 * just duplicating a benefit the standard deduction would already give.
 *
 * If a filer's OTHER itemized deductions (mortgage interest, charitable
 * giving, medical expenses above the AGI floor, etc.) already exceed the
 * standard deduction on their own, every dollar of the SALT deduction is
 * pure additional benefit. If they don't, only the portion of the SALT
 * deduction that pushes total itemized deductions PAST the standard
 * deduction is doing any real work -- the rest is redundant with what a
 * filer would get anyway by taking the standard deduction and not
 * itemizing at all. This is the interaction most by-hand SALT estimates
 * skip entirely (see vs-estimating-the-salt-benefit-by-hand.html).
 */
export function marginalItemizedBenefit({ saltDeduction, otherItemizedDeductions, standardDeduction, marginalRatePercent } = {}) {
  const salt = Math.max(0, Number(saltDeduction) || 0);
  const other = num(otherItemizedDeductions);
  const standard = num(standardDeduction);
  const rate = Math.max(0, Math.min(100, num(marginalRatePercent))) / 100;

  const totalItemized = salt + other;
  const recommendItemize = totalItemized > standard;
  const excessOverStandard = Math.max(0, totalItemized - standard);

  const shortfall = Math.max(0, standard - other);
  const marginalSalt = Math.max(0, salt - shortfall);
  const marginalBenefit = marginalSalt * rate;

  return { totalItemized, recommendItemize, excessOverStandard, marginalSalt, marginalBenefit };
}

export function estimateTaxSavings(totalDeduction, marginalRatePercent) {
  const rate = Math.max(0, Math.min(100, num(marginalRatePercent))) / 100;
  return Math.max(0, num(totalDeduction)) * rate;
}
