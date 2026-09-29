// Core arithmetic for the RSU withholding gap, tax year 2026.
// No network calls: this applies published IRS rules to the numbers the user
// supplies. It is NOT tax advice -- see README "What this does not cover".
//
// Rules applied (2026 brackets and standard deductions are the ones the
// sibling roth-conversion-bracket-fill-calculator verified 2026-09-29 against
// Rev. Proc. 2025-32):
//
//   - Supplemental wages (RSU vests are wages) are withheld for federal income
//     tax at a flat 22% by the "percentage method" (Treas. Reg. 31.3402(g)-1),
//     and at a mandatory 37% on supplemental wages over $1,000,000 in a year.
//   - Actual tax on the vest is whatever the vest adds to the year's tax at the
//     taxpayer's real marginal rates (10-37%), so above the 24% bracket the flat
//     22% under-withholds and below it (12% / 10% / 22%) it over-withholds.
//   - Additional Medicare Tax of 0.9% applies to wages over $200,000 single /
//     head of household, $250,000 joint; employers begin withholding it at
//     $200,000 of wages regardless of filing status, so joint filers can be
//     over-withheld and single filers are usually right.
//   - Underpayment penalty safe harbor (IRC 6654(d)): withholding of at least
//     90% of this year's tax, or 100% of last year's tax (110% when last year's
//     AGI exceeded $150,000). Withholding counts as paid evenly through the year.

export const TAX_YEAR = 2026;

export const BRACKETS = {
  single: [[12400, 0.10], [50400, 0.12], [105700, 0.22], [201775, 0.24], [256225, 0.32], [640600, 0.35], [Infinity, 0.37]],
  mfj: [[24800, 0.10], [100800, 0.12], [211400, 0.22], [403550, 0.24], [512450, 0.32], [768700, 0.35], [Infinity, 0.37]],
  hoh: [[17700, 0.10], [67450, 0.12], [105700, 0.22], [201775, 0.24], [256200, 0.32], [640600, 0.35], [Infinity, 0.37]],
};
export const STANDARD_DEDUCTION = { single: 16100, mfj: 32200, hoh: 24150 };
export const SUPPLEMENTAL_RATE = 0.22;
export const SUPPLEMENTAL_HIGH_RATE = 0.37;
export const SUPPLEMENTAL_HIGH_THRESHOLD = 1000000;
export const ADDL_MEDICARE_RATE = 0.009;
export const ADDL_MEDICARE_THRESHOLD = { single: 200000, mfj: 250000, hoh: 200000 };
export const ADDL_MEDICARE_EMPLOYER_START = 200000;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round2 = (n) => Math.round(n * 100) / 100;
const statusOf = (s) => (BRACKETS[s] ? s : "single");

