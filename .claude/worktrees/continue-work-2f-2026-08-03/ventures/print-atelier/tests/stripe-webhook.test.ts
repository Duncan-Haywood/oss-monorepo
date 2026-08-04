import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  getStripeWebhookEnvStatus,
  processStripeConnectWebhookEvent,
} from "../src/lib/stripe-connect.ts";
import { verifyStripeWebhookSignature } from "../src/lib/stripe-webhook-server.ts";

test("getStripeWebhookEnvStatus reports missing Stripe credentials", () => {
  const status = getStripeWebhookEnvStatus({});

  assert.equal(status.readyForTestMode, false);
  assert.equal(status.blockers.length, 3);
});

test("getStripeWebhookEnvStatus passes when test-mode env vars are present", () => {
  const status = getStripeWebhookEnvStatus({
    STRIPE_SECRET_KEY: "sk_test_abc",
    STRIPE_WEBHOOK_SECRET: "whsec_abc",
    STRIPE_CONNECT_CLIENT_ID: "ca_abc",
  });

  assert.equal(status.readyForTestMode, true);
  assert.equal(status.blockers.length, 0);
});

test("processStripeConnectWebhookEvent handles transfer.created", () => {
  const result = processStripeConnectWebhookEvent({
    id: "evt_1",
    type: "transfer.created",
    created: 1710000000,
    livemode: false,
    data: {
      object: {
        amount: 1250,
        destination: "acct_artist_1",
      },
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.artistAccountId, "acct_artist_1");
  assert.equal(result.amountCents, 1250);
  assert.equal(result.testMode, true);
});

test("verifyStripeWebhookSignature validates Stripe signature headers", () => {
  const secret = "whsec_test_secret";
  const payload = JSON.stringify({ id: "evt_test", type: "transfer.created" });
  const timestamp = "1710000000";
  const signature = createHmac("sha256", secret)
    .update(`${timestamp}.${payload}`, "utf8")
    .digest("hex");
  const header = `t=${timestamp},v1=${signature}`;

  assert.equal(verifyStripeWebhookSignature(payload, header, secret), true);
  assert.equal(verifyStripeWebhookSignature(payload, "t=1,v1=bad", secret), false);
});
