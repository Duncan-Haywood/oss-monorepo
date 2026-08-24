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
       WHERE metric = 'entry' AND date(bucket_start) = ?`,
    )
    .get(day) as { v: number };
  const bounces = db
    .prepare(
      `SELECT COALESCE(SUM(value), 0) AS v FROM aggregate_events
       WHERE metric = 'bounce' AND date(bucket_start) = ?`,
    )
    .get(day) as { v: number };
  const purchases = db
    .prepare(
      `SELECT COUNT(*) AS c FROM sale_events WHERE date(closed_at) = ?`,
    )
    .get(day) as { c: number };
  // SUM ignores NULL total_cents rows rather than treating them as zero, so a
  // sale recorded without a total does not silently zero out the day's revenue.
  const revenue = db
    .prepare(
      `SELECT COALESCE(SUM(total_cents), 0) AS v FROM sale_events
       WHERE date(closed_at) = ? AND total_cents IS NOT NULL`,
    )
    .get(day) as { v: number };
  const entryCount = Number(entries.v);
  const purchaseCount = Number(purchases.c);
  const revenueCents = Number(revenue.v);
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
