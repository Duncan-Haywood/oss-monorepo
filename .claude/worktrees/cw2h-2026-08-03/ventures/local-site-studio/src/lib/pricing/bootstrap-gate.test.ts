import { afterEach, describe, expect, it } from "vitest";
import {
  assessStripeBootstrapGate,
  isStripeBootstrapAllowed,
} from "./bootstrap-gate";

const ORIGINAL_ALLOW = process.env.ALLOW_STRIPE_BOOTSTRAP;
const ORIGINAL_SECRET = process.env.STRIPE_SECRET_KEY;

afterEach(() => {
  if (ORIGINAL_ALLOW === undefined) {
    delete process.env.ALLOW_STRIPE_BOOTSTRAP;
  } else {
    process.env.ALLOW_STRIPE_BOOTSTRAP = ORIGINAL_ALLOW;
  }
  if (ORIGINAL_SECRET === undefined) {
    delete process.env.STRIPE_SECRET_KEY;
  } else {
    process.env.STRIPE_SECRET_KEY = ORIGINAL_SECRET;
  }
});

describe("isStripeBootstrapAllowed", () => {
  it("is true only when ALLOW_STRIPE_BOOTSTRAP is exactly 1", () => {
    expect(isStripeBootstrapAllowed({ ALLOW_STRIPE_BOOTSTRAP: "1" })).toBe(true);
    expect(isStripeBootstrapAllowed({ ALLOW_STRIPE_BOOTSTRAP: "true" })).toBe(
      false,
    );
    expect(isStripeBootstrapAllowed({ ALLOW_STRIPE_BOOTSTRAP: "0" })).toBe(
      false,
    );
    expect(isStripeBootstrapAllowed({})).toBe(false);
    expect(
      isStripeBootstrapAllowed({ ALLOW_STRIPE_BOOTSTRAP: " 1 " }),
    ).toBe(false);
  });
});

describe("assessStripeBootstrapGate", () => {
  it("returns 403 when the opt-in flag is unset", () => {
    const gate = assessStripeBootstrapGate({
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
    expect(gate.error).toMatch(/disabled/i);
  });

  it("returns 403 when the flag is not exactly 1", () => {
    const gate = assessStripeBootstrapGate({
      ALLOW_STRIPE_BOOTSTRAP: "true",
      STRIPE_SECRET_KEY: "sk_test_x",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
  });

  it("returns 501 when the flag is set but STRIPE_SECRET_KEY is missing", () => {
    const gate = assessStripeBootstrapGate({
      ALLOW_STRIPE_BOOTSTRAP: "1",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(501);
    expect(gate.error).toMatch(/not configured/i);
  });

  it("treats whitespace-only STRIPE_SECRET_KEY as missing", () => {
    const gate = assessStripeBootstrapGate({
      ALLOW_STRIPE_BOOTSTRAP: "1",
      STRIPE_SECRET_KEY: "   ",
    });
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(501);
  });

  it("returns ok when flag is 1 and secret is set", () => {
    expect(
      assessStripeBootstrapGate({
        ALLOW_STRIPE_BOOTSTRAP: "1",
        STRIPE_SECRET_KEY: "sk_test_x",
      }),
    ).toEqual({ ok: true });
  });

  it("reads process.env when no env arg is passed", () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_live";
    expect(assessStripeBootstrapGate()).toEqual({ ok: true });

    delete process.env.ALLOW_STRIPE_BOOTSTRAP;
    const gate = assessStripeBootstrapGate();
    expect(gate.ok).toBe(false);
    if (gate.ok) return;
    expect(gate.status).toBe(403);
  });
});
