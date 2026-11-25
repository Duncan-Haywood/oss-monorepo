import type { DatabaseSync } from "node:sqlite";
import { DEFAULT_DB, openDb } from "./db.js";

/**
 * The pilot stores are in Italy, so a "day" is the Europe/Rome trading day
 * unless the caller names another IANA zone. A sale at 00:30 CEST is
 * 22:30Z the day before; bucketing by UTC date moved it into the wrong day.
 */
export const DEFAULT_TIME_ZONE = "Europe/Rome";

export interface ReportOptions {
  /** Only count rows for this store. Required when the database holds more than one. */
  storeId?: string;
  /** IANA time zone whose calendar day is reported (default Europe/Rome). */
  timeZone?: string;
  /**
   * Count the `--sample` stub events too. Only for smoke-testing the pipeline
   * (`pnpm bootstrap`); a store's real report must leave this off.
   */
  includeSynthetic?: boolean;
}

const realOnly = (options: ReportOptions): string => (options.includeSynthetic ? "1 = 1" : "synthetic = 0");

export interface DailySummary {
  date: string;
  store_id: string | null;
  time_zone: string;
  currency: string | null;
  entries: number;
  bounces: number;
  purchases: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_entrant_cents: number;
}

/** Raised when a report would silently add up rows that must not be added. */
export class ReportScopeError extends Error {
  constructor(
    readonly code: "multiple_stores" | "mixed_currencies",
    message: string,
  ) {
    super(message);
    this.name = "ReportScopeError";
  }
}

function assertTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new RangeError(`Unknown time zone: ${timeZone}`);
  }
}

/** Minutes the zone is ahead of UTC at the given instant (Rome: 60 or 120). */
function zoneOffsetMinutes(instantMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instantMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(instantMs / 1000) * 1000) / 60000);
}

/** UTC instant of local midnight at the start of `isoDate` in `timeZone`. */
function localMidnightUtcMs(isoDate: string, timeZone: string): number {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const wall = Date.UTC(year, month - 1, day);
  let guess = wall - zoneOffsetMinutes(wall, timeZone) * 60000;
  // A DST change between the first guess and the true instant shifts the offset once.
  const corrected = wall - zoneOffsetMinutes(guess, timeZone) * 60000;
  if (corrected !== guess) guess = corrected;
  return guess;
}

/**
 * The half-open UTC interval [start, end) covering one local calendar day.
 * It is 23 or 25 hours long on DST change days.
 */
export function localDayBoundsUtc(isoDate: string, timeZone = DEFAULT_TIME_ZONE): [string, string] {
  if (!isIsoDate(isoDate)) {
    throw new Error("localDayBoundsUtc expects YYYY-MM-DD");
  }
  assertTimeZone(timeZone);
  const start = localMidnightUtcMs(isoDate, timeZone);
  const end = localMidnightUtcMs(shiftIsoDate(isoDate, 1), timeZone);
  return [new Date(start).toISOString(), new Date(end).toISOString()];
}

