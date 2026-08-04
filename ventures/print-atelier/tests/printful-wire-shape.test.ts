import assert from "node:assert/strict";
import { test } from "node:test";

import {
  clearPrintfulFulfillmentForTests,
  queuePrintfulFulfillmentFromOrder,
  type FetchLike,
} from "../src/lib/printful-orders.ts";
import type { OrderRecord } from "../src/lib/orders.ts";

/**
 * These assert on the JSON that actually reaches `fetchFn`, not on the object
 * `buildPrintfulOrderPayload` returns. That distinction is the whole point: the
 * builder's TypeScript shape is what the operator panels read, and a test
 * asserting `payload.variantId` passes with a payload Printful rejects — which
 * is how the camelCase wire shape survived having a test suite.
 *
 * Nothing here mocks `printful-orders.ts`; the fake is the HTTP boundary.
 */

const PRINT_FILE = "https://files.example.com/prints/midnight-coast-18x24.tif";

const completeOrderInputs = {
  shippingName: "Test Buyer",
  shippingAddress1: "12 Analytical Way",
  shippingCity: "Portland",
  shippingState: "OR",
  shippingZip: "97205",
  shippingCountry: "US",
  catalogSlug: "midnight-coast",
  buyerEmail: "buyer@example.com",
  lineItemQuantities: "2",
  lineItemUnitAmounts: "8500",
  artworkUrl: PRINT_FILE,
};

const sampleOrder: OrderRecord = {
  orderId: "ord_wire_1",
  stripeEventId: "evt_wire_1",
  paymentIntentId: "pi_wire_1",
  amountCents: 17000,
  currency: "usd",
  status: "fulfillment_queued",
  fulfillmentPartnerId: "printful",
  shippingRegion: "US",
  artistTransferTotal: 25,
  lineItemCount: 1,
  testMode: true,
  recordedAt: "2026-08-04T11:00:00.000Z",
};

const liveEnv = { PRINTFUL_API_KEY: "pf_key", PRINTFUL_STORE_ID: "store_1" };

/** Submits the order and hands back the parsed JSON body Printful would see. */
async function capturePostedBody(
  metadata: Record<string, unknown>,
): Promise<{ body: unknown; callCount: number }> {
  clearPrintfulFulfillmentForTests();
  let captured: string | undefined;
  let callCount = 0;
  const fetchFn: FetchLike = async (_input, init) => {
    callCount += 1;
    captured = init?.body;
    return { ok: true, status: 200, text: async () => '{"result":{"id":1}}' };
  };

  await queuePrintfulFulfillmentFromOrder(sampleOrder, metadata, liveEnv, fetchFn);
  return { body: captured === undefined ? undefined : JSON.parse(captured), callCount };
}

test("the JSON Printful receives uses the API's own snake_case field names", async () => {
  const { body, callCount } = await capturePostedBody(completeOrderInputs);
  assert.equal(callCount, 1, "the order must actually have been submitted");

  const wire = body as Record<string, unknown>;
  const recipient = wire.recipient as Record<string, unknown>;
  const items = wire.items as Array<Record<string, unknown>>;

  // `variant_id` is the name recorded in
  // docs/research/2026-06-12-printful-variant-retargeting.md:5.
  assert.equal(items[0]?.variant_id, "4011");
  assert.equal(wire.external_id, sampleOrder.orderId);
  assert.equal(items[0]?.retail_price, "85.00");
  assert.equal(recipient?.state_code, "OR");
  assert.equal(recipient?.country_code, "US");

  // The camelCase names Printful has no field for must be gone, not merely
  // duplicated alongside the correct ones.
  assert.equal(Object.hasOwn(wire, "externalId"), false);
  assert.equal(Object.hasOwn(recipient, "stateCode"), false);
  assert.equal(Object.hasOwn(recipient, "countryCode"), false);
  assert.equal(Object.hasOwn(items[0] ?? {}, "variantId"), false);
  assert.equal(Object.hasOwn(items[0] ?? {}, "retailPrice"), false);
  assert.equal(Object.hasOwn(wire, "retailCosts"), false);
  assert.equal(Object.hasOwn(wire, "packingSlip"), false);
});

test("every submitted line names the artwork file Printful is to print", async () => {
  const { body } = await capturePostedBody(completeOrderInputs);
  const items = (body as { items: Array<{ files?: Array<{ url: string }> }> }).items;

  assert.ok(items.length > 0);
  for (const item of items) {
    assert.ok(item.files, "a line with no `files` entry has no artwork to print");
    assert.equal(item.files?.length, 1);
    assert.equal(item.files?.[0]?.url, PRINT_FILE);
  }
});

test("an order with no print file is refused rather than sent without artwork", async () => {
  clearPrintfulFulfillmentForTests();
  const { artworkUrl: _omitted, ...withoutPrintFile } = completeOrderInputs;

  let callCount = 0;
  const fetchFn: FetchLike = async () => {
    callCount += 1;
    return { ok: true, status: 200, text: async () => "{}" };
  };

  const submission = await queuePrintfulFulfillmentFromOrder(
    sampleOrder,
    withoutPrintFile,
    liveEnv,
    fetchFn,
  );

  assert.equal(callCount, 0, "nothing may reach Printful without a print file");
  assert.equal(submission?.status, "blocked");
  assert.ok(
    submission?.message.includes("artworkUrl_0"),
    `the refusal must name the missing key, got: ${submission?.message}`,
  );
  // And no URL was invented in its place — the payload an operator sees is empty
  // where the artwork would be, not a product page.
  assert.equal(submission?.payload.items[0]?.printFileUrl, "");
});
