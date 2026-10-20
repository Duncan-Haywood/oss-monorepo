// Pure annual car-deduction and self-employment-tax arithmetic for a gig
// driver. No network, no state.
//
// The session calculator answers "what did a shift keep"; this answers the
// question that follows at tax time: deduct the car by the IRS standard
// mileage rate or by actual expenses, and what does either choice do to the
// self-employment tax and the quarterly payments. The rate, the Social
// Security wage base and the income-tax rate are inputs with the published
// 2026 figures as defaults, because they change every year and a stale
// default is the main way a page like this goes wrong. Income tax itself is
// never computed: it depends on filing status, other income and deductions,
// so the page applies the driver's own marginal rate to the change in profit.
// Arithmetic on typed figures, not tax advice.

export const DEFAULTS_2026 = {
  standardRate: 0.725, // IRS business standard mileage rate, dollars per mile, 2026
  socialSecurityWageBase: 184500, // SSA 2026 wage base
};

const SE_FACTOR = 0.9235;
const SS_RATE = 0.124;
const MEDICARE_RATE = 0.029;
const SE_MINIMUM = 400; // below this net profit, no self-employment tax is owed

function number(value, name, { min = 0, allowZero = true } = {}) {
  const result = Number(value);
  if (value === '' || value === null || value === undefined || !Number.isFinite(result)) {
    throw new Error(`${name} must be a number`);
  }
  if (result < min) throw new Error(`${name} must be at least ${min}`);
  if (!allowZero && result === 0) throw new Error(`${name} must be greater than zero`);
  return result;
}

/** Self-employment tax on a net profit, given W-2 wages already counted against the Social Security base. */
export function selfEmploymentTax(netProfit, { otherWages = 0, socialSecurityWageBase = DEFAULTS_2026.socialSecurityWageBase } = {}) {
  if (netProfit < SE_MINIMUM) return { base: 0, socialSecurity: 0, medicare: 0, total: 0, halfDeduction: 0 };
  const base = netProfit * SE_FACTOR;
  const room = Math.max(0, socialSecurityWageBase - otherWages);
  const socialSecurity = Math.min(base, room) * SS_RATE;
  const medicare = base * MEDICARE_RATE;
  const total = socialSecurity + medicare;
  return { base, socialSecurity, medicare, total, halfDeduction: total / 2 };
}

function method(label, deduction, input, grossIncome, otherDeductible) {
  const netProfit = grossIncome - deduction - otherDeductible;
  const se = selfEmploymentTax(netProfit, input);
  const incomeTax = Math.max(0, netProfit - se.halfDeduction) * (input.incomeTaxRatePercent / 100);
  const totalTax = se.total + incomeTax;
  return {
    label, deduction, netProfit, se, incomeTax, totalTax,
    quarterly: totalTax / 4,
    keep: netProfit - totalTax,
  };
}

/**
 * @param {object} input
 * @param {number} input.grossIncome       Year's 1099 income from all apps, tips included.
 * @param {number} input.businessMiles     Business miles for the year (every mile driven online, plus miles to
 *   the first stop and from the last one, per your own log).
 * @param {number} input.totalMiles        All miles the car drove this year, used for the business-use share of
 *   actual expenses. Defaults to businessMiles.
 * @param {number} input.mpg
 * @param {number} input.gasPrice
 * @param {number} input.maintenancePerMile
 * @param {number} input.insuranceAnnual
 * @param {number} input.depreciationAnnual  Your own figure for the car's annual depreciation or lease payments.
 * @param {number} input.parkingTolls        Deductible under either method.
 * @param {number} input.otherDeductible     Phone share, hot bag, supplies: deductible under either method.
 * @param {number} input.standardRate        Dollars per mile; the IRS figure for the year.
 * @param {number} input.incomeTaxRatePercent Your marginal income-tax rate (federal + state). 0 leaves income tax out.
 * @param {number} input.otherWages          W-2 wages that already count against the Social Security wage base.
 * @param {number} input.socialSecurityWageBase
 */
export function compareDeductions(raw) {
  const input = {
    grossIncome: number(raw.grossIncome, 'Gross income'),
    businessMiles: number(raw.businessMiles, 'Business miles'),
    mpg: number(raw.mpg, 'Miles per gallon', { allowZero: false }),
    gasPrice: number(raw.gasPrice, 'Gas price'),
    maintenancePerMile: number(raw.maintenancePerMile, 'Maintenance per mile'),
    insuranceAnnual: number(raw.insuranceAnnual, 'Insurance'),
    depreciationAnnual: number(raw.depreciationAnnual, 'Depreciation'),
    parkingTolls: number(raw.parkingTolls ?? 0, 'Parking and tolls'),
    otherDeductible: number(raw.otherDeductible ?? 0, 'Other deductible costs'),
    standardRate: number(raw.standardRate ?? DEFAULTS_2026.standardRate, 'Standard mileage rate'),
    incomeTaxRatePercent: number(raw.incomeTaxRatePercent ?? 0, 'Income tax rate'),
    otherWages: number(raw.otherWages ?? 0, 'Other wages'),
    socialSecurityWageBase: number(raw.socialSecurityWageBase ?? DEFAULTS_2026.socialSecurityWageBase, 'Social Security wage base'),
  };
  if (input.incomeTaxRatePercent >= 100) throw new Error('Income tax rate must be less than 100%');
  const totalMiles = raw.totalMiles === '' || raw.totalMiles == null ? input.businessMiles : number(raw.totalMiles, 'Total miles');
  if (totalMiles < input.businessMiles) throw new Error('Total miles must be at least business miles');
  const businessShare = totalMiles === 0 ? 0 : input.businessMiles / totalMiles;

  const runningCost = input.businessMiles * (input.gasPrice / input.mpg + input.maintenancePerMile);
  const sharedCost = input.insuranceAnnual + input.depreciationAnnual;
  // Fuel and upkeep were counted on business miles already; insurance and
  // depreciation cover the whole car, so only the business share is deductible.
  const actualCar = runningCost + sharedCost * businessShare;
  const standardCar = input.businessMiles * input.standardRate;
  const extras = input.parkingTolls + input.otherDeductible;

  const standard = method('Standard mileage rate', standardCar + input.parkingTolls, input, input.grossIncome, input.otherDeductible);
  const actual = method('Actual expenses', actualCar + input.parkingTolls, input, input.grossIncome, input.otherDeductible);
  const better = actual.totalTax < standard.totalTax - 0.005 ? 'actual'
    : standard.totalTax < actual.totalTax - 0.005 ? 'standard' : 'tie';
  return {
    businessShare, runningCost, actualCar, standardCar, extras,
    standard, actual, better,
    taxDifference: Math.abs(standard.totalTax - actual.totalTax),
    // The standard rate is a single national average. This is the per-mile
    // figure that makes both methods deduct the same dollars on this car.
    breakEvenPerMile: input.businessMiles === 0 ? null : actualCar / input.businessMiles,
  };
}
