import { todayKpis } from "../data/demoStore";

export type DataSourceKind = "illustrative" | "live" | "unreachable";

export interface LiveKpiPayload {
  source: "live";
  date: string;
  resolvedFrom: "requested" | "latest";
  entries: number;
  bounces: number;
  purchases: number;
  conversion_rate: number;
  revenue_cents: number;
  revenue_per_entrant_cents: number;
  avg_basket_cents: number;
  vsPriorWeek: {
    date: string;
    entries: number;
    conversion_rate: number;
    revenue_cents: number;
  } | null;
}

export interface OverviewKpis {
  entries: number;
  bounces: number;
  engaged: number | null;
  purchases: number;
  revenueEur: number;
  avgBasketEur: number;
  conversionPct: number;
  engagementPct: number | null;
  bouncePct: number;
  vsLastWeek: {
    entries: string;
    conversion: string;
    revenue: string;
  } | null;
}

export interface PilotKpiView {
  source: DataSourceKind;
  date: string | null;
  resolvedFrom: "requested" | "latest" | null;
  kpis: OverviewKpis;
  message: string;
}

function signedDelta(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  const prefix = rounded > 0 ? "+" : "";
  return `${prefix}${rounded}`;
}

export function mapLiveKpis(payload: LiveKpiPayload): OverviewKpis {
  const bouncePct = payload.entries > 0 ? (payload.bounces / payload.entries) * 100 : 0;
  const conversionPct = payload.conversion_rate * 100;
  const revenueEur = payload.revenue_cents / 100;
  const avgBasketEur = payload.avg_basket_cents / 100;
  let vsLastWeek: OverviewKpis["vsLastWeek"] = null;
  if (payload.vsPriorWeek) {
    const priorRevenue = payload.vsPriorWeek.revenue_cents / 100;
    const revenueDeltaPct =
      priorRevenue > 0 ? ((revenueEur - priorRevenue) / priorRevenue) * 100 : 0;
    vsLastWeek = {
      entries: `${signedDelta(payload.entries - payload.vsPriorWeek.entries)} vs last week`,
      conversion: `${signedDelta(conversionPct - payload.vsPriorWeek.conversion_rate * 100, 1)} pts`,
      revenue: `${signedDelta(revenueDeltaPct, 0)}%`,
    };
  }
  return {
    entries: payload.entries,
    bounces: payload.bounces,
    engaged: null,
    purchases: payload.purchases,
    revenueEur,
    avgBasketEur,
    conversionPct: Math.round(conversionPct * 10) / 10,
    engagementPct: null,
    bouncePct: Math.round(bouncePct * 10) / 10,
    vsLastWeek,
  };
}

export function illustrativeKpiView(): PilotKpiView {
  return {
    source: "illustrative",
    date: null,
    resolvedFrom: null,
    kpis: {
      ...todayKpis,
      vsLastWeek: {
        entries: `${todayKpis.vsLastWeek.entries > 0 ? "+" : ""}${todayKpis.vsLastWeek.entries} vs last week`,
        conversion: `+${todayKpis.vsLastWeek.conversion} pts`,
        revenue: `+${todayKpis.vsLastWeek.revenue}%`,
      },
    },
    message: "Illustrative pilot week — not connected to this store's SQLite.",
  };
}

export function liveKpiView(payload: LiveKpiPayload): PilotKpiView {
  const emptyToday =
    payload.resolvedFrom === "requested" &&
    payload.entries === 0 &&
    payload.purchases === 0 &&
    payload.bounces === 0;
  return {
    source: "live",
    date: payload.date,
    resolvedFrom: payload.resolvedFrom,
    kpis: mapLiveKpis(payload),
    message: emptyToday
      ? `Live from store SQLite · ${payload.date} has no door or POS events yet.`
      : payload.resolvedFrom === "latest"
        ? `Live from store SQLite · last activity ${payload.date} (today is empty).`
        : `Live from store SQLite · ${payload.date}`,
  };
}

export function unreachableKpiView(): PilotKpiView {
  return {
    ...illustrativeKpiView(),
    source: "unreachable",
    message:
      "Live KPI API unreachable — showing illustrative numbers. Start serve-kpis and set VITE_PILOT_API_URL.",
  };
}

export function payloadHasActivity(payload: LiveKpiPayload): boolean {
  return payload.entries > 0 || payload.purchases > 0 || payload.bounces > 0;
}

export function getPilotApiUrl(envUrl?: string): string | undefined {
  const raw = envUrl ?? import.meta.env?.VITE_PILOT_API_URL;
  if (!raw) {
    return undefined;
  }
  const trimmed = raw.trim().replace(/\/$/, "");
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function loadPilotKpiView(apiUrl: string): Promise<PilotKpiView> {
  const todayResponse = await fetch(`${apiUrl}/api/kpis/today`);
  if (!todayResponse.ok) {
    throw new Error(`today ${todayResponse.status}`);
  }
  const today = (await todayResponse.json()) as LiveKpiPayload;
  if (payloadHasActivity(today)) {
    return liveKpiView(today);
  }
  const latestResponse = await fetch(`${apiUrl}/api/kpis/latest`);
  if (latestResponse.status === 404) {
    return liveKpiView(today);
  }
  if (!latestResponse.ok) {
    throw new Error(`latest ${latestResponse.status}`);
  }
  const latest = (await latestResponse.json()) as LiveKpiPayload;
  return liveKpiView(latest);
}
