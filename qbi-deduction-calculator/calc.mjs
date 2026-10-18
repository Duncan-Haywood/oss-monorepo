// Core arithmetic for the Section 199A qualified business income (QBI)
// deduction estimator. No network calls: this applies the published federal
// formula (26 U.S.C. 199A, IRS Pub. 535/Form 8995-A instructions) to numbers
// the user supplies, for ONE qualified trade or business. It is not a full
// tax return -- see README "What this does not cover", in particular the
// multi-business netting rule this tool deliberately does not implement.
//
// The deduction is the LESSER of:
//   (a) the "combined qualified business income amount" -- 20% of QBI,
//       reduced above an income threshold for a specified service trade or
//       business (SSTB) and/or by a W-2 wage / UBIA-of-qualified-property
//       limit -- plus 20% of REIT dividends and PTP income (never limited
//       by wages or SSTB status), and
//   (b) 20% of (taxable income minus net capital gain).
//
// Below the taxable-income threshold for the filer's status, neither the
// SSTB reduction nor the wage/UBIA limit applies at all: the deduction is
// simply 20% of QBI. Above threshold + the phase-in range, an SSTB's QBI
// deduction from that business is $0, and a non-SSTB's is capped at the
// wage/UBIA limit. Inside the range, both blend proportionally by how far
// through the range taxable income sits -- the "applicable percentage" /
// "reduction ratio" method IRS's own Form 8995-A Schedule A worksheet uses.
//
// Thresholds, indexed for inflation, and the OBBBA (2026) changes:
//   - 2025 (pre-OBBBA widening): threshold $191,950 single/HoH/MFS,
//     $383,900 joint; phase-in range $50,000 single/HoH/MFS, $100,000
//     joint.
//   - 2026 on (OBBBA made the deduction permanent and widened the range):
//     threshold $201,750 single/HoH/MFS, $403,500 joint; phase-in range
//     $75,000 single/HoH/MFS, $150,000 joint. OBBBA also adds a minimum
//     deduction of $400 whenever total QBI from an active qualified trade
//     or business is at least $1,000, even if the formula above would
//     otherwise produce less -- modeled here as a floor applied to the
//     combined QBI amount, before the taxable-income-based cap in (b).
//
// Married filing separately uses the same threshold and range as single in
// this module (IRS sets the MFS threshold at half the joint figure, which
// equals the single figure in both years modeled) -- see README.

export const THRESHOLDS = {
  2025: { single: 191950, joint: 383900, rangeSingle: 50000, rangeJoint: 100000 },
  2026: {
    single: 201750, joint: 403500, rangeSingle: 75000, rangeJoint: 150000,
    minDeduction: 400, minDeductionFloor: 1000,
  },
};

export const TAX_YEARS = Object.keys(THRESHOLDS).map(Number).sort();

export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'joint', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nonNeg(v) {
  return Math.max(0, num(v));
}

