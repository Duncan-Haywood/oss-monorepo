import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildOrderSummary,
  clearOrdersForTests,
  getOrderRecords,
  recordOrderFromPaymentWebhook,
} from "../src/lib/orders.ts";

test("recordOrderFromPaymentWebhook creates fulfillment-queued order from metadata", () => {
  clearOrdersForTests();

  const order = recordOrderFromPaymentWebhook(
    "evt_order_1",
    "payment_intent.succeeded",
    {
      id: "pi_test_1",
      amount: 9500,
      currency: "usd",
      metadata: {
        fulfillmentPartnerId: "printful",
        shippingRegion: "US",
        artistTransferTotal: "12.50",
        lineItemCount: "2",
      },
    },
    true,
  );

  assert.ok(order);
  assert.equal(order?.status, "fulfillment_queued");
  assert.equal(order?.amountCents, 9500);
  assert.equal(order?.fulfillmentPartnerId, "printful");
  assert.equal(order?.artistTransferTotal, 12.5);
  assert.equal(order?.lineItemCount, 2);
  assert.equal(getOrderRecords().length, 1);
});

test("recordOrderFromPaymentWebhook ignores non-payment events", () => {
  clearOrdersForTests();

  const order = recordOrderFromPaymentWebhook(
    "evt_xfer_1",
    "transfer.created",
    { amount: 1200 },
    true,
  );

  assert.equal(order, null);
  assert.equal(getOrderRecords().length, 0);
});

test("buildOrderSummary totals revenue and fulfillment queue", () => {
  clearOrdersForTests();

  recordOrderFromPaymentWebhook(
    "evt_order_2",
    "payment_intent.succeeded",
    {
      id: "pi_test_2",
      amount: 5000,
      metadata: { fulfillmentPartnerId: "gelato", artistTransferTotal: "8.00" },
    },
    true,
  );

  recordOrderFromPaymentWebhook(
    "evt_order_3",
    "payment_intent.succeeded",
    { id: "pi_test_3", amount: 3000 },
    false,
  );

  const summary = buildOrderSummary();

  assert.equal(summary.totalOrders, 2);
  assert.equal(summary.paidOrders, 2);
  assert.equal(summary.fulfillmentQueued, 1);
  assert.equal(summary.totalRevenueCents, 8000);
  assert.equal(summary.totalArtistTransfers, 8);
  assert.equal(summary.testModeOrders, 1);
});
