// Core arithmetic for the IRS Form 8606 Part I "pro-rata" computation that
// decides how much of a Roth IRA conversion is taxable when a filer holds
// both after-tax (nondeductible) and pre-tax money across traditional, SEP
// and SIMPLE IRAs. No network calls: this applies the form's own formula to
// the numbers the user supplies. It is NOT tax advice -- see README "What
// this does not cover".
//
// The form, in the order the lines run (Form 8606 Part I):
//
//   1. Nondeductible contributions made for the year.
//   2. Total basis from prior years (last year's Form 8606, line 14).
//   3. Add 1 and 2.
//   4. Contributions made after Dec 31 and by the filing deadline that were
//      counted for the prior year (out of scope here, treated as 0).
//   5. Subtract 4 from 3 -- total basis available.
//   6. Value of ALL traditional, SEP and SIMPLE IRAs on Dec 31 (after the
//      conversion; includes basis dollars still inside, plus outstanding
//      rollovers).
//   7. Distributions taken in the year, excluding conversions.
//   8. Net amount converted to Roth.
//   9. Add 6, 7 and 8.
//  10. Divide 5 by 9 (a decimal, at least 3 places, never above 1.000).
//  11. Multiply 8 by 10: the NONTAXABLE part of the conversion.
//  12. Multiply 7 by 10: the nontaxable part of ordinary distributions.
//  13. Add 11 and 12.
//  14. Basis carried forward: 3 minus 13.
//  15. Taxable amount: 7 + 8 - 13.
//
// The rule aggregates every traditional, SEP and SIMPLE IRA a person owns
// (not per account, not per custodian) and is measured on December 31, which
// is why moving pre-tax IRA money into an employer 401(k) or a Solo 401(k)
// that accepts roll-ins BEFORE year-end -- so it is not in line 6 -- makes
// the ratio 1.000 and the backdoor conversion tax-free.
//
// Verified 2026-09-29 against IRS.gov's 2026 announcement (Notice 2025-67):
// the 2026 IRA contribution limit is $7,500, with a $1,100 catch-up at 50+.

export const LIMITS_2026 = {
  iraContribution: 7_500,
  iraCatchUp50: 1_100,
};

