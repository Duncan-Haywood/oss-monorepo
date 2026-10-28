// Federal income-tax estimate and quarterly payment plan (Form 1040-ES style) for a
// sole proprietor: the year's Schedule C profit annualised, self-employment tax from
// taxforms.mjs, the half-SE deduction, the standard deduction, a simplified 20%
// qualified business income deduction, then the bracket tax. The payment plan uses
// the IRS safe harbour: the smaller of 90% of this year's tax and 100% of last year's
// (110% when last year's AGI was over $150,000), less withholding and what is already
// paid, spread over the due dates still ahead. A worksheet, not a filing.
//
// The bracket tables below were typed from memory of IRS Rev. Proc. 2024-40 (2025) and
// 2025-32 (2026); both were checked against the IRS text on 2026-10-23. The 2026 table was checked 2026-10-23 against the IRS text of Rev. Proc. 2025-32
// (irs.gov/pub/irs-drop/rp-25-32.pdf: tables 1-3, standard deductions, QBI thresholds); the 2025 tables and QBI thresholds match the IRS text of Rev. Proc. 2024-40 (pdftotext, 2026-10-23); the 2025 standard deductions are the One Big Beautiful Bill figures from the IRS 2026 inflation release and the Form 1040 instructions ($15,750 / $31,500 / $23,625), not the Rev. Proc.'s $15,000 / $30,000 / $22,500; the SS wage bases match ssa.gov; every result warns;
// pass `brackets` and `standardDeduction` to override. Dollar amounts are cents.
import { scheduleC, selfEmployment, estimatedDueDates } from "./taxforms.mjs";

const D = (n) => n * 100;
// [upper bound of the bracket, rate]; the last bound is Infinity.
export const BRACKETS = {
  2025: {
    single: { std: D(15750), b: [[D(11925), 0.10], [D(48475), 0.12], [D(103350), 0.22], [D(197300), 0.24], [D(250525), 0.32], [D(626350), 0.35], [Infinity, 0.37]] },
    mfj: { std: D(31500), b: [[D(23850), 0.10], [D(96950), 0.12], [D(206700), 0.22], [D(394600), 0.24], [D(501050), 0.32], [D(751600), 0.35], [Infinity, 0.37]] },
    hoh: { std: D(23625), b: [[D(17000), 0.10], [D(64850), 0.12], [D(103350), 0.22], [D(197300), 0.24], [D(250500), 0.32], [D(626350), 0.35], [Infinity, 0.37]] },
  },
  2026: {
    single: { std: D(16100), b: [[D(12400), 0.10], [D(50400), 0.12], [D(105700), 0.22], [D(201775), 0.24], [D(256225), 0.32], [D(640600), 0.35], [Infinity, 0.37]] },
    mfj: { std: D(32200), b: [[D(24800), 0.10], [D(100800), 0.12], [D(211400), 0.22], [D(403550), 0.24], [D(512450), 0.32], [D(768700), 0.35], [Infinity, 0.37]] },
    hoh: { std: D(24150), b: [[D(17700), 0.10], [D(67450), 0.12], [D(105700), 0.22], [D(201750), 0.24], [D(256200), 0.32], [D(640600), 0.35], [Infinity, 0.37]] },
  },
};
// 2025 earned income credit (rows for 0 to 3 children). The statutory rates are fixed; the earned-income and
// phase-out-start amounts are the indexed ones. The maximum credits (649, 4,328, 7,152, 8,046), the income
// limits (19,104 / 50,434 / 57,310 / 61,555 single; 26,214 / 57,554 / 64,430 / 68,675 joint) and the
// investment-income limit (11,950) reproduce the IRS's table (test in estimatedtax.test.mjs).
export const EITC_2025 = {
  rows: [
    { rate: 0.0765, earnedAmount: D(8490), phaseOutRate: 0.0765, phaseOutStart: D(10620), marriedAdd: D(7110) },
    { rate: 0.34, earnedAmount: D(12730), phaseOutRate: 0.1598, phaseOutStart: D(23350), marriedAdd: D(7120) },
    { rate: 0.4, earnedAmount: D(17880), phaseOutRate: 0.2106, phaseOutStart: D(23350), marriedAdd: D(7120) },
    { rate: 0.45, earnedAmount: D(17880), phaseOutRate: 0.2106, phaseOutStart: D(23350), marriedAdd: D(7120) },
  ],
  marriedAdd: D(7120),
  investmentLimit: D(11950),
};
// 2026 earned income credit, Rev. Proc. 2025-32 section 3.06 (pdf read on irs.gov 2026-10-28): earned income amounts
// 8,680 / 13,020 / 18,290 / 18,290, maximum credits 664 / 4,427 / 7,316 / 8,231, phase-out starts 10,860 and 23,890
// (joint 18,140 and 31,160), investment-income limit 12,200. Phase-out rates are the statutory ones.
export const EITC_2026 = {
  rows: [
    { rate: 0.0765, earnedAmount: D(8680), phaseOutRate: 0.0765, phaseOutStart: D(10860), marriedAdd: D(7280) },
    { rate: 0.34, earnedAmount: D(13020), phaseOutRate: 0.1598, phaseOutStart: D(23890), marriedAdd: D(7270) },
    { rate: 0.4, earnedAmount: D(18290), phaseOutRate: 0.2106, phaseOutStart: D(23890), marriedAdd: D(7270) },
    { rate: 0.45, earnedAmount: D(18290), phaseOutRate: 0.2106, phaseOutStart: D(23890), marriedAdd: D(7270) },
  ],
  marriedAdd: D(7270),
  investmentLimit: D(12200),
};
// Taxable income above which the QBI deduction is limited by wages/property or
// phased out for service businesses; this module does not model that, so it warns.
// Additional Medicare Tax (Form 8959): 0.9% of wages plus self-employment earnings above
// a threshold fixed by statute (not indexed) by filing status; mfs is not modelled.
export const ADDL_MEDICARE_THRESHOLD = { single: D(200000), hoh: D(200000), mfj: D(250000) };
export const NIIT_THRESHOLD = { single: D(200000), hoh: D(200000), mfj: D(250000) };
// Section 199A threshold amounts: 2025 Rev. Proc. 2024-40 section 3.27 (read 2026-10-23), 2026 Rev. Proc. 2025-32
// section 3.26 (read on irs.gov 2026-10-23).
const QBI_LIMIT = {
  2025: { single: D(197300), hoh: D(197300), mfj: D(394600) },
  2026: { single: D(201750), hoh: D(201750), mfj: D(403500) },
};

