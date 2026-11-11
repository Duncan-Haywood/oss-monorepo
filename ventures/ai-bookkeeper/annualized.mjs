// Annualized income installment method (Form 2210 Schedule AI) for a sole proprietor whose income
// is lumpy: a landscaper who earns in summer, a tax preparer who earns in spring, a seller whose
// Q4 is the year. The regular safe harbour asks for a quarter of the year's required payment by
// each due date; this method asks only for the share the year-to-date profit, annualized, supports,
// so a back-loaded year owes little early and does not trip the underpayment penalty.
//
// Checked 2026-11-11 against the form itself (pdftotext of irs.gov/pub/irs-pdf/f2210.pdf, "Form 2210
// (2025)", Schedule AI, and i2210.pdf, its instructions; annualized.test.mjs pins the printed
// figures). Part I: periods end March 31, May 31, August 31 and December 31 (line headings); line 2
// annualization amounts 4, 2.4, 1.5 and 1; line 7 is the full standard deduction in every column;
// line 20 applicable percentages 22.5%, 45%, 67.5% and 90%; lines 22 to 27 take the smaller of the
// annualized amount still unmet and 25% of the required annual payment plus any regular quarter not
// used earlier. Part II (self-employment tax, lines 28 to 36) is done line by line: line 28 is the
// period's net profit x 92.35%, zero when under $400 for the period (instructions, "Line 28"); line
// 29 is the wage base prorated by 3, 5, 8 and 12 months (printed for 2025 as $44,025, $73,375,
// $117,400 and $176,100); line 33 multiplies the smaller of line 28 and the base left after wages
// by 0.496, 0.2976, 0.186 and 0.124, and line 35 multiplies line 28 by 0.116, 0.0696, 0.0435 and
// 0.029. The form's other set of period ends (2/28, 4/30, 7/31, 11/30) is for estates and trusts
// only and is not used. Credits are figured on annualized income (instructions, "Line 18"), as the
// estimate does.
//
// Simplifications: wages, other income and withholding are taken as even through the year (period
// wages are the year's x months/12, the form's default for withholding); the period's half of
// self-employment tax comes off annualized income as the annualized figure's half. The penalty is
// figured both ways with penalty2210.mjs (Part III and the instructions' penalty worksheet) from
// the payments given, so the result shows whether checking box C lowers it. Dollar amounts are
// cents. A worksheet, not a filing.
import { scheduleC, estimatedDueDates, SS_WAGE_BASE } from "./taxforms.mjs";
import { estimatedTax } from "./estimatedtax.mjs";
import { form2210Penalty } from "./penalty2210.mjs";

export const PERIODS = [
  { end: "03-31", months: 3, factor: 4, pct: 0.225, seSs: 0.496, seMed: 0.116, label: "Jan 1 to Mar 31" },
  { end: "05-31", months: 5, factor: 2.4, pct: 0.45, seSs: 0.2976, seMed: 0.0696, label: "Jan 1 to May 31" },
  { end: "08-31", months: 8, factor: 1.5, pct: 0.675, seSs: 0.186, seMed: 0.0435, label: "Jan 1 to Aug 31" },
  { end: "12-31", months: 12, factor: 1, pct: 0.9, seSs: 0.124, seMed: 0.029, label: "Jan 1 to Dec 31" },
];

// Schedule AI Part II for one period (column i): profit to date and wages for the period, cents.
export function annualizedSelfEmployment(periodProfit, i, { year, periodWages = 0, wageBase } = {}) {
  const p = PERIODS[i];
  const base = wageBase ?? SS_WAGE_BASE[year];
  const warnings = base === undefined ? [`No social security wage base on file for ${year}; pass wageBase.`] : [];
  const ne = Math.round(Math.max(0, periodProfit) * 0.9235);
  const line28 = ne < 40000 ? 0 : ne;
  const line29 = base === undefined ? Infinity : Math.round((base * p.months) / 12);
  const line30 = Math.max(0, periodWages);
  const line31 = Math.max(0, line29 - line30);
  const line33 = Math.round(Math.min(line28, line31) * p.seSs);
  const line35 = Math.round(line28 * p.seMed);
  const line36 = line33 + line35;
  return { line28, line29, line30, line31, line33, line35, line36, warnings };
}

