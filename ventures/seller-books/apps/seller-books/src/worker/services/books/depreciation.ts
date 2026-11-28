// Form 4562 for a reseller's equipment: the amount on Schedule C line 13 for one tax year, from each piece of
// equipment over the de minimis limit (a laptop, a camera, shelving: kept and used, not sold) and the choice
// the seller saved on it. It is a worksheet, not a filing and not tax advice; the preparer decides.
//
// The rules followed (IRS Publication 946 and the Form 4562 instructions; irs.gov was unreachable from the
// build container on 2026-11-28, so the figures below come from the publication as already used by
// ventures/ai-bookkeeper/taxdepr.mjs and ventures/bonus-depreciation-calculator, and the tables are checked
// in the tests by regenerating them with the 200% declining balance method):
//
// - Basis is the cost times the business-use share. At 50% business use or less, a camera (property used for
//   amusement or recreation is "listed property") or other listed property may take neither section 179 nor
//   bonus and must use the alternative depreciation system; the worksheet does not work that out and leaves
//   such an item off line 13 with a warning.
// - Bonus (special) depreciation applies by default unless the seller elects out for the class and year
//   (IRC 168(k)(7)). The rate depends on when the property was acquired, taken here as the expense's date:
//   100% after January 19, 2025 (the 2025 law, P.L. 119-21, made it permanent), 40% from January 1 to 19,
//   2025, 60% in 2024, 80% in 2023, 100% from 2018 to 2022. Earlier purchases are not computed.
// - Section 179 is an election to expense the cost in the year placed in service, up to a dollar limit that
//   shrinks dollar for dollar above an investment threshold, and no more than the business's taxable income
//   (the rest carries forward). The income limit counts wages too; the worksheet only knows the shop's own
//   profit, so it limits to that and says so.
// - What is left after section 179 and bonus is depreciated over 5 years (computers, printers, cameras) or
//   7 years (shelving, furniture) by the MACRS general depreciation system tables: half-year convention, or
//   mid-quarter when more than 40% of the year's depreciable basis (after section 179) was placed in service
//   in October to December. The test counts only the equipment in these books.
//
// Equipment that is sold or thrown away is not tracked (there is no disposal date on an expense): the
// worksheet keeps depreciating it, and says so. Pure functions; every amount in cents.

/** How the seller treats one piece of equipment. Null on the expense row = "bonus", the law's default. */
export const DEPRECIATION_METHODS = ["bonus", "section_179", "no_bonus"] as const;
export type DepreciationMethod = (typeof DEPRECIATION_METHODS)[number];
export const RECOVERY_YEARS = [5, 7] as const;
export type RecoveryYears = (typeof RECOVERY_YEARS)[number];

export interface DepAsset {
  id: string;
  /** The expense's date: taken as both the day acquired and the day placed in service. */
  date: string;
  /** Cost on the receipt. */
  amountCents: number;
  vendor: string | null;
  memo: string | null;
  method: DepreciationMethod | null;
  recoveryYears: RecoveryYears | null;
  /** 1 to 100; null = 100. */
  businessUsePct: number | null;
}

// Percent of the basis per recovery year, in hundredths of a percent (2000 = 20.00%).
// Pub 946 Table A-1 (half-year) and A-2 to A-5 (mid-quarter, placed in service in quarter 1 to 4).
const P = (a: number[]) => a.map((p) => Math.round(p * 100));
export const HALF_YEAR: Record<RecoveryYears, number[]> = {
  5: P([20.0, 32.0, 19.2, 11.52, 11.52, 5.76]),
  7: P([14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46]),
};
export const MID_QUARTER: Record<RecoveryYears, number[][]> = {
  5: [
    P([35.0, 26.0, 15.6, 11.01, 11.01, 1.38]),
    P([25.0, 30.0, 18.0, 11.37, 11.37, 4.26]),
    P([15.0, 34.0, 20.4, 12.24, 11.3, 7.06]),
    P([5.0, 38.0, 22.8, 13.68, 10.94, 9.58]),
  ],
  7: [
    P([25.0, 21.43, 15.31, 10.93, 8.75, 8.74, 8.75, 1.09]),
    P([17.85, 23.47, 16.76, 11.97, 8.87, 8.87, 8.87, 3.34]),
    P([10.71, 25.51, 18.22, 13.02, 9.3, 8.85, 8.86, 5.53]),
    P([3.57, 27.55, 19.68, 14.06, 10.04, 8.73, 8.73, 7.64]),
  ],
};

/** Section 179 dollar limit and investment threshold by year placed in service (cents). */
export const S179_LIMITS: Record<number, { limit: number; threshold: number }> = {
  2023: { limit: 116_000_000, threshold: 289_000_000 }, // Rev. Proc. 2022-38
  2024: { limit: 122_000_000, threshold: 305_000_000 }, // Rev. Proc. 2023-34
  2025: { limit: 250_000_000, threshold: 400_000_000 }, // P.L. 119-21
  2026: { limit: 256_000_000, threshold: 409_000_000 }, // Rev. Proc. 2025-32
};

