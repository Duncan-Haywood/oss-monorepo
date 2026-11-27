// Quarterly federal estimated tax (Form 1040-ES) from the seller's own books. A worksheet, not a filing
// and not tax advice.
//
// Two ways the IRS lets a sole proprietor size each payment, both shown:
//  - Regular: a quarter of the required annual payment by each due date. The required payment is the
//    smaller of 90% of this year's tax and 100% of last year's (110% when last year's AGI was over
//    $150,000): IRC 6654(d)(1), Form 2210 line 9.
//  - Annualized (Form 2210 Schedule AI): each period's year-to-date Schedule C profit, annualized, sets
//    the payment. A seller whose fourth quarter is the year owes little in April and June.
//
// Ported from the MIT-licensed ai-bookkeeper engines in oss-monorepo (ventures/ai-bookkeeper:
// estimatedtax.mjs, annualized.mjs, irsdates.mjs, taxforms.mjs), where each figure below carries the
// source it was checked against:
//  - 2025 brackets and QBI thresholds: Rev. Proc. 2024-40 (IRS text, read 2026-10-23); 2025 standard
//    deductions: the Form 1040 instructions as amended by the 2025 law ($15,750 / $31,500 / $23,625).
//  - 2026 brackets, standard deductions and QBI thresholds: Rev. Proc. 2025-32 (irs.gov/pub/irs-drop/
//    rp-25-32.pdf, read 2026-10-23).
//  - Social security wage bases: 2024 and 2025 from the Schedule SE instructions; 2026 ($184,500) and
//    2027 ($192,300) from SSA's Contribution and Benefit Base page (found by search 2026-11-05); 2026
//    also matches line 29 of the draft 2026 Form 2210.
//  - Schedule AI periods (Mar 31, May 31, Aug 31, Dec 31), annualization amounts (4, 2.4, 1.5, 1),
//    applicable percentages (22.5%, 45%, 67.5%, 90%) and Part II factors: the 2025 Form 2210 and its
//    instructions (pdftotext of irs.gov/pub/irs-pdf/f2210.pdf, read 2026-11-11).
//  - Due dates: April 15, June 15, September 15 and January 15, moved past a weekend or a Washington,
//    DC legal holiday (IRC 7503).
// Not modelled (each result says so): credits (child, earned income), itemized deductions, the
// Schedule 1-A deductions, other businesses, state tax, and the underpayment penalty itself.
// Dollar amounts are integer cents.

export type Filing = "single" | "mfj" | "hoh";
export const FILING_LABELS: Record<Filing, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  hoh: "Head of household",
};

const D = (n: number) => n * 100;
type Table = { std: number; b: [number, number][] };
export const BRACKETS: Record<number, Record<Filing, Table>> = {
  2025: {
    single: {
      std: D(15750),
      b: [
        [D(11925), 0.1],
        [D(48475), 0.12],
        [D(103350), 0.22],
        [D(197300), 0.24],
        [D(250525), 0.32],
        [D(626350), 0.35],
        [Infinity, 0.37],
      ],
    },
    mfj: {
      std: D(31500),
      b: [
        [D(23850), 0.1],
        [D(96950), 0.12],
        [D(206700), 0.22],
        [D(394600), 0.24],
        [D(501050), 0.32],
        [D(751600), 0.35],
        [Infinity, 0.37],
      ],
    },
    hoh: {
      std: D(23625),
      b: [
        [D(17000), 0.1],
        [D(64850), 0.12],
        [D(103350), 0.22],
        [D(197300), 0.24],
        [D(250500), 0.32],
        [D(626350), 0.35],
        [Infinity, 0.37],
      ],
    },
  },
  2026: {
    single: {
      std: D(16100),
      b: [
        [D(12400), 0.1],
        [D(50400), 0.12],
        [D(105700), 0.22],
        [D(201775), 0.24],
        [D(256225), 0.32],
        [D(640600), 0.35],
        [Infinity, 0.37],
      ],
    },
    mfj: {
      std: D(32200),
      b: [
        [D(24800), 0.1],
        [D(100800), 0.12],
        [D(211400), 0.22],
        [D(403550), 0.24],
        [D(512450), 0.32],
        [D(768700), 0.35],
        [Infinity, 0.37],
      ],
    },
    hoh: {
      std: D(24150),
      b: [
        [D(17700), 0.1],
        [D(67450), 0.12],
        [D(105700), 0.22],
        [D(201750), 0.24],
        [D(256200), 0.32],
        [D(640600), 0.35],
        [Infinity, 0.37],
      ],
    },
  },
};
const QBI_THRESHOLD_2026 = { single: D(201750), hoh: D(201750), mfj: D(403500) };
const qbiThreshold = (year: number, filing: Filing) =>
  (QBI_THRESHOLD[year] ?? QBI_THRESHOLD_2026)[filing];
