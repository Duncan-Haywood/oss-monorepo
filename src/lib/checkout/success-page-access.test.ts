import { describe, expect, it } from "vitest";
import {
  CHECKOUT_SUCCESS_RATE_LIMIT,
  planCheckoutSuccessAccess,
} from "./success-page-access";

describe("planCheckoutSuccessAccess", () => {
  it("checks the rate limit before ever calling loadSession", async () => {
    let loadSessionCalled = false;
    const plan = await planCheckoutSuccessAccess("cs_test_123", "1.2.3.4", {
      loadSession: async () => {
        loadSessionCalled = true;
        return { confirmed: true, sessionId: "cs_test_123", showBillingPortal: false };
      },
      checkRateLimit: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 30 }),
    });
    expect(plan).toEqual({ kind: "rate_limited" });
    expect(loadSessionCalled).toBe(false);
  });

  it("loads the session and passes through the result when the rate limit passes", async () => {
    const result = { confirmed: true as const, sessionId: "cs_test_456", showBillingPortal: true };
    const plan = await planCheckoutSuccessAccess("cs_test_456", "1.2.3.4", {
      loadSession: async () => result,
      checkRateLimit: () => ({ allowed: true, remaining: 19, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "loaded", result });
  });

  it("passes through an unconfirmed result unchanged", async () => {
    const plan = await planCheckoutSuccessAccess(undefined, "1.2.3.4", {
      loadSession: async () => ({ confirmed: false }),
      checkRateLimit: () => ({ allowed: true, remaining: 19, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "loaded", result: { confirmed: false } });
  });

  it("keys the rate limit bucket by clientIp, not by sessionId, and uses CHECKOUT_SUCCESS_RATE_LIMIT", async () => {
    const seenArgs: Array<[string, unknown]> = [];
    await planCheckoutSuccessAccess("cs_test_a", "9.9.9.9", {
      loadSession: async () => ({ confirmed: false }),
      checkRateLimit: (key, config) => {
        seenArgs.push([key, config]);
        return { allowed: true, remaining: 19, retryAfterSeconds: 0 };
      },
    });
    await planCheckoutSuccessAccess("cs_test_b", "9.9.9.9", {
      loadSession: async () => ({ confirmed: false }),
      checkRateLimit: (key, config) => {
        seenArgs.push([key, config]);
        return { allowed: true, remaining: 19, retryAfterSeconds: 0 };
      },
    });
    expect(seenArgs).toEqual([
      ["checkout-success:9.9.9.9", CHECKOUT_SUCCESS_RATE_LIMIT],
      ["checkout-success:9.9.9.9", CHECKOUT_SUCCESS_RATE_LIMIT],
    ]);
  });

  it("uses the plain DEFAULT_RATE_LIMIT budget (single loadSession call per view, unlike preview's doubled allowance)", () => {
    expect(CHECKOUT_SUCCESS_RATE_LIMIT).toEqual({ limit: 20, windowMs: 60_000 });
  });
});
