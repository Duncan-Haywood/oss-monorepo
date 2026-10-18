// Core arithmetic for the IRC Section 461(l) excess business loss (EBL)
// limitation, made PERMANENT by the One Big Beautiful Bill Act (OBBBA). No
// network calls: this applies published federal figures to the numbers the
// user supplies. It is not a full tax return -- see README "What this does
// not cover".
//
// Verified 2026-09-25 via WebSearch against Moss Adams' "Avoid Tax
// Surprises Related to Excess Business Loss Limitations Post-OBBBA", Baker
// Tilly's "2025 Year-end planning considerations for key business tax
// provisions", Hiltzik CPA's "Excess Business Loss Limitation 2026:
// Threshold Falls to $256,000", Keiter's "Excess Business Loss | OBBBA",
// MBE CPAs' "What You Should Know About Excess Business Losses in 2026",
// and a cross-check search confirming the exact filing-status breakdown
// against Tax Notes' threshold reference table, cross-checked against each
// other:
//
//   - IRC Section 461(l) limits how much of a NONCORPORATE taxpayer's net
//     business loss can offset OTHER income (wages, investment income,
//     etc.) in the current year. It was scheduled to expire after 2028;
//     OBBBA (signed July 4, 2025) made it PERMANENT starting with the 2025
//     tax year.
//   - The threshold is single/head-of-household/married-filing-separately:
//     $313,000 for 2025; married filing jointly: $626,000 for 2025 (MFJ is
//     exactly double the other three statuses' shared figure, not a
//     separate figure of its own).
//   - For 2026, OBBBA also changed how the threshold is INDEXED --
//     rebasing it to a 2024 base year instead of continuing to compound
//     from the original 2017 TCJA base. The result is COUNTERINTUITIVE: the
//     2026 threshold is LOWER than 2025's, not higher -- $256,000 single/
//     HOH/MFS, $512,000 MFJ, erasing several years of inflation
//     adjustment. Most OBBBA changes raise a threshold; this one is a
//     rare exception a taxpayer or preparer comparing only "this year vs.
//     last year, inflation always goes up" would get backwards.
//   - The loss compared against the threshold is the NET business loss --
//     aggregate gross income/gain from all the taxpayer's trades or
//     businesses MINUS aggregate deductions attributable to those same
//     trades or businesses. Wages, interest, dividends, and capital gains
//     outside a trade or business are NOT part of this net figure; they
//     are what the allowed loss then offsets.
//   - A loss up to the threshold is fully deductible against other income
//     this year, same as before EBL existed. The EXCESS above the
//     threshold is disallowed this year and instead added to the
//     taxpayer's net operating loss (NOL) carryforward to the next tax
//     year -- where it is subject to the existing post-2017 NOL rules
//     (limited to offsetting 80% of a future year's taxable income, no
//     carryback for most businesses), the same NOL mechanism this
//     portfolio's bonus-depreciation-calculator already models for a
//     different trigger.
//   - This module does not model the separate interaction between a large
//     business loss and the Section 199A qualified business income (QBI)
//     deduction, which the sibling qbi-deduction-calculator covers on its
//     own -- a negative QBI amount in one year reduces a future year's QBI
//     deduction, a compounding effect this module flags but does not
//     compute.
//
// This module does not verify a filer's business income, business
// deductions, or filing status -- the user supplies each figure, and the
// page points at a qualified tax professional as the source to verify
// against before filing.

export const EBL_THRESHOLDS = {
  2025: { single: 313_000, mfj: 626_000 },
  2026: { single: 256_000, mfj: 512_000 },
};

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Computes how much of a taxpayer's net business loss is deductible this
 * year against the Section 461(l) threshold, and how much becomes a net
 * operating loss (NOL) carryforward instead.
 */
export function excessBusinessLossOutcome({
  filingStatus = "single",
  businessIncome = 0,
  businessDeductions = 0,
  taxYear = 2025,
} = {}) {
  const rules = EBL_THRESHOLDS[taxYear] || EBL_THRESHOLDS[2025];
  const isMfj = filingStatus === "mfj";
  const threshold = isMfj ? rules.mfj : rules.single;
  const priorYearThreshold = taxYear === 2026
    ? (isMfj ? EBL_THRESHOLDS[2025].mfj : EBL_THRESHOLDS[2025].single)
    : null;

  const income = Math.max(0, num(businessIncome));
  const deductions = Math.max(0, num(businessDeductions));
  const netLoss = Math.max(0, deductions - income);

  const allowedLoss = Math.min(netLoss, threshold);
  const excessLoss = Math.max(0, netLoss - threshold);
  const limited = excessLoss > 0;

  const findings = [];

  if (netLoss <= 0) {
    findings.push({
      severity: "info",
      title: "No net business loss to limit",
      detail: deductions > 0
        ? "Business income covers business deductions this year -- the excess business loss limitation only applies when deductions exceed income."
        : "Enter your business income and deductions to check whether the limitation applies.",
    });
  }

  if (limited) {
    findings.push({
      severity: "high",
      title: `${money(excessLoss)} of your loss is disallowed this year`,
      detail: `Your ${money(netLoss)} net business loss exceeds the ${money(threshold)} threshold for ${taxYear} (${filingStatus === "mfj" ? "married filing jointly" : "single/head-of-household/married-filing-separately"}). The excess does not vanish -- it is added to your net operating loss (NOL) carryforward to next year, where it can offset up to 80% of that year's taxable income under current law, with no carryback for most businesses.`,
    });
  }

  if (limited && taxYear === 2026 && priorYearThreshold && threshold < priorYearThreshold) {
    findings.push({
      severity: "medium",
      title: "The 2026 threshold is LOWER than 2025's -- easy to get backwards",
      detail: `OBBBA rebased how this threshold is indexed, so it fell from ${money(priorYearThreshold)} in 2025 to ${money(threshold)} in 2026 for this filing status -- most other OBBBA changes raised a threshold; this one is a rare exception. A hand estimate that assumes "inflation always goes up" will overstate how much loss is deductible in 2026.`,
    });
  }

  findings.push({
    severity: "info",
    title: "Trade-or-business income and deductions only",
    detail: "This net loss is aggregate income/gain and deductions from your trades or businesses only -- wages, interest, dividends, and capital gains outside a business are not part of this figure. The allowed loss (below the threshold) is what then offsets that other income.",
  });

  findings.push({
    severity: "info",
    title: "QBI interaction not modeled",
    detail: "A large business loss can also reduce a future year's Section 199A qualified business income (QBI) deduction -- see the QBI deduction calculator for that separate calculation. This tool does not compute that interaction.",
  });

  return {
    filingStatus,
    taxYear,
    threshold,
    priorYearThreshold,
    businessIncome: income,
    businessDeductions: deductions,
    netLoss,
    allowedLoss,
    excessLoss,
    limited,
    findings,
  };
}