// opts are estimatedTax's (year, filing, wages, otherIncome, withholding, priorYearTax, priorAgi,
// brackets, ...) plus payments: [{ date: "YYYY-MM-DD", cents }] already sent as estimates (an
// overpayment applied from last year is a payment dated April 15), and rates (penalty2210.mjs).
export function annualizedInstallments(books, opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const { payments = [], paid, asOf, rates, ...rest } = opts;
  const warnings = [];
  const dates = estimatedDueDates(year);
  const whole = estimatedTax(books, { ...rest, year, monthsElapsed: 12 });
  const withholding = Number.isFinite(rest.withholding) ? Math.max(0, rest.withholding) : 0;
  const wages = Number.isFinite(rest.wages) ? Math.max(0, rest.wages) : 0;
  const required = whole.safeHarbor.prior == null ? whole.safeHarbor.current90 : Math.min(whole.safeHarbor.current90, whole.safeHarbor.prior); // Form 2210 line 9
  const regularQuarter = Math.round(required * 0.25); // Schedule AI line 24
  const rows = [];
  let prevInstallments = 0, prevUnused = 0, cumInstallment = 0;
  PERIODS.forEach((p, i) => {
    const ytd = scheduleC(books, { from: `${year}-01-01`, to: `${year}-${p.end}` }).netProfit;
    const annualProfit = Math.round(ytd * p.factor);
    const partII = annualizedSelfEmployment(ytd, i, { year, periodWages: Math.round((wages * p.months) / 12), wageBase: rest.wageBase });
    const se = { tax: partII.line36, deduction: Math.round(partII.line36 / 2), netEarnings: Math.round(partII.line28 * p.factor), socialSecurity: partII.line33, medicare: partII.line35, warnings: partII.warnings };
    const tax = estimatedTax(books, { ...rest, year, profit: annualProfit, monthsElapsed: 12, se }).totalTax; // line 19
    const annualizedRequired = Math.round(tax * p.pct); // line 21
    const unmet = Math.max(0, annualizedRequired - prevInstallments); // lines 22, 23
    const regularPlusCarry = regularQuarter + prevUnused; // lines 24 to 26
    const installment = Math.min(unmet, regularPlusCarry); // line 27
    prevUnused = regularPlusCarry - installment;
    prevInstallments += installment;
    cumInstallment = prevInstallments;
    const credits = payments.filter((x) => x.date <= dates[i]).reduce((s, x) => s + Math.max(0, x.cents || 0), 0) + Math.round((withholding * (i + 1)) / 4);
    rows.push({
      period: p.label, due: dates[i], profitToDate: ytd, annualizedProfit: annualProfit, selfEmployment: partII, annualizedTax: tax,
      annualizedRequired, installment, cumulativeRequired: cumInstallment,
      regularCumulative: regularQuarter * (i + 1), creditsByDue: credits, shortfall: Math.max(0, cumInstallment - credits),
      regularShortfall: Math.max(0, regularQuarter * (i + 1) - credits),
    });
  });
  const lump = rows[0].profitToDate <= 0 && rows[2].profitToDate > 0;
  if (!required) warnings.push("No payment is required for the year (tax after safe harbour is zero), so nothing is due on any date.");
  warnings.push(`Worksheet. Lines follow the 2025 Form 2210 Schedule AI and its instructions as printed (read 2026-11-11)${year !== 2025 ? `; ${year}'s form may differ` : ""}. Form 2210 and the IRS instructions decide.`);
  if (!payments.length && !(Number.isFinite(paid) && paid > 0)) warnings.push("No payments given, so every shortfall counts only withholding; pass the estimates you have already sent as payments [{ date, cents }].");
  if (Number.isFinite(paid) && paid > 0 && !payments.length) warnings.push("`paid` has no dates, so it is ignored here; pass payments with dates.");
  if (lump) warnings.push("Profit arrives after the first period; the annualized method is likely to lower the early installments.");

  // Part III both ways. No penalty when the tax after withholding is under $1,000 (Form 2210 Part I, line 7).
  const exempt = whole.totalTax - withholding < 100000;
  const regular = form2210Penalty(year, [0, 1, 2, 3].map(() => regularQuarter), { payments, withholding, rates });
  const annual = form2210Penalty(year, rows.map((r) => r.installment), { payments, withholding, rates });
  const penalty = {
    exempt, regular: exempt ? 0 : regular.penalty, annualized: exempt ? 0 : annual.penalty,
    regularWorksheet: regular, annualizedWorksheet: annual,
  };
  penalty.useScheduleAI = !exempt && penalty.annualized < penalty.regular;
  if (exempt) warnings.push("Tax after withholding is under $1,000, so there is no underpayment penalty (Form 2210, line 7).");
  else if (penalty.useScheduleAI) warnings.push(`Checking box C (Schedule AI) lowers the penalty from ${penalty.regular / 100} to ${penalty.annualized / 100}; if you use it for one date you must use it for all four.`);
  for (const w of regular.warnings) if (!warnings.includes(w)) warnings.push(w);
  if (!exempt && (penalty.regular || penalty.annualized)) warnings.push("The penalty assumes the payments listed are all there are and that the rest is paid by April 15 of next year; a payment with an early return (by January 31) or withholding on the dates actually withheld (box D) can lower it.");
  return {
    year, requiredAnnual: required, regularQuarter, rows, withholding, penalty,
    saved: rows.map((r) => r.regularCumulative - r.cumulativeRequired),
    totalTax: whole.totalTax, warnings: [...warnings, ...whole.warnings],
  };
}