const QBI_THRESHOLD: Record<number, Record<Filing, number>> = {
  2025: { single: D(197300), hoh: D(197300), mfj: D(394600) },
  2026: { single: D(201750), hoh: D(201750), mfj: D(403500) },
};
export const SS_WAGE_BASE: Record<number, number> = {
  2024: D(168600),
  2025: D(176100),
  2026: D(184500),
  2027: D(192300),
};
/** Additional Medicare Tax (Form 8959) thresholds, fixed by statute. */
const ADDL_MEDICARE: Record<Filing, number> = { single: D(200000), hoh: D(200000), mfj: D(250000) };

export const PERIODS = [
  {
    end: "03-31",
    months: 3,
    factor: 4,
    pct: 0.225,
    seSs: 0.496,
    seMed: 0.116,
    label: "Jan 1 to Mar 31",
  },
  {
    end: "05-31",
    months: 5,
    factor: 2.4,
    pct: 0.45,
    seSs: 0.2976,
    seMed: 0.0696,
    label: "Jan 1 to May 31",
  },
  {
    end: "08-31",
    months: 8,
    factor: 1.5,
    pct: 0.675,
    seSs: 0.186,
    seMed: 0.0435,
    label: "Jan 1 to Aug 31",
  },
  {
    end: "12-31",
    months: 12,
    factor: 1,
    pct: 0.9,
    seSs: 0.124,
    seMed: 0.029,
    label: "Jan 1 to Dec 31",
  },
] as const;

export const ESTIMATED_TAX_DISCLAIMER =
  "Estimate only, from your own records: not tax advice and not a filing. It leaves out credits, itemized deductions and income these books do not hold. Check the figures with your tax preparer or Form 1040-ES before you pay.";

// Washington, DC legal holidays that can land on a due date: Martin Luther King Jr. Day (third Monday of
// January) and Emancipation Day (April 16, observed Friday or Monday when on a weekend).
function dcHoliday(dt: Date): boolean {
  const y = dt.getUTCFullYear();
  const m = dt.getUTCMonth() + 1;
  const d = dt.getUTCDate();
  const dow = dt.getUTCDay();
  if (m === 1) return dow === 1 && d >= 15 && d <= 21;
  if (m === 4) {
    const ed = new Date(Date.UTC(y, 3, 16)).getUTCDay();
    return d === (ed === 6 ? 15 : ed === 0 ? 17 : 16);
  }
  return false;
}

/** The four 1040-ES due dates for a tax year (the last one in January of the next year). */
export function estimatedDueDates(year: number): string[] {
  return (
    [
      [year, 4, 15],
      [year, 6, 15],
      [year, 9, 15],
      [year + 1, 1, 15],
    ] as const
  ).map(([y, m, d]) => {
    const dt = new Date(Date.UTC(y, m - 1, d));
    while (dt.getUTCDay() === 0 || dt.getUTCDay() === 6 || dcHoliday(dt))
      dt.setUTCDate(dt.getUTCDate() + 1);
    return dt.toISOString().slice(0, 10);
  });
}

export function bracketTax(taxable: number, brackets: [number, number][]): number {
  let tax = 0;
  let lo = 0;
  for (const [hi, rate] of brackets) {
    if (taxable <= lo) break;
    tax += (Math.min(taxable, hi) - lo) * rate;
    lo = hi;
  }
  return Math.round(tax);
}

export interface SeTax {
  netEarnings: number;
  socialSecurity: number;
  medicare: number;
  tax: number;
  deduction: number;
}

/** Schedule SE on a whole year's profit: 92.35% of it, 12.4% up to the wage base left after wages, 2.9% on all. */
export function selfEmploymentTax(profit: number, wageBase: number | undefined, wages = 0): SeTax {
  const ne = Math.round(Math.max(0, profit) * 0.9235);
  if (ne < D(400)) return { netEarnings: ne, socialSecurity: 0, medicare: 0, tax: 0, deduction: 0 };
  const room = Math.max(0, (wageBase ?? Infinity) - Math.max(0, wages));
  const socialSecurity = Math.round(Math.min(ne, room) * 0.124);
  const medicare = Math.round(ne * 0.029);
  const tax = socialSecurity + medicare;
  return { netEarnings: ne, socialSecurity, medicare, tax, deduction: Math.round(tax / 2) };
}

