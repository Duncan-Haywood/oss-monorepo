import { DEFAULT_DB, openDb } from "./db.js";

export interface DailySummary {
  date: string;
  entries: number;
  bounces: number;
  purchases: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_entrant_cents: number;
}

export function dailySummary(dbPath: string, day: string): DailySummary {
  const db = openDb(dbPath);
  const entries = db
    .prepare(
      `SELECT COALESCE(SUM(value), 0) AS v FROM aggregate_events
       WHERE metric = 'entry' AND synthetic = 0 AND date(bucket_start) = ?`,
    )
    .get(day) as { v: number };
  const bounces = db
    .prepare(
      `SELECT COALESCE(SUM(value), 0) AS v FROM aggregate_events
       WHERE metric = 'bounce' AND synthetic = 0 AND date(bucket_start) = ?`,
    )
    .get(day) as { v: number };
  const purchases = db
    .prepare(
      `SELECT COUNT(*) AS c, COALESCE(SUM(total_cents), 0) AS revenue
       FROM sale_events WHERE synthetic = 0 AND date(closed_at) = ?`,
    )
    .get(day) as { c: number; revenue: number };
  const entryCount = Number(entries.v);
  const purchaseCount = Number(purchases.c);
  const revenueCents = Number(purchases.revenue);
  return {
    date: day,
    entries: entryCount,
    bounces: Number(bounces.v),
    purchases: purchaseCount,
    conversion_rate:
      entryCount > 0
        ? Math.round((purchaseCount / entryCount) * 10000) / 10000
        : 0,
    revenue_cents: revenueCents,
    revenue_per_entrant_cents:
      entryCount > 0 ? Math.round(revenueCents / entryCount) : 0,
  };
}

export function printReport(dbPath = DEFAULT_DB, day: string): void {
  const summary = dailySummary(dbPath, day);
  console.log("Daily funnel summary");
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k}: ${v}`);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

/** Shift a YYYY-MM-DD date by a whole number of UTC days. */
export function shiftIsoDate(isoDate: string, days: number): string {
  if (!isIsoDate(isoDate)) {
    throw new Error("shiftIsoDate expects YYYY-MM-DD");
  }
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/**
 * Most recent calendar day that has either a door aggregate or a POS close.
 * Returns null when the store database is empty.
 */
export function latestDayWithActivity(dbPath: string): string | null {
  const db = openDb(dbPath);
  const aggregate = db
    .prepare(`SELECT MAX(date(bucket_start)) AS d FROM aggregate_events WHERE synthetic = 0`)
    .get() as { d: string | null };
  const sale = db
    .prepare(`SELECT MAX(date(closed_at)) AS d FROM sale_events WHERE synthetic = 0`)
    .get() as { d: string | null };
  const candidates = [aggregate.d, sale.d].filter(
    (value): value is string => typeof value === "string" && isIsoDate(value),
  );
  if (candidates.length === 0) {
    return null;
  }
  return candidates.sort().at(-1) ?? null;
}

export function summaryHasActivity(summary: DailySummary): boolean {
  return summary.entries > 0 || summary.purchases > 0 || summary.bounces > 0;
}
