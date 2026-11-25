import { DEFAULT_DB, openDb } from "./db.js";

/**
 * The pilot store is in Italy, so a "day" is a Europe/Rome calendar day by
 * default. Before 2026-11-25 days were UTC dates: a sale at 00:30 in Rome
 * (22:30 UTC the evening before) was counted on the previous day.
 */
export const DEFAULT_TIME_ZONE = "Europe/Rome";

export interface ReportOptions {
  /** Only count rows for this store. Required once the database holds more than one store. */
  storeId?: string;
  /** IANA time zone whose calendar days the report uses. */
  timeZone?: string;
}

export interface DailySummary {
  date: string;
  store_id: string | null;
  time_zone: string;
  /** ISO 4217 code of the day's sales, or null when there were none. */
  currency: string | null;
  entries: number;
  bounces: number;
  purchases: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_entrant_cents: number;
}

/** Thrown when a report would silently add up more than one store, or more than one currency. */
export class ReportScopeError extends Error {
  constructor(
    readonly code: "multiple_stores" | "mixed_currency" | "invalid_time_zone",
    message: string,
  ) {
    super(message);
    this.name = "ReportScopeError";
  }
}

function checkTimeZone(timeZone: string): void {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
  } catch {
    throw new ReportScopeError("invalid_time_zone", `Unknown time zone: ${timeZone}`);
  }
}

/** Milliseconds the wall clock in `timeZone` is ahead of UTC at instant `utcMs`. */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string): number => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return wall - Math.floor(utcMs / 1000) * 1000;
}

/** UTC instant of local midnight at the start of `isoDate` in `timeZone`. */
function localMidnightUtcMs(isoDate: string, timeZone: string): number {
  const [year, month, day] = isoDate.split("-").map(Number) as [number, number, number];
  const naive = Date.UTC(year, month - 1, day);
  const first = naive - zoneOffsetMs(naive, timeZone);
  // Re-read the offset at the candidate instant, in case a DST change sits between.
  return naive - zoneOffsetMs(first, timeZone);
}

/** The [start, end) UTC bounds, as ISO strings, of a local calendar day. */
export function localDayBoundsUtc(isoDate: string, timeZone = DEFAULT_TIME_ZONE): [string, string] {
  if (!isIsoDate(isoDate)) {
    throw new Error("localDayBoundsUtc expects YYYY-MM-DD");
  }
  checkTimeZone(timeZone);
  const start = localMidnightUtcMs(isoDate, timeZone);
  const end = localMidnightUtcMs(shiftIsoDate(isoDate, 1), timeZone);
  return [new Date(start).toISOString(), new Date(end).toISOString()];
}

/** The local calendar date (YYYY-MM-DD) of an instant in `timeZone`. */
export function localIsoDate(instant: Date, timeZone = DEFAULT_TIME_ZONE): string {
  checkTimeZone(timeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

type Db = ReturnType<typeof openDb>;

/**
 * The store the report covers. With no storeId, a database that holds two
 * stores is refused rather than summed into one conversion rate.
 */
function resolveStore(db: Db, storeId: string | undefined): string | null {
  if (storeId !== undefined) {
    return storeId;
  }
  const rows = db
    .prepare(
      `SELECT store_id FROM aggregate_events WHERE synthetic = 0
       UNION SELECT store_id FROM sale_events WHERE synthetic = 0`,
    )
    .all() as { store_id: string }[];
  if (rows.length > 1) {
    const ids = rows.map((r) => r.store_id).sort();
    throw new ReportScopeError(
      "multiple_stores",
      `The database holds ${ids.length} stores (${ids.join(", ")}); pass a store id.`,
    );
  }
  return rows[0]?.store_id ?? null;
}

const STORE_CLAUSE = "AND (? IS NULL OR store_id = ?)";

export function dailySummary(dbPath: string, day: string, options: ReportOptions = {}): DailySummary {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  const [from, to] = localDayBoundsUtc(day, timeZone);
  const db = openDb(dbPath);
  try {
    const store = resolveStore(db, options.storeId);
    const aggregate = (metric: string): number =>
      Number(
        (
          db
            .prepare(
              `SELECT COALESCE(SUM(value), 0) AS v FROM aggregate_events
               WHERE metric = ? AND synthetic = 0 ${STORE_CLAUSE}
               AND julianday(bucket_start) >= julianday(?) AND julianday(bucket_start) < julianday(?)`,
            )
            .get(metric, store, store, from, to) as { v: number }
        ).v,
      );
    const sales = db
      .prepare(
        `SELECT currency, COUNT(*) AS c, COALESCE(SUM(total_cents), 0) AS revenue
         FROM sale_events WHERE synthetic = 0 ${STORE_CLAUSE}
         AND julianday(closed_at) >= julianday(?) AND julianday(closed_at) < julianday(?)
         GROUP BY currency ORDER BY currency`,
      )
      .all(store, store, from, to) as { currency: string; c: number; revenue: number }[];
    if (sales.length > 1) {
      throw new ReportScopeError(
        "mixed_currency",
        `Sales on ${day} are in ${sales.map((s) => s.currency).join(" and ")}; revenue cannot be summed across currencies.`,
      );
    }
    const entryCount = aggregate("entry");
    const purchaseCount = Number(sales[0]?.c ?? 0);
    const revenueCents = Number(sales[0]?.revenue ?? 0);
    return {
      date: day,
      store_id: store,
      time_zone: timeZone,
      currency: sales[0]?.currency ?? null,
      entries: entryCount,
      bounces: aggregate("bounce"),
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
 * Most recent local calendar day that has either a door aggregate or a POS
 * close. Returns null when the store database is empty.
 */
export function latestDayWithActivity(dbPath: string, options: ReportOptions = {}): string | null {
  const timeZone = options.timeZone ?? DEFAULT_TIME_ZONE;
  checkTimeZone(timeZone);
  const db = openDb(dbPath);
  try {
    const store = resolveStore(db, options.storeId);
    const row = db
      .prepare(
        `SELECT MAX(j) AS j FROM (
           SELECT MAX(julianday(bucket_start)) AS j FROM aggregate_events WHERE synthetic = 0 ${STORE_CLAUSE}
           UNION ALL
           SELECT MAX(julianday(closed_at)) AS j FROM sale_events WHERE synthetic = 0 ${STORE_CLAUSE}
         )`,
      )
      .get(store, store, store, store) as { j: number | null };
    if (typeof row.j !== "number") {
      return null;
    }
    // Julian day 2440587.5 is 1970-01-01T00:00:00Z.
    const instant = new Date(Math.round((row.j - 2440587.5) * 86400000));
    return localIsoDate(instant, timeZone);
  } finally {
    db.close();
  }
}

export function summaryHasActivity(summary: DailySummary): boolean {
  return summary.entries > 0 || summary.purchases > 0 || summary.bounces > 0;
}
