import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPrintfulOrderPayload,
  clearPrintfulFulfillmentForTests,
  queuePrintfulFulfillmentFromOrder,
  type FetchLike,
} from "../src/lib/printful-orders.ts";
import type { OrderRecord } from "../src/lib/orders.ts";

const sampleOrder: OrderRecord = {
  orderId: "ord_test_1",
  stripeEventId: "evt_1",
  paymentIntentId: "pi_1",
  amountCents: 8500,
  currency: "usd",
  status: "fulfillment_queued",
  fulfillmentPartnerId: "printful",
  shippingRegion: "US",
  artistTransferTotal: 12.5,
  lineItemCount: 1,
  testMode: true,
  recordedAt: "2026-06-12T11:00:00.000Z",
};

test("buildPrintfulOrderPayload maps Stripe order metadata", () => {
  const payload = buildPrintfulOrderPayload(sampleOrder, {
    catalogSlug: "midnight-coast",
    shippingName: "Test Buyer",
    buyerEmail: "buyer@example.com",
  });

  assert.equal(payload.externalId, sampleOrder.orderId);
  assert.equal(payload.recipient.name, "Test Buyer");
  assert.equal(payload.items[0]?.variantId, "4011");
  assert.equal(payload.retailCosts.subtotal, "85.00");
});

test("queuePrintfulFulfillmentFromOrder dry-runs without API keys", async () => {
  clearPrintfulFulfillmentForTests();
  const submission = await queuePrintfulFulfillmentFromOrder(sampleOrder, {}, {});

  assert.ok(submission);
  assert.equal(submission?.mode, "dry_run");
  assert.equal(submission?.status, "queued");
  assert.ok(submission?.message.includes("PRINTFUL_API_KEY"));
});

test("queuePrintfulFulfillmentFromOrder submits when keys and fetch succeed", async () => {
  clearPrintfulFulfillmentForTests();
  const fetchFn: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => '{"result":{"id":123}}',
  });

  const submission = await queuePrintfulFulfillmentFromOrder(
    sampleOrder,
    { catalogSlug: "midnight-coast" },
    { PRINTFUL_API_KEY: "pf_key", PRINTFUL_STORE_ID: "store_1" },
    fetchFn,
  );

  assert.ok(submission);
  assert.equal(submission?.status, "submitted");
  assert.equal(submission?.httpOk, true);
});

test("queuePrintfulFulfillmentFromOrder skips non-printful partners", async () => {
  const gelatoOrder: OrderRecord = { ...sampleOrder, fulfillmentPartnerId: "gelato" };
  const submission = await queuePrintfulFulfillmentFromOrder(gelatoOrder, {}, {});
  assert.equal(submission, null);
});
