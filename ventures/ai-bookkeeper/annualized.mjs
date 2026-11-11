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
//
// The 2026 form, read 2026-11-11 (pdftotext of the early-release draft irs.gov/pub/irs-dft/
// f2210--dft.pdf, "Form 2210 (2026) Created 4/16/26", diffed line by line against the 2025
// form): Schedule AI is unchanged apart from the years, the line 29 limits ($46,125, $76,875,
// $123,000 and $184,500, the 2026 wage base of $184,500 prorated, as SS_WAGE_BASE has it) and a
// new line 9b, "Additional deductions (see instructions)", added to line 10 beside the QBI
// deduction (now 9a). Part III's dates are 4/15/26, 6/15/26, 9/15/26 and 1/15/27; Part I line 3
// is renamed "Refundable credits and other adjustments". The draft instructions posted beside it
// (i2210--dft.pdf, dated Feb 17, 2026) are still the 2025 text, so what line 9b takes is not
// printed yet; the 2025 instructions ("Line 14") let the Schedule 1-A deductions (tips, overtime,
// car-loan interest, the senior deduction) adjust taxable income there, and 9b is presumably the
// same. The senior deduction is taken here (estimatedTax, `over65`); tips, overtime and car-loan
// interest are not, and the result says so.
//
// Box D (withholding on the dates it was actually withheld): pass `withheld` [{ date, cents }] and
// the penalty is figured with and without it; box D wins when tax was withheld early in the year,
// the even quarter-a-date default when it was withheld late (a December W-4 change).
import { scheduleC, estimatedDueDates, SS_WAGE_BASE } from "./taxforms.mjs";
import { estimatedTax } from "./estimatedtax.mjs";
import { form2210Penalty, checkWithheld } from "./penalty2210.mjs";

// The Form 2210 each year's worksheet was checked against, with the printed line 29 limits (cents).
export const FORM_2210 = {
  2025: { status: "final", created: "10/21/25", source: "irs.gov/pub/irs-pdf/f2210.pdf", line29: [4402500, 7337500, 11740000, 17610000], line9b: false },
  2026: { status: "draft", created: "4/16/26", source: "irs.gov/pub/irs-dft/f2210--dft.pdf", line29: [4612500, 7687500, 12300000, 18450000], line9b: true },
};

function formNote(year) {
  const f = FORM_2210[year];
  if (!f) return `Worksheet. Lines follow the 2025 Form 2210 Schedule AI and its instructions as printed (read 2026-11-11); no ${year} Form 2210 has been read, so ${year}'s form may differ. Form 2210 and the IRS instructions decide.`;
  if (f.status === "final") return `Worksheet. Lines follow the ${year} Form 2210 Schedule AI and its instructions as printed (read 2026-11-11). Form 2210 and the IRS instructions decide.`;
  return `Worksheet. Lines follow the ${year} Form 2210 early-release draft (created ${f.created}, read 2026-11-11), whose Schedule AI matches the 2025 form apart from the line 29 limits and a new line 9b; the ${year} instructions are not out yet, so check the final form. Form 2210 and the IRS instructions decide.`;
}

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
const best0 = (p) => Math.min(p.regular, p.annualized);