/** Schedule AI Part II for period i (lines 28 to 36): annualized self-employment tax from profit to date. */
export function annualizedSeTax(
  periodProfit: number,
  i: number,
  wageBase: number | undefined,
  periodWages = 0,
): SeTax & { line29: number } {
  const p = PERIODS[i];
  if (!p) throw new Error(`no Schedule AI period ${i}`);
  const ne = Math.round(Math.max(0, periodProfit) * 0.9235);
  const line28 = ne < D(400) ? 0 : ne;
  const line29 = wageBase === undefined ? Infinity : Math.round((wageBase * p.months) / 12);
  const line31 = Math.max(0, line29 - Math.max(0, periodWages));
  const socialSecurity = Math.round(Math.min(line28, line31) * p.seSs);
  const medicare = Math.round(line28 * p.seMed);
  const tax = socialSecurity + medicare;
  return {
    netEarnings: Math.round(line28 * p.factor),
    socialSecurity,
    medicare,
    tax,
    deduction: Math.round(tax / 2),
    line29,
  };
}

export interface TaxContext {
  year: number;
  filing: Filing;
  /** W-2 wages for the year (they use up the social security wage base first). */
  wages: number;
  /** Other taxable income for the year (interest, a spouse's wages on a joint return, ...). */
  otherIncome: number;
}

export interface YearTax {
  profit: number;
  se: SeTax;
  agi: number;
  standardDeduction: number;
  qbiDeduction: number;
  taxable: number;
  incomeTax: number;
  addlMedicare: number;
  total: number;
}

/**
 * Federal tax on a whole year's Schedule C profit plus wages and other income: self-employment tax, the
 * half-SE adjustment, the standard deduction, the QBI deduction (20%, phased out above the threshold for a
 * business with no W-2 payroll), the brackets and the 0.9% Additional Medicare Tax. Null when no bracket
 * table is on file for the year.
 */
export function yearTax(profit: number, c: TaxContext, seIn?: SeTax): YearTax | null {
  const table = BRACKETS[c.year]?.[c.filing];
  if (!table) return null;
  const se = seIn ?? selfEmploymentTax(profit, SS_WAGE_BASE[c.year], c.wages);
  const agi = profit - se.deduction + c.wages + c.otherIncome;
  const beforeQbi = Math.max(0, agi - table.std);
  const qbiIncome = Math.max(0, profit - se.deduction);
  const threshold = qbiThreshold(c.year, c.filing);
  const range = (c.year >= 2026 ? 75000 : 50000) * (c.filing === "mfj" ? 200 : 100);
  let qbi = 0;
  if (profit > 0) {
    const full = 0.2 * qbiIncome;
    const pct = beforeQbi <= threshold ? 0 : Math.min(1, (beforeQbi - threshold) / range);
    qbi = Math.min(Math.round(full - pct * full), Math.round(0.2 * beforeQbi));
    // IRC 199A(i), tax years after 2025: at least $400 when QBI is $1,000 or more (indexed after 2026).
    if (c.year === 2026 && qbiIncome >= D(1000) && qbi < D(400)) qbi = Math.min(D(400), beforeQbi);
  }
  const taxable = Math.max(0, beforeQbi - qbi);
  const incomeTax = bracketTax(taxable, table.b);
  const T = ADDL_MEDICARE[c.filing];
  const addlMedicare = Math.round(
    ((Math.max(0, c.wages - T) + Math.max(0, se.netEarnings - Math.max(0, T - c.wages))) * 9) /
      1000,
  );
  return {
    profit,
    se,
    agi,
    standardDeduction: table.std,
    qbiDeduction: qbi,
    taxable,
    incomeTax,
    addlMedicare,
    total: incomeTax + se.tax + addlMedicare,
  };
}

export interface EstimateInput extends TaxContext {
  /** Today, or the day the books are read to (YYYY-MM-DD). */
  asOf: string;
  /**
   * Schedule C profit (line 31: line 29 less any home office on line 30) from January 1 through each period
   * end (index 0..3), or through `asOf` for the period `asOf` falls in; null for periods that start after
   * `asOf`.
   */
  profitToDate: (number | null)[];
  /** True when the profit already has line 30 (home office) taken off; false or omitted = none entered. */
  homeOffice?: boolean;
  /** Federal income tax withheld from wages for the year (spread evenly over the four dates, as Form 2210 does). */
  withholding: number;
  /** Last year's total tax (Form 1040 line 24), or null when not given. */
  priorYearTax: number | null;
  priorAgiOver150k: boolean;
  /** Estimated payments already sent for each of the four dates. */
  paid: number[];
}

