import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGelatoOrderPayload,
  clearGelatoFulfillmentForTests,
  queueGelatoFulfillmentFromOrder,
  type FetchLike,
} from "../src/lib/gelato-orders.ts";
import type { OrderRecord } from "../src/lib/orders.ts";

const sampleOrder: OrderRecord = {
  orderId: "ord_gelato_1",
  stripeEventId: "evt_gelato_1",
  paymentIntentId: "pi_gelato_1",
  amountCents: 7200,
  currency: "eur",
  status: "fulfillment_queued",
  fulfillmentPartnerId: "gelato",
  shippingRegion: "EU",
  artistTransferTotal: 9.5,
  lineItemCount: 1,
  testMode: true,
  recordedAt: "2026-06-12T15:00:00.000Z",
};

/**
 * A real order carries the address Stripe collected at checkout. These cases
 * used to pass `{}` and still reach the Gelato API, which is what
 * `tests/buyer-shipping-address.test.ts` now forbids: the recipient was a
 * hardcoded London street.
 */
const buyerAddress = {
  shippingName: "Elena Buyer",
  shippingAddress1: "4 Rue des Arts",
  shippingCity: "Lyon",
  shippingZip: "69001",
  shippingCountry: "FR",
};

test("buildGelatoOrderPayload maps Stripe order metadata to Gelato v4 shape", () => {
  const payload = buildGelatoOrderPayload(sampleOrder, {
    ...buyerAddress,
    catalogSlug: "midnight-coast",
    buyerEmail: "buyer@example.com",
    artworkUrl: "https://cdn.printatelier.com/midnight-coast.jpg",
  });

  assert.equal(payload.orderReferenceId, sampleOrder.orderId);
  assert.equal(payload.shippingAddress.firstName, "Elena");
  assert.equal(payload.items[0]?.productUid, "gel_poster_18x24_matte");
  assert.equal(payload.items[0]?.fileUrl, "https://cdn.printatelier.com/midnight-coast.jpg");
  assert.equal(payload.currency, "EUR");
});

test("queueGelatoFulfillmentFromOrder dry-runs without API keys", async () => {
  clearGelatoFulfillmentForTests();
  const submission = await queueGelatoFulfillmentFromOrder(sampleOrder, buyerAddress, {});

  assert.ok(submission);
  assert.equal(submission?.mode, "dry_run");
  assert.equal(submission?.status, "queued");
  assert.ok(submission?.message.includes("GELATO_API_KEY"));
});

test("queueGelatoFulfillmentFromOrder submits when keys and fetch succeed", async () => {
  clearGelatoFulfillmentForTests();
  const fetchFn: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => '{"orderId":"gel_123"}',
  });

  const submission = await queueGelatoFulfillmentFromOrder(
    sampleOrder,
    { ...buyerAddress, catalogSlug: "midnight-coast" },
    { GELATO_API_KEY: "gel_key", GELATO_STORE_ID: "store_eu" },
    fetchFn,
  );

  assert.ok(submission);
  assert.equal(submission?.status, "submitted");
  assert.equal(submission?.httpOk, true);
});

test("queueGelatoFulfillmentFromOrder skips non-gelato partners", async () => {
  const printfulOrder: OrderRecord = { ...sampleOrder, fulfillmentPartnerId: "printful" };
  const submission = await queueGelatoFulfillmentFromOrder(printfulOrder, {}, {});
  assert.equal(submission, null);
});
