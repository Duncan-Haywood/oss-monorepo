// Core arithmetic for the Section 174A domestic R&E catch-up election
// comparison: an eligible small business choosing between deducting its
// entire remaining unamortized 2022-2024 domestic research and experimental
// (R&E) balance in a single year (2025) or spreading it ratably over two
// years (half in 2025, half in 2026). No network calls: this applies
// published federal rules and the numbers the user supplies. It is not a
// full tax return -- see README "What this does not cover".
//
// Verified 2026-09-25 via WebSearch against the IRS's own Rev. Proc. 2025-28
// (irs.gov/pub/irs-drop/rp-25-28.pdf), BDO's and Grant Thornton's summaries
// of that guidance, RSM US's coverage of the acceleration-election
// procedures, CalCPA's "Navigating Sect. 174A Elections After OBBBA", Brady
// Ware's and Strike Tax's OBBBA/174A explainers, and Hungerford's "Big
// Changes to Section 174 Treatment Under the 2025 Tax Act", cross-checked
// against each other:
//
//   - The One Big Beautiful Bill Act (OBBBA, 2025) created new IRC Section
//     174A, permanently restoring full, immediate expensing of DOMESTIC R&E
//     costs for tax years beginning after December 31, 2024 -- reversing the
//     mandatory 5-year amortization Section 174 had required since 2022.
//   - An "eligible small business" -- average annual gross receipts of $31
//     million or less across 2022-2024 (the Section 448(c) gross-receipts
//     test) -- that had capitalized and was amortizing domestic R&E costs
//     from 2022-2024 gets a one-time CATCH-UP DEDUCTION for whatever portion
//     of those costs it had not yet amortized by the start of its first tax
//     year beginning after December 31, 2024 (2025, for a calendar-year
//     filer).
//   - Rev. Proc. 2025-28 gives two ways to claim that catch-up, elected on
//     the 2025 return: deduct the ENTIRE remaining unamortized balance in
//     2025 (the "1-year" option), or spread it RATABLY over two years --
//     half in 2025, half in 2026 (the "2-year" option).
//   - A separate, fully retroactive path -- amending 2022-2024 returns
//     directly under the same Rev. Proc. -- exists, but its election window
//     closed July 6, 2026, which is in the past as of this tool's build date
//     (2026-09-25). This calculator does not model that path; the live
//     decision a small business faces right now is the 1-year-vs-2-year
//     choice on its 2025 return, which is what this module computes.
//   - The choice is a real financial tradeoff, not a formality: taking it
//     all in 2025 front-loads the tax savings (better if 2025's marginal
//     rate or income is expected to be HIGHER than 2026's, or the business
//     simply prefers cash sooner); spreading it over 2025-2026 is better if
//     2025's rate or income is expected to be LOWER than 2026's -- e.g. 2025
//     is a loss or near-breakeven year -- or the marginal rate is expected
//     to rise in 2026.
//   - If a deduction would exceed the year's taxable income (before this
//     deduction), the excess does not vanish -- it can create or increase a
//     net operating loss (NOL) rather than producing an immediate cash tax
//     saving. This module flags that prominently and does not attempt to
//     model the value of an NOL carryforward (timing, the Section 172(a)
//     80%-of-taxable-income limitation on post-2017 NOLs, and any state
//     conformity question are all left to a professional) -- see the
//     `createsOrIncreasesNol` flag on each year's outcome.
//
// This module does not verify a filer's gross-receipts eligibility, the size
// of the remaining unamortized balance, or which return the election is
// filed on -- the user supplies each figure, and the page points at Rev.
// Proc. 2025-28 and a qualified tax professional as the sources to verify
// against before filing.

export const ELIGIBLE_SMALL_BUSINESS_GROSS_RECEIPTS_CAP = 31_000_000; // 2022-2024 average, Section 448(c) test
export const CATCH_UP_ELECTION_YEARS = [2025, 2026];
export const RETROACTIVE_ELECTION_DEADLINE = '2026-07-06'; // closed; informational only, not modeled here

// A discount rate for comparing the two paths' combined cash tax savings in
// present-value terms. There is no statutory or IRS-published rate for this
// -- it is a planning assumption the user should adjust to their own
// situation -- so the default is chosen deliberately conservatively rather
// than invented: WebSearch 2026-09-25 found 20-year Treasury yields
// clustering around 4.2%-4.8% and small-business term-loan/SBA 7(a) rates
// generally running several points above that in 2026. 6% sits between a
// risk-free floor and a small business's typical cost of borrowed cash --
// the same middle-of-the-range assumption this portfolio's own
// trump-account-calculator uses as its default *investment return*, chosen
// here for the same reason: a plausible, clearly-labeled, user-adjustable
// starting point for a near-certain, tax-sized cash flow, not a rate meant
// to price a risky business's whole future.
export const DEFAULT_DISCOUNT_RATE_PERCENT = 6;
export const MIN_DISCOUNT_RATE_PERCENT = -20;
export const MAX_DISCOUNT_RATE_PERCENT = 50;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampPercent(v, lo = 0, hi = 100) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0;
  return Math.max(lo, Math.min(hi, n));
}