export function money(n) {
  const v = Math.round(n * 100) / 100;
  return (v < 0 ? "-$" : "$") + Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function incomeTax(taxable, status) {
  let tax = 0, lower = 0;
  for (const [upper, rate] of BRACKETS[statusOf(status)]) {
    if (taxable <= lower) break;
    tax += (Math.min(taxable, upper) - lower) * rate;
    lower = upper;
  }
  return tax;
}

export const taxableOf = (income, status, deductionOverride) =>
  Math.max(0, income - (deductionOverride > 0 ? deductionOverride : STANDARD_DEDUCTION[statusOf(status)]));

export function marginalRate(taxable, status) {
  for (const [upper, rate] of BRACKETS[statusOf(status)]) if (taxable <= upper) return rate;
  return 0.37;
}

// Federal income-tax withholding the employer takes from a vest.
export function supplementalWithholding(vest, rate = SUPPLEMENTAL_RATE) {
  const base = Math.min(vest, SUPPLEMENTAL_HIGH_THRESHOLD);
  const over = Math.max(0, vest - SUPPLEMENTAL_HIGH_THRESHOLD);
  return round2(base * rate + over * SUPPLEMENTAL_HIGH_RATE);
}

export function addlMedicareTax(wages, status) {
  return round2(Math.max(0, wages - ADDL_MEDICARE_THRESHOLD[statusOf(status)]) * ADDL_MEDICARE_RATE);
}

export function rsuGap(input = {}) {
  const status = statusOf(input.filingStatus);
  const vest = num(input.vest);
  const wages = num(input.wages);
  const otherIncome = num(input.otherIncome);
  const deductionOverride = num(input.deductionOverride);
  const withholdingRate = input.withholdingRate === "" || input.withholdingRate == null ? SUPPLEMENTAL_RATE : Math.min(1, num(input.withholdingRate));
  const stateRate = Math.min(1, num(input.stateRate));
  const stateWithheldRate = Math.min(1, num(input.stateWithheldRate));
  const paychecksLeft = Math.floor(num(input.paychecksLeft));
  const priorYearTax = num(input.priorYearTax);
  const priorYearAgiOver150k = Boolean(input.priorYearAgiOver150k);
  if (vest <= 0) return { invalid: true };

  const gross = wages + otherIncome + vest;
  const taxableAfter = taxableOf(gross, status, deductionOverride);
  const taxableBefore = taxableOf(wages + otherIncome, status, deductionOverride);
  const taxAfter = incomeTax(taxableAfter, status);
  const taxBefore = incomeTax(taxableBefore, status);
  const federalTaxOnVest = round2(taxAfter - taxBefore);
  const federalWithheld = supplementalWithholding(vest, withholdingRate);
  const federalGap = round2(federalTaxOnVest - federalWithheld);

  const medicareTotal = addlMedicareTax(wages + vest, status);
  const medicareWithheld = round2(Math.max(0, wages + vest - ADDL_MEDICARE_EMPLOYER_START) * ADDL_MEDICARE_RATE);
  const medicareGap = round2(medicareTotal - medicareWithheld);

  const stateTaxOnVest = round2(vest * stateRate);
  const stateWithheld = round2(vest * stateWithheldRate);
  const stateGap = round2(stateTaxOnVest - stateWithheld);

  const gap = round2(federalGap + medicareGap + stateGap);
  const marginal = marginalRate(taxableAfter, status);

  // Salary withholding is unknown to us: assume it covers the tax on salary alone
  // unless the user says otherwise, so the year-end position isolates the vest.
  const salaryWithheld = input.salaryWithheld === "" || input.salaryWithheld == null ? round2(taxBefore) : num(input.salaryWithheld);
  const totalFederalTax = round2(taxAfter);
  const totalFederalWithheld = round2(salaryWithheld + federalWithheld);
  const yearEndFederal = round2(totalFederalTax - totalFederalWithheld);

  // Safe harbor: is the federal withholding enough to avoid the penalty?
  const ninety = round2(totalFederalTax * 0.9);
  const priorTarget = priorYearTax > 0 ? round2(priorYearTax * (priorYearAgiOver150k ? 1.1 : 1)) : 0;
  const safeHarborTarget = priorTarget > 0 ? Math.min(ninety, priorTarget) : ninety;
  const safeHarborMet = totalFederalWithheld >= safeHarborTarget;
  const safeHarborShortfall = safeHarborMet ? 0 : round2(safeHarborTarget - totalFederalWithheld);

  const extraPerPaycheck = paychecksLeft > 0 && federalGap > 0 ? round2(federalGap / paychecksLeft) : 0;

  // How the vest is layered through the brackets.
  const layers = [];
  let lower = 0;
  for (const [upper, rate] of BRACKETS[status]) {
    const lo = Math.max(lower, taxableBefore), hi = Math.min(upper, taxableAfter);
    if (hi > lo) layers.push({ rate, amount: round2(hi - lo), tax: round2((hi - lo) * rate) });
    lower = upper;
  }

  const findings = [];
  const effectiveOnVest = federalTaxOnVest / vest;
  if (federalGap > 0.5) {
    findings.push({
      severity: "high",
      title: `Federal withholding on the vest is about ${money(federalGap)} short`,
      detail: `The employer withholds ${(withholdingRate * 100).toFixed(0)}% (${money(federalWithheld)}), but the vest adds ${money(federalTaxOnVest)} of federal income tax (${(effectiveOnVest * 100).toFixed(1)}% on average, ${(marginal * 100).toFixed(0)}% on the top dollar). Set that difference aside, raise your W-4 withholding, or make an estimated payment.`,
    });
  } else if (federalGap < -0.5) {
    findings.push({
      severity: "info",
      title: `Federal withholding on the vest is about ${money(-federalGap)} more than the vest adds`,
      detail: `The vest adds ${money(federalTaxOnVest)} of federal income tax, but ${money(federalWithheld)} is withheld. The difference comes back as a refund, or offsets tax due elsewhere.`,
    });
  }
  if (medicareTotal > 0 || medicareWithheld > 0) {
    findings.push({
      severity: Math.abs(medicareGap) > 0.5 ? "medium" : "info",
      title: medicareGap > 0.5 ? `Additional Medicare Tax is ${money(medicareGap)} short` : medicareGap < -0.5 ? `Additional Medicare Tax withheld is ${money(-medicareGap)} too high` : "Additional Medicare Tax is withheld about right",
      detail: `The 0.9% tax applies to wages over ${money(ADDL_MEDICARE_THRESHOLD[status])} for your filing status (Form 8959). Employers start withholding at $200,000 of wages whatever your filing status, so joint filers are often over-withheld and reconcile on the return.`,
    });
  }
  if (Math.abs(stateGap) > 0.5) {
    findings.push({
      severity: stateGap > 0 ? "medium" : "info",
      title: stateGap > 0 ? `State tax on the vest is about ${money(stateGap)} short` : `State withholding on the vest is about ${money(-stateGap)} high`,
      detail: "Uses the flat rates you entered; states with brackets, local taxes and multi-state sourcing can differ.",
    });
  }
  if (!safeHarborMet) {
    findings.push({
      severity: "high",
      title: "Total federal withholding may miss the underpayment-penalty safe harbor",
      detail: `Withholding of ${money(totalFederalWithheld)} is below the ${money(safeHarborTarget)} target (the lower of 90% of this year's tax and ${priorTarget > 0 ? `${priorYearAgiOver150k ? "110%" : "100%"} of last year's` : "100% of last year's, which you did not enter"}). Shortfall ${money(safeHarborShortfall)}. Extra W-4 withholding late in the year counts as paid evenly, so it fixes this; a late estimated payment does not.`,
    });
  }
  if (vest > SUPPLEMENTAL_HIGH_THRESHOLD) {
    findings.push({ severity: "info", title: "37% mandatory rate applies above $1,000,000", detail: "Supplemental wages over $1,000,000 in a calendar year are withheld at 37%, included above." });
  }
  if (extraPerPaycheck > 0) {
    findings.push({ severity: "info", title: `About ${money(extraPerPaycheck)} extra per remaining paycheck would close the federal gap`, detail: "Enter it on Form W-4 step 4(c), or ask payroll. Withholding through year end is treated as paid evenly." });
  }

  return {
    status, vest, gross, taxableBefore, taxableAfter, taxBefore, taxAfter, marginalRate: marginal,
    federalTaxOnVest, federalWithheld, federalGap, effectiveOnVest,
    medicareTotal, medicareWithheld, medicareGap, stateTaxOnVest, stateWithheld, stateGap, gap,
    salaryWithheld, totalFederalTax, totalFederalWithheld, yearEndFederal,
    safeHarborTarget, safeHarborMet, safeHarborShortfall, extraPerPaycheck, layers, findings,
  };
}
