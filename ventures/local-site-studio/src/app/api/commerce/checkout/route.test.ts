import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";

/**
 * Route-level coverage for POST /api/commerce/checkout — Commerce Buy now
 * create-side twin of stripe-checkout-route-test-coverage. Locks
 * server-resolved stripePriceId (never trusts client price), unsynced-SKU
 * 501, kind=commerce_sku + skuId tracking, and CHECKOUT_SESSION_CREATE
 * CONVEX_PRIMARY fail-closed 502.
 *
 * Only the Stripe SDK and @/lib/db are stubbed.
 */

const sessionsCreate = vi.fn();
const pricesRetrieve = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: (...args: unknown[]) => sessionsCreate(...args),
      },
    };
    prices = {
      retrieve: (...args: unknown[]) => pricesRetrieve(...args),
    };
  },
}));

const getCommerceCatalog = vi.fn();
const recordCheckoutSessionCreated = vi.fn();
vi.mock("@/lib/db", () => ({
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  recordCheckoutSessionCreated: (...args: unknown[]) =>
    recordCheckoutSessionCreated(...args),
}));

function commerceRequest(body: unknown) {
  return new Request("http://localhost/api/commerce/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const syncedCatalog = {
  leadSlug: "demo-cafe",
  items: [
    {
      id: "sku_latte",
      name: "Latte",
      priceCents: 450,
      stripeProductId: "prod_latte",
      stripePriceId: "price_latte_450",
    },
    {
      id: "sku_draft",
      name: "Draft pastry",
      priceCents: 300,
      // No Stripe ids — Request order path only.
    },
  ],
};

const ENV_KEYS = ["STRIPE_SECRET_KEY", "NEXT_PUBLIC_APP_URL"] as const;
const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> =
  {};

describe("POST /api/commerce/checkout", () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    sessionsCreate.mockReset();
    pricesRetrieve.mockReset();
    // A correctly synced account: the Price charges the SKU's stored cents,
    // which is the figure the preview page printed. Derived from the catalog
    // so it cannot drift from what the fixture advertises.
    pricesRetrieve.mockImplementation(async (id: string) => {
      const sku = syncedCatalog.items.find((candidate) => candidate.stripePriceId === id);
      if (!sku) throw new Error(`No such price: '${id}'`);
      return {
        id,
        unit_amount: sku.priceCents,
        currency: "usd",
        active: true,
        type: "one_time" as const,
        recurring: null,
      };
    });
    getCommerceCatalog.mockReset();
    recordCheckoutSessionCreated.mockReset();
    // Each `it` below issues its own POST(s) from the same synthetic (no
    // x-forwarded-for) client — reset the limiter so route-level tests don't
    // interfere with each other regardless of run order.
    resetRateLimiterForTests();
    getCommerceCatalog.mockResolvedValue(syncedCatalog);
    recordCheckoutSessionCreated.mockResolvedValue(undefined);
    sessionsCreate.mockResolvedValue({
      id: "cs_test_commerce_1",
      url: "https://checkout.stripe.com/pay/cs_test_commerce_1",
    });
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("returns 501 when STRIPE_SECRET_KEY is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(501);
    expect(await res.json()).toMatchObject({
      error: "Commerce checkout not available",
    });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const res = await POST(commerceRequest("{nope"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when slug or skuId is missing", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const missingSku = await POST(commerceRequest({ slug: "demo-cafe" }));
    expect(missingSku.status).toBe(400);
    expect(await missingSku.json()).toEqual({
      error: "slug and skuId are required",
    });

    const missingSlug = await POST(commerceRequest({ skuId: "sku_latte" }));
    expect(missingSlug.status).toBe(400);
  });

  it("returns 404 when the catalog item is unknown", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_missing" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Catalog item not found" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when no catalog exists for the slug", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    getCommerceCatalog.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "unknown-shop", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 501 when the SKU has not been synced to Stripe", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_draft" }),
    );
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.message).toContain("not been synced to Stripe");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("creates a payment session from the server-resolved stripePriceId", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({
        slug: "demo-cafe",
        skuId: "sku_latte",
        customerEmail: "shopper@example.com",
        // Tampered client price must be ignored — route never reads it.
        priceCents: 1,
        stripePriceId: "price_attacker_cheap",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.com/pay/cs_test_commerce_1",
    });

    expect(sessionsCreate).toHaveBeenCalledTimes(1);
    const [params] = sessionsCreate.mock.calls[0] as [
      {
        mode: string;
        line_items: Array<{ price: string; quantity: number }>;
        customer_email?: string;
        metadata: Record<string, string>;
        cancel_url: string;
        success_url: string;
      },
    ];
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      { price: "price_latte_450", quantity: 1 },
    ]);
    expect(params.customer_email).toBe("shopper@example.com");
    expect(params.metadata).toEqual({
      slug: "demo-cafe",
      skuId: "sku_latte",
      kind: "commerce_sku",
    });
    expect(params.cancel_url).toBe(
      "https://app.example.com/preview/demo-cafe#catalog",
    );

    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      {
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_test_commerce_1",
        tier: "",
        commerceAddon: false,
        customerEmail: "shopper@example.com",
        kind: "commerce_sku",
        skuId: "sku_latte",
      },
      CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
    );
  });

  it("trims slug and skuId before catalog lookup", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "  demo-cafe  ", skuId: "  sku_latte  " }),
    );
    expect(res.status).toBe(200);
    expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        leadSlug: "demo-cafe",
        skuId: "sku_latte",
        kind: "commerce_sku",
      }),
      CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
    );
  });

  it("returns 502 when Stripe omits the checkout URL", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    sessionsCreate.mockResolvedValue({ id: "cs_no_url", url: null });
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Stripe session missing checkout URL",
    });
    expect(recordCheckoutSessionCreated).not.toHaveBeenCalled();
  });

  it("returns 502 and does not hand out a URL when Convex-primary tracking fails", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    recordCheckoutSessionCreated.mockRejectedValue(
      new ConvexPrimaryWriteError("recordCheckoutSessionCreated", new Error("convex down")),
    );
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Checkout tracking unavailable");
    expect(body).not.toHaveProperty("url");
  });

  it("returns 502 when non-Convex tracking fails (still fail-closed)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    recordCheckoutSessionCreated.mockRejectedValue(new Error("disk full"));
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "Checkout tracking unavailable",
    });
  });

  it("returns 502 when Stripe session creation throws", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    sessionsCreate.mockRejectedValue(new Error("stripe_timeout"));
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "Stripe session creation failed",
      message: "stripe_timeout",
    });
    expect(recordCheckoutSessionCreated).not.toHaveBeenCalled();
  });

  /**
   * Resolving stripePriceId server-side stops a tampered request body, which
   * is a different question from whether that Price still charges the cents
   * the preview page printed. An amount edited in the Stripe Dashboard after
   * the sync leaves the stored priceCents untouched and every catalog test
   * green. See src/lib/pricing/advertised-price-guarantee.ts.
   */
  describe("guarantees the advertised SKU price before taking money", () => {
    it("refuses when the Stripe Price no longer charges the listed cents", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
      pricesRetrieve.mockResolvedValue({
        id: "price_latte_450",
        unit_amount: 900,
        currency: "usd",
        active: true,
        type: "one_time",
        recurring: null,
      });
      const { POST } = await import("./route");
      const res = await POST(commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }));

      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body.error).toBe("Advertised price mismatch");
      const reasons = body.reasons.join(" ");
      expect(reasons).toContain("Latte");
      expect(reasons).toContain("$4.50");
      expect(reasons).toContain("$9.00");
      expect(sessionsCreate).not.toHaveBeenCalled();
      expect(recordCheckoutSessionCreated).not.toHaveBeenCalled();
    });

    it("refuses when Stripe cannot confirm the Price at all", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
      pricesRetrieve.mockRejectedValue(new Error("No such price: 'price_latte_450'"));
      const { POST } = await import("./route");
      const res = await POST(commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }));

      expect(res.status).toBe(502);
      expect(await res.json()).toMatchObject({ error: "Advertised price unverified" });
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("verifies the SKU's Price before the session exists", async () => {
      process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
      const { POST } = await import("./route");
      const res = await POST(commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }));
      expect(res.status).toBe(200);

      expect(pricesRetrieve).toHaveBeenCalledWith("price_latte_450");
      expect(pricesRetrieve.mock.invocationCallOrder[0]!).toBeLessThan(
        sessionsCreate.mock.invocationCallOrder[0]!,
      );
    });
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/commerce/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.10",
        },
        body: JSON.stringify({ slug: "demo-cafe", skuId: "sku_latte" }),
      });

    let lastResponse;
    for (let i = 0; i < 21; i += 1) {
      lastResponse = await POST(request());
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get("Retry-After")).toBeTruthy();
    const body = await lastResponse!.json();
    expect(body.error).toBe("Too many requests");
    // The 21st request never reached Stripe.
    expect(sessionsCreate).toHaveBeenCalledTimes(20);
  });
});
