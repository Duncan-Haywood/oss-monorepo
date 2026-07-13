import { describe, expect, it } from "vitest";
import {
  assessStripeCoreEnvReadiness,
  listRequiredStripeCoreEnvNames,
  STRIPE_CORE_ENV_NAMES,
} from "./stripe-core-env-readiness";

describe("listRequiredStripeCoreEnvNames", () => {
  it("lists the three launch-checklist Stripe core secrets in stable order", () => {
    expect(listRequiredStripeCoreEnvNames()).toEqual([...STRIPE_CORE_ENV_NAMES]);
    expect(listRequiredStripeCoreEnvNames()).toEqual([
      "STRIPE_SECRET_KEY",
      "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
      "STRIPE_WEBHOOK_SECRET",
    ]);
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
    expect(result.publishableKeyReady).toBe(false);
  });

  it("treats whitespace-only values as missing", () => {
    const result = assessStripeCoreEnvReadiness({
      STRIPE_SECRET_KEY: "   ",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
      STRIPE_WEBHOOK_SECRET: "\t",
    });
    expect(result.publishableKeyReady).toBe(true);
    expect(result.secretKeyReady).toBe(false);
    expect(result.webhookSecretReady).toBe(false);
    expect(result.present).toEqual(["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]);
    expect(result.missing).toEqual(["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET"]);
    expect(result.ready).toBe(false);
  });

  it("is ready only when every core secret is set", () => {
    const result = assessStripeCoreEnvReadiness({
      STRIPE_SECRET_KEY: "sk_test_abc",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
      STRIPE_WEBHOOK_SECRET: "whsec_abc",
    });
    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.present).toEqual([...STRIPE_CORE_ENV_NAMES]);
    expect(result.secretKeyReady).toBe(true);
    expect(result.webhookSecretReady).toBe(true);
    expect(result.publishableKeyReady).toBe(true);
  });

  it("flags webhook-only gap as not ready (silent fulfillment risk)", () => {
    const result = assessStripeCoreEnvReadiness({
      STRIPE_SECRET_KEY: "sk_test_abc",
      NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: "pk_test_abc",
      // STRIPE_WEBHOOK_SECRET missing — checkout can succeed, CRM never records
    });
    expect(result.ready).toBe(false);
    expect(result.secretKeyReady).toBe(true);
    expect(result.webhookSecretReady).toBe(false);
    expect(result.missing).toEqual(["STRIPE_WEBHOOK_SECRET"]);
  });
});
