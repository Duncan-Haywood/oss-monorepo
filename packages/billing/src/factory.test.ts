// Checkout turns on by itself once the Paddle secrets exist (owner, 2026-11-26), and an explicit
// BILLING_PROVIDER=none stays a kill switch.
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { billingProviderName, createBillingProvider } from "./factory.ts";
import { PaddleBillingProvider } from "./paddle.ts";

const keys = { BILLING_API_KEY: "pdl_test_key", BILLING_WEBHOOK_SECRET: "whsec_test" };

describe("billingProviderName", () => {
  it("defaults to paddle when both secrets are present", () => {
    assert.equal(billingProviderName(keys), "paddle");
    assert.equal(billingProviderName({ ...keys, BILLING_PROVIDER: "  " }), "paddle");
  });
  it("is none while either secret is missing", () => {
    assert.equal(billingProviderName({}), "none");
    assert.equal(billingProviderName({ BILLING_API_KEY: "k" }), "none");
    assert.equal(billingProviderName({ BILLING_WEBHOOK_SECRET: "s" }), "none");
  });
  it("an explicit value wins, so none switches checkout off", () => {
    assert.equal(billingProviderName({ ...keys, BILLING_PROVIDER: "none" }), "none");
    assert.equal(billingProviderName({ ...keys, BILLING_PROVIDER: "Paddle" }), "paddle");
  });
});

describe("createBillingProvider", () => {
  it("builds Paddle from the secrets alone", () => {
    assert.ok(createBillingProvider(keys) instanceof PaddleBillingProvider);
  });
  it("returns null with no secrets, or with BILLING_PROVIDER=none", () => {
    assert.equal(createBillingProvider({}), null);
    assert.equal(createBillingProvider({ ...keys, BILLING_PROVIDER: "none" }), null);
  });
});