export interface EstimateRow {
  period: string;
  due: string;
  status: "complete" | "in-progress" | "not-started";
  profitToDate: number | null;
  annualizedProfit: number | null;
  annualizedTax: number | null;
  /** Schedule AI line 27, the installment the annualized method asks for (null when not figured). */
  annualizedInstallment: number | null;
  /** 25% of the required annual payment. */
  regularInstallment: number | null;
  /** What to have paid in total by this date: the lower method where both are known. */
  cumulativeTarget: number | null;
  /** Estimates paid by this date plus withholding counted to it. */
  credited: number;
  /** cumulativeTarget less credited, never below zero. */
  stillToPay: number | null;
}

export interface Estimate {
  year: number;
  asOf: string;
  filing: Filing;
  disclaimer: string;
  bracketsOnFile: boolean;
  /** This year's profit projected from the books so far (whole year once it is over). */
  projectedProfit: number | null;
  projected: YearTax | null;
  safeHarbor: { current90: number | null; prior: number | null; required: number | null };
  /** Tax after withholding under $1,000: no estimated payments are required (IRC 6654(e)(1)). */
  exempt: boolean;
  rows: EstimateRow[];
  /** The next due date on or after asOf, with what is still to pay by it. */
  next: { due: string; stillToPay: number | null } | null;
  warnings: string[];
}

const DAY = 86_400_000;
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY;

