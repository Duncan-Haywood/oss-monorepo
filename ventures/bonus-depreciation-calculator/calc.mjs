// Core arithmetic for comparing three ways to write off a new equipment/asset
// purchase: 100% bonus depreciation (IRC Section 168(k)), a Section 179
// election, and plain MACRS depreciation with no election at all. No network
// calls: this applies published federal rules and the numbers the user
// supplies. It is not a full tax return -- see README "What this does not
// cover".
//
// Verified 2026-09-25 via WebSearch against BDO's "One Big Beautiful Bill Act
// Expands 100% Depreciation Expensing Opportunities", RSM US's "The OBBBA
// restores and expands bonus depreciation", Grant Thornton's "OBBBA offers
// new ways to accelerate depreciation", Section179.org's 2026 deduction guide
// and its "Section 179 vs Bonus Depreciation" comparison, Instead's "Section
// 179 expensing limits for 2026", Thomson Reuters' "Who needs Sec. 179
// expensing when 100% bonus depreciation is available?", and WCG's "Section
// 179 or Bonus Depreciation", cross-checked against each other:
//
//   - The One Big Beautiful Bill Act (OBBBA, signed July 4, 2025) made 100%
//     bonus depreciation PERMANENT for qualifying tangible property (20-year
//     class life or less, including used property) both ACQUIRED and placed
//     in service after January 19, 2025 -- reversing the TCJA phase-down that
//     had cut bonus depreciation to 40% for 2025 acquisitions before OBBBA.
//   - Bonus depreciation is NOT limited by the taxpayer's taxable income and
//     has no dollar cap or phase-out -- it can create or increase a net
//     operating loss (NOL), which then carries forward under the post-TCJA
//     NOL rules (no carryback for most businesses; limited to offsetting 80%
//     of a future year's taxable income). It is also not elective per
//     dollar: a taxpayer either claims it for an entire class of property
//     placed in service that year, or affirmatively elects out of the whole
//     class -- there is no "claim half" option, unlike Section 179.
//   - Section 179 lets a business elect to expense SPECIFIC dollar amounts of
//     the same kind of qualifying property, up to an annual dollar limit that
//     phases out dollar-for-dollar once total qualifying purchases for the
//     year exceed a threshold -- OBBBA raised the 2025 limit to $2,500,000
//     with a $4,000,000 phase-out threshold (both up from the pre-OBBBA
//     2025 figures of $1,250,000 / $3,130,000), and both figures are now
//     indexed for inflation: $2,560,000 / $4,090,000 for 2026.
//   - Unlike bonus depreciation, a Section 179 election IS capped at the
//     taxpayer's aggregate active-trade-or-business taxable income for the
//     year (before this deduction) -- it cannot create or increase a loss.
//     Any elected amount disallowed for this reason carries forward
//     INDEFINITELY as a Section 179 carryforward, still subject to the same
//     income limitation in every future year it is claimed -- a materially
//     different (generally less flexible) carryforward than an NOL.
//   - Section 179 requires more than 50% business use in the year the
//     property is placed in service (IRS Pub. 946, ch. 2). For LISTED
//     property (passenger vehicles and similar), 50% or less business use
//     also rules out bonus depreciation and forces the straight-line
//     Alternative Depreciation System (ADS) (IRC 280F(b)(1)); other property
//     keeps bonus and MACRS on its business-use share. This module does not
//     model ADS or ask whether property is listed; it only flags the
//     condition.
//   - The "no election" baseline is ordinary MACRS depreciation under the
//     200%-declining-balance method (3-, 5-, 7- and 10-year property) or the
//     150%-declining-balance method (15- and 20-year property, IRC
//     168(b)(2)), with the half-year convention (IRS Pub.
//     946, Table A-1) -- the first-year percentages below (33.33% / 3-year,
//     20.00% / 5-year, 14.29% / 7-year, 10.00% / 10-year, 5.00% / 15-year,
//     3.750% / 20-year) are long-standing published constants, unchanged by
//     OBBBA and not expected to change.
//   - State conformity to bonus depreciation varies widely -- several states
//     decouple from it entirely or cap it, while most states conform much
//     more closely to Section 179 (often at the pre-OBBBA federal dollar
//     limits). This module estimates FEDERAL income tax only; state
//     conformity is a case to bring to a preparer licensed in that state.
//
// This module does not verify a filer's business-use percentage, total
// qualifying purchases for the year, or which property class an asset
// belongs to -- the user supplies each figure, and the page points at a
// qualified tax professional as the source to verify against before filing.

