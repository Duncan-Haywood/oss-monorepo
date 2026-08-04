import { DEFAULT_DB, openDb } from "./db.js";

export interface DailySummary {
  date: string;
  entries: number;
  bounces: number;
  purchases: number;
  conversion_rate: number;
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
  const entryCount = Number(entries.v);
  const purchaseCount = Number(purchases.c);
  return {
    date: day,
    entries: entryCount,
    bounces: Number(bounces.v),
    purchases: purchaseCount,
    conversion_rate:
      entryCount > 0
        ? Math.round((purchaseCount / entryCount) * 10000) / 10000
        : 0,
  };
}

export function printReport(dbPath = DEFAULT_DB, day: string): void {
  const summary = dailySummary(dbPath, day);
  console.log("Daily funnel summary");
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k}: ${v}`);
  }
}
