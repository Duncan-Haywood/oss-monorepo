import test from "node:test";
import assert from "node:assert";
import { simulateVercelEnvPull } from "../src/lib/partner-credentials.ts";

test("simulateVercelEnvPull simulates syncing Vercel environment variables", () => {
  const result = simulateVercelEnvPull({
    PRINTFUL_API_KEY: "pf_live_test_12345",
    PRINTFUL_STORE_ID: "store_12345",
    STRIPE_SECRET_KEY: "sk_test_12345",
    STRIPE_WEBHOOK_SECRET: "whsec_12345",
    STRIPE_CONNECT_CLIENT_ID: "ca_12345",
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.pulledCount, 5);
  assert.strictEqual(result.vaultSummary.fulfillmentReady, true);
  assert.strictEqual(result.vaultSummary.paymentsReady, true);
});