/** The bonus rate (percent) for property acquired on `date`; null before 2018 (not computed). */
export function bonusPct(date: string): number | null {
  if (date >= "2025-01-20") return 100;
  if (date >= "2025-01-01") return 40;
  if (date >= "2024-01-01") return 60;
  if (date >= "2023-01-01") return 80;
  if (date >= "2018-01-01") return 100;
  return null;
}

const quarterOf = (date: string) => Math.floor((Number(date.slice(5, 7)) - 1) / 3);
const yearOf = (date: string) => Number(date.slice(0, 4));

export interface DepRow {
  id: string;
  date: string;
  vendor: string | null;
  memo: string | null;
  amountCents: number;
  method: DepreciationMethod;
  recoveryYears: RecoveryYears | null;
  businessUsePct: number;
  /** Cost times business use. */
  basisCents: number;
  /** This tax year's amounts; null when the row is not worked out (`reason` says why). */
  section179Cents: number | null;
  bonusCents: number | null;
  macrsCents: number | null;
  totalCents: number | null;
  /** The convention used for the MACRS part, when there is one. */
  convention: "half-year" | "mid-quarter" | null;
  reason: string | null;
}

export interface DepResult {
  year: number;
  rows: DepRow[];
  /** Section 179 elected for property placed in service this year, before the income limit. */
  section179ElectedCents: number;
  /** Section 179 allowed this year (after the dollar and income limits); in line 13. */
  section179AllowedCents: number;
  /** Elected but over the income limit: carries forward to next year (Form 4562 line 13). */
  section179CarryoverCents: number;
  /** Bonus and MACRS for the year, every placed-in-service year. */
  otherCents: number;
  /** Line 13: allowed section 179 + bonus + MACRS. */
  line13Cents: number;
  midQuarterYears: number[];
  warnings: string[];
}

interface Prepared {
  a: DepAsset;
  method: DepreciationMethod;
  pct: number;
  basis: number;
  /** Basis after section 179 and bonus, to depreciate by the tables. */
  remaining: number;
  s179: number;
  bonus: number;
  reason: string | null;
}

function prepare(a: DepAsset): Prepared {
  const method = a.method ?? "bonus";
  const pct = a.businessUsePct ?? 100;
  const basis = Math.round((a.amountCents * pct) / 100);
  const out: Prepared = {
    a,
    method,
    pct,
    basis,
    remaining: basis,
    s179: 0,
    bonus: 0,
    reason: null,
  };
  if (pct <= 50) {
    out.reason =
      "Business use of 50% or less: if this is listed property (a camera, or anything used for amusement or recreation), no section 179 or bonus is allowed and the alternative depreciation system applies. Not worked out here; ask your preparer.";
    return out;
  }
  const rate = bonusPct(a.date);
  if (rate === null) {
    out.reason = "Bought before 2018: not worked out here.";
    return out;
  }
  if (method === "section_179") {
    out.s179 = basis;
    out.remaining = 0;
    return out;
  }
  if (method === "bonus") {
    out.bonus = Math.round((basis * rate) / 100);
    out.remaining = basis - out.bonus;
  }
  if (out.remaining > 0 && a.recoveryYears == null) {
    out.reason =
      "Choose 5 years (a computer, printer or camera) or 7 years (shelving or furniture) to work out what is left after bonus.";
  }
  return out;
}

/** The mid-quarter test for one placed-in-service year, over the prepared assets placed that year. */
function midQuarter(placed: Prepared[]): boolean {
  const basis = placed.reduce((s, p) => s + p.basis - p.s179, 0);
  const q4 = placed
    .filter((p) => quarterOf(p.a.date) === 3)
    .reduce((s, p) => s + p.basis - p.s179, 0);
  return basis > 0 && q4 * 100 > basis * 40;
}

/** One recovery year's MACRS amount (index k = 0 for the year placed in service), cumulative rounding. */
export function macrsYear(remaining: number, table: number[], k: number): number {
  if (k < 0 || k >= table.length || remaining <= 0) return 0;
  const cum = (j: number) =>
    j < 0
      ? 0
      : j >= table.length - 1
        ? remaining
        : Math.round((remaining * table.slice(0, j + 1).reduce((s, p) => s + p, 0)) / 10_000);
  return cum(k) - cum(k - 1);
}

/**
 * Line 13 for `year` from every equipment purchase over the de minimis limit placed in service by `through`
 * (default December 31). `profitBefore179Cents` is the business's profit with every other deduction taken
 * (bonus and MACRS included, section 179 not); null = no income limit applied.
 */