export const EXCESS_CONTRIBUTION_EXCISE_RATE = 0.06;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nonNegative(v) {
  return Math.max(0, num(v));
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) =>
    `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

function cents(n) {
  return Math.round(n * 100) / 100;
}

export function percent(ratio) {
  return `${(ratio * 100).toFixed(2)}%`;
}

/** The IRA contribution limit for a person of the given age at year-end. */
export function iraLimitFor(age) {
  return LIMITS_2026.iraContribution + (Math.floor(num(age)) >= 50 ? LIMITS_2026.iraCatchUp50 : 0);
}

/**
 * Form 8606 Part I. Returns every line the form computes plus the taxable
 * conversion amount. `ratio` is exact; `formRatio` is the 3-decimal figure
 * the form has you write down (truncated up to 3 places, capped at 1.000).
 */
export function proRata({
  nondeductibleContribution = 0,
  priorBasis = 0,
  yearEndIraValue = 0,
  otherDistributions = 0,
  conversion = 0,
} = {}) {
  const line1 = nonNegative(nondeductibleContribution);
  const line2 = nonNegative(priorBasis);
  const line3 = line1 + line2;
  const line5 = line3;
  const line6 = nonNegative(yearEndIraValue);
  const line7 = nonNegative(otherDistributions);
  const line8 = nonNegative(conversion);
  const line9 = line6 + line7 + line8;
  const ratio = line9 > 0 ? Math.min(1, line5 / line9) : 0;
  const line11 = cents(line8 * ratio);
  const line12 = cents(line7 * ratio);
  const line13 = cents(line11 + line12);
  const line14 = cents(Math.max(0, line3 - line13));
  const taxableConversion = cents(line8 - line11);
  const taxableDistributions = cents(line7 - line12);
  return {
    basis: line5,
    totalIraValue: line9,
    ratio,
    formRatio: Math.min(1, Math.ceil(ratio * 1000) / 1000),
    nontaxableConversion: line11,
    taxableConversion,
    taxableDistributions,
    taxableTotal: cents(taxableConversion + taxableDistributions),
    basisCarriedForward: line14,
  };
}

/**
 * The whole answer for a page: the pro-rata result as entered, the same
 * result if every pre-tax IRA dollar had been rolled into a 401(k) before
 * December 31 (so line 6 held only what cannot leave), the tax attributable
 * to the pro-rata rule at the user's marginal rate, and findings.
 *
 * `yearEndIraValue` is the Dec 31 value of ALL traditional, SEP and SIMPLE
 * IRAs AFTER the conversion. `pretaxRolledOut` is how much of that pre-tax
 * value the user could move into an employer plan before Dec 31.
 */
export function backdoorRothOutcome({
  nondeductibleContribution = 0,
  priorBasis = 0,
  yearEndIraValue = 0,
  otherDistributions = 0,
  conversion = 0,
  marginalRate = 0,
  age = 0,
} = {}) {
  const input = {
    nondeductibleContribution: nonNegative(nondeductibleContribution),
    priorBasis: nonNegative(priorBasis),
    yearEndIraValue: nonNegative(yearEndIraValue),
    otherDistributions: nonNegative(otherDistributions),
    conversion: nonNegative(conversion),
  };
  const rate = Math.min(1, Math.max(0, num(marginalRate) / 100));
  const result = proRata(input);

  // What the same filer would owe if the pre-tax IRA balance were not on the
  // form on Dec 31. Only the basis dollars can remain: they are not pre-tax.
  const basisLeftInside = Math.max(0, result.basis - input.conversion);
  const clean = proRata({ ...input, yearEndIraValue: Math.min(input.yearEndIraValue, basisLeftInside) });

  const proRataExtraTaxable = cents(result.taxableConversion - clean.taxableConversion);
  const estimatedTax = cents(result.taxableConversion * rate);
  const proRataTaxCost = cents(proRataExtraTaxable * rate);

  const findings = [];
  const limit = iraLimitFor(age);
  const inputSummary = { limit };

  if (input.conversion === 0) {
    findings.push({
      severity: "info",
      title: "No conversion entered",
      detail: "Enter the amount you converted (or plan to convert) to Roth in 2026 to see how much of it is taxable.",
    });
  } else if (result.ratio >= 1) {
    findings.push({
      severity: "info",
      title: "Your conversion is entirely tax-free",
      detail: "Your basis covers every dollar the form counts, so the nontaxable ratio is 100% and no part of the conversion is taxable.",
    });
  } else if (result.taxableConversion > 0) {
    findings.push({
      severity: "high",
      title: `${percent(1 - result.ratio)} of your conversion is taxable`,
      detail: `Because pre-tax money sits in your traditional, SEP or SIMPLE IRAs on December 31, only ${percent(result.ratio)} of the conversion is a tax-free return of basis. The other ${money(result.taxableConversion)} is ordinary income for 2026.`,
    });
  }

  if (proRataExtraTaxable > 0) {
    findings.push({
      severity: "medium",
      title: "Rolling pre-tax IRA money into a 401(k) before Dec 31 could remove this",
      detail: `If your pre-tax IRA balance were in an employer 401(k) or Solo 401(k) that accepts roll-ins on December 31 instead of in an IRA, the taxable part of this conversion would fall by about ${money(proRataExtraTaxable)}${rate > 0 ? `, roughly ${money(proRataTaxCost)} of tax at your ${(rate * 100).toFixed(0)}% marginal rate` : ""}. The plan must accept the roll-in, and it must complete before year-end. Basis dollars cannot be rolled into a 401(k), so only pre-tax money moves.`,
    });
  }

  if (input.nondeductibleContribution > limit) {
    findings.push({
      severity: "high",
      title: "This contribution is above the 2026 IRA limit",
      detail: `The 2026 limit for your age is ${money(limit)} across all your traditional and Roth IRAs combined. An excess contribution is subject to a ${percent(EXCESS_CONTRIBUTION_EXCISE_RATE)} excise tax for each year it stays in the account until it is corrected.`,
    });
  }

  if (input.nondeductibleContribution > 0 || input.priorBasis > 0) {
    findings.push({
      severity: "info",
      title: "File Form 8606 for 2026",
      detail: "Report the nondeductible contribution and the conversion on Form 8606 with your return. A missing Form 8606 is how basis gets lost and the same money ends up taxed twice; keep every year's copy.",
    });
  }

  return {
    ...result,
    ...inputSummary,
    marginalRate: rate,
    estimatedTax,
    cleanTaxableConversion: clean.taxableConversion,
    proRataExtraTaxable,
    proRataTaxCost,
    findings,
  };
}
