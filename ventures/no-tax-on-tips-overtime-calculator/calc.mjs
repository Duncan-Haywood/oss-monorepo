// Core arithmetic for the "No Tax on Tips & Overtime" deduction estimator.
// No network calls: this applies published One Big Beautiful Bill Act
// (OBBBA, enacted 2025) federal income-tax deduction rules to numbers the
// user supplies. It is not a full tax return -- see README "What this does
// not cover".
//
// Two federal, above-the-line deductions, both for tax years 2025-2028
// (IRC 224 "qualified tips" and IRC 225 "qualified overtime compensation"):
//
//   - Qualified tips: up to $25,000/year, for occupations on Treasury's
//     published list of those that "customarily and regularly" receive
//     tips (final regs published 2026-04-13, effective 2026-06-12).
//   - Qualified overtime compensation: up to $12,500/year single/HoH,
//     $25,000/year married filing jointly -- and only the FLSA "half-time"
//     PREMIUM portion of overtime pay (the extra 0.5x), never the full
//     1.5x rate. This is the same regular-rate mechanic this portfolio's
//     own overtime-pay-calculator already applies (29 CFR 778.115); the
//     new part is which slice of it is deductible.
//
// Both deductions phase out together on the same MAGI schedule: reduced by
// $100 for every $1,000 (or part of $1,000) of MAGI above $150,000 single/
// head-of-household or $300,000 married filing jointly. Each deduction's
// own cap determines where IT reaches zero (tips: cap $25,000 / $100 per
// $1,000 = $250,000 of headroom, so zero at $400,000 single / $550,000
// joint; overtime single: cap $12,500 -> zero at $275,000; overtime joint:
// cap $25,000 -> zero at $550,000) -- these zero-crossing points are the
// figures independently reported by every source checked during
// graduation (IRS FAQ summaries, TurboTax, Fidelity, TaxAct, USAPaycheck),
// and are used as this module's test fixtures.
//
// Married filing separately does not qualify for either deduction.
// Neither deduction reduces AGI, self-employment tax, FICA/payroll tax, or
// state tax -- see README.
//
// Self-employed net-profit ceiling (2026-03 IRS correction): Schedule 1-A's
// instructions limit the tip deduction to net profit from the trade or
// business LESS deductions allocable to it -- the deductible part of
// self-employment tax, plus any self-employed retirement-plan or
// health-insurance deduction claimed against that business -- not raw
// Schedule C net profit. An earlier Schedule 1-A draft read as "net profit"
// alone; Forbes and Spidell both reported filers and some software
// overstating the deduction under that earlier reading. This module takes
// the three allocable amounts as separate optional inputs (each already
// computed elsewhere on the same return) rather than deriving
// self-employment tax itself, to avoid restating that computation here.

export const TIP_DEDUCTION_CAP = 25000;
export const OVERTIME_CAP_SINGLE = 12500;
export const OVERTIME_CAP_JOINT = 25000;

export const PHASEOUT_THRESHOLD_SINGLE = 150000;
export const PHASEOUT_THRESHOLD_JOINT = 300000;
export const PHASEOUT_RATE_PER_1000 = 100;

export const FILING_STATUSES = [
  { value: 'single', label: 'Single' },
  { value: 'hoh', label: 'Head of household' },
  { value: 'joint', label: 'Married filing jointly' },
  { value: 'mfs', label: 'Married filing separately' },
];

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function phaseoutThreshold(filingStatus) {
  return filingStatus === 'joint' ? PHASEOUT_THRESHOLD_JOINT : PHASEOUT_THRESHOLD_SINGLE;
}

// $100 reduction per $1,000 of MAGI over the threshold, rounding UP to the
// next $1,000 (the statute's "or fraction thereof") -- so $150,001 of MAGI
// already costs the first $100, not $0.
export function phaseOutReduction(magi, filingStatus) {
  const threshold = phaseoutThreshold(filingStatus);
  const excess = num(magi) - threshold;
  if (excess <= 0) return 0;
  const thousands = Math.ceil(excess / 1000);
  return thousands * PHASEOUT_RATE_PER_1000;
}

function reducedCap(cap, magi, filingStatus) {
  return Math.max(0, cap - phaseOutReduction(magi, filingStatus));
}

