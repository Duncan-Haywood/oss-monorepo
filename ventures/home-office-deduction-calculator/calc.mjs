// Core arithmetic for the home office deduction, simplified method vs.
// regular (Form 8829) method, for a self-employed filer on Schedule C. No
// network calls: this applies published IRS rules to the numbers the user
// supplies. It is NOT tax advice -- see README "What this does not cover".
//
// Verified 2026-09-29 via WebFetch against IRS.gov's "Simplified Option for
// Home Office Deduction" page and the Instructions for Form 8829:
//
//   - Simplified method: $5 per square foot of the area used for business,
//     capped at 300 square feet ($1,500 maximum). No depreciation, and any
//     amount above the gross income limitation is NOT carried over.
//   - Part-year use under the simplified method: Rev. Proc. 2013-13 uses
//     the average monthly allowable square footage, which is modelled here
//     as min(area, 300) x months used / 12.
//   - Regular method (Form 8829): business share of actual expenses, subject
//     to the gross income limit in a fixed order: (1) business share of
//     mortgage interest and real estate taxes -- deductible regardless of
//     the limit; (2) operating expenses (insurance, utilities, repairs,
//     rent, direct expenses, prior-year operating carryover) up to what
//     remains of the limit; (3) depreciation (and prior-year depreciation
//     carryover) up to what remains after that. Operating and depreciation
//     amounts above the limit carry forward to the next year.
//   - Home depreciation: 39-year straight line, mid-month convention. First
//     year rate by month placed in service in business use (Form 8829
//     instructions): Jan 2.461% ... Dec 0.107%; every full year after:
//     2.564%. Basis is the lesser of fair market value and adjusted basis
//     when business use began, excluding land, times the business-use
//     percentage.
//   - An employee cannot deduct home office expenses on a personal return.

export const SIMPLIFIED_RATE = 5;
export const SIMPLIFIED_MAX_SQFT = 300;
export const SIMPLIFIED_MAX = SIMPLIFIED_RATE * SIMPLIFIED_MAX_SQFT; // 1,500
export const FULL_YEAR_DEPRECIATION_RATE = 0.02564;
// Index 0 = January placed in service.
export const FIRST_YEAR_DEPRECIATION_RATES = [
  0.02461, 0.02247, 0.02033, 0.01819, 0.01605, 0.01391,
  0.01177, 0.00963, 0.00749, 0.00535, 0.00321, 0.00107,
];
// Self-employment tax factors (Schedule SE): 92.35% of net profit x 15.3%.
// Assumes the filer is below the Social Security wage base; above it only
// the 2.9% Medicare portion falls, so the SE saving is overstated there.
export const SE_NET_EARNINGS_FACTOR = 0.9235;
export const SE_TAX_RATE = 0.153;

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

