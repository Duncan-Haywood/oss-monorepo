import assert from "node:assert/strict";
import test from "node:test";

import { buildPartnerCredentialVault } from "../src/lib/partner-credentials";

test("buildPartnerCredentialVault reports missing credentials by default", () => {
  const vault = buildPartnerCredentialVault({});

  assert.ok(vault.overallScore < 55);
  assert.equal(vault.fulfillmentReady, false);
  assert.equal(vault.paymentsReady, false);
  assert.ok(vault.blockers.length > 0);
  assert.equal(vault.credentials.find((item) => item.partnerId === "printful")?.status, "missing");
});

test("buildPartnerCredentialVault marks fulfillment ready when Printful keys are set", () => {
  const vault = buildPartnerCredentialVault({
    PRINTFUL_API_KEY: "test-key",
    PRINTFUL_STORE_ID: "12345",
    STRIPE_SECRET_KEY: "sk_test_x",
    STRIPE_WEBHOOK_SECRET: "whsec_x",
    STRIPE_CONNECT_CLIENT_ID: "ca_x",
    META_PIXEL_ID: "px",
    META_CATALOG_ID: "cat",
    META_ACCESS_TOKEN: "tok",
    GOOGLE_ADS_CUSTOMER_ID: "123",
    GOOGLE_MERCHANT_CENTER_ID: "456",
  });

  const printful = vault.credentials.find((item) => item.partnerId === "printful");
  assert.equal(printful?.status, "ready");
  assert.equal(printful?.marginRoutingEligible, true);
  assert.equal(vault.fulfillmentReady, true);
  assert.equal(vault.paymentsReady, true);
  assert.ok(vault.overallScore >= 55);
});

test("maskSecretValue securely masks sensitive tokens and handles Stripe prefixes", () => {
  const vault = buildPartnerCredentialVault({
    STRIPE_SECRET_KEY: "sk_test_51Mz9876543219876543210ab",
    PRINTFUL_API_KEY: "pf_secret_api_key_value_9999",
  });

  const stripe = vault.credentials.find((item) => item.partnerId === "stripe");
  const secretKeyField = stripe?.envKeys.find((k) => k.key === "STRIPE_SECRET_KEY");
  assert.equal(secretKeyField?.maskedValue, "sk_test_••••10ab");

  const printful = vault.credentials.find((item) => item.partnerId === "printful");
  const printfulKeyField = printful?.envKeys.find((k) => k.key === "PRINTFUL_API_KEY");
  assert.equal(printfulKeyField?.maskedValue, "pf_••••9999");
});

test("buildPartnerCredentialVault includes Vercel integration status and pull instructions", () => {
  const vault = buildPartnerCredentialVault({
    VERCEL: "1",
    VERCEL_ENV: "production",
    VERCEL_PROJECT_ID: "prj_12345",
  });

  assert.equal(vault.vercelStatus.isVercelEnv, true);
  assert.equal(vault.vercelStatus.environmentName, "production");
  assert.equal(vault.vercelStatus.projectIdConfigured, true);
  assert.equal(vault.vercelStatus.pullCommand, "npx vercel env pull .env.local");
});