export function estimate(input: EstimateInput): Estimate {
  const { year, asOf } = input;
  const warnings: string[] = [];
  const nonNeg = (v: number) => (Number.isFinite(v) ? Math.max(0, Math.round(v)) : 0);
  const ctx: TaxContext = {
    year,
    filing: input.filing,
    wages: nonNeg(input.wages),
    otherIncome: Number.isFinite(input.otherIncome) ? Math.round(input.otherIncome) : 0,
  };
  const withholding = nonNeg(input.withholding);
  const paid = [0, 1, 2, 3].map((i) => nonNeg(input.paid[i] ?? 0));
  const wageBase = SS_WAGE_BASE[year];
  const bracketsOnFile = BRACKETS[year] !== undefined;
  const dates = estimatedDueDates(year);
  const start = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  if (!bracketsOnFile)
    warnings.push(
      `No ${year} tax brackets are on file yet, so this year's tax is not estimated. Enter last year's total tax to use the prior-year safe harbour.`,
    );
  if (wageBase === undefined)
    warnings.push(
      `No ${year} social security wage base is on file; self-employment tax is not capped.`,
    );

  // Projection: the year's profit so far, scaled to a whole year by days elapsed.
  const soFar = input.profitToDate.reduce<number | null>((last, v) => (v == null ? last : v), null);
  let projectedProfit: number | null = null;
  if (asOf >= yearEnd) projectedProfit = input.profitToDate[3] ?? null;
  else if (asOf >= start && soFar != null) {
    const elapsed = dayNum(asOf) - dayNum(start) + 1;
    const total = dayNum(yearEnd) - dayNum(start) + 1;
    projectedProfit = Math.round((soFar * total) / elapsed);
    warnings.push(
      `This year's tax is projected from ${elapsed} days of books scaled to the full year. A seller whose busy season is still ahead should lean on last year's tax (the prior-year safe harbour) or the annualized column.`,
    );
  }
  const projected = projectedProfit == null ? null : yearTax(projectedProfit, ctx);

  const current90 = projected ? Math.round(projected.total * 0.9) : null;
  const prior =
    input.priorYearTax == null || !Number.isFinite(input.priorYearTax)
      ? null
      : Math.round(Math.max(0, input.priorYearTax) * (input.priorAgiOver150k ? 1.1 : 1));
  if (prior == null)
    warnings.push(
      "Enter last year's total tax (Form 1040, line 24) to use the 100% / 110% prior-year safe harbour, which is often the smaller and the more certain.",
    );
  const candidates = [current90, prior].filter((v): v is number => v != null);
  const required = candidates.length ? Math.min(...candidates) : null;
  const exempt = projected != null && projected.total - withholding < D(1000);
  if (exempt)
    warnings.push(
      "Projected tax after withholding is under $1,000, so no estimated payments are required (IRC 6654(e)(1)). Recheck if sales pick up.",
    );
  const regularQuarter = required == null || exempt ? null : Math.round(required * 0.25);

  // Schedule AI, lines 21 to 27, for every period with books behind it.
  const rows: EstimateRow[] = [];
  let prevInstallments = 0;
  let prevUnused = 0;
  let aiBroken = false;
  PERIODS.forEach((p, i) => {
    const end = `${year}-${p.end}`;
    const ytd = input.profitToDate[i] ?? null;
    const status: EstimateRow["status"] =
      asOf >= end ? "complete" : ytd != null && asOf >= start ? "in-progress" : "not-started";
    let annualizedProfit: number | null = null;
    let annualizedTax: number | null = null;
    let installment: number | null = null;
    if (ytd != null && bracketsOnFile && regularQuarter != null && !aiBroken) {
      annualizedProfit = Math.round(ytd * p.factor);
      const se = annualizedSeTax(ytd, i, wageBase, Math.round((ctx.wages * p.months) / 12));
      annualizedTax = yearTax(annualizedProfit, ctx, se)?.total ?? null;
      if (annualizedTax != null) {
        const unmet = Math.max(0, Math.round(annualizedTax * p.pct) - prevInstallments);
        const cap = regularQuarter + prevUnused;
        installment = Math.min(unmet, cap);
        prevUnused = cap - installment;
        prevInstallments += installment;
      }
    } else if (ytd == null) aiBroken = true;
    rows.push({
      period: p.label,
      due: dates[i] ?? "",
      status,
      profitToDate: ytd,
      annualizedProfit,
      annualizedTax,
      annualizedInstallment: installment,
      regularInstallment: regularQuarter,
      cumulativeTarget: null,
      credited: 0,
      stillToPay: null,
    });
  });

  let paidSoFar = 0;
  let regularCum = 0;
  let aiCum = 0;
  for (const [i, r] of rows.entries()) {
    paidSoFar += paid[i] ?? 0;
    r.credited = paidSoFar + Math.round((withholding * (i + 1)) / 4);
    if (exempt) {
      r.cumulativeTarget = 0;
      r.stillToPay = 0;
      continue;
    }
    if (r.regularInstallment == null) continue;
    regularCum += r.regularInstallment;
    if (r.annualizedInstallment != null) aiCum += r.annualizedInstallment;
    r.cumulativeTarget = r.annualizedInstallment != null ? Math.min(aiCum, regularCum) : regularCum;
    r.stillToPay = Math.max(0, r.cumulativeTarget - r.credited);
  }
  if (rows.some((r) => r.status === "in-progress" && r.annualizedInstallment != null))
    warnings.push(
      "The annualized figure for the period still in progress uses the profit so far; it rises if more sales land before the period ends.",
    );
  if (rows.some((r) => r.annualizedInstallment != null))
    warnings.push(
      "To pay the annualized amounts you must file Form 2210 with Schedule AI (box C) with your return, and use it for all four dates.",
    );
  warnings.push(
    input.homeOffice
      ? "Not counted: credits (child tax credit, earned income credit), itemized deductions, the Schedule 1-A deductions (tips, overtime, car-loan interest, seniors) and any other business. Each can lower or raise the tax."
      : "Not counted: credits (child tax credit, earned income credit), itemized deductions, the Schedule 1-A deductions (tips, overtime, car-loan interest, seniors), home office (line 30: save the space you use on the Schedule C page and it is taken off here) and any other business. Each can lower or raise the tax.",
  );
  if (input.homeOffice)
    warnings.push(
      "Home office (line 30, simplified method) is taken off each period's profit for the months used by that period's end (a month counts from its 15th day), held to that period's own profit.",
    );
  if (projected && projected.taxable + projected.qbiDeduction > qbiThreshold(year, ctx.filing))
    warnings.push(
      "Taxable income is above the QBI threshold, so the 20% deduction is phased out as for a business with no W-2 payroll. A business with staff, or a service business, follows other rules.",
    );

  const nextIdx = dates.findIndex((d) => d >= asOf);
  const nextDue = nextIdx < 0 ? undefined : dates[nextIdx];
  const next =
    nextDue === undefined ? null : { due: nextDue, stillToPay: rows[nextIdx]?.stillToPay ?? null };
  return {
    year,
    asOf,
    filing: ctx.filing,
    disclaimer: ESTIMATED_TAX_DISCLAIMER,
    bracketsOnFile,
    projectedProfit,
    projected,
    safeHarbor: { current90, prior, required },
    exempt,
    rows,
    next,
    warnings,
  };
}
