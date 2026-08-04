import assert from "node:assert/strict";
import test from "node:test";
import {
  formatStripeCurrency,
  processStripeConnectWebhookEvent,
  simulateStripeConnectPayout,
} from "../src/lib/stripe-connect.ts";

test("simulateStripeConnectPayout splits net profit 30/70 after Stripe fees", () => {
  const result = simulateStripeConnectPayout({
    retailPrice: 85,
    fulfillmentCost: 28,
    monthlyOrders: 42,
  });

  assert.ok(result.perOrder.artistTransfer > 0);
  assert.ok(result.perOrder.platformRetained > result.perOrder.artistTransfer);
  assert.equal(result.monthly.artistTransfers, result.perOrder.artistTransfer * 42);
  assert.ok(result.readiness.testModeReady);
  assert.equal(formatStripeCurrency(12.5), "$12.50");
});

test("simulateStripeConnectPayout flags negative economics", () => {
  const result = simulateStripeConnectPayout({
    retailPrice: 40,
    fulfillmentCost: 38,
    monthlyOrders: 5,
  });

  assert.ok(result.readiness.blockers.length > 0);
  assert.equal(result.readiness.testModeReady, false);
});

test("processStripeConnectWebhookEvent extracts destination Connect routing on payment_intent.succeeded", () => {
  const result = processStripeConnectWebhookEvent({
    id: "evt_pi_succeeded_1",
    type: "payment_intent.succeeded",
    created: Date.now(),
    livemode: false,
    data: {
      object: {
        id: "pi_123456",
        amount: 12000,
        metadata: {
          destinationConnectAccountId: "acct_maya",
          artistTransferTotal: "24.60",
        },
      },
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.eventType, "payment_intent.succeeded");
  assert.equal(result.artistAccountId, "acct_maya");
  assert.equal(result.destinationConnectAccountId, "acct_maya");
  assert.equal(result.transferAmountCents, 2460);
  assert.match(result.action, /route Connect transfer of \$24\.60 to acct_maya/);
});

