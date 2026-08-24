import { describe, expect, it } from "vitest";
import {
  CHECKOUT_PAGE_RATE_LIMIT,
  planCheckoutPageAccess,
} from "./checkout-page-access";

describe("planCheckoutPageAccess", () => {
  it("checks the rate limit before ever calling loadPrefillLead", async () => {
    let loadPrefillLeadCalled = false;
    const plan = await planCheckoutPageAccess("demo-cafe", "1.2.3.4", {
      loadPrefillLead: async () => {
        loadPrefillLeadCalled = true;
        return { slug: "demo-cafe", lead: null };
      },
      checkRateLimit: () => ({ allowed: false, remaining: 0, retryAfterSeconds: 30 }),
    });
    expect(plan).toEqual({ kind: "rate_limited" });
    expect(loadPrefillLeadCalled).toBe(false);
  });

  it("loads the prefill lead and passes through the result when the rate limit passes", async () => {
    const result = { slug: "demo-cafe", lead: null };
    const plan = await planCheckoutPageAccess("demo-cafe", "1.2.3.4", {
      loadPrefillLead: async () => result,
      checkRateLimit: () => ({ allowed: true, remaining: 19, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "loaded", result });
  });

  it("passes through a missing-slug result unchanged", async () => {
    const plan = await planCheckoutPageAccess(undefined, "1.2.3.4", {
      loadPrefillLead: async () => ({ slug: undefined, lead: null }),
      checkRateLimit: () => ({ allowed: true, remaining: 19, retryAfterSeconds: 0 }),
    });
    expect(plan).toEqual({ kind: "loaded", result: { slug: undefined, lead: null } });
  });

  it("keys the rate limit bucket by clientIp, not by slug, and uses CHECKOUT_PAGE_RATE_LIMIT", async () => {
    const seenArgs: Array<[string, unknown]> = [];
    await planCheckoutPageAccess("lead-a", "9.9.9.9", {
      loadPrefillLead: async () => ({ slug: undefined, lead: null }),
      checkRateLimit: (key, config) => {
        seenArgs.push([key, config]);
        return { allowed: true, remaining: 19, retryAfterSeconds: 0 };
      },
    });
    await planCheckoutPageAccess("lead-b", "9.9.9.9", {
      loadPrefillLead: async () => ({ slug: undefined, lead: null }),
      checkRateLimit: (key, config) => {
        seenArgs.push([key, config]);
        return { allowed: true, remaining: 19, retryAfterSeconds: 0 };
      },
    });
    expect(seenArgs).toEqual([
      ["checkout-page:9.9.9.9", CHECKOUT_PAGE_RATE_LIMIT],
      ["checkout-page:9.9.9.9", CHECKOUT_PAGE_RATE_LIMIT],
    ]);
  });

  it("uses the plain DEFAULT_RATE_LIMIT budget (single loadPrefillLead call per view)", () => {
    expect(CHECKOUT_PAGE_RATE_LIMIT).toEqual({ limit: 20, windowMs: 60_000 });
  });
});
