// Core arithmetic for self-employment (SE) tax, Schedule SE, tax year 2026.
// No network calls: this applies published IRS/SSA rules to the numbers the
// user supplies. It is NOT tax advice -- see README "What this does not cover".
//
// Verified 2026-09-29 against IRS Tax Topic 554 and SSA's 2026 figures:
//
//   - SE tax applies at $400 or more of net earnings from self-employment.
//   - Net earnings = 92.35% of Schedule C net profit.
//   - 12.4% Social Security on net earnings up to the wage base ($184,500 for
//     2026), reduced by any W-2 Social Security wages already taxed; plus
//     2.9% Medicare on all net earnings.
//   - One-half of SE tax is deductible in figuring adjusted gross income
//     (not in figuring the SE tax itself).
//   - Additional Medicare Tax of 0.9% (Form 8959) on wages plus SE earnings
//     over $200,000 single / $250,000 joint / $125,000 separate. The SE part
//     uses the threshold reduced by Medicare wages. It is not deductible and
//     is not part of the SE tax line.

export const TAX_YEAR = 2026;
export const SS_WAGE_BASE = 184500;
export const SS_RATE = 0.124;
export const MEDICARE_RATE = 0.029;
export const ADDITIONAL_MEDICARE_RATE = 0.009;
export const SE_NET_EARNINGS_FACTOR = 0.9235;
export const SE_MINIMUM = 400;
export const ADDITIONAL_MEDICARE_THRESHOLDS = { single: 200000, mfj: 250000, mfs: 125000 };

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function seParts(netProfit, w2Wages) {
  const netEarnings = netProfit * SE_NET_EARNINGS_FACTOR;
  if (netEarnings < SE_MINIMUM) return { netEarnings, socialSecurity: 0, medicare: 0, total: 0, ssTaxable: 0 };
  const ssRoom = Math.max(0, SS_WAGE_BASE - w2Wages);
  const ssTaxable = Math.min(netEarnings, ssRoom);
  const socialSecurity = ssTaxable * SS_RATE;
  const medicare = netEarnings * MEDICARE_RATE;
  return { netEarnings, socialSecurity, medicare, total: socialSecurity + medicare, ssTaxable };
}

function additionalMedicare(netEarnings, w2Wages, status) {
  const threshold = ADDITIONAL_MEDICARE_THRESHOLDS[status] ?? ADDITIONAL_MEDICARE_THRESHOLDS.single;
  const onWages = Math.max(0, w2Wages - threshold);
  const onSelfEmployment = Math.max(0, netEarnings - Math.max(0, threshold - w2Wages));
  return (onWages + onSelfEmployment) * ADDITIONAL_MEDICARE_RATE;
}

export function selfEmploymentTax(input = {}) {
  const netProfit = num(input.netProfit);
  const w2Wages = num(input.w2Wages);
  const status = Object.hasOwn(ADDITIONAL_MEDICARE_THRESHOLDS, input.filingStatus) ? input.filingStatus : "single";
  const marginalRate = Math.min(num(input.marginalRate), 1);
  if (netProfit <= 0) return { invalid: true };

  const p = seParts(netProfit, w2Wages);
  // Under $400 there are no SE earnings on Schedule SE, so none reach Form 8959.
  const addlMedicare = additionalMedicare(p.netEarnings < SE_MINIMUM ? 0 : p.netEarnings, w2Wages, status);
  const halfDeduction = p.total / 2;
  const incomeTax = Math.max(0, netProfit - halfDeduction) * marginalRate;
  const totalSetAside = p.total + addlMedicare + incomeTax;

  // What the next $1,000 of profit costs in SE tax: tells the filer whether
  // extra work is being taxed at 15.3% or has crossed the wage base to 2.9%.
  const next = seParts(netProfit + 1000, w2Wages);
  const marginalSeRate = (next.total - p.total) / 1000;

  const findings = [];
  if (p.netEarnings < SE_MINIMUM) {
    findings.push({
      severity: "info",
      title: "Below the $400 threshold",
      detail: "Net earnings from self-employment under $400 are not subject to SE tax. Income tax may still apply.",
    });
  }
  if (p.netEarnings >= SE_MINIMUM && p.ssTaxable < p.netEarnings) {
    findings.push({
      severity: "info",
      title: "Part of your income is above the Social Security wage base",
      detail: `Only ${money(round2(p.ssTaxable))} of your net earnings is taxed at 12.4% (wage base ${money(SS_WAGE_BASE)}, less ${money(w2Wages)} of W-2 wages). Earnings above that pay only the 2.9% Medicare rate, so your next dollar of profit costs about ${(marginalSeRate * 100).toFixed(1)}% in SE tax.`,
    });
  }
  if (addlMedicare > 0) {
    findings.push({
      severity: "medium",
      title: "Additional Medicare Tax applies",
      detail: `A further 0.9% (${money(round2(addlMedicare))}) is owed on Form 8959 because wages plus self-employment earnings pass the ${money(ADDITIONAL_MEDICARE_THRESHOLDS[status])} threshold. It is separate from the SE tax total and is not deductible.`,
    });
  }
  if (netProfit >= 80000) {
    findings.push({
      severity: "info",
      title: "At this profit level, an S corporation election is worth modelling",
      detail: "Some owners cut SE tax by paying themselves a reasonable salary and taking the rest as distributions. It adds payroll, filing and state costs and only works with a defensible salary. Model it before deciding; this tool does not.",
    });
  }

  return {
    invalid: false,
    netProfit: round2(netProfit),
    netEarnings: round2(p.netEarnings),
    socialSecurity: round2(p.socialSecurity),
    medicare: round2(p.medicare),
    seTax: round2(p.total),
    halfDeduction: round2(halfDeduction),
    additionalMedicare: round2(addlMedicare),
    effectiveRate: p.total / netProfit,
    marginalSeRate,
    incomeTaxEstimate: round2(incomeTax),
    totalSetAside: round2(totalSetAside),
    setAsideRate: totalSetAside / netProfit,
    quarterlyPayment: round2(totalSetAside / 4),
    findings,
  };
}