export function computeQualifiedTipDeduction({
  qualifiedTips,
  filingStatus,
  magi,
  isSelfEmployed = false,
  netProfitFromTippedWork = null,
  seTaxDeduction = null,
  seHealthInsuranceDeduction = null,
  seRetirementContribution = null,
} = {}) {
  const findings = [];
  const tips = num(qualifiedTips);

  if (filingStatus === 'mfs') {
    findings.push({
      severity: 'high',
      title: 'Married filing separately does not qualify',
      detail: 'The qualified-tips deduction is unavailable to a married-filing-separately return. File jointly to claim it, if eligible.',
    });
    return { deduction: 0, cappedByPhaseOut: false, cappedByNetProfit: false, findings };
  }

  let cap = reducedCap(TIP_DEDUCTION_CAP, magi, filingStatus);
  const cappedByPhaseOut = cap < TIP_DEDUCTION_CAP;
  if (cappedByPhaseOut && cap === 0) {
    findings.push({
      severity: 'high',
      title: 'Fully phased out at this income',
      detail: `At a MAGI of ${money(magi)}, the tip deduction is reduced to $0 (the phase-out removes $100 per $1,000 of MAGI over ${money(phaseoutThreshold(filingStatus))}).`,
    });
  } else if (cappedByPhaseOut) {
    findings.push({
      severity: 'medium',
      title: 'Reduced by the income phase-out',
      detail: `The $${TIP_DEDUCTION_CAP.toLocaleString()} cap is reduced by ${money(phaseOutReduction(magi, filingStatus))} at this MAGI, to a maximum of ${money(cap)}.`,
    });
  }

  let deduction = Math.min(tips, cap);
  let cappedByNetProfit = false;
  if (isSelfEmployed && netProfitFromTippedWork !== null && netProfitFromTippedWork !== '' && Number.isFinite(Number(netProfitFromTippedWork))) {
    let netProfit = Math.max(0, Number(netProfitFromTippedWork));

    // Schedule 1-A's own instructions limit the deduction to gross income
    // from the trade or business LESS other deductions allocable to it --
    // not raw Schedule C net profit. The IRS clarified this a full month
    // into the 2025 filing season (2026-03), after an earlier Schedule 1-A
    // draft read as "net profit" alone: allocable deductions include the
    // deductible part of self-employment tax and, where claimed against
    // this business, the self-employed retirement-plan and health-insurance
    // deductions. All three are entered elsewhere on the same return, so
    // this only subtracts figures the filer already has -- it does not
    // compute self-employment tax itself.
    const allocable = num(seTaxDeduction) + num(seHealthInsuranceDeduction) + num(seRetirementContribution);
    if (allocable > 0) {
      const reduced = Math.max(0, netProfit - allocable);
      findings.push({
        severity: 'medium',
        title: 'Net-profit ceiling reduced by allocable deductions',
        detail: `Schedule 1-A's instructions cap the deduction at net profit LESS deductions allocable to this business -- the deductible part of self-employment tax, plus any self-employed retirement-plan or health-insurance deduction claimed against it. ${money(netProfit)} of net profit minus ${money(allocable)} of allocable deductions leaves a ${money(reduced)} ceiling.`,
      });
      netProfit = reduced;
    }

    if (netProfit < deduction) {
      cappedByNetProfit = true;
      deduction = netProfit;
      findings.push({
        severity: 'medium',
        title: 'Capped at net profit from the tipped trade or business',
        detail: `For self-employment income, the deduction cannot exceed net profit from the tipped trade or business (${money(netProfit)}${allocable > 0 ? ' after allocable deductions' : ' entered'}), even though qualified tips and the phased-out cap allow more.`,
      });
    }
  }

  if (tips > 0 && deduction === tips && !cappedByPhaseOut) {
    findings.push({
      severity: 'info',
      title: 'Full amount deductible before the cap or phase-out bind',
      detail: `${money(tips)} of qualified tips is under both the $${TIP_DEDUCTION_CAP.toLocaleString()} cap and the phase-out threshold for this filing status.`,
    });
  }

  return { deduction, cappedByPhaseOut, cappedByNetProfit, findings };
}

