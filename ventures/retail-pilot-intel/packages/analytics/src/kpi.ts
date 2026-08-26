import {
  dailySummary,
  isIsoDate,
  latestDayWithActivity,
  shiftIsoDate,
  summaryHasActivity,
  type DailySummary,
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
  entries: number;
  bounces: number;
  purchases: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_entrant_cents: number;
  avg_basket_cents: number;
  vsPriorWeek: PriorWeekKpis | null;
}

function priorWeekIfPresent(dbPath: string, date: string): PriorWeekKpis | null {
  const priorDate = shiftIsoDate(date, -7);
  const prior = dailySummary(dbPath, priorDate);
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
): LiveKpiPayload {
  if (!isIsoDate(date)) {
    throw new Error("liveKpiPayload expects YYYY-MM-DD");
  }
  const summary = dailySummary(dbPath, date);
  return {
    source: "live",
    date: summary.date,
    resolvedFrom,
    entries: summary.entries,
    bounces: summary.bounces,
    purchases: summary.purchases,
    conversion_rate: summary.conversion_rate,
    revenue_cents: summary.revenue_cents,
    revenue_per_entrant_cents: summary.revenue_per_entrant_cents,
    avg_basket_cents: avgBasketCents(summary),
    vsPriorWeek: priorWeekIfPresent(dbPath, date),
  };
}

export function todayIsoDate(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function kpisForDate(dbPath: string, date: string): LiveKpiPayload {
  return liveKpiPayload(dbPath, date, "requested");
}

export function kpisForToday(dbPath: string, now = new Date()): LiveKpiPayload {
  return liveKpiPayload(dbPath, todayIsoDate(now), "requested");
}

export function kpisForLatest(dbPath: string): LiveKpiPayload | null {
  const latest = latestDayWithActivity(dbPath);
  if (!latest) {
    return null;
  }
  return liveKpiPayload(dbPath, latest, "latest");
}
