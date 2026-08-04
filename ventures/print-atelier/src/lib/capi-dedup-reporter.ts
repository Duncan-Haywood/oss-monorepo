export type CapiEventName = "InitiateCheckout" | "Purchase" | "Lead" | "PageView" | "ViewContent";

export type CapiUserData = {
  email?: string;
  phone?: string;
  externalId?: string;
  fbp?: string;
  fbc?: string;
  clientIp?: string;
  clientUserAgent?: string;
};

export type CapiCustomData = {
  currency?: string;
  value?: number;
  orderId?: string;
  contentCategory?: string;
};

export type CapiEventPayload = {
  eventId: string;
  eventName: CapiEventName;
  eventTime: number;
  source: "browser" | "server";
  userData: CapiUserData;
  customData?: CapiCustomData;
};

export type CapiDeduplicationReport = {
  reportId: string;
  totalEventsProcessed: number;
  browserEventsCount: number;
  serverEventsCount: number;
  deduplicatedEventsCount: number;
  deduplicationRatePct: number;
  averageMatchQualityScore: number;
  matchQualityRating: "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT";
  missingParameterRecommendations: string[];
  timestamp: string;
};

export function calculateMatchQualityScore(userData: CapiUserData): number {
  let score = 0;

  if (userData.email && userData.email.trim().length > 0) {
    score += 25;
  }
  if (userData.phone && userData.phone.trim().length > 0) {
    score += 25;
  }
  if (userData.externalId && userData.externalId.trim().length > 0) {
    score += 15;
  }
  if (userData.fbp && userData.fbp.trim().length > 0) {
    score += 15;
  }
  if (userData.fbc && userData.fbc.trim().length > 0) {
    score += 10;
  }
  if (userData.clientIp && userData.clientUserAgent) {
    score += 10;
  } else if (userData.clientUserAgent) {
    score += 5;
  }

  return Math.min(100, score);
}

export function processCapiEventsAndReport(
  events: CapiEventPayload[],
  timestamp: string = new Date().toISOString(),
): CapiDeduplicationReport {
  const reportId = `capidedup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const totalEventsProcessed = events.length;

  if (totalEventsProcessed === 0) {
    return {
      reportId,
      totalEventsProcessed: 0,
      browserEventsCount: 0,
      serverEventsCount: 0,
      deduplicatedEventsCount: 0,
      deduplicationRatePct: 100,
      averageMatchQualityScore: 0,
      matchQualityRating: "NEEDS_IMPROVEMENT",
      missingParameterRecommendations: [
        "No CAPI events recorded. Ensure Meta, Google, and Pinterest CAPI fire triggers are active.",
      ],
      timestamp,
    };
  }

  const browserEvents = events.filter((e) => e.source === "browser");
  const serverEvents = events.filter((e) => e.source === "server");

  // Track unique eventId + eventName pairs
  const eventKeys = new Set<string>();
  let deduplicatedCount = 0;

  for (const e of events) {
    const key = `${e.eventName}:${e.eventId}`;
    if (eventKeys.has(key)) {
      deduplicatedCount++;
    } else {
      eventKeys.add(key);
    }
  }

  const deduplicationRatePct =
    totalEventsProcessed > 0
      ? Math.round((deduplicatedCount / totalEventsProcessed) * 1000) / 10
      : 100;

  const totalMatchScore = events.reduce((sum, e) => sum + calculateMatchQualityScore(e.userData), 0);
  const averageMatchQualityScore =
    totalEventsProcessed > 0 ? Math.round((totalMatchScore / totalEventsProcessed) * 10) / 10 : 0;

  let matchQualityRating: "EXCELLENT" | "GOOD" | "NEEDS_IMPROVEMENT" = "NEEDS_IMPROVEMENT";
  if (averageMatchQualityScore >= 80) {
    matchQualityRating = "EXCELLENT";
  } else if (averageMatchQualityScore >= 60) {
    matchQualityRating = "GOOD";
  }

  const missingParameterRecommendations: string[] = [];

  const missingEmailCount = events.filter((e) => !e.userData.email).length;
  if (missingEmailCount / totalEventsProcessed > 0.3) {
    missingParameterRecommendations.push(
      `Pass hashed email parameter on checkout/lead events to boost match score (+25pts).`,
    );
  }

  const missingFbpCount = events.filter((e) => !e.userData.fbp).length;
  if (missingFbpCount / totalEventsProcessed > 0.2) {
    missingParameterRecommendations.push(
      `Pass Meta _fbp cookie value in CAPI user_data payload to improve browser-server pairing (+15pts).`,
    );
  }

  const missingExternalIdCount = events.filter((e) => !e.userData.externalId).length;
  if (missingExternalIdCount / totalEventsProcessed > 0.3) {
    missingParameterRecommendations.push(
      `Attach persistent artist/customer external_id to user_data (+15pts).`,
    );
  }

  if (missingParameterRecommendations.length === 0) {
    missingParameterRecommendations.push("CAPI event deduplication match parameters are fully optimized.");
  }

  return {
    reportId,
    totalEventsProcessed,
    browserEventsCount: browserEvents.length,
    serverEventsCount: serverEvents.length,
    deduplicatedEventsCount: deduplicatedCount,
    deduplicationRatePct,
    averageMatchQualityScore,
    matchQualityRating,
    missingParameterRecommendations,
    timestamp,
  };
}

export type ConvexCapiDedupRecord = {
  reportId: string;
  totalEventsProcessed: number;
  deduplicatedEventsCount: number;
  deduplicationRatePct: number;
  averageMatchQualityScore: number;
  matchQualityRating: string;
  timestamp: string;
  convexSyncedAt: string;
};

const capiDedupStore: ConvexCapiDedupRecord[] = [];

export function generateConvexCapiDedupSchema() {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  capi_dedup_reports: defineTable({
    reportId: v.string(),
    totalEventsProcessed: v.number(),
    deduplicatedEventsCount: v.number(),
    deduplicationRatePct: v.number(),
    averageMatchQualityScore: v.number(),
    matchQualityRating: v.string(),
    timestamp: v.string(),
    convexSyncedAt: v.string(),
  })
    .index("by_reportId", ["reportId"])
    .index("by_timestamp", ["timestamp"]),
});
`;
  return {
    tableName: "capi_dedup_reports",
    indexes: ["by_reportId", "by_timestamp"],
    schemaCode: schemaCode.trim(),
  };
}

export function persistCapiDedupReport(
  report: CapiDeduplicationReport,
  timestamp: string = new Date().toISOString(),
): ConvexCapiDedupRecord {
  const record: ConvexCapiDedupRecord = {
    reportId: report.reportId,
    totalEventsProcessed: report.totalEventsProcessed,
    deduplicatedEventsCount: report.deduplicatedEventsCount,
    deduplicationRatePct: report.deduplicationRatePct,
    averageMatchQualityScore: report.averageMatchQualityScore,
    matchQualityRating: report.matchQualityRating,
    timestamp: report.timestamp,
    convexSyncedAt: timestamp,
  };

  capiDedupStore.unshift(record);
  return record;
}

export function getCapiDedupReports(limit?: number): ConvexCapiDedupRecord[] {
  let records = [...capiDedupStore];
  if (limit) records = records.slice(0, limit);
  return records;
}

export function clearCapiDedupStoreForTesting(): void {
  capiDedupStore.length = 0;
}
