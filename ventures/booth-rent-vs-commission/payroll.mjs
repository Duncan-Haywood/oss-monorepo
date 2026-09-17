// US payroll and self-employment tax, to the depth this comparison needs.
//
// Why this module exists: `calc.mjs` compares a commission check against a
// booth-rent check, and until now it compared them as if a dollar of each
// were the same dollar. They are not. On commission a stylist is a W-2
// employee and the salon pays the employer half of FICA; on booth rent she is
// self-employed and pays *both* halves herself. Net of the 92.35% base that is
// a ~6.5-point wedge (an effective 14.1% against 7.65%) applied only to the
// booth side, on the same book, and it lands squarely in the range where these
// two deals are usually within a few percent of each other. A tool that omits
// it does not merely round off — it tilts every
// close call toward booth rent, which is the direction that costs the user
// money and the direction the "keep 100% of your ticket" pitch already
// exaggerates.
//
// Scope is deliberately payroll tax only. Federal and state *income* tax is
// broadly the same on either deal for the same net income, depends on filing
// status, other household income, and deductions this tool has no business
// asking for, and would swamp the structural difference with personal detail.
// The employer-vs-self split is the part that is structural, computable from
// what the calculator already knows, and different between the two paths.
//
// Everything here is arithmetic on rates the user can see and override. It is
// an estimate for comparing two offers, not a tax return.

/** Employee's half of Social Security. The employer pays a matching 6.2%. */
export const SOCIAL_SECURITY_RATE = 0.062;

/** Employee's half of Medicare. The employer pays a matching 1.45%. */
export const MEDICARE_RATE = 0.0145;

/**
 * Self-employment tax is charged on 92.35% of net earnings, not on all of it.
 * The factor is `1 - 0.153/2`: it removes the employer half of the tax from
 * the base, so a self-employed person is not taxed on money that a W-2
 * employee would never have seen as wages in the first place. Omitting it
 * overstates the booth-rent burden by about 1.2 points.
 */
export const SE_NET_EARNINGS_FACTOR = 0.9235;

/**
 * Social Security stops at an annual wage base; Medicare does not.
 *
 * This default is the 2025 figure. The number is indexed to average wages and
 * changes every January, so it is a default rather than a constant of nature —
 * `socialSecurityWageBase` overrides it on every entry point that uses it, and
 * the page says so next to the result. It binds rarely for this audience: a
 * stylist would need to clear it on chair income alone before the cap changes
 * either side of the comparison, and below it the cap is inert.
 */
export const DEFAULT_SOCIAL_SECURITY_WAGE_BASE = 176100;

function nonNegative(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * What a W-2 employee has withheld for FICA on `annualWages`.
 *
 * The employer's matching half is real money, but it never appears in the
 * stylist's pay and never will, so it is not modelled here — the commission
 * take-home this is subtracted from is already net of it by construction.
 */
export function employeePayrollTax(annualWages, { wageBase = DEFAULT_SOCIAL_SECURITY_WAGE_BASE } = {}) {
  const wages = nonNegative(annualWages);
  const cap = nonNegative(wageBase);
  const socialSecurity = Math.min(wages, cap) * SOCIAL_SECURITY_RATE;
  const medicare = wages * MEDICARE_RATE;
  return { wages, socialSecurity, medicare, total: socialSecurity + medicare };
}

/**
 * Self-employment tax on `annualNetEarnings` — the booth renter's profit after
 * rent, card fees, backbar, retail cost, and other business expenses, which is
 * exactly what `calc.mjs` already computes as booth take-home.
 *
 * `deductibleHalf` is the employer-equivalent half, which is an above-the-line
 * deduction against *income* tax. It is not a refund and it is not netted off
 * here: what it is worth depends on a marginal rate this module does not know.
 * `calc.mjs` credits it back only when the user supplies that rate, and treats
 * it as zero otherwise — the conservative direction, and the honest one when
 * the tool has not asked.
 *
 * A loss-making book pays no SE tax. That is why the base floors at zero
 * rather than producing a negative credit that would silently flatter booth
 * rent by the exact amount it is losing.
 */
export function selfEmploymentTax(annualNetEarnings, { wageBase = DEFAULT_SOCIAL_SECURITY_WAGE_BASE } = {}) {
  const net = nonNegative(annualNetEarnings);
  const cap = nonNegative(wageBase);
  const taxableBase = net * SE_NET_EARNINGS_FACTOR;
  const socialSecurity = Math.min(taxableBase, cap) * SOCIAL_SECURITY_RATE * 2;
  const medicare = taxableBase * MEDICARE_RATE * 2;
  const total = socialSecurity + medicare;
  return { netEarnings: net, taxableBase, socialSecurity, medicare, total, deductibleHalf: total / 2 };
}
