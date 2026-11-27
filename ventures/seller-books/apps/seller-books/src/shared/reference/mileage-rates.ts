// IRS standard mileage rates for business use, by the date a trip was driven.
//
// Schedule C line 9 at the standard rate is each business mile times the rate in force on the day it was
// driven, so a year with a mid-year change (July 1, 2022 and July 1, 2026) cannot be priced at one rate.
//
// Source: the IRS page "Standard mileage rates", table "Mileage rates for all years (cents/mile)", read
// directly from irs.gov on 2026-11-26 (the cloud session's proxy answered it). Each period's `source` is the
// IRS news release that table names for it. The table on that page is the one to re-check each January,
// when the next year's rate is announced; a date after the last period has no rate here, so the worksheet
// asks the seller to type one in instead of guessing.

export const IRS_MILEAGE_RATES_URL = "https://www.irs.gov/tax-professionals/standard-mileage-rates";
export const IRS_MILEAGE_RATES_CHECKED_ON = "2026-11-26";

export interface MileageRatePeriod {
  /** First day the rate applies (YYYY-MM-DD). */
  from: string;
  /** Last day it applies (YYYY-MM-DD). */
  to: string;
  /** Business rate in cents per mile (72.5 is 72.5 cents). */
  cents: number;
  /** The IRS news release the rates table names for this period. */
  source: string;
}

/** Oldest first, no gaps, no overlaps (checked in test/unit/mileage-rates.test.ts). */
export const IRS_BUSINESS_MILEAGE_RATES: readonly MileageRatePeriod[] = [
  { from: "2019-01-01", to: "2019-12-31", cents: 58, source: "IR-2018-251" },
  { from: "2020-01-01", to: "2020-12-31", cents: 57.5, source: "IR-2019-215" },
  { from: "2021-01-01", to: "2021-12-31", cents: 56, source: "IR-2020-279" },
  { from: "2022-01-01", to: "2022-06-30", cents: 58.5, source: "IR-2021-251" },
  { from: "2022-07-01", to: "2022-12-31", cents: 62.5, source: "IR-2022-124" },
  { from: "2023-01-01", to: "2023-12-31", cents: 65.5, source: "IR-2022-234" },
  { from: "2024-01-01", to: "2024-12-31", cents: 67, source: "IR-2023-239" },
  { from: "2025-01-01", to: "2025-12-31", cents: 70, source: "IR-2024-312" },
  { from: "2026-01-01", to: "2026-06-30", cents: 72.5, source: "IR-2025-128" },
  { from: "2026-07-01", to: "2026-12-31", cents: 76, source: "IR-2026-29" },
];

/** The IRS business rate period covering `date` (YYYY-MM-DD), or null when the table has none. */
export function irsBusinessRateOn(date: string): MileageRatePeriod | null {
  for (const p of IRS_BUSINESS_MILEAGE_RATES) if (date >= p.from && date <= p.to) return p;
  return null;
}

export interface PricedMileage {
  /** Line 9 in cents (rounded once, on the total), or null when no mile could be priced. */
  cents: number | null;
  /** Miles and amount per rate used, in date order. `source` is null for the seller's own rate. */
  byRate: {
    from: string;
    to: string;
    cents: number;
    source: string | null;
    miles: number;
    amountCents: number;
  }[];
  /** Miles driven on dates the table has no rate for (and no rate was typed in): left out of line 9. */
  unpricedMiles: number;
  /** First and last such date. */
  unpricedRange: { from: string; to: string } | null;
}

/**
 * Prices business miles for line 9. With `overrideCents` every mile is at that one rate (the seller's choice);
 * without it each trip takes the IRS rate in force on its date. Miles are counted miles (a round trip twice).
 */
export function priceMileage(
  trips: readonly { date: string; miles: number }[],
  overrideCents: number | null,
): PricedMileage {
  const groups = new Map<string, PricedMileage["byRate"][number] & { raw: number }>();
  let unpricedMiles = 0;
  let firstUnpriced: string | null = null;
  let lastUnpriced: string | null = null;
  for (const t of [...trips].sort((a, b) => a.date.localeCompare(b.date))) {
    if (!(t.miles > 0)) continue;
    let key: string;
    let period: { from: string; to: string; cents: number; source: string | null };
    if (overrideCents != null) {
      key = "override";
      period = { from: t.date, to: t.date, cents: overrideCents, source: null };
    } else {
      const p = irsBusinessRateOn(t.date);
      if (!p) {
        unpricedMiles += t.miles;
        firstUnpriced ??= t.date;
        lastUnpriced = t.date;
        continue;
      }
      key = p.from;
      period = p;
    }
    const g = groups.get(key);
    if (g) {
      g.miles += t.miles;
      g.raw += t.miles * period.cents;
      if (t.date > g.to) g.to = t.date;
    } else {
      groups.set(key, { ...period, miles: t.miles, raw: t.miles * period.cents, amountCents: 0 });
    }
  }
  const list = [...groups.values()];
  const total = list.reduce((s, g) => s + g.raw, 0);
  return {
    cents: list.length ? Math.round(total) : null,
    byRate: list.map(({ raw, ...g }) => ({
      ...g,
      miles: Math.round(g.miles * 10) / 10,
      amountCents: Math.round(raw),
    })),
    unpricedMiles: Math.round(unpricedMiles * 10) / 10,
    unpricedRange: firstUnpriced && lastUnpriced ? { from: firstUnpriced, to: lastUnpriced } : null,
  };
}

/** "1,234.5 mi at 70¢ (IRS, IR-2024-312)" lines joined, for line 9's note and the mileage log. */
export function describeMileagePricing(p: PricedMileage): string {
  return p.byRate
    .map((g) => {
      const mi = g.miles.toLocaleString("en-US", { maximumFractionDigits: 1 });
      const when = g.source == null ? "your rate" : `IRS ${g.from} to ${g.to}, ${g.source}`;
      return `${mi} mi at ${g.cents}¢ (${when})`;
    })
    .join("; ");
}