export function annualizedInstallments(books, opts = {}) {
  const year = opts.year ?? new Date().getFullYear();
  const { payments = [], paid, asOf, rates, withheld: withheldIn, ...rest } = opts;
  const warnings = [];
  const withheld = withheldIn == null ? null : checkWithheld(year, withheldIn);
  if (withheld) {
    const dated = withheld.reduce((s, w) => s + Math.max(0, w.cents), 0);
    if (Number.isFinite(rest.withholding) && rest.withholding !== dated) warnings.push(`The dated withholding adds up to ${dated / 100}, not the ${rest.withholding / 100} given as withholding; the dated total is used.`);
    rest.withholding = dated;
  }
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
    const early = (x) => x.withReturn && i === 3 && x.date > dates[3] && x.date <= `${year + 1}-01-31`; // January 31 rule: column (d)
    const paidBy = payments.filter((x) => x.date <= dates[i] || early(x)).reduce((s, x) => s + Math.max(0, x.cents || 0), 0);
    const evenCredits = paidBy + Math.round((withholding * (i + 1)) / 4);
    const datedCredits = withheld ? paidBy + withheld.filter((w) => w.date <= dates[i]).reduce((s, w) => s + Math.max(0, w.cents), 0) : evenCredits;
    rows.push({
      period: p.label, due: dates[i], profitToDate: ytd, annualizedProfit: annualProfit, selfEmployment: partII, annualizedTax: tax,
      annualizedRequired, installment, cumulativeRequired: cumInstallment,
      regularCumulative: regularQuarter * (i + 1), creditsByDue: evenCredits, creditsByDueBoxD: datedCredits,
    });
  });
  const lump = rows[0].profitToDate <= 0 && rows[2].profitToDate > 0;
  if (!required) warnings.push("No payment is required for the year (tax after safe harbour is zero), so nothing is due on any date.");
  warnings.push(formNote(year));
  if (year >= 2025 && year <= 2028) warnings.push(`Schedule 1-A deductions for qualified tips, overtime and car-loan interest are not taken (${year >= 2026 ? "Schedule AI line 9b" : "the instructions' line 14 adjustment"}), so if you claim them the annualized tax here is too high; the senior deduction is taken when you give people 65 or older.`);
  if (!payments.length && !(Number.isFinite(paid) && paid > 0)) warnings.push("No payments given, so every shortfall counts only withholding; pass the estimates you have already sent as payments [{ date, cents }].");
  if (Number.isFinite(paid) && paid > 0 && !payments.length) warnings.push("`paid` has no dates, so it is ignored here; pass payments with dates.");
  if (lump) warnings.push("Profit arrives after the first period; the annualized method is likely to lower the early installments.");

  // Part III both ways. No penalty when the tax after withholding is under $1,000 (Form 2210 Part I, line 7).
  const exempt = whole.totalTax - withholding < 100000;
  const regularRequired = [0, 1, 2, 3].map(() => regularQuarter), aiRequired = rows.map((r) => r.installment);
  const regular = form2210Penalty(year, regularRequired, { payments, withholding, rates });
  const annual = form2210Penalty(year, aiRequired, { payments, withholding, rates });
  const penalty = {
    exempt, regular: exempt ? 0 : regular.penalty, annualized: exempt ? 0 : annual.penalty,
    regularWorksheet: regular, annualizedWorksheet: annual,
  };
  penalty.useScheduleAI = !exempt && penalty.annualized < penalty.regular;
  // Box D: the same two methods with withholding on its actual dates; check it only when it lowers the lower one.
  if (withheld) {
    const regD = form2210Penalty(year, regularRequired, { payments, withheld, rates });
    const aiD = form2210Penalty(year, aiRequired, { payments, withheld, rates });
    penalty.boxD = { regular: exempt ? 0 : regD.penalty, annualized: exempt ? 0 : aiD.penalty, regularWorksheet: regD, annualizedWorksheet: aiD };
    const best = (p) => Math.min(p.regular, p.annualized);
    penalty.useBoxD = !exempt && best(penalty.boxD) < best(penalty);
  } else penalty.useBoxD = false;
  const pick = penalty.useBoxD ? penalty.boxD : penalty;
  penalty.best = { scheduleAI: !exempt && pick.annualized < pick.regular, boxD: penalty.useBoxD, cents: exempt ? 0 : Math.min(pick.regular, pick.annualized) };
  rows.forEach((r) => {
    const credits = penalty.useBoxD ? r.creditsByDueBoxD : r.creditsByDue;
    r.creditsCounted = credits;
    r.shortfall = Math.max(0, r.cumulativeRequired - credits);
    r.regularShortfall = Math.max(0, r.regularCumulative - credits);
  });
  if (exempt) warnings.push("Tax after withholding is under $1,000, so there is no underpayment penalty (Form 2210, line 7).");
  else if (penalty.useScheduleAI) warnings.push(`Checking box C (Schedule AI) lowers the penalty from ${penalty.regular / 100} to ${penalty.annualized / 100}; if you use it for one date you must use it for all four.`);
  if (withheld && !exempt) {
    if (penalty.useBoxD) warnings.push(`Checking box D (withholding on the dates it was actually withheld) lowers the penalty from ${best0(penalty) / 100} to ${penalty.best.cents / 100}${penalty.best.scheduleAI ? ", with box C as well" : ""}; you must then file Form 2210 with your return and be able to show the dates.`);
    else warnings.push(`Box D (withholding on its actual dates) gives ${Math.min(penalty.boxD.regular, penalty.boxD.annualized) / 100}, no lower than the default quarter-a-date spread (${best0(penalty) / 100}), so leave it unchecked.`);
  }
  for (const w of regular.warnings) if (!warnings.includes(w)) warnings.push(w);
  const earlyReturn = payments.some((x) => x.withReturn && x.date > dates[3] && x.date <= `${year + 1}-01-31`);
  if (!exempt && (penalty.regular || penalty.annualized)) warnings.push(`The penalty assumes the payments listed are all there are and that the rest is paid by April 15 of next year${earlyReturn ? "" : "; filing and paying with the return by January 31 (mark it as paid with the return) removes the January 15 installment's penalty"}${withheld ? "" : ", and withholding on the dates actually withheld (box D) can lower it"}.`);
  return {
    year, requiredAnnual: required, regularQuarter, rows, withholding, penalty,
    saved: rows.map((r) => r.regularCumulative - r.cumulativeRequired),
    totalTax: whole.totalTax, warnings: [...warnings, ...whole.warnings],
  };
}
