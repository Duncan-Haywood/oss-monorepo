import { afterEach, describe, expect, it } from "vitest";
import {
  assessStripeConnectOnboardingGate,
  isStripeConnectOnboardingAllowed,
} from "./stripe-connect-gate";

const ORIGINAL_ALLOW = process.env.ALLOW_STRIPE_CONNECT_ONBOARDING;
const ORIGINAL_SECRET = process.env.STRIPE_SECRET_KEY;

afterEach(() => {
  if (ORIGINAL_ALLOW === undefined) {
    delete process.env.ALLOW_STRIPE_CONNECT_ONBOARDING;
  } else {
    process.env.ALLOW_STRIPE_CONNECT_ONBOARDING = ORIGINAL_ALLOW;
  }
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = ORIGINAL_SECRET;
  }
});

describe("isStripeConnectOnboardingAllowed", () => {
  it("is true only when ALLOW_STRIPE_CONNECT_ONBOARDING is exactly 1", () => {
    expect(
      isStripeConnectOnboardingAllowed({ ALLOW_STRIPE_CONNECT_ONBOARDING: "1" }),
    ).toBe(true);
    expect(
      isStripeConnectOnboardingAllowed({ ALLOW_STRIPE_CONNECT_ONBOARDING: "true" }),
    ).toBe(false);
    expect(
      isStripeConnectOnboardingAllowed({ ALLOW_STRIPE_CONNECT_ONBOARDING: "0" }),
    ).toBe(false);
    expect(isStripeConnectOnboardingAllowed({})).toBe(false);
    expect(
      isStripeConnectOnboardingAllowed({ ALLOW_STRIPE_CONNECT_ONBOARDING: " 1 " }),
    ).toBe(false);
  });
});

describe("assessStripeConnectOnboardingGate", () => {
  it("returns 403 when the opt-in flag is unset", () => {
    const gate = assessStripeConnectOnboardingGate({
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
    expect(gate.error).toMatch(/disabled/i);
  });

  it("returns 403 when the flag is not exactly 1", () => {
    const gate = assessStripeConnectOnboardingGate({
      ALLOW_STRIPE_CONNECT_ONBOARDING: "true",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
  });

  it("returns 501 when the flag is set but STRIPE_SECRET_KEY is missing", () => {
    const gate = assessStripeConnectOnboardingGate({
      ALLOW_STRIPE_CONNECT_ONBOARDING: "1",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(501);
    expect(gate.error).toMatch(/not configured/i);
  });

  it("treats whitespace-only STRIPE_SECRET_KEY as missing", () => {
    const gate = assessStripeConnectOnboardingGate({
      ALLOW_STRIPE_CONNECT_ONBOARDING: "1",
      STRIPE_SECRET_KEY: "   ",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(501);
  });

  it("returns ok when flag is 1 and secret is set", () => {
    expect(
      assessStripeConnectOnboardingGate({
        ALLOW_STRIPE_CONNECT_ONBOARDING: "1",
        STRIPE_SECRET_KEY: "sk_test_x",
      }),
    ).toEqual({ ok: true });
  });

  it("reads process.env when no env arg is passed", () => {
    process.env.ALLOW_STRIPE_CONNECT_ONBOARDING = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_live";
    expect(assessStripeConnectOnboardingGate()).toEqual({ ok: true });

    delete process.env.ALLOW_STRIPE_CONNECT_ONBOARDING;
    const gate = assessStripeConnectOnboardingGate();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
  });
});
