import { describe, expect, it } from "vitest";
import {
  assessStripeCoreEnvReadiness,
  listRequiredStripeCoreEnvNames,
  STRIPE_CORE_ENV_NAMES,
} from "./stripe-core-env-readiness";

describe("listRequiredStripeCoreEnvNames", () => {
  it("lists the two launch-checklist Stripe core secrets in stable order", () => {
    expect(listRequiredStripeCoreEnvNames()).toEqual([...STRIPE_CORE_ENV_NAMES]);
    expect(listRequiredStripeCoreEnvNames()).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
  });

  it("does not require NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY — no checkout flow reads it", () => {
    // Every checkout (bundle + commerce Buy now) redirects to a Stripe-hosted
    // Checkout Session URL server-side; there is no loadStripe/@stripe/stripe-js
    // call site that would ever consume a publishable key.
    expect(listRequiredStripeCoreEnvNames()).not.toContain("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY");
  });
});

describe("assessStripeCoreEnvReadiness", () => {
  it("reports all missing when env is empty", () => {
    const result = assessStripeCoreEnvReadiness({});
    expect(result.ready).toBe(false);
    expect(result.required).toEqual([...STRIPE_CORE_ENV_NAMES]);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual([...STRIPE_CORE_ENV_NAMES]);
    expect(result.secretKeyReady).toBe(false);
    expect(result.webhookSecretReady).toBe(false);
  });

  it("treats whitespace-only values as missing", () => {
    const result = assessStripeCoreEnvReadiness({
      STRIPE_SECRET_KEY: "   ",
      STRIPE_WEBHOOK_SECRET: "\t",
    });
    expect(result.secretKeyReady).toBe(false);
    expect(result.webhookSecretReady).toBe(false);
    expect(result.present).toEqual([]);
    expect(result.missing).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    expect(result.ready).toBe(false);
  });

  it("is ready once both core secrets are set — publishable key is irrelevant", () => {
    const result = assessStripeCoreEnvReadiness({
      STRIPE_SECRET_KEY: "sk_test_abc",
      STRIPE_WEBHOOK_SECRET: "whsec_abc",
      // NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY deliberately omitted
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual([...STRIPE_CORE_ENV_NAMES]);
    expect(result.secretKeyReady).toBe(true);
    expect(result.webhookSecretReady).toBe(true);
  });

  it("flags webhook-only gap as not ready (silent fulfillment risk)", () => {
    const result = assessStripeCoreEnvReadiness({
      STRIPE_SECRET_KEY: "sk_test_abc",
      // STRIPE_WEBHOOK_SECRET missing — checkout can succeed, CRM never records
    });
    expect(result.ready).toBe(false);
    expect(result.secretKeyReady).toBe(true);
    expect(result.webhookSecretReady).toBe(false);
    expect(result.missing).toEqual(["STRIPE_WEBHOOK_SECRET"]);
  });
});
