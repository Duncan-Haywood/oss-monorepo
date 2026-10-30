// Annualized income installment method (Form 2210 Schedule AI) for a sole proprietor whose income
// is lumpy: a landscaper who earns in summer, a tax preparer who earns in spring, a seller whose
// Q4 is the year. The regular safe harbour asks for a quarter of the year's required payment by
// each due date; this method asks only for the share the year-to-date profit, annualized, supports,
// so a back-loaded year owes little early and does not trip the underpayment penalty.
//
// Periods end March 31, May 31, August 31 and December 31; their profit is multiplied by 4, 2.4,
// 1.5 and 1, and the tax on that annualized profit is multiplied by 22.5%, 45%, 67.5% and 90%
// (the factors are 12 over the months elapsed and the percentages 22.5% a quarter, which
// annualized.test.mjs checks by derivation; the form text itself is unread because irs.gov is
// blocked from the build container, and every result says so). The required installment of a period is the smaller of the
// annualized amount still unmet and the regular quarter plus any regular quarter not used earlier
// (Part III lines 20 to 26 of the form). Wages, other income and withholding are taken as even
// through the year, which is the form's default for withholding; the form's second set of
// periods (Feb 28, Apr 30, Jul 31, Oct 31) is not modelled. Dollar amounts are cents. A worksheet,
// not a filing: the penalty itself (a quarterly rate set by the IRS) is not computed.
import { scheduleC, estimatedDueDates } from "./taxforms.mjs";
import { estimatedTax } from "./estimatedtax.mjs";

export const PERIODS = [
  { end: "03-31", factor: 4, pct: 0.225, label: "Jan 1 to Mar 31" },
  { end: "05-31", factor: 2.4, pct: 0.45, label: "Jan 1 to May 31" },
  { end: "08-31", factor: 1.5, pct: 0.675, label: "Jan 1 to Aug 31" },
  { end: "12-31", factor: 1, pct: 0.9, label: "Jan 1 to Dec 31" },
];

// opts are estimatedTax's (year, filing, wages, otherIncome, withholding, priorYearTax, priorAgi,
// brackets, ...) plus payments: [{ date: "YYYY-MM-DD", cents }] already sent as estimates.
export function annualizedInstallments(books, opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const { payments = [], paid, asOf, ...rest } = opts;
  const warnings = [];
  const dates = estimatedDueDates(year);
  const whole = estimatedTax(books, { ...rest, year, monthsElapsed: 12 });
  const withholding = Number.isFinite(rest.withholding) ? Math.max(0, rest.withholding) : 0;
  const required = whole.safeHarbor.prior == null ? whole.safeHarbor.current90 : Math.min(whole.safeHarbor.current90, whole.safeHarbor.prior);
  const regularQuarter = Math.round(required * 0.25);
  const rows = [];
  let prevInstallments = 0, prevUnused = 0, cumInstallment = 0;
  PERIODS.forEach((p, i) => {
    const ytd = scheduleC(books, { from: `${year}-01-01`, to: `${year}-${p.end}` }).netProfit;
    const annualProfit = Math.round(ytd * p.factor);
    const tax = estimatedTax(books, { ...rest, year, profit: annualProfit, monthsElapsed: 12 }).totalTax;
    const annualizedRequired = Math.round(tax * p.pct); // line 20
    const unmet = Math.max(0, annualizedRequired - prevInstallments); // lines 21, 22
    const regularPlusCarry = regularQuarter + prevUnused; // lines 23 to 25
    const installment = Math.min(unmet, regularPlusCarry); // line 26
    prevUnused = regularPlusCarry - installment;
    prevInstallments += installment;
    cumInstallment = prevInstallments;
    const credits = payments.filter((x) => x.date <= dates[i]).reduce((s, x) => s + Math.max(0, x.cents || 0), 0) + Math.round((withholding * (i + 1)) / 4);
    rows.push({
      period: p.label, due: dates[i], profitToDate: ytd, annualizedProfit: annualProfit, annualizedTax: tax,
      annualizedRequired, installment, cumulativeRequired: cumInstallment,
      regularCumulative: regularQuarter * (i + 1), creditsByDue: credits, shortfall: Math.max(0, cumInstallment - credits),
      regularShortfall: Math.max(0, regularQuarter * (i + 1) - credits),
    });
  });
  const lump = rows[0].profitToDate <= 0 && rows[2].profitToDate > 0;
  if (!required) warnings.push("No payment is required for the year (tax after safe harbour is zero), so nothing is due on any date.");
  warnings.push("Worksheet from the Schedule AI percentages and factors as remembered, not checked against the form text; Form 2210 and the IRS instructions decide.");
  if (!payments.length && !(Number.isFinite(paid) && paid > 0)) warnings.push("No payments given, so every shortfall counts only withholding; pass the estimates you have already sent as payments [{ date, cents }].");
  if (Number.isFinite(paid) && paid > 0 && !payments.length) warnings.push("`paid` has no dates, so it is ignored here; pass payments with dates.");
  if (lump) warnings.push("Profit arrives after the first period; the annualized method is likely to lower the early installments.");
  return {
    year, requiredAnnual: required, regularQuarter, rows, withholding,
    saved: rows.map((r) => r.regularCumulative - r.cumulativeRequired),
    totalTax: whole.totalTax, warnings: [...warnings, ...whole.warnings],
  };
}