export function depreciationForYear(
  assets: DepAsset[],
  year: number,
  {
    through,
    profitBefore179Cents = null,
  }: { through?: string; profitBefore179Cents?: number | null } = {},
): DepResult {
  const end = through ?? `${year}-12-31`;
  const warnings: string[] = [];
  const prepared = assets.filter((a) => a.date <= end).map(prepare);
  const byYear = new Map<number, Prepared[]>();
  for (const p of prepared) {
    const y = yearOf(p.a.date);
    byYear.set(y, [...(byYear.get(y) ?? []), p]);
  }
  const mq = new Set<number>();
  for (const [y, placed] of byYear) if (midQuarter(placed)) mq.add(y);

  const rows: DepRow[] = [];
  let elected = 0;
  let other = 0;
  for (const p of prepared) {
    const placedYear = yearOf(p.a.date);
    const k = year - placedYear;
    const cls = p.a.recoveryYears;
    const row: DepRow = {
      id: p.a.id,
      date: p.a.date,
      vendor: p.a.vendor,
      memo: p.a.memo,
      amountCents: p.a.amountCents,
      method: p.method,
      recoveryYears: cls,
      businessUsePct: p.pct,
      basisCents: p.basis,
      section179Cents: null,
      bonusCents: null,
      macrsCents: null,
      totalCents: null,
      convention: null,
      reason: p.reason,
    };
    if (p.reason !== null) {
      if (k === 0) rows.push(row);
      continue;
    }
    const s179 = k === 0 ? p.s179 : 0;
    const bonus = k === 0 ? p.bonus : 0;
    let macrs = 0;
    if (p.remaining > 0 && cls != null) {
      const isMq = mq.has(placedYear);
      const table = isMq ? MID_QUARTER[cls][quarterOf(p.a.date)] : HALF_YEAR[cls];
      macrs = macrsYear(p.remaining, table ?? HALF_YEAR[cls], k);
      row.convention = isMq ? "mid-quarter" : "half-year";
    }
    // Nothing left this year and nothing taken: fully depreciated in an earlier year.
    if (k > 0 && macrs === 0) continue;
    row.section179Cents = s179;
    row.bonusCents = bonus;
    row.macrsCents = macrs;
    row.totalCents = s179 + bonus + macrs;
    elected += s179;
    other += bonus + macrs;
    rows.push(row);
  }

  // Section 179: the dollar limit for the year, then the income limit.
  let allowed = elected;
  const lim = S179_LIMITS[year];
  if (elected > 0 && lim) {
    const placedCost = (byYear.get(year) ?? []).reduce((s, p) => s + p.basis, 0);
    const dollarLimit = Math.max(0, lim.limit - Math.max(0, placedCost - lim.threshold));
    if (elected > dollarLimit) {
      warnings.push(
        `Section 179 elected (${usd(elected)}) is over the ${year} dollar limit (${usd(dollarLimit)}); only the limit is counted. The rest is not deductible under section 179; ask your preparer about bonus or regular depreciation for it.`,
      );
      allowed = dollarLimit;
    }
  } else if (elected > 0) {
    warnings.push(
      `This app has no section 179 dollar limit for ${year}; the election is counted in full. Check the limit with your preparer.`,
    );
  }
  let carryover = 0;
  if (allowed > 0 && profitBefore179Cents !== null) {
    const income = Math.max(0, profitBefore179Cents);
    if (allowed > income) {
      carryover = allowed - income;
      allowed = income;
      warnings.push(
        `Section 179 cannot be more than the business's taxable income, so ${usd(carryover)} of it is not deducted this year and carries forward to next year (Form 4562 line 13). That income includes wages you or your spouse earned, which these books do not see, so your preparer may allow more. The worksheet does not carry it into next year for you.`,
      );
    }
  }
  if (elected > 0) {
    warnings.push(
      "Section 179 is an election made on Form 4562 Part I with the return for the year the equipment was placed in service.",
    );
  }

  // Electing out of bonus applies to the whole class for the year (IRC 168(k)(7)): flag a mix.
  for (const [y, placed] of byYear) {
    for (const cls of RECOVERY_YEARS) {
      const inClass = placed.filter((p) => p.a.recoveryYears === cls && p.method !== "section_179");
      const methods = new Set(inClass.map((p) => p.method));
      if (methods.has("bonus") && methods.has("no_bonus") && y <= year) {
        warnings.push(
          `Equipment placed in service in ${y} in the ${cls}-year class mixes bonus and "no bonus": electing out of bonus depreciation applies to every item in a class for the year. Choose one for all of them.`,
        );
      }
    }
  }
  const mqYears = [...mq].filter((y) => y <= year).sort();
  for (const y of mqYears) {
    warnings.push(
      `More than 40% of the equipment basis placed in service in ${y} went into service in October to December, so the mid-quarter convention applies to it. The test counts only the equipment in these books; other business property you placed in service that year counts too.`,
    );
  }
  const skipped = rows.filter((r) => r.reason !== null);
  if (skipped.length) {
    warnings.push(
      `${skipped.length === 1 ? "1 equipment purchase is" : `${skipped.length} equipment purchases are`} not worked out and left off line 13: see the Form 4562 section for why.`,
    );
  }
  if (rows.some((r) => r.totalCents !== null)) {
    warnings.push(
      "Line 13 assumes the equipment you depreciate is still in use. If you sold or got rid of a piece, its depreciation stops that year and the sale may be taxable; tell your preparer.",
    );
  }
  return {
    year,
    rows,
    section179ElectedCents: elected,
    section179AllowedCents: allowed,
    section179CarryoverCents: carryover,
    otherCents: other,
    line13Cents: allowed + other,
    midQuarterYears: mqYears,
    warnings,
  };
}

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
