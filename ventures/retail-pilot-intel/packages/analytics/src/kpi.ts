import {
  dailySummary,
  isIsoDate,
  latestDayWithActivity,
  localIsoDate,
  shiftIsoDate,
  summaryHasActivity,
  DEFAULT_TIME_ZONE,
  type DailySummary,
  type ReportOptions,
} from "./report.js";

export type KpiResolvedFrom = "requested" | "latest";

export interface PriorWeekKpis {
  date: string;
  entries: number;
  conversion_rate: number;
  revenue_cents: number;
}

export interface LiveKpiPayload {
  source: "live";
  date: string;
  resolvedFrom: KpiResolvedFrom;
  store_id: string | null;
  time_zone: string;
  currency: string | null;
  entries: number;
  bounces: number;
  purchases: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_entrant_cents: number;
  avg_basket_cents: number;
  vsPriorWeek: PriorWeekKpis | null;
}

function priorWeekIfPresent(
  dbPath: string,
  date: string,
  options: ReportOptions,
): PriorWeekKpis | null {
  const priorDate = shiftIsoDate(date, -7);
  const prior = dailySummary(dbPath, priorDate, options);
  if (!summaryHasActivity(prior)) {
    return null;
  }
  return {
    date: priorDate,
    entries: prior.entries,
    conversion_rate: prior.conversion_rate,
    revenue_cents: prior.revenue_cents,
  };
}

export function avgBasketCents(summary: DailySummary): number {
  if (summary.purchases <= 0) {
    return 0;
  }
  return Math.round(summary.revenue_cents / summary.purchases);
}

export function liveKpiPayload(
  dbPath: string,
  date: string,
  resolvedFrom: KpiResolvedFrom,
  options: ReportOptions = {},
): LiveKpiPayload {
  if (!isIsoDate(date)) {
    throw new Error("liveKpiPayload expects YYYY-MM-DD");
  }
  const summary = dailySummary(dbPath, date, options);
  // Compare the same store with itself a week earlier, even if that day is empty.
  const scoped = { ...options, storeId: options.storeId ?? summary.store_id ?? undefined };
  return {
    source: "live",
    date: summary.date,
    resolvedFrom,
    store_id: summary.store_id,
    time_zone: summary.time_zone,
    currency: summary.currency,
    entries: summary.entries,
    bounces: summary.bounces,
    purchases: summary.purchases,
    conversion_rate: summary.conversion_rate,
    revenue_cents: summary.revenue_cents,
    revenue_per_entrant_cents: summary.revenue_per_entrant_cents,
    avg_basket_cents: avgBasketCents(summary),
    vsPriorWeek: priorWeekIfPresent(dbPath, date, scoped),
  };
}

/** Today's date in the store's time zone (not UTC: 00:30 in Rome is still yesterday in UTC). */
export function todayIsoDate(now = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  return localIsoDate(now, timeZone);
}

export function kpisForDate(dbPath: string, date: string, options: ReportOptions = {}): LiveKpiPayload {
  return liveKpiPayload(dbPath, date, "requested", options);
}

export function kpisForToday(
  dbPath: string,
  now = new Date(),
  options: ReportOptions = {},
): LiveKpiPayload {
  return liveKpiPayload(dbPath, todayIsoDate(now, options.timeZone), "requested", options);
}

export function kpisForLatest(dbPath: string, options: ReportOptions = {}): LiveKpiPayload | null {
  const latest = latestDayWithActivity(dbPath, options);
  if (!latest) {
    return null;
  }
  return liveKpiPayload(dbPath, latest, "latest", options);
}