export const SECTION_179_RULES = {
  2025: { limit: 2_500_000, phaseoutThreshold: 4_000_000 },
  2026: { limit: 2_560_000, phaseoutThreshold: 4_090_000 },
};

// IRS Pub. 946, Table A-1: 200% declining balance, half-year convention,
// first recovery year. Stable published constants, not a per-year figure.
export const FIRST_YEAR_MACRS_RATE = {
  3: 0.3333,
  5: 0.2000,
  7: 0.1429,
  10: 0.1000,
  15: 0.0500,
  20: 0.0375,
};

export const MIN_BUSINESS_USE_PERCENT_FOR_ACCELERATION = 50; // > this, not >=

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
  const format = (v) => `$${v.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  const text = format(Math.abs(value));
  return value < 0 && /[1-9]/.test(text) ? `-${text}` : text;
}

/**
 * A requested deduction can only produce an immediate cash tax saving up to
 * the year's taxable income BEFORE this deduction. Used identically for
 * bonus depreciation and the MACRS baseline (neither is limited by income
 * as a matter of election, but the CASH benefit this year is capped by what
 * there is to offset) -- excess is flagged as NOL-creating, never valued.
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
 * Section 179's own, different cap: elected amount is capped by the annual
 * dollar limit (after phase-out), THEN by the year's taxable income -- but
 * the disallowed remainder is a Section 179 CARRYFORWARD (still a 179
 * deduction, still income-limited every future year it's used), never an
 * NOL. Keeping this separate from `usableDeduction` is deliberate: conflating
 * the two carryforward mechanisms is exactly the mistake a hand estimate
 * makes.
 */
export function section179Outcome({
  eligibleBasis,
  otherQualifyingPurchases = 0,
  incomeBeforeDeduction = 0,
  taxYear = 2025,
} = {}) {
  const rules = SECTION_179_RULES[taxYear] || SECTION_179_RULES[2025];
  const basis = Math.max(0, num(eligibleBasis));
  const otherPurchases = Math.max(0, num(otherQualifyingPurchases));
  const totalQualifyingPurchases = basis + otherPurchases;
  const phaseoutReduction = Math.max(0, totalQualifyingPurchases - rules.phaseoutThreshold);
  const limitAfterPhaseout = Math.max(0, rules.limit - phaseoutReduction);
  const phasedOutToZero = limitAfterPhaseout <= 0 && basis > 0;

  const elected = Math.min(basis, limitAfterPhaseout);
  const income = Math.max(0, num(incomeBeforeDeduction));
  const usable = Math.min(elected, income);
  const carryforward = elected - usable;

  return {
    limit: rules.limit,
    phaseoutThreshold: rules.phaseoutThreshold,
    totalQualifyingPurchases,
    limitAfterPhaseout,
    phasedOutToZero,
    elected,
    usable,
    carryforward,
    incomeLimited: carryforward > 0,
  };
}

/**
 * Compares 100% bonus depreciation, a Section 179 election, and plain MACRS
 * (no election) for one asset purchase.
 */
export function compareDepreciationPaths({
  assetCost = 0,
  businessUsePercent = 100,
  otherQualifyingPurchases = 0,
  taxYear = 2025,
  taxableIncomeBeforeDeduction = 0,
  ratePercent = 0,
  recoveryYears = 5,
} = {}) {
  const cost = Math.max(0, num(assetCost));
  const businessUse = clampPercent(businessUsePercent, 0, 100);
  const eligibleBasis = cost * (businessUse / 100);
  const rate = clampPercent(ratePercent) / 100;
  const income = num(taxableIncomeBeforeDeduction);
  const recovery = FIRST_YEAR_MACRS_RATE[recoveryYears] ? recoveryYears : 5;
  const macrsRate = FIRST_YEAR_MACRS_RATE[recovery];

  const belowHalfBusinessUse = cost > 0 && businessUse <= MIN_BUSINESS_USE_PERCENT_FOR_ACCELERATION;

  const bonus = usableDeduction(eligibleBasis, income);
  const bonusCashSavings = bonus.usable * rate;

  // At 50% or less business use no Section 179 election is allowed at all
  // (Pub. 946 ch. 2), so nothing is elected or carried forward and the whole
  // basis falls to bonus in this column. Red team 2026-11-23: the report used
  // to say "not available" and then show a Section 179 carryforward.
  const section179 = section179Outcome({
    eligibleBasis: belowHalfBusinessUse ? 0 : eligibleBasis,
    otherQualifyingPurchases,
    incomeBeforeDeduction: income,
    taxYear,
  });
  // Basis the Section 179 election does not cover (above the limit after
  // phase-out) is not lost: bonus depreciation applies to the remaining
  // basis in the same year, after the 179 amount (IRC 168(k)(1)(A); Pub. 946
  // ch. 3, "Figuring the special depreciation allowance": basis is reduced by
  // any 179 deduction first). Its cash value is capped by the income left
  // after the usable 179 amount; any excess is NOL-creating like bonus.
  // Quality audit 2026-11-17, defect 0: this remainder used to be dropped.
  const remainderBasis = eligibleBasis - section179.elected;
  const remainder = usableDeduction(remainderBasis, income - section179.usable);
  const section179CashSavings = (section179.usable + remainder.usable) * rate;

  const macrsYear1Deduction = eligibleBasis * macrsRate;
  const macrs = usableDeduction(macrsYear1Deduction, income);
  const macrsCashSavings = macrs.usable * rate;
  const macrsRemainingBasis = eligibleBasis - macrsYear1Deduction;

  const findings = [];

  if (cost <= 0) {
    findings.push({
      severity: 'info',
      title: 'Enter an asset cost to compare the three paths',
      detail: 'With no cost entered, all three paths produce no deduction and no savings.',
    });
  }

  if (belowHalfBusinessUse) {
    findings.push({
      severity: 'high',
      title: 'Business use is at or below 50% -- Section 179 is not available',
      detail: `At ${businessUse}% business use, no Section 179 election is allowed: it requires more than 50% business use in the year the property is placed in service (IRS Pub. 946, ch. 2), so the Section 179 column elects nothing and shows bonus depreciation on the whole basis instead. If this is listed property (a passenger vehicle or similar), 50% or less business use also rules out bonus depreciation and requires the straight-line Alternative Depreciation System (IRC 280F(b)(1)), which this calculator does not model. Other property keeps bonus depreciation and MACRS on its business-use share.`,
    });
  }

  if (cost > 0 && recovery >= 15) {
    findings.push({
      severity: 'medium',
      title: 'Check that 15- or 20-year property qualifies for Section 179',
      detail: 'Land improvements (paved parking, fences, docks, bridges) and buildings are not Section 179 property (IRS Pub. 946, ch. 2), though qualified improvement property and some nonresidential roofs and HVAC can be. If this asset is a land improvement, ignore the Section 179 column; bonus depreciation and MACRS still apply.',
    });
  }

  if (section179.phasedOutToZero) {
    findings.push({
      severity: 'high',
      title: `Section 179 is fully phased out for ${taxYear}`,
      detail: `Total qualifying purchases for the year (${money(section179.totalQualifyingPurchases)}, including this asset) exceed the ${money(section179.phaseoutThreshold)} phase-out threshold by enough to reduce the ${money(section179.limit)} limit to zero. No Section 179 election is available this year; bonus depreciation has no such phase-out.`,
    });
  } else if (section179.limitAfterPhaseout < section179.limit) {
    findings.push({
      severity: 'medium',
      title: `Section 179's limit is reduced by the phase-out`,
      detail: `Total qualifying purchases of ${money(section179.totalQualifyingPurchases)} exceed the ${money(section179.phaseoutThreshold)} threshold, cutting the available ${taxYear} limit from ${money(section179.limit)} to ${money(section179.limitAfterPhaseout)}.`,
    });
  }

  if (remainderBasis > 0 && section179.elected > 0) {
    findings.push({
      severity: 'medium',
      title: 'Bonus depreciation covers the basis above the Section 179 limit',
      detail: `Section 179 can only expense ${money(section179.elected)} of the ${money(eligibleBasis)} basis this year. The Section 179 column takes 100% bonus depreciation on the remaining ${money(remainderBasis)} in the same year, as a preparer would (bonus applies to basis after the 179 deduction, IRS Pub. 946 ch. 3). If you elect out of bonus for this class, the remainder gets ordinary MACRS instead, about ${money(remainderBasis * macrsRate)} in year one.`,
    });
  }

  if (bonus.createsOrIncreasesNol) {
    findings.push({
      severity: 'high',
      title: 'Bonus depreciation exceeds this year\'s taxable income',
      detail: `The ${money(bonus.deduction)} bonus-depreciation deduction is more than the ${money(Math.max(0, income))} of taxable income entered. The extra ${money(bonus.excess)} does not vanish -- it can create or increase a net operating loss (NOL), which carries forward and can offset up to 80% of a future year's taxable income under current law (no carryback for most businesses). This calculator does not value that carryforward.`,
    });
  }

  if (section179.incomeLimited) {
    findings.push({
      severity: 'high',
      title: 'Section 179 elected amount exceeds this year\'s taxable income',
      detail: `${money(section179.carryforward)} of the ${money(section179.elected)} elected cannot be used this year because Section 179 is capped at taxable income. Unlike bonus depreciation's NOL, this carries forward as a SECTION 179 CARRYFORWARD -- still a 179 deduction, still limited by taxable income in every future year it is claimed, with no 80% cap but no guarantee of full use either.`,
    });
  }

  if (cost > 0 && !belowHalfBusinessUse) {
    findings.push({
      severity: 'info',
      title: 'Section 179 lets you choose the amount; bonus depreciation does not',
      detail: `Bonus depreciation is all-or-nothing at 100% for the property's full class -- there is no partial election. Section 179 is elected asset-by-asset up to the year's limit, which is why it stays useful even now: a business expecting a loss or low-income year might prefer NOT to create a large NOL, and either elect a smaller Section 179 amount capped to income, or affirmatively elect out of bonus depreciation and use plain MACRS instead, preserving more depreciation for a future higher-income year. That tradeoff depends on income expectations this calculator does not know.`,
    });
  }

  findings.push({
    severity: 'info',
    title: 'Federal income tax only -- state conformity varies',
    detail: 'This estimates federal tax only. Several states decouple from bonus depreciation entirely or cap it well below 100%, while most states conform more closely to Section 179 (often at pre-OBBBA federal dollar limits). Check your state\'s own rules with a preparer licensed there.',
  });

  return {
    eligibleBasis,
    businessUsePercent: businessUse,
    belowHalfBusinessUse,
    taxYear,
    recoveryYears: recovery,
    macrsRate,
    bonus: { ...bonus, cashSavings: bonusCashSavings },
    section179: {
      ...section179,
      remainderBasis,
      remainderBonus: remainder.deduction,
      remainderUsable: remainder.usable,
      remainderExcess: remainder.excess,
      totalUsable: section179.usable + remainder.usable,
      cashSavings: section179CashSavings,
    },
    macrs: { ...macrs, year1Deduction: macrsYear1Deduction, remainingBasis: macrsRemainingBasis, cashSavings: macrsCashSavings },
    findings,
  };
}
