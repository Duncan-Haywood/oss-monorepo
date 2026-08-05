import assert from "node:assert/strict";
import { test } from "node:test";

import {
  recordOrderFromPaymentWebhook,
  resetOrderStoreForTests,
  setOrderStore,
  type OrderStore,
} from "../src/lib/orders.ts";
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

/**
 * `summarizePersistedOrders` reduces over the Convex mirror, but its
 * `completeness` came from `buildOrderSummary`'s default argument, which
 * describes the *active* order store — a different array with a different
 * durability. While the active store was the process-local default the two
 * happened to agree, so the mis-binding was invisible.
 *
 * Installing a durable active store separates them: the mirror is still a
 * process-local array that truncates at 500, and the summary must keep saying
 * so rather than inheriting `complete: true` from a store it never read.
 */
test("the persisted summary describes the mirror, not whichever store is active", () => {
  clearPersistedOrdersForTest();

  const durable: OrderStore = {
    descriptor: { kind: "postgres (test double)", durable: true, capacity: 1_000_000 },
    findByStripeEventId: () => undefined,
    append: () => {},
    list: () => [],
    clear: () => {},
  };

  setOrderStore(durable);
  try {
    const summary = summarizePersistedOrders();

    assert.equal(
      summary.completeness.durable,
      false,
      "the Convex mirror is a process-local array whatever the active store is",
    );
    assert.equal(
      summary.completeness.complete,
      false,
      "a 500-truncating mirror can never account for every order ever recorded",
    );
    assert.equal(summary.completeness.storeKind, "convex-mirror (process-local array)");
    assert.match(
      summary.completeness.reason ?? "",
      /truncates to 500|discards the oldest/,
      "the reason must name the truncation, which is what makes the totals wrong",
    );
    assert.notEqual(
      summary.completeness.storeKind,
      durable.descriptor.kind,
      "the summary is quoting the active store's provenance for the mirror's numbers",
    );
  } finally {
    resetOrderStoreForTests();
  }
});