export function thresholdFor(taxYear, filingStatus) {
  const table = THRESHOLDS[taxYear] || THRESHOLDS[TAX_YEARS[TAX_YEARS.length - 1]];
  const isJoint = filingStatus === 'joint';
  return {
    threshold: isJoint ? table.joint : table.single,
    range: isJoint ? table.rangeJoint : table.rangeSingle,
  };
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

export function estimateTaxSavings(deduction, marginalRatePercent) {
  const rate = Math.max(0, Math.min(100, num(marginalRatePercent))) / 100;
  return Math.max(0, num(deduction)) * rate;
}

/**
 * The QBI component from ONE qualified trade or business: 20% of QBI,
 * reduced for an SSTB and/or the W-2 wage / UBIA limit per the taxable-
 * income phase-in described above. Returns 0 (with a carryforward finding)
 * for QBI <= 0, per the statute -- a loss produces no deduction and instead
 * reduces next year's QBI from the same business.
 */
export function computeBusinessComponent({
  taxYear, filingStatus, taxableIncome, qbi, isSstb = false, w2Wages = 0, ubia = 0,
}) {
  const findings = [];
  const qbiAmount = num(qbi);
  if (qbiAmount <= 0) {
    if (qbiAmount < 0) {
      findings.push({
        severity: 'medium',
        title: 'Negative QBI carries forward, no deduction this year',
        detail: `This business's qualified business income is negative (${money(qbiAmount)}). It produces no deduction for this business this year and instead reduces the QBI this same business reports next year.`,
      });
    }
    return { component: 0, findings };
  }

  const ti = nonNeg(taxableIncome);
  const wages = nonNeg(w2Wages);
  const ubiaAmount = nonNeg(ubia);
  const { threshold, range } = thresholdFor(taxYear, filingStatus);
  const excess = Math.max(0, ti - threshold);
  const fullyBelow = excess <= 0;
  const fullyAbove = excess >= range;
  const ratio = fullyBelow ? 0 : fullyAbove ? 1 : excess / range;
  const tentative = 0.2 * qbiAmount;

  if (fullyBelow) {
    return { component: tentative, findings };
  }

  if (isSstb) {
    if (fullyAbove) {
      findings.push({
        severity: 'high',
        title: 'Specified service business, fully phased out',
        detail: `At a taxable income of ${money(ti)}, above the ${money(threshold + range)} end of the phase-in range for this filing status, a specified service trade or business (SSTB) gets $0 of QBI deduction from this business.`,
      });
      return { component: 0, findings };
    }
    const applicablePct = 1 - ratio;
    const adjQbi = qbiAmount * applicablePct;
    const adjWages = wages * applicablePct;
    const adjUbia = ubiaAmount * applicablePct;
    const wageLimit = Math.max(0.5 * adjWages, 0.25 * adjWages + 0.025 * adjUbia);
    const component = Math.min(0.2 * adjQbi, wageLimit);
    findings.push({
      severity: 'medium',
      title: 'Specified service business, partly phased out',
      detail: `At a taxable income of ${money(ti)}, ${Math.round(ratio * 100)}% through the phase-in range for this filing status, only ${Math.round(applicablePct * 100)}% of this SSTB's QBI, W-2 wages, and UBIA count before the wage/UBIA limit is applied.`,
    });
    return { component, findings };
  }

  const wageLimit = Math.max(0.5 * wages, 0.25 * wages + 0.025 * ubiaAmount);
  if (wageLimit >= tentative) {
    return { component: tentative, findings };
  }
  const overage = tentative - wageLimit;
  const component = fullyAbove ? wageLimit : tentative - overage * ratio;
  findings.push({
    severity: 'medium',
    title: fullyAbove ? 'Limited by W-2 wages / UBIA of qualified property' : 'Partly limited by W-2 wages / UBIA of qualified property',
    detail: `The greater of 50% of W-2 wages or 25% of W-2 wages plus 2.5% of UBIA is ${money(wageLimit)}, below the unlimited 20% of QBI (${money(tentative)}). ${fullyAbove ? 'Above the phase-in range, the limit applies in full.' : `At ${Math.round(ratio * 100)}% through the phase-in range, the reduction is applied proportionally.`}`,
  });
  return { component, findings };
}

/**
 * Full estimate: one business's QBI component, plus REIT dividends/PTP
 * income (never wage-limited, never SSTB-reduced), the 2026+ minimum
 * deduction floor, and the overall 20%-of-(taxable income minus net
 * capital gain) cap.
 */
export function computeQbiDeduction({
  taxYear = TAX_YEARS[TAX_YEARS.length - 1],
  filingStatus = 'single',
  taxableIncome = 0,
  netCapitalGain = 0,
  qbi = 0,
  isSstb = false,
  w2Wages = 0,
  ubia = 0,
  reitPtpIncome = 0,
  marginalRatePercent = 0,
} = {}) {
  const { component, findings } = computeBusinessComponent({
    taxYear, filingStatus, taxableIncome, qbi, isSstb, w2Wages, ubia,
  });

  const reitPtpComponent = 0.2 * nonNeg(reitPtpIncome);
  let combined = component + reitPtpComponent;

  const table = THRESHOLDS[taxYear];
  const qbiAmount = num(qbi);
  let appliedMinimum = false;
  if (table?.minDeduction && qbiAmount >= table.minDeductionFloor && combined < table.minDeduction) {
    appliedMinimum = true;
    combined = table.minDeduction;
    findings.push({
      severity: 'info',
      title: 'Minimum deduction applies',
      detail: `Starting tax year 2026 (OBBBA), a filer with at least ${money(table.minDeductionFloor)} of QBI from an active qualified trade or business can claim at least a ${money(table.minDeduction)} QBI deduction, even though the formula above alone would produce less.`,
    });
  }

  const ti = nonNeg(taxableIncome);
  const ncg = nonNeg(netCapitalGain);
  const overallLimit = 0.2 * Math.max(0, ti - ncg);
  const limitedByOverallCap = combined > overallLimit;
  const deduction = Math.max(0, Math.min(combined, overallLimit));

  if (limitedByOverallCap) {
    findings.push({
      severity: 'medium',
      title: 'Limited by the overall taxable-income cap',
      detail: `The QBI-based amount (${money(combined)}) is capped at 20% of taxable income minus net capital gain (${money(overallLimit)}), the second, independent limit the statute applies.`,
    });
  }

  if (deduction > 0 && findings.length === 0) {
    findings.push({
      severity: 'info',
      title: 'Full 20% applies, no limitation reached',
      detail: `Below the taxable-income threshold for this filing status, and under the overall cap: the deduction is the unreduced 20% of QBI.`,
    });
  }

  return {
    businessComponent: component,
    reitPtpComponent,
    combinedBeforeCap: combined,
    overallLimit,
    deduction,
    appliedMinimum,
    limitedByOverallCap,
    estimatedSavings: estimateTaxSavings(deduction, marginalRatePercent),
    findings,
  };
}
