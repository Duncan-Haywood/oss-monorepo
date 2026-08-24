import { describe, expect, it } from "vitest";
import {
  MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH,
  parseCheckoutSessionId,
} from "./checkout-session-id";

describe("parseCheckoutSessionId", () => {
  it("rejects non-strings and blank values as missing", () => {
    expect(parseCheckoutSessionId(undefined)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCheckoutSessionId(null)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCheckoutSessionId(42)).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCheckoutSessionId("")).toEqual({
      ok: false,
      reason: "missing",
    });
    expect(parseCheckoutSessionId("   ")).toEqual({
      ok: false,
      reason: "missing",
    });
  });

  it("trims a valid session id", () => {
    expect(parseCheckoutSessionId("  cs_test_abc123  ")).toEqual({
      ok: true,
      sessionId: "cs_test_abc123",
    });
  });

  it("hard-rejects over MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH (no soft-cap)", () => {
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    expect(parseCheckoutSessionId(over)).toEqual({
      ok: false,
      reason: "too_long",
    });
  });

  it("accepts a session id at the exact max length", () => {
    const exact = "c".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    expect(parseCheckoutSessionId(exact)).toEqual({
      ok: true,
      sessionId: exact,
    });
  });
});
