import { DEFAULT_DB, openDb } from "./db.js";

export interface DailySummary {
  date: string;
  entries: number;
  bounces: number;
  purchases: number;
  /**
   * Measured door-to-POS conversion, or `null` when this day's data cannot
   * support the measurement. Never a substitute figure: an unmeasurable day
   * reports `null` plus a reason, not a plausible-looking number.
   */
  conversion_rate: number | null;
  measurable: boolean;
  unmeasurable_reason: string | null;
}

interface DayCounts {
  entries: number;
  syntheticEntries: number;
  bounces: number;
  purchases: number;
  syntheticPurchases: number;
}

function countDay(dbPath: string, day: string): DayCounts {
  const db = openDb(dbPath);
  const sumMetric = (metric: string, syntheticOnly: boolean): number => {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(value), 0) AS v FROM aggregate_events
         WHERE metric = ? AND date(bucket_start) = ?${
           syntheticOnly ? " AND synthetic = 1" : ""
         }`,
      )
      .get(metric, day) as { v: number };
    return Number(row.v);
  };
  const countSales = (syntheticOnly: boolean): number => {
    const row = db
      .prepare(
        `SELECT COUNT(*) AS c FROM sale_events
         WHERE date(closed_at) = ?${syntheticOnly ? " AND synthetic = 1" : ""}`,
      )
      .get(day) as { c: number };
    return Number(row.c);
  };
  return {
    entries: sumMetric("entry", false),
    syntheticEntries: sumMetric("entry", true),
    bounces: sumMetric("bounce", false),
    purchases: countSales(false),
    syntheticPurchases: countSales(true),
  };
}

/**
 * Why a day's conversion rate is not a measurement, or `null` if it is one.
 *
 * Door-to-POS conversion is only a measurement when the denominator is an
 * independent count of people through the door. The edge ingest is a stub that
 * emits one sample entry per invocation and no bounces or exits (real door
 * line-crossing counts are unbuilt Phase 1 work), so a rate computed from stub
 * events is 100% by construction rather than by observation. Reporting that
 * number would be inventing a measurement, so the report withholds it and says
 * why.
 */
function unmeasurableReason(day: string, counts: DayCounts): string | null {
  if (counts.entries <= 0) {
    return `no door entries recorded for ${day}, so conversion has no denominator`;
  }
  if (counts.syntheticEntries > 0 || counts.syntheticPurchases > 0) {
    return (
      `${counts.syntheticEntries} of ${counts.entries} door entries and ` +
      `${counts.syntheticPurchases} of ${counts.purchases} sales on ${day} are ` +
      `synthetic sample events, not observations (the edge ingest is not ` +
      `connected to a camera and emits no bounces), so door-to-POS conversion ` +
      `is not measurable from this data`
    );
  }
  if (counts.purchases > counts.entries) {
    return (
      `${counts.purchases} sales against ${counts.entries} door entries on ` +
      `${day}: the door count is missing entrants, so conversion is not ` +
      `measurable from this data`
    );
  }
  return null;
}

export function dailySummary(dbPath: string, day: string): DailySummary {
  const counts = countDay(dbPath, day);
  const reason = unmeasurableReason(day, counts);
  return {
    date: day,
    entries: counts.entries,
    bounces: counts.bounces,
    purchases: counts.purchases,
    conversion_rate:
      reason === null
        ? Math.round((counts.purchases / counts.entries) * 10000) / 10000
        : null,
    measurable: reason === null,
    unmeasurable_reason: reason,
  };
}

export function printReport(dbPath = DEFAULT_DB, day: string): void {
  const summary = dailySummary(dbPath, day);
  console.log("Daily funnel summary");
  console.log(`  date: ${summary.date}`);
  console.log(`  entries: ${summary.entries}`);
  console.log(`  bounces: ${summary.bounces}`);
  console.log(`  purchases: ${summary.purchases}`);
  if (summary.measurable) {
    console.log(`  conversion_rate: ${summary.conversion_rate}`);
  } else {
    console.log("  conversion_rate: not measurable");
    console.log(`  reason: ${summary.unmeasurable_reason}`);
  }
}