export function computeQualifiedOvertimeDeduction({ overtimePremium, filingStatus, magi } = {}) {
  const findings = [];
  const premium = num(overtimePremium);

  if (filingStatus === 'mfs') {
    findings.push({
      severity: 'high',
      title: 'Married filing separately does not qualify',
      detail: 'The qualified-overtime-compensation deduction is unavailable to a married-filing-separately return. File jointly to claim it, if eligible.',
    });
    return { deduction: 0, cappedByPhaseOut: false, statutoryCap: 0, findings };
  }

  const statutoryCap = filingStatus === 'joint' ? OVERTIME_CAP_JOINT : OVERTIME_CAP_SINGLE;
  const cap = reducedCap(statutoryCap, magi, filingStatus);
  const cappedByPhaseOut = cap < statutoryCap;

  if (cappedByPhaseOut && cap === 0) {
    findings.push({
      severity: 'high',
      title: 'Fully phased out at this income',
      detail: `At a MAGI of ${money(magi)}, the overtime deduction is reduced to $0 (the phase-out removes $100 per $1,000 of MAGI over ${money(phaseoutThreshold(filingStatus))}).`,
    });
  } else if (cappedByPhaseOut) {
    findings.push({
      severity: 'medium',
      title: 'Reduced by the income phase-out',
      detail: `The $${statutoryCap.toLocaleString()} cap for this filing status is reduced by ${money(phaseOutReduction(magi, filingStatus))} at this MAGI, to a maximum of ${money(cap)}.`,
    });
  }

  const deduction = Math.min(premium, cap);

  if (premium > 0 && deduction === premium && !cappedByPhaseOut) {
    findings.push({
      severity: 'info',
      title: 'Full amount deductible before the cap or phase-out bind',
      detail: `${money(premium)} of qualified overtime premium is under both the $${statutoryCap.toLocaleString()} cap and the phase-out threshold for this filing status.`,
    });
  }

  return { deduction, cappedByPhaseOut, statutoryCap, findings };
}

// The FLSA "half-time" premium for one hourly rate: overtime hours times
// HALF the regular rate -- not the full 1.5x, because straight-time pay for
// those hours is already paid separately. Multiple weeks/rates: sum rows.
// For a week worked at two or more DIFFERENT hourly rates in the same week
// (the FLSA weighted-average / "blended rate" case), compute the blended
// regular rate with this portfolio's overtime-pay-calculator first and
// enter its overtime-premium-per-hour figure as the rate here -- restating
// that calculation here would risk it drifting from the tested original.
export function computeOvertimePremiumRow({ hourlyRate, overtimeHours, weeks = 1 }) {
  return num(hourlyRate) * 0.5 * num(overtimeHours) * (num(weeks) || 1);
}

export function sumOvertimePremiumRows(rows = []) {
  return rows.reduce((total, row) => total + computeOvertimePremiumRow(row), 0);
}

export function estimateTaxSavings(totalDeduction, marginalRatePercent) {
  const rate = Math.max(0, Math.min(100, num(marginalRatePercent))) / 100;
  return Math.max(0, num(totalDeduction)) * rate;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

// One combined pass: both deductions, the phase-out, and the always-shown
// reminders about what this estimate does not cover (FICA/SECA, state tax,
// occupation eligibility, the rest of the return).
export function computeCombinedEstimate({
  filingStatus,
  magi,
  qualifiedTips,
  isSelfEmployed,
  netProfitFromTippedWork,
  seTaxDeduction,
  seHealthInsuranceDeduction,
  seRetirementContribution,
  overtimePremium,
  marginalRatePercent,
  occupationEligible,
} = {}) {
  const tipResult = computeQualifiedTipDeduction({
    qualifiedTips,
    filingStatus,
    magi,
    isSelfEmployed,
    netProfitFromTippedWork,
    seTaxDeduction,
    seHealthInsuranceDeduction,
    seRetirementContribution,
  });
  const otResult = computeQualifiedOvertimeDeduction({ overtimePremium, filingStatus, magi });

  const findings = [];

  if (occupationEligible === false && num(qualifiedTips) > 0) {
    findings.push({
      severity: 'high',
      title: 'Occupation eligibility not confirmed',
      detail: 'You indicated your occupation is not (or you are unsure it is) on Treasury’s published list of occupations that customarily and regularly receive tips. Only tips from a qualifying occupation are deductible -- confirm against the published list before relying on the tip figure below.',
    });
  }

  const tipDeduction = occupationEligible === false ? 0 : tipResult.deduction;
  const totalDeduction = tipDeduction + otResult.deduction;
  const estimatedSavings = estimateTaxSavings(totalDeduction, marginalRatePercent);

  findings.push(...tipResult.findings, ...otResult.findings);

  findings.push({
    severity: 'info',
    title: 'Payroll and state tax are unaffected',
    detail: 'This deduction lowers federal taxable income only. Tips and overtime pay are still fully subject to Social Security and Medicare (FICA/SECA) tax, and most states tax them unless that state has separately chosen to conform to this federal deduction -- check your state.',
  });

  return {
    tipDeduction,
    tipCappedByPhaseOut: tipResult.cappedByPhaseOut,
    tipCappedByNetProfit: tipResult.cappedByNetProfit,
    overtimeDeduction: otResult.deduction,
    overtimeCappedByPhaseOut: otResult.cappedByPhaseOut,
    totalDeduction,
    estimatedSavings,
    findings,
  };
}
