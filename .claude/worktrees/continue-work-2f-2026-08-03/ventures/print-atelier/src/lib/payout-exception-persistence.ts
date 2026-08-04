import { ConvexSchemaDefinition } from "./order-persistence";

export type ExceptionStatus = "active_exception" | "overridden" | "remediated" | "dismissed";

export type RemediationAction =
  | "price_adjustment"
  | "pod_switch"
  | "proof_approval"
  | "mockup_added"
  | "manual_override"
  | "created_exception"
  | "updated_exception";

export type RemediationStep = {
  timestamp: string;
  operator: string;
  action: RemediationAction;
  note: string;
  previousRetailPrice?: number;
  newRetailPrice?: number;
};

export type PersistedPayoutExceptionRecord = {
  dbId: string;
  exceptionId: string;
  artworkId: string;
  artworkSlug: string;
  artworkTitle: string;
  artistHandle: string;
  currentRetailPrice: number;
  fulfillmentCost: number;
  currentArtistPayout: number;
  suggestedRetailPrice: number;
  status: ExceptionStatus;
  severity: "critical" | "review" | "info";
  overrideReason?: string;
  overrideOperator?: string;
  blockers: string[];
  remediationHistory: RemediationStep[];
  convexSyncedAt: string;
  recordedAt: string;
  updatedAt: string;
};

export type PayoutExceptionQueryFilter = {
  status?: ExceptionStatus;
  severity?: "critical" | "review" | "info";
  artistHandle?: string;
  artworkId?: string;
  artworkSlug?: string;
  limit?: number;
};

const persistedExceptionStore: PersistedPayoutExceptionRecord[] = [];

