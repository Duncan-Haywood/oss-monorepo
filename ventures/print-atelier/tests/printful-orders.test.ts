import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPrintfulOrderPayload,
  clearPrintfulFulfillmentForTests,
  getPrintfulRetryQueue,
  queuePrintfulFulfillmentFromOrder,
  retryPrintfulFulfillmentSubmission,
  type FetchLike,
} from "../src/lib/printful-orders.ts";
import type { OrderRecord } from "../src/lib/orders.ts";

/**
 * A real order carries the address Stripe collected at checkout. These cases
 * used to pass `{}` and still reach the Printful API, which is what
 * `tests/buyer-shipping-address.test.ts` now forbids: the recipient was a
 * hardcoded San Francisco street.
 */
const buyerAddress = {
  shippingName: "Test Buyer",
  shippingAddress1: "12 Analytical Way",
  shippingCity: "Portland",
  shippingState: "OR",
  shippingZip: "97205",
  shippingCountry: "US",
};

/**
 * A complete order: the address plus the inputs the adapter used to invent when
 * they were absent — the buyer's own email, and a slug the variant map resolves
 * to a real Printful variant. Tests below that exercise the env and HTTP
 * branches use this, so that what they are asserting about is the branch and
 * not the guard.
 */
const completeOrderInputs = {
  ...buyerAddress,
  catalogSlug: "midnight-coast",
  buyerEmail: "buyer@example.com",
  // Quantity and unit price are inputs too, for the same reason the three above
  // are: the adapters had a default for them, and the default was wrong on every
  // multi-quantity order. A fixture calling itself complete has to carry them.
  lineItemQuantities: "1",
  lineItemUnitAmounts: "8500",
};

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
    ...buyerAddress,
    catalogSlug: "midnight-coast",
    buyerEmail: "buyer@example.com",
    lineItemQuantities: "3",
    lineItemUnitAmounts: "8500",
  });

  assert.equal(payload.externalId, sampleOrder.orderId);
  assert.equal(payload.recipient.name, "Test Buyer");
  assert.equal(payload.items[0]?.variantId, "4011");
  assert.equal(payload.items[0]?.quantity, 3);
  assert.equal(payload.items[0]?.retailPrice, "85.00");
  assert.equal(payload.retailCosts.subtotal, "85.00");
});

test("queuePrintfulFulfillmentFromOrder dry-runs without API keys", async () => {
  clearPrintfulFulfillmentForTests();
  const submission = await queuePrintfulFulfillmentFromOrder(sampleOrder, completeOrderInputs, {});

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
    completeOrderInputs,
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

test("getPrintfulRetryQueue tracks blocked submissions and handles retries", async () => {
  clearPrintfulFulfillmentForTests();

  const failFetch: FetchLike = async () => ({
    ok: false,
    status: 503,
    text: async () => '{"error":"Service unavailable"}',
  });

  const submission = await queuePrintfulFulfillmentFromOrder(
    sampleOrder,
    completeOrderInputs,
    { PRINTFUL_API_KEY: "pf_key", PRINTFUL_STORE_ID: "store_1" },
    failFetch,
  );

  assert.ok(submission);
  assert.equal(submission?.status, "blocked");
  assert.equal(submission?.canRetry, true);

  const retryQueue = getPrintfulRetryQueue();
  assert.equal(retryQueue.length, 1);
  assert.equal(retryQueue[0]?.orderId, sampleOrder.orderId);

  const successFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => '{"result":{"id":999}}',
  });

  const retried = await retryPrintfulFulfillmentSubmission(
    sampleOrder.orderId,
    { PRINTFUL_API_KEY: "pf_key", PRINTFUL_STORE_ID: "store_1" },
    successFetch,
  );

  assert.ok(retried);
  assert.equal(retried?.status, "submitted");
  assert.equal(retried?.retryCount, 1);
  assert.equal(retried?.canRetry, false);
  assert.equal(getPrintfulRetryQueue().length, 0);
});
