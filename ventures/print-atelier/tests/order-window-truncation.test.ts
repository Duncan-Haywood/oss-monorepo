import assert from "node:assert/strict";
import { test } from "node:test";

// The real module, deliberately not mocked: the defects under test live in this
// file's own module state (the display window, the idempotency index, and the
// running totals), so a test double would pass with the fix reverted.
import {
  buildOrderSummary,
  clearOrdersForTests,
  getOrderRecords,
  recordOrderFromPaymentWebhook,
  type OrderRecord,
} from "../src/lib/orders.ts";

const DISPLAY_WINDOW_LIMIT = 100;

function paymentIntent(
  id: string,
  amountCents: number,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id,
    amount: amountCents,
    currency: "usd",
    metadata: {
      fulfillmentPartnerId: "printful",
      shippingRegion: "US",
      artistTransferTotal: "10.00",
      lineItemCount: "1",
      ...(overrides.metadata as Record<string, unknown> | undefined),
    },
    ...overrides,
  };
}

function recordOrders(count: number, amountCents: number, prefix: string): void {
  for (let index = 0; index < count; index += 1) {
    recordOrderFromPaymentWebhook(
      `evt_${prefix}_${index}`,
      "payment_intent.succeeded",
      paymentIntent(`pi_${prefix}_${index}`, amountCents),
      true,
    );
  }
}

test("a replayed stripeEventId is still deduped after it leaves the display window", () => {
  clearOrdersForTests();

  const original = recordOrderFromPaymentWebhook(
    "evt_replayed",
    "payment_intent.succeeded",
    paymentIntent("pi_replayed", 24_500),
    false,
  ) as OrderRecord;
  assert.ok(original);

  // Push the original well past the 100-record display window.
  recordOrders(150, 1_000, "filler");
  assert.equal(
    getOrderRecords().some((order) => order.stripeEventId === "evt_replayed"),
    false,
    "precondition: the original must have scrolled out of the display window",
  );

  // Stripe redelivers the same event.
  const replay = recordOrderFromPaymentWebhook(
    "evt_replayed",
    "payment_intent.succeeded",
    paymentIntent("pi_replayed", 24_500),
    false,
  );

  assert.ok(replay);
  // `orderId` is the partner-visible reference id (Gelato `orderReferenceId`,
  // Printful `externalId`). A fresh id here is a second physical print.
  assert.equal(
    replay?.orderId,
    original.orderId,
    "a replayed event must return the original order, not mint a new one",
  );
  assert.equal(replay?.amountCents, 24_500);
  assert.notEqual(
    replay?.status,
    undefined,
    "the replay must not be silently dropped either",
  );

  const summary = buildOrderSummary();
  assert.equal(summary.totalOrders, 151, "the replay must not be counted twice");
  assert.equal(summary.totalRevenueCents, 24_500 + 150 * 1_000);
});

test("totalRevenueCents over 150 orders is the true sum, not the last 100", () => {
  clearOrdersForTests();

  let expectedRevenueCents = 0;
  let expectedArtistTransfers = 0;
  for (let index = 0; index < 150; index += 1) {
    const amountCents = 1_000 + index; // distinct amounts, so truncation shows up
    expectedRevenueCents += amountCents;
    expectedArtistTransfers += 10;
    recordOrderFromPaymentWebhook(
      `evt_total_${index}`,
      "payment_intent.succeeded",
      paymentIntent(`pi_total_${index}`, amountCents),
      true,
    );
  }

  const summary = buildOrderSummary();

  assert.equal(summary.totalOrders, 150);
  assert.equal(summary.totalRevenueCents, expectedRevenueCents);
  assert.equal(summary.totalArtistTransfers, expectedArtistTransfers);
  assert.equal(summary.paidOrders, 150);
  assert.equal(summary.fulfillmentQueued, 150);
  assert.equal(summary.testModeOrders, 150);

  // Guard against a summary that merely got a bigger window: the reported
  // totals must exceed anything the window alone could produce.
  const windowRevenueCents = getOrderRecords().reduce(
    (sum, order) => sum + order.amountCents,
    0,
  );
  assert.ok(
    summary.totalRevenueCents > windowRevenueCents,
    "totals must not be derived from the bounded display window",
  );
});

test("the displayed record list stays bounded while the totals keep growing", () => {
  clearOrdersForTests();

  recordOrders(250, 500, "bounded");

  assert.equal(
    getOrderRecords().length,
    DISPLAY_WINDOW_LIMIT,
    "memory bound: the display window must not grow with order count",
  );
  assert.equal(buildOrderSummary().totalOrders, 250);
});

test("lastOrderAt reports the most recently recorded order after truncation", () => {
  clearOrdersForTests();

  recordOrders(120, 700, "recency");
  recordOrderFromPaymentWebhook(
    "evt_recency_last",
    "payment_intent.succeeded",
    paymentIntent("pi_recency_last", 900),
    true,
    "2026-08-05T12:00:00.000Z",
  );

  assert.equal(buildOrderSummary().lastOrderAt, "2026-08-05T12:00:00.000Z");
});

test("buildOrderSummary(records) still summarises exactly the array it is given", () => {
  clearOrdersForTests();

  recordOrders(150, 2_000, "explicit");

  // `summarizePersistedOrders` passes a filtered record set and must get a
  // summary of that set, not this module's lifetime totals.
  const subset = getOrderRecords().slice(0, 3);
  const subsetSummary = buildOrderSummary(subset);

  assert.equal(subsetSummary.totalOrders, 3);
  assert.equal(subsetSummary.totalRevenueCents, 3 * 2_000);
  assert.equal(buildOrderSummary().totalOrders, 150);
});

test("clearOrdersForTests resets the totals and the idempotency index", () => {
  clearOrdersForTests();
  recordOrders(5, 1_500, "reset");
  clearOrdersForTests();

  const summary = buildOrderSummary();
  assert.equal(summary.totalOrders, 0);
  assert.equal(summary.totalRevenueCents, 0);
  assert.equal(summary.totalArtistTransfers, 0);
  assert.equal(summary.paidOrders, 0);
  assert.equal(summary.fulfillmentQueued, 0);
  assert.equal(summary.testModeOrders, 0);
  assert.equal(summary.lastOrderAt, null);
  assert.equal(getOrderRecords().length, 0);

  // A cleared store must not remember the event ids either, or a test that
  // reuses an id would silently get the previous run's record back.
  const reused = recordOrderFromPaymentWebhook(
    "evt_reset_0",
    "payment_intent.succeeded",
    paymentIntent("pi_reset_0", 3_300),
    true,
  );
  assert.equal(reused?.amountCents, 3_300);
  assert.equal(buildOrderSummary().totalOrders, 1);
});
