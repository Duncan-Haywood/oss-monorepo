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

/**
 * A complete order: the address plus the inputs the adapter used to invent when
 * they were absent — the buyer's own email, the artwork actually printed, and a
 * slug the variant map resolves to a real Gelato product. Tests below that
 * exercise the env and HTTP branches use this, so that what they are asserting
 * about is the branch and not the guard.
 */
const completeOrderInputs = {
  ...buyerAddress,
  catalogSlug: "midnight-coast",
  buyerEmail: "buyer@example.com",
  artworkUrl: "https://cdn.printatelier.com/midnight-coast.jpg",
  // Quantity and unit price are inputs too, for the same reason the three above
  // are: the adapters had a default for them, and the default was wrong on every
  // multi-quantity order. A fixture calling itself complete has to carry them.
  lineItemQuantities: "1",
  lineItemUnitAmounts: "7200",
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
  const submission = await queueGelatoFulfillmentFromOrder(sampleOrder, completeOrderInputs, {});

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
    completeOrderInputs,
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
