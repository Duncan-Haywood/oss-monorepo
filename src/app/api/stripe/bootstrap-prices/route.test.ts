import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Route-level coverage for POST /api/stripe/bootstrap-prices — the
 * operator opt-in gate that creates Stripe Price objects and returns
 * the envSnippet operators paste into secrets (unlocks every sale).
 *
 * bootstrap-stripe-prices.test.ts + list-all-pages.test.ts already
 * cover the idempotent Product/Price logic. This suite locks the
 * route glue: ALLOW_STRIPE_BOOTSTRAP 403, missing STRIPE_SECRET_KEY
 * 501, success payload shape, and 502 on bootstrap throw.
 */

const bootstrapStripePrices = vi.fn();
vi.mock("@/lib/pricing/bootstrap-stripe-prices", () => ({
  bootstrapStripePrices: (...args: unknown[]) => bootstrapStripePrices(...args),
}));

const stripeCtor = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(secretKey: string) {
      stripeCtor(secretKey);
    }
  },
}));

describe("POST /api/stripe/bootstrap-prices", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    bootstrapStripePrices.mockReset();
    stripeCtor.mockReset();
    process.env = { ...originalEnv };
    delete process.env.ALLOW_STRIPE_BOOTSTRAP;
    delete process.env.STRIPE_SECRET_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 403 when ALLOW_STRIPE_BOOTSTRAP is unset", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("Stripe price bootstrap disabled");
    expect(body.docs).toBe("/docs/roadmap#phase-3-payments");
    expect(bootstrapStripePrices).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns 403 when ALLOW_STRIPE_BOOTSTRAP is not exactly 1", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "true";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(403);
    expect(bootstrapStripePrices).not.toHaveBeenCalled();
  });

  it("returns 501 when STRIPE_SECRET_KEY is missing", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("Stripe not configured");
    expect(bootstrapStripePrices).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns ok + results + envSnippet when bootstrap succeeds", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    bootstrapStripePrices.mockResolvedValue({
      results: [
        {
          envVar: "STRIPE_PRICE_ID_STARTER_SETUP",
          priceId: "price_starter",
          productId: "prod_starter",
          created: true,
        },
      ],
      envSnippet:
        "STRIPE_PRICE_ID_STARTER_SETUP=price_starter\nSTRIPE_PRICE_ID_GROWTH_SETUP=price_growth",
    });

    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.results).toHaveLength(1);
    expect(body.results[0].priceId).toBe("price_starter");
    expect(body.envSnippet).toContain("STRIPE_PRICE_ID_STARTER_SETUP=price_starter");
    expect(body.next).toMatch(/unset ALLOW_STRIPE_BOOTSTRAP/);
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_bootstrap");
    expect(bootstrapStripePrices).toHaveBeenCalledTimes(1);
  });

  it("returns 502 when bootstrapStripePrices throws", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    bootstrapStripePrices.mockRejectedValue(new Error("Stripe API timeout"));

    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Bootstrap failed");
    expect(body.message).toBe("Stripe API timeout");
  });

  it("returns 502 with Unknown Stripe error when throw is non-Error", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    bootstrapStripePrices.mockRejectedValue("raw-failure");

    const { POST } = await import("./route");
    const res = await POST();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Bootstrap failed");
    expect(body.message).toBe("Unknown Stripe error");
  });
});