export function bracketTax(taxable, brackets) {
  let tax = 0, lo = 0;
  for (const [hi, rate] of brackets) {
    if (taxable <= lo) break;
    tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return Math.round(tax);
}

const toCents = (v) => Math.round(+v * 100);

// opts: year, monthsElapsed, filing (single|mfj|hoh), otherIncome, wages (W-2 wages,
// cents), withholding (cents), priorYearTax and priorAgi (cents, from last year's
// 1040), paid (cents of estimates already sent), asOf (YYYY-MM-DD), qbi (false to
// skip the 20% deduction), children (under 17) and otherDependents (counts, for the child tax credit), qbiMinimum ({ floor, threshold } cents, years after 2026), brackets, standardDeduction, wageBase, qbiThreshold and qbiRange (cents), businessWages (the business's own W-2 payroll, cents) and service (true for a specified service trade) for the QBI limits above the threshold (`taxTableOptions` builds these from a JSON file).
// A year's figures from a JSON file in dollars, for a year the code has no table for (or to override one):
// { "standardDeduction": 16900, "brackets": [[12800, 0.10], ..., [null, 0.37]], "qbiThreshold": 205000,
//   "qbiMinimum": { "floor": 400, "threshold": 1000 }, "wageBase": 192300 }. A null last bound means no upper limit.
// Returns the options estimatedTax takes, in cents; throws on a table that cannot be right.
export function taxTableOptions(t) {
  const bad = (m) => { throw new Error(`tax table: ${m}`); };
  if (!t || typeof t !== "object") bad("expected a JSON object");
  const out = {}, dollars = (v, what) => { if (!Number.isFinite(v) || v < 0) bad(`${what} must be a number of dollars, 0 or more`); return Math.round(v * 100); };
  if (t.brackets !== undefined) {
    if (!Array.isArray(t.brackets) || !t.brackets.length) bad("brackets must be a list of [upper bound, rate]");
    let prev = 0;
    out.brackets = t.brackets.map(([hi, rate], i, all) => {
      const last = i === all.length - 1;
      if (!(rate > 0 && rate < 1)) bad(`bracket ${i + 1} rate must be between 0 and 1`);
      if (hi === null || hi === undefined) { if (!last) bad("only the last bracket may have a null upper bound"); return [Infinity, rate]; }
      const c = dollars(hi, `bracket ${i + 1} upper bound`);
      if (c <= prev) bad(`bracket ${i + 1} upper bound must be above the one before`);
      prev = c;
      return [c, rate];
    });
    if (out.brackets.at(-1)[0] !== Infinity) bad("the last bracket needs a null upper bound");
    if (t.standardDeduction === undefined) bad("brackets come with standardDeduction");
  }
  if (t.standardDeduction !== undefined) out.standardDeduction = dollars(t.standardDeduction, "standardDeduction");
  if (t.qbiThreshold !== undefined) out.qbiThreshold = dollars(t.qbiThreshold, "qbiThreshold");
  if (t.wageBase !== undefined) out.wageBase = dollars(t.wageBase, "wageBase");
  if (t.eitc !== undefined) {
    const e = t.eitc;
    if (!e || !Array.isArray(e.rows) || e.rows.length < 1 || e.rows.length > 4) bad("eitc.rows must list 1 to 4 rows, for 0 to 3 children");
    const rate = (v, what) => { if (!(v > 0 && v < 1)) bad(`${what} must be between 0 and 1`); return v; };
    out.eitc = {
      rows: e.rows.map((r, i) => ({ rate: rate(r.rate, `eitc row ${i} rate`), earnedAmount: dollars(r.earnedAmount, `eitc row ${i} earnedAmount`), phaseOutRate: rate(r.phaseOutRate, `eitc row ${i} phaseOutRate`), phaseOutStart: dollars(r.phaseOutStart, `eitc row ${i} phaseOutStart`) })),
      marriedAdd: e.marriedAdd === undefined ? 0 : dollars(e.marriedAdd, "eitc.marriedAdd"),
      investmentLimit: e.investmentLimit === undefined ? null : dollars(e.investmentLimit, "eitc.investmentLimit"),
    };
  }
  if (t.qbiMinimum !== undefined) out.qbiMinimum = { floor: dollars(t.qbiMinimum.floor, "qbiMinimum.floor"), threshold: dollars(t.qbiMinimum.threshold, "qbiMinimum.threshold") };
  return out;
}

export function estimatedTax(books, o = {}) {
  const year = o.year ?? new Date().getFullYear();
  const filing = o.filing ?? "single";
  const warnings = [];
  const months = Math.min(12, Math.max(1, o.monthsElapsed ?? 12));
  const sc = scheduleC(books, { from: `${year}-01-01`, to: `${year}-12-31` });
  const profit = Number.isFinite(o.profit) ? Math.round(o.profit) : Math.round((sc.netProfit * 12) / months); // o.profit: a whole-year profit in cents, used by annualized.mjs
  const num = (v) => (Number.isFinite(v) ? v : 0); // a blank form field arrives as NaN
  const nonNeg = (v) => Math.max(0, num(v)); // withholding and payments already sent cannot be negative
  const wages = nonNeg(o.wages), other = num(o.otherIncome), withholding = nonNeg(o.withholding), paid = nonNeg(o.paid);
  const priorTax = Number.isFinite(o.priorYearTax) ? Math.max(0, o.priorYearTax) : null; // blank or non-numeric means not given
  const se = selfEmployment(profit, { year, wages, wageBase: o.wageBase });
  const table = o.brackets ? { std: o.standardDeduction ?? 0, b: o.brackets } : BRACKETS[year]?.[filing];
  if (!table) throw new Error(`No ${filing} brackets on file for ${year}; pass brackets (and standardDeduction).`);
  if (!o.brackets) warnings.push(year === 2026 ? `The 2026 brackets and standard deductions match the IRS text of Rev. Proc. 2025-32 (checked 2026-10-23); confirm they are still current or pass brackets.` : year === 2025 ? `The 2025 brackets match the IRS text of Rev. Proc. 2024-40 and the standard deductions the Form 1040 instructions as amended by the 2025 law (checked 2026-10-23); confirm they are still current or pass brackets.` : `The ${year} brackets and standard deduction are from memory and unchecked; confirm them on irs.gov or pass brackets.`);
  const stdOnly = o.standardDeduction ?? table.std;
  // Itemised deductions (Schedule A) replace the standard deduction when larger. Pass the total after the
  // SALT cap and the 7.5%-of-AGI medical floor; those limits are the filer's to apply.
  const itemized = nonNeg(o.itemized);
  const std = Math.max(stdOnly, itemized);
  const itemizing = itemized > stdOnly;
  if (itemizing) warnings.push("Itemised deductions are larger than the standard deduction, so they are used; pass the Schedule A total after the SALT cap and the medical-expense floor.");
  // Above-the-line adjustments for the self-employed. A SEP-IRA or solo 401(k) contribution (Schedule 1
  // line 16) comes off first, then the self-employed health insurance deduction (Form 7206, line 17),
  // capped at the business profit left after both. Both also come off the QBI base (Treas. Reg. 1.199A-3).
  // Whether the person was eligible for an employer-subsidised plan in a month is theirs to say: the
  // premiums passed in must be only the months they were not.
  const retirementIn = nonNeg(o.retirement), healthIn = nonNeg(o.healthInsurance);
  const afterSe = Math.max(0, profit - se.deduction);
  const retirementDeduction = Math.min(retirementIn, afterSe);
  const healthDeduction = Math.min(healthIn, afterSe - retirementDeduction);
  if (retirementDeduction < retirementIn) warnings.push("The retirement contribution is capped at the business profit after half of self-employment tax; the rest is not deducted here.");
  if (healthDeduction < healthIn) warnings.push("The self-employed health insurance deduction is capped at the business profit left after half of self-employment tax and any retirement contribution; the rest may be an itemised medical expense instead.");
  if (healthDeduction) warnings.push("Self-employed health insurance counts only for months you could not join a plan subsidised by your or your spouse's employer; pass premiums for the other months only.");
  const adjustments = retirementDeduction + healthDeduction;
  const agi = profit - se.deduction - adjustments + wages + other;
  // Age 65 or older / blind: an extra standard deduction per box (not for itemizers), and from 2025 to 2028 the
  // "senior" deduction of $6,000 per person 65 or older, cut by 6% of AGI over $75,000 ($150,000 joint). The 2026
  // extra amounts ($2,050 single/head of household, $1,650 married) and the senior deduction are from memory,
  // unchecked against the IRS text, so every use warns; pass extraStandard / seniorDeduction (cents) to override.
  const nOlder = Math.min(2, Math.max(0, Math.floor(num(o.over65)))), nBlind = Math.min(2, Math.max(0, Math.floor(num(o.blind))));
  const extra = itemizing || o.brackets && o.extraStandard == null ? 0 : (nOlder + nBlind) * (o.extraStandard ?? D(filing === "mfj" ? 1650 : 2050));
  let seniorCut = 0;
  if (nOlder && year >= 2025 && year <= 2028) {
    const from = o.seniorThreshold ?? D(filing === "mfj" ? 150000 : 75000);
    seniorCut = Math.max(0, nOlder * (o.seniorDeduction ?? D(6000)) - Math.round(0.06 * Math.max(0, agi - from)));
  }
  if (extra || seniorCut) warnings.push("The extra standard deduction for age 65 or blindness and the 2025-2028 senior deduction ($6,000 each, phased out at 6% of AGI over $75,000, $150,000 joint) use figures not yet checked against the IRS text; confirm them.");
  const beforeQbi = Math.max(0, agi - std - extra - seniorCut);
  const qbiIncome = Math.max(0, profit - se.deduction - adjustments);
  // Above the threshold (section 199A(b)(2)(B), (d)(3)): the deduction is the smaller of 20% of QBI and 50% of the
  // business's own W-2 wages (opts.businessWages, cents; none for a sole proprietor with no staff), phased in over
  // the range; a specified service business (opts.service) loses it over the same range. Property (the 2.5% leg) is
  // not modelled. The 2026 range (75,000 single / 150,000 joint) is from secondary sources, unchecked.
  const qbiThreshold = o.qbiThreshold ?? (QBI_LIMIT[year] ?? QBI_LIMIT[2026])[filing] ?? Infinity;
  const qbiRange = o.qbiRange ?? (year >= 2026 ? 75000 : 50000) * (filing === "mfj" ? 200 : 100);
  const w2 = nonNeg(o.businessWages);
  const limited = (q) => {
    if (beforeQbi <= qbiThreshold) return Math.round(0.2 * q);
    const pct = Math.min(1, (beforeQbi - qbiThreshold) / qbiRange);
    const qa = o.service ? q * (1 - pct) : q, wa = o.service ? w2 * (1 - pct) : w2;
    const full = 0.2 * qa;
    return Math.round(Math.max(0, full - pct * Math.max(0, full - 0.5 * wa)));
  };
  let qbiDeduction = o.qbi === false || profit <= 0 ? 0 : Math.min(limited(qbiIncome), Math.round(0.2 * beforeQbi));
  // IRC 199A(i), read at law.cornell.edu 2026-10-23: for tax years after 2025 the deduction is the
  // greater of the usual figure and $400, for a taxpayer whose QBI from businesses they materially
  // participate in is "at least" $1,000 (so exactly $1,000 qualifies). Both amounts are indexed for
  // years after 2026 (subsection (i)(3), rounded to $5): pass qbiMinimum { floor, threshold } in cents
  // for those years. Capped here by taxable income before the deduction. Only bites for QBI of $1,000
  // to $2,000. Materially participating is the user's call; the page does not ask.
  const qmin = { floor: D(400), threshold: D(1000), ...(o.qbiMinimum ?? {}) };
  if (o.qbi !== false && year >= 2026 && qbiIncome >= qmin.threshold && qmin.floor > qbiDeduction) {
    qbiDeduction = Math.min(qmin.floor, beforeQbi);
    warnings.push("The minimum QBI deduction (IRC 199A(i)) applies only if you materially participate in the business; if not, the deduction may be smaller.");
  }
  if (o.qbi !== false && year >= 2027 && !o.qbiMinimum) warnings.push(`The $400 minimum QBI deduction and its $1,000 threshold are indexed for ${year} (IRC 199A(i)(3)); pass qbiMinimum { floor, threshold } in cents from the IRS revenue procedure, or treat a small-QBI result as approximate.`);
  if (o.qbi !== false && profit > 0 && beforeQbi > qbiThreshold) warnings.push(`Taxable income is above the QBI threshold, so the 20% deduction is limited to 50% of the business's W-2 wages (${w2 ? "you passed " + w2 / 100 : "none for a sole proprietor with no staff"})${o.service ? " and phased out, as you marked this a service business" : "; pass service: true if yours is a service business (law, health, consulting, accounting, finance and similar), which loses it over the range"}. Property is not modelled. The phase-in range is ${qbiRange / 100} dollars${o.qbiRange === undefined && year >= 2026 ? " (the 2026 widening from 50,000/100,000 is unchecked against the statute; pass qbiRange)" : ""}.`);
  const taxable = Math.max(0, beforeQbi - qbiDeduction);
  const incomeTax = bracketTax(taxable, table.b);
  // Part II of Form 8959: the SE threshold is lowered by wages, which count first.
  const T = ADDL_MEDICARE_THRESHOLD[filing] ?? D(200000);
  const addlMedicare = Math.round(0.009 * (Math.max(0, wages - T) + Math.max(0, se.netEarnings - Math.max(0, T - wages))));
  if (addlMedicare) warnings.push("Includes the 0.9% Additional Medicare Tax (Form 8959) on earnings above " + T / 100 + "; an employer withholds it on wages over $200,000 only, so check the wage part against your W-2.");
  // Net investment income tax (Form 8960): 3.8% of the smaller of net investment income and modified AGI
  // above a statutory threshold (not indexed). Investment income is part of otherIncome; pass the part of it
  // that is interest, dividends, gains or passive rent. MAGI is taken as AGI.
  const nii = nonNeg(o.investmentIncome);
  const NT = NIIT_THRESHOLD[filing] ?? D(200000);
  const niit = Math.round(0.038 * Math.min(nii, Math.max(0, agi - NT)));
  if (niit) warnings.push("Includes the 3.8% net investment income tax (Form 8960) on the smaller of your investment income and the AGI above " + NT / 100 + "; investment income is taken as already inside the other income you passed.");
  // Child tax credit and credit for other dependents (Schedule 8812). Per-child amounts are opts so a
  // later year can be passed in cents; the defaults are the 2026 figures from secondary sources (OBBBA
  // $2,200 / $1,700 refundable / $500 other; not yet read in the IRS text), so every use warns.
  const kids = Math.max(0, Math.floor(num(o.children))), others = Math.max(0, Math.floor(num(o.otherDependents)));
  let childCredit = 0, refundableCredit = 0;
  if (kids || others) {
    const perChild = o.childCredit ?? D(2200), perOther = o.otherDependentCredit ?? D(500), refundCap = o.childCreditRefundable ?? D(1700);
    const phaseFrom = o.childCreditThreshold ?? (filing === "mfj" ? D(400000) : D(200000));
    // $50 less for each $1,000, or part of $1,000, of income over the threshold (modified AGI taken as AGI).
    const over = Math.max(0, agi - phaseFrom), cut = Math.ceil(over / D(1000)) * D(50);
    const full = kids * perChild + others * perOther, allowed = Math.max(0, full - cut);
    const nonref = Math.min(allowed, incomeTax);
    // What is left of the child part is refundable: up to refundCap per child and 15% of earned income over $2,500.
    const earned = Math.max(0, profit - se.deduction) + wages;
    const refundable = Math.min(Math.max(0, allowed - nonref), Math.max(0, allowed - others * perOther), kids * refundCap, Math.round(0.15 * Math.max(0, earned - D(2500))));
    childCredit = nonref; refundableCredit = Math.max(0, refundable);
    warnings.push("Child credits assume each child is under 17 with a Social Security number valid for work, and that you can claim them; the 2026 amounts ($2,200, $1,700 refundable, $500 other, phase-out over $200,000 or $400,000 joint) come from secondary sources, so check them against Schedule 8812 or pass childCredit, childCreditRefundable and childCreditThreshold in cents.");
  }
  // Earned income credit (Schedule EIC). No built-in figures: the IRS tables are not readable from here, so the
  // schedule comes from `eitc` (cents, built by taxTableOptions from the tax-table file) and nothing is guessed.
  // credit = min(rate x earned, rate x earnedAmount), less phaseOutRate on the larger of earned income and AGI
  // above the phase-out start (the joint start is higher by `marriedAdd`); no credit above the investment limit.
  let eitcCredit = 0;
  const builtinEitc = !o.eitc && (year === 2025 || year === 2026) && o.eitcChildren !== undefined;
  const sched = o.eitc ?? (builtinEitc ? (year === 2026 ? EITC_2026 : EITC_2025) : undefined);
  if (sched) {
    const row = sched.rows?.[Math.min(3, Math.max(0, Math.floor(num(o.eitcChildren ?? o.children))))];
    const earnedEic = Math.max(0, profit - se.deduction) + wages;
    if (row && o.filing !== "mfs" && (sched.investmentLimit == null || nii <= sched.investmentLimit)) {
      // Schedule EIC's lookup table works on $50 bands and computes the credit at each band's midpoint (`eitcTable`).
      const band = (c) => (o.eitcTable && c > 0 ? (Math.floor(c / 5000) * 5000) + 2500 : c);
      const earnedBand = band(earnedEic), agiBand = band(agi);
      const start = row.phaseOutStart + (filing === "mfj" ? row.marriedAdd ?? sched.marriedAdd ?? 0 : 0);
      const base = Math.min(Math.round(row.rate * earnedBand), Math.round(row.rate * row.earnedAmount));
      eitcCredit = Math.max(0, base - Math.round(row.phaseOutRate * Math.max(0, Math.max(earnedBand, agiBand) - start)));
    }
    if (builtinEitc) warnings.push(`Earned income credit uses the built-in ${year} schedule (${year === 2026 ? "Rev. Proc. 2025-32 section 3.06" : "maximum credits, income limits and investment-income limit read from irs.gov's EITC tables page"}, read 2026-10-28); it assumes the qualifying-child, age, residency and Social Security number tests are met (Schedule EIC) and the credit is refundable.`);
    else warnings.push("Earned income credit uses the schedule you passed, not a built-in table; it assumes the qualifying-child, age, residency and Social Security number tests are met (Schedule EIC) and the credit is refundable.");
  }
  const total = Math.max(0, incomeTax - childCredit) + se.tax + addlMedicare + niit - refundableCredit - eitcCredit;
  const marginal = (table.b.find(([hi]) => taxable <= hi) ?? [0, 0])[1];

  // Safe harbour: smaller of 90% of this year and 100%/110% of last year.
  const current90 = Math.round(total * 0.9);
  let prior = null;
  if (priorTax != null) prior = Math.round(priorTax * (num(o.priorAgi) > D(150000) ? 1.1 : 1.0));
  else warnings.push("No prior-year tax given: the plan uses 90% of this year's estimate. Pass priorYearTax (and priorAgi) from last year's 1040 for the 100%/110% safe harbour, which is often far smaller.");
  const required = Math.max(0, (prior == null ? current90 : Math.min(current90, prior)) - withholding);
  const owedAfterWithholding = total - withholding;
  const exempt = owedAfterWithholding < D(1000);
  if (exempt) warnings.push("Tax after withholding is under $1,000, so no estimated payments are required.");

  const dates = estimatedDueDates(year);
  const asOf = o.asOf ?? null;
  const future = asOf ? dates.filter((d) => d >= asOf) : dates;
  const remaining = exempt ? 0 : Math.max(0, required - paid);
  const each = future.length ? Math.floor(remaining / future.length) : 0;
  const payments = dates.map((due) => {
    const idx = future.indexOf(due);
    if (idx < 0) return { due, cents: 0, status: "past" };
    return { due, cents: idx === future.length - 1 ? remaining - each * (future.length - 1) : each, status: "due" };
  });
  if (!future.length && remaining) warnings.push(`All four dates have passed with ${remaining / 100} still unpaid; pay now and expect an underpayment penalty (Form 2210).`);
  // The rest is paid with the return: the balance, not a penalty.
  const balanceWithReturn = Math.max(0, total - withholding - Math.max(paid, 0) - payments.reduce((s, p) => s + p.cents, 0));
  // State income tax, a flat rate you supply (no state's table is built in): rate x (federal AGI less the
  // state deduction), less state withholding. Kept apart from the federal total and safe harbour: states set
  // their own safe-harbour rules and dates.
  let state = null;
  if (o.stateRate !== undefined && Number.isFinite(o.stateRate)) {
    if (!(o.stateRate >= 0 && o.stateRate <= 0.2)) throw new Error("stateRate must be between 0 and 20 percent");
    const base = Math.max(0, agi - nonNeg(o.stateDeduction));
    const tax = Math.round(base * o.stateRate), stateWithheld = nonNeg(o.stateWithheld);
    state = { rate: o.stateRate, base, tax, withheld: stateWithheld, balance: Math.max(0, tax - stateWithheld), quarterly: Math.ceil(Math.max(0, tax - stateWithheld) / 4) };
    warnings.push("State tax is a flat rate you supplied on federal AGI less your state deduction; it ignores the state's brackets, credits and its own safe-harbour dates. Check the state's form.");
  }
  warnings.push(...sc.warnings, ...se.warnings);
  return { year, filing, state, monthsElapsed: months, profit, se, retirementDeduction, healthDeduction, agi, standardDeduction: std, extraStandard: extra, seniorDeduction: seniorCut, qbiDeduction, taxable, incomeTax, childCredit, refundableCredit, eitcCredit, addlMedicare, niit, itemizing, marginalRate: marginal, totalTax: total, effectiveRate: profit + wages + other > 0 ? total / (profit + wages + other) : 0, safeHarbor: { current90, prior, required, exempt }, withholding, paid, payments, balanceWithReturn, warnings };
}

export { toCents };
