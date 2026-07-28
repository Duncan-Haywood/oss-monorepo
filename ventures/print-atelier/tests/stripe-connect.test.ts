import assert from "node:assert/strict";
import test from "node:test";
import { formatStripeCurrency, simulateStripeConnectPayout } from "../src/lib/stripe-connect.ts";

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
