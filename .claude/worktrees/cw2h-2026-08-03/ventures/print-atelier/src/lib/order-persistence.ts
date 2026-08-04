import { OrderRecord, OrderStatus, buildOrderSummary, OrderSummary } from "./orders";

export type PersistedOrderRecord = OrderRecord & {
  dbId: string;
  customerEmailHash?: string;
  acquisitionChannel?: string;
  convexSyncedAt?: string;
  updatedAt: string;
};

export type OrderQueryFilter = {
  status?: OrderStatus;
  fulfillmentPartnerId?: string;
  shippingRegion?: string;
  testMode?: boolean;
  minAmountCents?: number;
  limit?: number;
};

export type ConvexSchemaDefinition = {
  tableName: string;
  indexes: Array<{ name: string; fields: string[] }>;
  schemaCode: string;
};

const persistedOrderStore: PersistedOrderRecord[] = [];

export function generateConvexOrderSchema(): ConvexSchemaDefinition {
  const schemaCode = `
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  orders: defineTable({
    orderId: v.string(),
    stripeEventId: v.string(),
    paymentIntentId: v.union(v.string(), v.null()),
    amountCents: v.number(),
    currency: v.string(),
    status: v.union(
      v.literal("paid"),
      v.literal("fulfillment_queued"),
      v.literal("fulfilled"),
      v.literal("cancelled")
    ),
    fulfillmentPartnerId: v.union(v.string(), v.null()),
    shippingRegion: v.union(v.string(), v.null()),
    artistTransferTotal: v.union(v.number(), v.null()),
    lineItemCount: v.number(),
    testMode: v.boolean(),
    customerEmailHash: v.optional(v.string()),
    acquisitionChannel: v.optional(v.string()),
    convexSyncedAt: v.optional(v.string()),
    recordedAt: v.string(),
    updatedAt: v.string(),
  })
    .index("by_orderId", ["orderId"])
    .index("by_stripeEventId", ["stripeEventId"])
    .index("by_status", ["status"])
    .index("by_fulfillmentPartner", ["fulfillmentPartnerId"])
    .index("by_shippingRegion", ["shippingRegion"]),
});
  `.trim();

  return {
    tableName: "orders",
    indexes: [
      { name: "by_orderId", fields: ["orderId"] },
      { name: "by_stripeEventId", fields: ["stripeEventId"] },
      { name: "by_status", fields: ["status"] },
      { name: "by_fulfillmentPartner", fields: ["fulfillmentPartnerId"] },
      { name: "by_shippingRegion", fields: ["shippingRegion"] },
    ],
    schemaCode,
  };
}

export function persistOrderRecord(
  order: OrderRecord,
  extra?: {
    customerEmailHash?: string;
    acquisitionChannel?: string;
    convexSyncedAt?: string;
  },
): PersistedOrderRecord {
  const existingIndex = persistedOrderStore.findIndex(
    (o) => o.stripeEventId === order.stripeEventId || o.orderId === order.orderId,
  );

  const now = new Date().toISOString();
  const dbId =
    existingIndex >= 0
      ? persistedOrderStore[existingIndex].dbId
      : `doc_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const persisted: PersistedOrderRecord = {
    ...order,
    dbId,
    customerEmailHash: extra?.customerEmailHash ?? (existingIndex >= 0 ? persistedOrderStore[existingIndex].customerEmailHash : undefined),
    acquisitionChannel: extra?.acquisitionChannel ?? (existingIndex >= 0 ? persistedOrderStore[existingIndex].acquisitionChannel : undefined),
    convexSyncedAt: extra?.convexSyncedAt ?? now,
    updatedAt: now,
  };

  if (existingIndex >= 0) {
    persistedOrderStore[existingIndex] = persisted;
  } else {
    persistedOrderStore.unshift(persisted);
  }

  if (persistedOrderStore.length > 500) {
    persistedOrderStore.length = 500;
  }

  return persisted;
}

export function queryPersistedOrders(filter?: OrderQueryFilter): PersistedOrderRecord[] {
  let results = [...persistedOrderStore];

  if (!filter) {
    return results;
  }

  if (filter.status) {
    results = results.filter((o) => o.status === filter.status);
  }

  if (filter.fulfillmentPartnerId !== undefined) {
    results = results.filter((o) => o.fulfillmentPartnerId === filter.fulfillmentPartnerId);
  }

  if (filter.shippingRegion !== undefined) {
    results = results.filter((o) => o.shippingRegion === filter.shippingRegion);
  }

  if (filter.testMode !== undefined) {
    results = results.filter((o) => o.testMode === filter.testMode);
  }

  if (filter.minAmountCents !== undefined) {
    const min = filter.minAmountCents;
    results = results.filter((o) => o.amountCents >= min);
  }

  if (filter.limit && filter.limit > 0) {
    results = results.slice(0, filter.limit);
  }

  return results;
}

export function updateOrderStatusInPersistence(
  orderId: string,
  newStatus: OrderStatus,
): PersistedOrderRecord | null {
  const target = persistedOrderStore.find((o) => o.orderId === orderId);
  if (!target) {
    return null;
  }

  target.status = newStatus;
  target.updatedAt = new Date().toISOString();
  return target;
}

export function summarizePersistedOrders(
  filter?: OrderQueryFilter,
): OrderSummary & { persistedTotalCount: number; channelBreakdown: Record<string, number> } {
  const records = queryPersistedOrders(filter);
  const baseSummary = buildOrderSummary(records);

  const channelBreakdown: Record<string, number> = {};
  for (const r of records) {
    const ch = r.acquisitionChannel ?? "organic_direct";
    channelBreakdown[ch] = (channelBreakdown[ch] ?? 0) + 1;
  }

  return {
    ...baseSummary,
    persistedTotalCount: records.length,
    channelBreakdown,
  };
}

export const summarizeOrderPersistence = summarizePersistedOrders;

export function clearPersistedOrdersForTest(): void {
  persistedOrderStore.length = 0;
}