export function money(n) {
  const value = Number(n) || 0;
  const format = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * Splits a requested deduction against the taxable income it is claimed
 * against. A deduction can only produce an immediate cash tax saving up to
 * the year's taxable income BEFORE this deduction -- if taxable income
 * before the deduction is zero or negative (already a loss year), or the
 * deduction requested is larger than that income, the excess does not
 * vanish: it can create or increase a net operating loss instead of an
 * immediate saving. This never guesses at NOL carryforward value; it only
 * flags that the excess exists.
 */
export function usableDeduction(deductionRequested, incomeBeforeDeduction) {
  const deduction = Math.max(0, num(deductionRequested));
  const income = num(incomeBeforeDeduction);
  if (income <= 0) {
    return { deduction, usable: 0, excess: deduction, createsOrIncreasesNol: deduction > 0 };
  }
  const usable = Math.min(deduction, income);
  const excess = deduction - usable;
  return { deduction, usable, excess, createsOrIncreasesNol: excess > 0 };
}

/**
 * The actual current-year cash tax saving from claiming `deductionRequested`
 * against a year whose taxable income before this deduction is
 * `incomeBeforeDeduction`, at marginal/effective rate `ratePercent`. Caps
 * the deduction at that income (see `usableDeduction`) rather than silently
 * assuming every dollar produces a saving.
 */
export function computeYearOutcome(deductionRequested, incomeBeforeDeduction, ratePercent) {
  const { deduction, usable, excess, createsOrIncreasesNol } = usableDeduction(deductionRequested, incomeBeforeDeduction);
  const rate = clampPercent(ratePercent) / 100;
  const cashSavings = usable * rate;
  return {
    deductionRequested: deduction,
    incomeBeforeDeduction: num(incomeBeforeDeduction),
    usable,
    excess,
    createsOrIncreasesNol,
    ratePercent: clampPercent(ratePercent),
    cashSavings,
  };
}

/**
 * Present value of a sequence of year-0, year-1, ... cash flows at annual
 * rate `rate` (a decimal, e.g. 0.06). Clamped rate keeps this finite even at
 * the extreme end of MIN_DISCOUNT_RATE_PERCENT.
 */
export function presentValue(cashflows, rate) {
  return cashflows.reduce((sum, cf, i) => sum + cf / (1 + rate) ** i, 0);
}

function splitInHalf(total) {
  // Round the first half to the cent and give the second half whatever is
  // left, so the two always sum back to the original balance exactly --
  // independently rounding each half can drop or add a cent.
  const half1 = Math.round((total / 2) * 100) / 100;
  const half2 = Math.round((total - half1) * 100) / 100;
  return [half1, half2];
}

/**
 * Compares the 1-year and 2-year Section 174A catch-up election paths for
 * one eligible small business's remaining unamortized domestic R&E balance.
 */
export function compareCatchUpPaths({
  remainingBalance = 0,
  income2025 = 0,
  income2026 = 0,
  ratePercent2025 = 0,
  ratePercent2026 = 0,
  discountRatePercent = DEFAULT_DISCOUNT_RATE_PERCENT,
} = {}) {
  const balance = Math.max(0, num(remainingBalance));
  const discountRate = clampPercent(discountRatePercent, MIN_DISCOUNT_RATE_PERCENT, MAX_DISCOUNT_RATE_PERCENT) / 100;

  const oneYear2025 = computeYearOutcome(balance, income2025, ratePercent2025);
  const oneYear2026 = computeYearOutcome(0, income2026, ratePercent2026);

  const [half2025, half2026] = splitInHalf(balance);
  const twoYear2025 = computeYearOutcome(half2025, income2025, ratePercent2025);
  const twoYear2026 = computeYearOutcome(half2026, income2026, ratePercent2026);

  const oneYear = {
    2025: oneYear2025,
    2026: oneYear2026,
    nominalTotal: oneYear2025.cashSavings + oneYear2026.cashSavings,
    presentValue: presentValue([oneYear2025.cashSavings, oneYear2026.cashSavings], discountRate),
  };
  const twoYear = {
    2025: twoYear2025,
    2026: twoYear2026,
    nominalTotal: twoYear2025.cashSavings + twoYear2026.cashSavings,
    presentValue: presentValue([twoYear2025.cashSavings, twoYear2026.cashSavings], discountRate),
  };

  const pvDifference = oneYear.presentValue - twoYear.presentValue; // positive => 1-year path ahead
  const nominalDifference = oneYear.nominalTotal - twoYear.nominalTotal;
  const pvReference = Math.max(Math.abs(oneYear.presentValue), Math.abs(twoYear.presentValue), 0.01);
  const pvDifferencePercent = (pvDifference / pvReference) * 100;

  const TIE_THRESHOLD_DOLLARS = 1; // within a dollar of PV is a genuine tie, not noise
  let recommendedPath = 'tie';
  if (balance > 0) {
    if (pvDifference > TIE_THRESHOLD_DOLLARS) recommendedPath = '1-year';
    else if (pvDifference < -TIE_THRESHOLD_DOLLARS) recommendedPath = '2-year';
  }

  const findings = [];

  if (balance <= 0) {
    findings.push({
      severity: 'info',
      title: 'No remaining balance to catch up',
      detail: 'Enter the remaining unamortized domestic R&E balance being caught up to see a comparison. With no balance, both paths produce no deduction and no savings.',
    });
  }

  for (const [label, outcome] of [
    ['1-year path, 2025', oneYear2025],
    ['2-year path, 2025', twoYear2025],
    ['2-year path, 2026', twoYear2026],
  ]) {
    if (outcome.createsOrIncreasesNol) {
      findings.push({
        severity: 'high',
        title: `${label}: deduction exceeds that year's taxable income`,
        detail: `The ${money(outcome.deductionRequested)} deduction claimed here is more than the ${money(Math.max(0, outcome.incomeBeforeDeduction))} of taxable income entered for that year before this deduction. The extra ${money(outcome.excess)} does not vanish — it can create or increase a net operating loss (NOL) rather than an immediate cash tax saving. This calculator does not model NOL carryforward value, the Section 172(a) 80%-of-taxable-income limitation on using it in a later year, or state conformity — that math is real but belongs with a tax professional.`,
      });
    }
  }

  if (balance > 0) {
    if (Math.abs(pvDifference) <= TIE_THRESHOLD_DOLLARS) {
      findings.push({
        severity: 'info',
        title: 'The two paths are within a dollar of each other in present-value terms',
        detail: 'Based on what you told us, neither path has a meaningfully larger combined tax saving once time value is factored in. The choice may come down to which return is simpler to prepare, or a factor this calculator does not model.',
      });
    } else {
      findings.push({
        severity: 'medium',
        title: `Based on what you told us, the ${recommendedPath} path has the higher present-value saving`,
        detail: `The ${recommendedPath} path's combined cash tax savings, discounted at ${discountRatePercent}%/year, are worth about ${money(Math.abs(pvDifference))} (${Math.abs(pvDifferencePercent).toFixed(1)}%) more today than the other path's, given the income, rates, and discount rate entered. This is a comparison of what you told us, not a recommendation independent of those numbers — changing any one of them can flip the answer.`,
      });
    }

    const rateDelta = clampPercent(ratePercent2026) - clampPercent(ratePercent2025);
    if (Math.abs(rateDelta) >= 1) {
      findings.push({
        severity: 'info',
        title: rateDelta > 0 ? 'Your 2026 rate is higher than your 2025 rate' : 'Your 2025 rate is higher than your 2026 rate',
        detail: rateDelta > 0
          ? 'A higher expected 2026 rate independently favors shifting more of the deduction into 2026 (the 2-year path), because each dollar deducted there is worth more in tax saved.'
          : 'A higher expected 2025 rate independently favors taking more of the deduction in 2025 (the 1-year path), because each dollar deducted there is worth more in tax saved.',
      });
    }
  }

  findings.push({
    severity: 'info',
    title: 'Federal income tax only, and this is not the retroactive-amendment path',
    detail: 'This compares the two elections available on the 2025 return under Rev. Proc. 2025-28 -- deducting the full remaining balance in 2025, or spreading it over 2025-2026. It does not model amending 2022-2024 returns directly; that separate retroactive election window closed July 6, 2026. This also estimates federal income tax only -- state conformity to Section 174A varies and is not modeled here.',
  });

  return {
    balance,
    discountRatePercent: clampPercent(discountRatePercent, MIN_DISCOUNT_RATE_PERCENT, MAX_DISCOUNT_RATE_PERCENT),
    oneYear,
    twoYear,
    pvDifference,
    pvDifferencePercent,
    nominalDifference,
    recommendedPath,
    findings,
  };
}
