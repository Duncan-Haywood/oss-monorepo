import { ConvexSchemaDefinition } from "./order-persistence";
import { StripeLedgerEntry } from "./stripe-ledger";

export type StripePayoutStatus = "pending" | "settled" | "failed";

export type PersistedStripePayoutEvent = {
  dbId: string;
  eventId: string;
  eventType: string;
  artistAccountId: string | null;
  artistHandle?: string;
  amountCents: number;
  currency: string;
  status: StripePayoutStatus;
  stripeTransferId?: string;
  convexSyncedAt: string;
  recordedAt: string;
  updatedAt: string;
  testMode: boolean;
};

export type StripePayoutQueryFilter = {
  eventType?: string;
  artistAccountId?: string;
  artistHandle?: string;
  status?: StripePayoutStatus;
  testMode?: boolean;
  limit?: number;
};

const persistedStripePayoutStore: PersistedStripePayoutEvent[] = [];

export function generateConvexStripePayoutSchema(): ConvexSchemaDefinition {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  stripe_payout_events: defineTable({
    eventId: v.string(),
    eventType: v.string(),
    artistAccountId: v.union(v.string(), v.null()),
    artistHandle: v.optional(v.string()),
    amountCents: v.number(),
    currency: v.string(),
    status: v.union(v.literal("pending"), v.literal("settled"), v.literal("failed")),
    stripeTransferId: v.optional(v.string()),
    testMode: v.boolean(),
    convexSyncedAt: v.string(),
    recordedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_eventId", ["eventId"])
    .index("by_eventType", ["eventType"])
    .index("by_artistAccountId", ["artistAccountId"])
    .index("by_status", ["status"]),
});
  `.trim();

  return {
    tableName: "stripe_payout_events",
    indexes: [
      { name: "by_eventId", fields: ["eventId"] },
      { name: "by_eventType", fields: ["eventType"] },
      { name: "by_artistAccountId", fields: ["artistAccountId"] },
      { name: "by_status", fields: ["status"] },
    ],
    schemaCode,
  };
}

export function persistStripePayoutEvent(
  ledgerEntry: StripeLedgerEntry,
  extra?: {
    artistHandle?: string;
    stripeTransferId?: string;
    status?: StripePayoutStatus;
    currency?: string;
  },
): PersistedStripePayoutEvent {
  const existingIndex = persistedStripePayoutStore.findIndex((e) => e.eventId === ledgerEntry.eventId);
  const now = new Date().toISOString();
  const dbId =
    existingIndex >= 0
      ? persistedStripePayoutStore[existingIndex].dbId
      : `doc_ledger_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const status: StripePayoutStatus =
    extra?.status ??
    (ledgerEntry.eventType === "payout.paid"
      ? "settled"
      : ledgerEntry.eventType === "transfer.created"
        ? "pending"
        : "settled");

  const persisted: PersistedStripePayoutEvent = {
    dbId,
    eventId: ledgerEntry.eventId,
    eventType: ledgerEntry.eventType,
    artistAccountId: ledgerEntry.artistAccountId,
    artistHandle: extra?.artistHandle,
    amountCents: ledgerEntry.amountCents ?? 0,
    currency: extra?.currency ?? "USD",
    status,
    stripeTransferId: extra?.stripeTransferId,
    convexSyncedAt: now,
    recordedAt: ledgerEntry.recordedAt,
    updatedAt: now,
    testMode: ledgerEntry.testMode,
  };

  if (existingIndex >= 0) {
    persistedStripePayoutStore[existingIndex] = persisted;
  } else {
    persistedStripePayoutStore.unshift(persisted);
  }

  if (persistedStripePayoutStore.length > 500) {
    persistedStripePayoutStore.length = 500;
  }

  return persisted;
}

export function queryPersistedStripePayoutEvents(
  filter?: StripePayoutQueryFilter,
): PersistedStripePayoutEvent[] {
  let results = [...persistedStripePayoutStore];

  if (!filter) {
    return results;
  }

  if (filter.eventType) {
    results = results.filter((e) => e.eventType === filter.eventType);
  }

  if (filter.artistAccountId) {
    results = results.filter((e) => e.artistAccountId === filter.artistAccountId);
  }

  if (filter.artistHandle) {
    results = results.filter((e) => e.artistHandle === filter.artistHandle);
  }

  if (filter.status) {
    results = results.filter((e) => e.status === filter.status);
  }

  if (filter.testMode !== undefined) {
    results = results.filter((e) => e.testMode === filter.testMode);
  }

  if (filter.limit && filter.limit > 0) {
    results = results.slice(0, filter.limit);
  }

  return results;
}

export function updateStripePayoutEventStatus(
  eventId: string,
  newStatus: StripePayoutStatus,
): PersistedStripePayoutEvent | null {
  const target = persistedStripePayoutStore.find((e) => e.eventId === eventId);
  if (!target) {
    return null;
  }

  target.status = newStatus;
  target.updatedAt = new Date().toISOString();
  return target;
}

export function summarizePersistedStripePayoutEvents(filter?: StripePayoutQueryFilter) {
  const records = queryPersistedStripePayoutEvents(filter);
  const totalAmountCents = records.reduce((sum, r) => sum + r.amountCents, 0);
  const settledAmountCents = records
    .filter((r) => r.status === "settled")
    .reduce((sum, r) => sum + r.amountCents, 0);
  const pendingAmountCents = records
    .filter((r) => r.status === "pending")
    .reduce((sum, r) => sum + r.amountCents, 0);

  return {
    totalRecords: records.length,
    totalAmountCents,
    settledAmountCents,
    pendingAmountCents,
    settledCount: records.filter((r) => r.status === "settled").length,
    pendingCount: records.filter((r) => r.status === "pending").length,
    failedCount: records.filter((r) => r.status === "failed").length,
  };
}

export function clearPersistedStripePayoutEventsForTest(): void {
  persistedStripePayoutStore.length = 0;
}

export const clearPersistedStripePayoutLedgerForTest = clearPersistedStripePayoutEventsForTest;

export function generateConvexStripePayoutLedgerSchema(): ConvexSchemaDefinition {
  const base = generateConvexStripePayoutSchema();
  return {
    ...base,
    tableName: "stripe_payout_ledger",
    indexes: [
      ...base.indexes,
      { name: "by_artistAccountId", fields: ["artistAccountId"] },
    ],
  };
}

export function persistStripePayoutLedgerEntry(entry: StripeLedgerEntry): PersistedStripePayoutEvent {
  return persistStripePayoutEvent(entry);
}

export function queryPersistedStripePayoutLedger(filter?: StripePayoutQueryFilter) {
  return queryPersistedStripePayoutEvents(filter);
}

export function summarizePersistedStripePayoutLedger(filter?: StripePayoutQueryFilter) {
  const summary = summarizePersistedStripePayoutEvents(filter);
  const transfers = queryPersistedStripePayoutEvents({ eventType: "transfer.created" });
  const payouts = queryPersistedStripePayoutEvents({ eventType: "payout.paid" });
  return {
    ...summary,
    persistedCount: summary.totalRecords,
    transferCount: transfers.length,
    payoutCount: payouts.length,
  };
}

export function syncStripeWebhookLedgerToPersistence(): PersistedStripePayoutEvent[] {
  const { getStripeLedgerEntries } = require("./stripe-ledger");
  const entries: StripeLedgerEntry[] = getStripeLedgerEntries();
  return entries.map((entry) => persistStripePayoutEvent(entry));
}
