import assert from "node:assert/strict";
import { test } from "node:test";

import { recordOrderFromPaymentWebhook } from "../src/lib/orders.ts";
import {
  clearPersistedOrdersForTest,
  generateConvexOrderSchema,
  persistOrderRecord,
  queryPersistedOrders,
  summarizePersistedOrders,
  updateOrderStatusInPersistence,
} from "../src/lib/order-persistence.ts";

test("generateConvexOrderSchema produces valid Convex table and index definitions", () => {
  const schema = generateConvexOrderSchema();
  assert.equal(schema.tableName, "orders");
  assert.ok(schema.schemaCode.includes("defineTable"));
  assert.ok(schema.schemaCode.includes('.index("by_orderId", ["orderId"])'));
  assert.equal(schema.indexes.length, 5);
});

test("persistOrderRecord stores order and allows filtered querying", () => {
  clearPersistedOrdersForTest();

  const rawOrder = recordOrderFromPaymentWebhook(
    "evt_persist_1",
    "payment_intent.succeeded",
    {
      id: "pi_persist_1",
      amount: 12500,
      currency: "usd",
      metadata: {
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: "25.00",
        lineItemCount: "1",
      },
    },
    false,
  );

  assert.ok(rawOrder);
  if (!rawOrder) return;

  const persisted = persistOrderRecord(rawOrder, {
    customerEmailHash: "sha256_hash_123",
    acquisitionChannel: "meta_ads",
  });

  assert.ok(persisted.dbId.startsWith("doc_ord_"));
  assert.equal(persisted.customerEmailHash, "sha256_hash_123");
  assert.equal(persisted.acquisitionChannel, "meta_ads");

  const queryResults = queryPersistedOrders({
    fulfillmentPartnerId: "printful",
    status: "fulfillment_queued",
  });

  assert.equal(queryResults.length, 1);
  assert.equal(queryResults[0].amountCents, 12500);
});

test("updateOrderStatusInPersistence updates status and timestamp", () => {
  clearPersistedOrdersForTest();

  const rawOrder = recordOrderFromPaymentWebhook(
    "evt_persist_2",
    "payment_intent.succeeded",
    {
      id: "pi_persist_2",
      amount: 7500,
      metadata: { fulfillmentPartnerId: "gelato" },
    },
    true,
  );
  if (!rawOrder) return;

  const persisted = persistOrderRecord(rawOrder);
  const updated = updateOrderStatusInPersistence(persisted.orderId, "fulfilled");

  assert.ok(updated);
  assert.equal(updated?.status, "fulfilled");

  const summary = summarizePersistedOrders();
  assert.equal(summary.persistedTotalCount, 1);
  assert.equal(summary.channelBreakdown["organic_direct"], 1);
});