/** The calendar date of an instant in `timeZone`, as YYYY-MM-DD. */
export function localIsoDate(instant: Date, timeZone = DEFAULT_TIME_ZONE): string {
  assertTimeZone(timeZone);
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

// julianday() parses ISO 8601 with a Z or +HH:MM suffix and normalises to UTC,
// so comparing julian days compares instants, whatever offset a POS wrote.
const IN_DAY = (column: string): string =>
  `julianday(${column}) >= julianday(?) AND julianday(${column}) < julianday(?)`;
const STORE = "(? IS NULL OR store_id = ?)";

function storesInWindow(db: DatabaseSync, start: string, end: string, real: string): string[] {
  const rows = db
    .prepare(
      `SELECT store_id FROM aggregate_events WHERE ${real} AND ${IN_DAY("bucket_start")}
       UNION
       SELECT store_id FROM sale_events WHERE ${real} AND ${IN_DAY("closed_at")}
       ORDER BY store_id`,
    )
    .all(start, end, start, end) as { store_id: string }[];
  return rows.map((row) => row.store_id);
}

export function dailySummary(dbPath: string, day: string, options: ReportOptions = {}): DailySummary {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const [start, end] = localDayBoundsUtc(day, timeZone);
  const real = realOnly(options);
  const db = openDb(dbPath);
  try {
    let storeId = options.storeId ?? null;
    if (storeId === null) {
      const stores = storesInWindow(db, start, end, real);
      if (stores.length > 1) {
        throw new ReportScopeError(
          "multiple_stores",
          `${day} has rows for ${stores.length} stores (${stores.join(", ")}); pass a store id`,
        );
      }
      storeId = stores[0] ?? null;
    }
    const metric = (name: string): number =>
      Number(
        (
          db
            .prepare(
              `SELECT COALESCE(SUM(value), 0) AS v FROM aggregate_events
               WHERE metric = ? AND ${real} AND ${STORE} AND ${IN_DAY("bucket_start")}`,
            )
            .get(name, storeId, storeId, start, end) as { v: number }
        ).v,
      );
    const entryCount = metric("entry");
    const bounces = metric("bounce");
    const sales = db
      .prepare(
        `SELECT currency, COUNT(*) AS c, COALESCE(SUM(total_cents), 0) AS revenue
         FROM sale_events WHERE ${real} AND ${STORE} AND ${IN_DAY("closed_at")}
         GROUP BY currency ORDER BY currency`,
      )
      .all(storeId, storeId, start, end) as { currency: string; c: number; revenue: number }[];
    if (sales.length > 1) {
      throw new ReportScopeError(
        "mixed_currencies",
        `${day} has sales in ${sales.map((s) => s.currency).join(" and ")}; revenue cannot be summed across currencies`,
      );
    }
    const purchaseCount = Number(sales[0]?.c ?? 0);
    const revenueCents = Number(sales[0]?.revenue ?? 0);
    return {
      date: day,
      store_id: storeId,
      time_zone: timeZone,
      currency: sales[0]?.currency ?? null,
      entries: entryCount,
      bounces,
      purchases: purchaseCount,
      conversion_rate:
        entryCount > 0
          ? Math.round((purchaseCount / entryCount) * 10000) / 10000
          : 0,
      revenue_cents: revenueCents,
      revenue_per_entrant_cents:
        entryCount > 0 ? Math.round(revenueCents / entryCount) : 0,
    };
  } finally {
    db.close();
  }
}

export function printReport(dbPath = DEFAULT_DB, day: string, options: ReportOptions = {}): void {
  const summary = dailySummary(dbPath, day, options);
  console.log("Daily funnel summary");
  if (options.includeSynthetic) {
    console.log("  (includes synthetic --sample events: a pipeline check, not a store's figures)");
  }
  for (const [k, v] of Object.entries(summary)) {
    console.log(`  ${k}: ${v}`);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string): boolean {
  return ISO_DATE.test(value);
}

/** Shift a YYYY-MM-DD calendar date by a whole number of days. */
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
 * Most recent local calendar day (in the report's time zone) that has either
 * a door aggregate or a POS close. Returns null when the store database is empty.
 */
export function latestDayWithActivity(dbPath: string, options: ReportOptions = {}): string | null {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const storeId = options.storeId ?? null;
  const db = openDb(dbPath);
  try {
    const row = db
      .prepare(
        `SELECT MAX(jd) AS jd FROM (
           SELECT MAX(julianday(bucket_start)) AS jd FROM aggregate_events WHERE synthetic = 0 AND ${STORE}
           UNION ALL
           SELECT MAX(julianday(closed_at)) AS jd FROM sale_events WHERE synthetic = 0 AND ${STORE}
         )`,
      )
      .get(storeId, storeId, storeId, storeId) as { jd: number | null };
    if (typeof row.jd !== "number" || !Number.isFinite(row.jd)) {
      return null;
    }
    // Julian day 2440587.5 is 1970-01-01T00:00Z; round to the millisecond.
    const instant = new Date(Math.round((row.jd - 2440587.5) * 86400000));
    return localIsoDate(instant, timeZone);
  } finally {
    db.close();
  }
}

export function summaryHasActivity(summary: DailySummary): boolean {
  return summary.entries > 0 || summary.purchases > 0 || summary.bounces > 0;
}
