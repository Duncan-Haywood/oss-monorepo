import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level coverage for bootstrapStripePricesAction — the
 * operator-auth'd dashboard twin of POST /api/stripe/bootstrap-prices.
 *
 * bootstrap-gate.test.ts + bootstrap-prices/route.test.ts already cover
 * the shared gate and API route. This suite locks the server-action glue:
 * requireOperatorAuth rejection, per-IP rate limit (auth alone is not a
 * throttle — see AGENT_PROTOCOL), gate failure surfaces, success
 * results+envSnippet+next, and Stripe throw → error string.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const headerGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (...args: unknown[]) => headerGet(...(args as [string])),
  })),
}));

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

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("bootstrapStripePricesAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headerGet.mockReset().mockReturnValue("203.0.113.5");
    bootstrapStripePrices.mockReset();
    stripeCtor.mockReset();
    captureError.mockReset().mockResolvedValue(undefined);
    process.env = { ...originalEnv };
    delete process.env.ALLOW_STRIPE_BOOTSTRAP;
    delete process.env.STRIPE_SECRET_KEY;
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error when requireOperatorAuth fails", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";

    const { bootstrapStripePricesAction } = await import("./actions");
    const result = await bootstrapStripePricesAction();

    expect(result).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(bootstrapStripePrices).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("rate-limits repeated bootstrap calls from the same IP (auth alone is not a throttle)", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    bootstrapStripePrices.mockResolvedValue({ results: [], envSnippet: "" });

    const { bootstrapStripePricesAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await bootstrapStripePricesAction();
      expect(res.success).toBe(true);
    }
    bootstrapStripePrices.mockClear();
    stripeCtor.mockClear();

    const limited = await bootstrapStripePricesAction();
    expect(limited).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(bootstrapStripePrices).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns gate error when ALLOW_STRIPE_BOOTSTRAP is unset", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";

    const { bootstrapStripePricesAction } = await import("./actions");
    const result = await bootstrapStripePricesAction();

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toMatch(/ALLOW_STRIPE_BOOTSTRAP=1/);
    expect(bootstrapStripePrices).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns gate error when STRIPE_SECRET_KEY is missing", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";

    const { bootstrapStripePricesAction } = await import("./actions");
    const result = await bootstrapStripePricesAction();

    expect(result).toEqual({
      success: false,
      error: "Set STRIPE_SECRET_KEY before bootstrapping prices.",
    });
    expect(bootstrapStripePrices).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns results + envSnippet + next when bootstrap succeeds", async () => {
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

    const { bootstrapStripePricesAction } = await import("./actions");
    const result = await bootstrapStripePricesAction();

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.priceId).toBe("price_starter");
    expect(result.envSnippet).toContain(
      "STRIPE_PRICE_ID_STARTER_SETUP=price_starter",
    );
    expect(result.next).toMatch(/unset ALLOW_STRIPE_BOOTSTRAP/);
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_bootstrap");
    expect(bootstrapStripePrices).toHaveBeenCalledTimes(1);
  });

  it("returns Stripe error message when bootstrapStripePrices throws", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    bootstrapStripePrices.mockRejectedValue(new Error("Stripe API timeout"));

    const { bootstrapStripePricesAction } = await import("./actions");
    const result = await bootstrapStripePricesAction();

    expect(result).toEqual({
      success: false,
      error: "Stripe API timeout",
    });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-actions",
      failureKind: "bootstrapStripePricesAction",
    });
  });

  it("returns Unknown Stripe error when throw is non-Error", async () => {
    process.env.ALLOW_STRIPE_BOOTSTRAP = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_bootstrap";
    bootstrapStripePrices.mockRejectedValue("raw-failure");

    const { bootstrapStripePricesAction } = await import("./actions");
    const result = await bootstrapStripePricesAction();

    expect(result).toEqual({
      success: false,
      error: "Unknown Stripe error",
    });
    expect(captureError).toHaveBeenCalledWith("raw-failure", {
      component: "dashboard-actions",
      failureKind: "bootstrapStripePricesAction",
    });
  });
});