export function generateConvexPayoutExceptionSchema(): ConvexSchemaDefinition {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  payout_exceptions: defineTable({
    artworkId: v.string(),
    artworkTitle: v.string(),
    artistHandle: v.string(),
    currentRetailPrice: v.number(),
    fulfillmentCost: v.number(),
    suggestedRetailPrice: v.number(),
    status: v.union(
      v.literal("active_exception"),
      v.literal("overridden"),
      v.literal("remediated"),
      v.literal("dismissed")
    ),
    overrideReason: v.optional(v.string()),
    overrideOperator: v.optional(v.string()),
    blockers: v.array(v.string()),
    remediationHistory: v.array(
      v.object({
        timestamp: v.string(),
        operator: v.string(),
        action: v.string(),
        note: v.string(),
        previousRetailPrice: v.optional(v.number()),
        newRetailPrice: v.optional(v.number()),
      })
    ),
    convexSyncedAt: v.string(),
    recordedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_artworkId", ["artworkId"])
    .index("by_artworkSlug", ["artworkId"])
    .index("by_artistHandle", ["artistHandle"])
    .index("by_status", ["status"]),
});
  `.trim();

  return {
    tableName: "payout_exceptions",
    indexes: [
      { name: "by_artworkId", fields: ["artworkId"] },
      { name: "by_artworkSlug", fields: ["artworkId"] },
      { name: "by_artistHandle", fields: ["artistHandle"] },
      { name: "by_status", fields: ["status"] },
    ],
    schemaCode,
  };
}

export function generatePayoutExceptionId(): string {
  return `exc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function persistPayoutExceptionDecision(input: {
  artworkId?: string;
  artworkSlug?: string;
  artworkTitle?: string;
  title?: string;
  artistHandle?: string;
  artistName?: string;
  currentRetailPrice: number;
  fulfillmentCost?: number;
  currentFulfillmentCost?: number;
  currentArtistPayout?: number;
  suggestedRetailPrice: number;
  severity?: "critical" | "review" | "info";
  blockers: string[];
  overrideReason?: string;
  initialRemediationNote?: string;
  actor?: string;
}): PersistedPayoutExceptionRecord {
  const artworkSlug = input.artworkSlug ?? input.artworkId ?? "unknown-artwork";
  const artworkId = input.artworkId ?? artworkSlug;
  const artworkTitle = input.artworkTitle ?? input.title ?? "Untitled Artwork";
  const artistHandle = input.artistHandle ?? input.artistName ?? "@artist";
  const fulfillmentCost = input.fulfillmentCost ?? input.currentFulfillmentCost ?? 0;
  const currentArtistPayout = input.currentArtistPayout ?? 0;
  const severity = input.severity ?? "critical";

  const existingIndex = persistedExceptionStore.findIndex(
    (e) => e.artworkSlug === artworkSlug || e.artworkId === artworkId,
  );
  const now = new Date().toISOString();
  const dbId =
    existingIndex >= 0
      ? persistedExceptionStore[existingIndex].dbId
      : `doc_exc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const exceptionId =
    existingIndex >= 0
      ? persistedExceptionStore[existingIndex].exceptionId
      : generatePayoutExceptionId();

  const existing = existingIndex >= 0 ? persistedExceptionStore[existingIndex] : null;

  const remediationHistory: RemediationStep[] = existing
    ? [...existing.remediationHistory]
    : [];

  if (input.initialRemediationNote || !existing) {
    remediationHistory.push({
      timestamp: now,
      operator: input.actor ?? "system_guardrail",
      action: !existing ? "created_exception" : "updated_exception",
      note: input.initialRemediationNote ?? "Payout exception recorded by system guardrail.",
    });
  }

  const persisted: PersistedPayoutExceptionRecord = {
    dbId,
    exceptionId,
    artworkId,
    artworkSlug,
    artworkTitle,
    artistHandle,
    currentRetailPrice: input.currentRetailPrice,
    fulfillmentCost,
    currentArtistPayout,
    suggestedRetailPrice: input.suggestedRetailPrice,
    status: input.overrideReason ? "overridden" : existing?.status ?? "active_exception",
    severity,
    overrideReason: input.overrideReason ?? existing?.overrideReason,
    overrideOperator: existing?.overrideOperator,
    blockers: input.blockers,
    remediationHistory,
    convexSyncedAt: now,
    recordedAt: existing?.recordedAt ?? now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    persistedExceptionStore[existingIndex] = persisted;
  } else {
    persistedExceptionStore.unshift(persisted);
  }

  if (persistedExceptionStore.length > 500) {
    persistedExceptionStore.length = 500;
  }

  return persisted;
}

export function recordPayoutExceptionOverride(
  artworkId: string,
  operator: string,
  overrideReason: string,
): PersistedPayoutExceptionRecord | null {
  const target = persistedExceptionStore.find(
    (e) => e.artworkId === artworkId || e.artworkSlug === artworkId,
  );
  if (!target) {
    return null;
  }

  const now = new Date().toISOString();
  target.status = "overridden";
  target.overrideOperator = operator;
  target.overrideReason = overrideReason;
  target.updatedAt = now;

  target.remediationHistory.push({
    timestamp: now,
    operator,
    action: "manual_override",
    note: `Override granted: ${overrideReason}`,
  });

  return target;
}

export function addRemediationStep(
  artworkId: string,
  operator: string,
  action: RemediationAction,
  note: string,
  priceChange?: { previousRetailPrice: number; newRetailPrice: number },
): PersistedPayoutExceptionRecord | null {
  const target = persistedExceptionStore.find(
    (e) => e.artworkId === artworkId || e.artworkSlug === artworkId,
  );
  if (!target) {
    return null;
  }

  const now = new Date().toISOString();
  if (priceChange) {
    target.currentRetailPrice = priceChange.newRetailPrice;
  }

  if (action === "price_adjustment" || action === "pod_switch") {
    target.status = "remediated";
  }

  target.remediationHistory.push({
    timestamp: now,
    operator,
    action,
    note,
    previousRetailPrice: priceChange?.previousRetailPrice,
    newRetailPrice: priceChange?.newRetailPrice,
  });
  target.updatedAt = now;

  return target;
}

export function queryPersistedPayoutExceptions(
  filter?: PayoutExceptionQueryFilter,
): PersistedPayoutExceptionRecord[] {
  let results = [...persistedExceptionStore];

  if (!filter) {
    return results;
  }

  if (filter.status) {
    results = results.filter((e) => e.status === filter.status);
  }

  if (filter.severity) {
    results = results.filter((e) => e.severity === filter.severity);
  }

  if (filter.artistHandle) {
    results = results.filter((e) => e.artistHandle === filter.artistHandle);
  }

  if (filter.artworkId) {
    results = results.filter((e) => e.artworkId === filter.artworkId);
  }

  if (filter.artworkSlug) {
    results = results.filter((e) => e.artworkSlug === filter.artworkSlug);
  }

  if (filter.limit && filter.limit > 0) {
    results = results.slice(0, filter.limit);
  }

  return results;
}

export function summarizePersistedPayoutExceptions(filter?: PayoutExceptionQueryFilter) {
  const records = queryPersistedPayoutExceptions(filter);
  return {
    totalRecords: records.length,
    totalCount: records.length,
    activeExceptionsCount: records.filter((r) => r.status === "active_exception").length,
    openCount: records.filter((r) => r.status === "active_exception").length,
    overriddenCount: records.filter((r) => r.status === "overridden").length,
    remediatedCount: records.filter((r) => r.status === "remediated").length,
    resolvedCount: records.filter((r) => r.status === "remediated").length,
    dismissedCount: records.filter((r) => r.status === "dismissed").length,
    criticalCount: records.filter((r) => r.severity === "critical" && r.status === "active_exception").length,
  };
}

export function clearPersistedPayoutExceptionsForTest(): void {
  persistedExceptionStore.length = 0;
}