export function money(n) {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

// Value of a Schedule C deduction: income tax at the marginal rate, plus
// self-employment tax saved (whose deductible half is then lost).
export function scheduleCTaxValue(deduction, marginalRate, includeSelfEmploymentTax = true) {
  const r = Math.min(Math.max(num(marginalRate), 0), 1);
  const incomeTax = deduction * r;
  if (!includeSelfEmploymentTax) return round2(incomeTax);
  const seSaved = deduction * SE_NET_EARNINGS_FACTOR * SE_TAX_RATE;
  return round2(incomeTax + seSaved * (1 - r / 2));
}

export function homeOfficeOutcome(input = {}) {
  const homeSqFt = num(input.homeSqFt);
  const officeSqFt = num(input.officeSqFt);
  const firstYearMonth = Math.trunc(num(input.firstYearMonth)); // 0 = not first year
  const validFirstYear = firstYearMonth >= 1 && firstYearMonth <= 12;
  let monthsUsed = Math.min(12, Math.max(0, Math.trunc(num(input.monthsUsed) || 12)));
  if (validFirstYear) monthsUsed = 13 - firstYearMonth;
  const grossIncome = num(input.grossIncome);
  const otherExpenses = num(input.otherExpenses);
  const owns = input.owns !== false;
  const itemizes = Boolean(input.itemizes);
  const marginalRate = num(input.marginalRate);
  const includeSE = input.includeSelfEmploymentTax !== false;

  const findings = [];
  const invalid = homeSqFt <= 0 || officeSqFt <= 0;
  const businessPct = homeSqFt > 0 ? Math.min(1, officeSqFt / homeSqFt) : 0;
  if (officeSqFt > homeSqFt && homeSqFt > 0) {
    findings.push({
      severity: "medium",
      title: "Office area is larger than the home",
      detail: "The office area was capped at 100% of the home's square footage. Check both numbers.",
    });
  }
  const timeFactor = monthsUsed / 12;
  const gap = Math.max(0, grossIncome - otherExpenses); // Form 8829 line 8

  // ---- Simplified method ------------------------------------------------
  const simplifiedBase = round2(
    Math.min(Math.min(officeSqFt, SIMPLIFIED_MAX_SQFT) * timeFactor, SIMPLIFIED_MAX_SQFT) * SIMPLIFIED_RATE,
  );
  const simplified = round2(Math.min(simplifiedBase, gap));
  const simplifiedLimited = simplifiedBase > simplified;

  // ---- Regular method ---------------------------------------------------
  const share = (v) => num(v) * businessPct * timeFactor;
  const mortgageInterest = owns ? share(input.mortgageInterest) : 0;
  const propertyTax = owns ? share(input.propertyTax) : 0;
  const tier1 = round2(mortgageInterest + propertyTax);
  const operating = round2(
    share(input.rent) * (owns ? 0 : 1) +
      share(input.utilities) +
      share(input.insurance) +
      share(input.repairs) +
      share(input.otherIndirect) +
      num(input.directExpenses),
  );
  const carryOperating = num(input.carryoverOperating);
  const carryDepreciation = num(input.carryoverDepreciation);

  let depreciationBasis = 0;
  let depreciationRate = 0;
  let depreciation = 0;
  if (owns) {
    depreciationBasis = round2(Math.max(0, num(input.homeBasis) - num(input.landValue)) * businessPct);
    depreciationRate = validFirstYear ? FIRST_YEAR_DEPRECIATION_RATES[firstYearMonth - 1] : FULL_YEAR_DEPRECIATION_RATE;
    depreciation = round2(depreciationBasis * depreciationRate);
  }

  const afterTier1 = Math.max(0, gap - tier1);
  const operatingTotal = operating + carryOperating;
  const operatingAllowed = round2(Math.min(operatingTotal, afterTier1));
  const afterOperating = Math.max(0, afterTier1 - operatingAllowed);
  const depreciationTotal = depreciation + carryDepreciation;
  const depreciationAllowed = round2(Math.min(depreciationTotal, afterOperating));
  const regular = invalid ? 0 : round2(tier1 + operatingAllowed + depreciationAllowed);
  const carryForwardOperating = round2(operatingTotal - operatingAllowed);
  const carryForwardDepreciation = round2(depreciationTotal - depreciationAllowed);

  // ---- Tax value of each ------------------------------------------------
  const rate = Math.min(marginalRate, 1);
  const simplifiedTax = scheduleCTaxValue(invalid ? 0 : simplified, rate, includeSE);
  // Moving business-use mortgage interest/taxes from Schedule A to Schedule
  // C costs an itemizer that Schedule A deduction (SALT cap not modelled).
  const scheduleALost = itemizes ? tier1 : 0;
  const regularTax = round2(scheduleCTaxValue(regular, rate, includeSE) - scheduleALost * rate);
  const better = regularTax > simplifiedTax ? "regular" : "simplified";

  if (!invalid) {
    if (grossIncome <= 0) {
      findings.push({
        severity: "high",
        title: "No gross income entered",
        detail: "Both methods are limited by the gross income from the business use of the home, less your other business expenses. With no income there is nothing to deduct this year.",
      });
    } else if (gap === 0) {
      findings.push({
        severity: "high",
        title: "Your other expenses use up the gross income limit",
        detail: "The deduction cannot create or increase a business loss. Regular-method amounts above the limit carry forward; simplified-method amounts do not.",
      });
    }
    if (simplifiedLimited && gap > 0) {
      findings.push({
        severity: "medium",
        title: "The gross income limit cuts the simplified deduction",
        detail: "The simplified amount above the limit is lost, not carried forward.",
      });
    }
    if (officeSqFt > SIMPLIFIED_MAX_SQFT) {
      findings.push({
        severity: "info",
        title: "Simplified method caps at 300 square feet",
        detail: "Your office is larger than 300 sq ft, so the simplified deduction stops at $1,500. The regular method has no size cap.",
      });
    }
    if (carryForwardOperating > 0 || carryForwardDepreciation > 0) {
      findings.push({
        severity: "info",
        title: "Regular-method carryforward",
        detail: `${money(carryForwardOperating)} of operating expenses and ${money(carryForwardDepreciation)} of depreciation carry forward to next year (Form 8829), usable only when you use the regular method and have room under that year's limit.`,
      });
    }
    if (carryOperating + carryDepreciation > 0) {
      findings.push({
        severity: "info",
        title: "Prior-year carryovers wait under the simplified method",
        detail: "Choosing the simplified method this year does not use up carryovers from earlier regular-method years; they stay available for a later regular-method year.",
      });
    }
    if (owns && regular > 0) {
      findings.push({
        severity: "medium",
        title: "Regular method and selling the home",
        detail: "Depreciation taken (or that could have been taken) on the office reduces the home's basis, and when you sell, that portion is taxed as unrecaptured Section 1250 gain at up to 25%, even if you never claimed it. The simplified method involves no depreciation.",
      });
    }
    if (itemizes && tier1 > 0) {
      findings.push({
        severity: "info",
        title: "Itemizer adjustment applied",
        detail: "Business-use mortgage interest and property tax move from Schedule A to Schedule C under the regular method, so that Schedule A amount is netted out of the regular-method tax value (the SALT cap is not modelled).",
      });
    }
  }
  findings.push({
    severity: "high",
    title: "Self-employed only, exclusive and regular use",
    detail: "This is for a self-employed filer (Schedule C). An employee cannot deduct home office expenses on a personal return. The space must be used exclusively and regularly for the business and be your principal place of business (or meet another Form 8829 test). Daycare facilities have different rules that this tool does not model.",
  });

  return {
    invalid,
    businessPct: round2(businessPct * 10000) / 10000,
    monthsUsed,
    grossIncomeLimit: round2(gap),
    simplified,
    simplifiedBase,
    regular,
    regularParts: {
      mortgageInterestAndTaxes: tier1,
      operating: operatingAllowed,
      depreciation: depreciationAllowed,
      depreciationBasis,
      depreciationRate,
    },
    carryForward: { operating: carryForwardOperating, depreciation: carryForwardDepreciation },
    simplifiedTaxValue: simplifiedTax,
    regularTaxValue: regularTax,
    better,
    taxAdvantage: round2(Math.abs(regularTax - simplifiedTax)),
    findings,
  };
}
