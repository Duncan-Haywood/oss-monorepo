import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { MAX_COMMERCE_LINE_ITEM_QUANTITY } from "@/lib/commerce/checkout-fields";
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
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        create: (...args: unknown[]) => sessionsCreate(...args),
      },
    };
  },
}));

const getCommerceCatalog = vi.fn();
const getLeadBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const recordCheckoutSessionCreated = vi.fn();
vi.mock("@/lib/db", () => ({
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  recordCheckoutSessionCreated: (...args: unknown[]) =>
    recordCheckoutSessionCreated(...args),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

const eligibleLead = {
  slug: "demo-cafe",
  businessName: "Demo Cafe",
  stage: "paid" as const,
};

const activeCommerceOrder = {
  leadSlug: "demo-cafe",
  commerceAddon: true,
  tier: "growth",
  amountPaid: 899,
};

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
    getCommerceCatalog.mockReset();
    getLeadBySlug.mockReset();
    listOrdersByLeadSlug.mockReset();
    recordCheckoutSessionCreated.mockReset();
    captureError.mockReset().mockResolvedValue(undefined);
    // Each `it` below issues its own POST(s) from the same synthetic (no
    // x-forwarded-for) client — reset the limiter so route-level tests don't
    // interfere with each other regardless of run order.
    resetRateLimiterForTests();
    getLeadBySlug.mockResolvedValue(eligibleLead);
    listOrdersByLeadSlug.mockResolvedValue([activeCommerceOrder]);
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

  it("returns 400 when the raw JSON body exceeds MAX_PUBLIC_JSON_BODY_BYTES", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { MAX_PUBLIC_JSON_BODY_BYTES } = await import(
      "@/lib/security/json-body"
    );
    const { POST } = await import("./route");
    const huge = JSON.stringify({
      slug: "demo-cafe",
      skuId: "sku_latte",
      pad: "p".repeat(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const res = await POST(commerceRequest(huge));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body is too large" });
    expect(sessionsCreate).not.toHaveBeenCalled();
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

  it("returns 400 when slug or skuId is over the hard length ceiling", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const { MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH, MAX_COMMERCE_CHECKOUT_SLUG_LENGTH } =
      await import("@/lib/commerce/checkout-fields");

    const overSlug = await POST(
      commerceRequest({
        slug: "a".repeat(MAX_COMMERCE_CHECKOUT_SLUG_LENGTH + 1),
        skuId: "sku_latte",
      }),
    );
    expect(overSlug.status).toBe(400);
    expect(await overSlug.json()).toEqual({ error: "slug is too long" });
    expect(getCommerceCatalog).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();

    const overSku = await POST(
      commerceRequest({
        slug: "demo-cafe",
        skuId: "s".repeat(MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH + 1),
      }),
    );
    expect(overSku.status).toBe(400);
    expect(await overSku.json()).toEqual({ error: "skuId is too long" });
    expect(getCommerceCatalog).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 404 when the lead is unknown", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    getLeadBySlug.mockResolvedValue(null);
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "unknown-shop", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Lead not found" });
    expect(getCommerceCatalog).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when commerceAddon recurring entitlement is paused", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    listOrdersByLeadSlug.mockResolvedValue([
      { ...activeCommerceOrder, recurringCanceledAt: 1_720_000_000_000 },
    ]);
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({
      error: "Commerce catalog not available for this lead",
    });
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(getCommerceCatalog).not.toHaveBeenCalled();
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 403 when the lead has no Commerce add-on order", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    listOrdersByLeadSlug.mockResolvedValue([
      { ...activeCommerceOrder, commerceAddon: false },
    ]);
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(403);
    expect(sessionsCreate).not.toHaveBeenCalled();
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
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
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
        line_items: Array<{
          price: string;
          quantity: number;
          adjustable_quantity?: {
            enabled: boolean;
            minimum: number;
            maximum: number;
          };
        }>;
        customer_email?: string;
        allow_promotion_codes?: boolean;
        metadata: Record<string, string>;
        cancel_url: string;
        success_url: string;
      },
    ];
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([
      {
        price: "price_latte_450",
        quantity: 1,
        adjustable_quantity: {
          enabled: true,
          minimum: 1,
          maximum: MAX_COMMERCE_LINE_ITEM_QUANTITY,
        },
      },
    ]);
    expect(params.customer_email).toBe("shopper@example.com");
    expect(params.allow_promotion_codes).toBe(true);
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

  it("soft-caps over-long customerEmail before Stripe + session tracking", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const { MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH } = await import(
      "@/lib/checkout/customer-email"
    );
    const overlong = `${"b".repeat(MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH + 30)}@shop.test`;
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({
        slug: "demo-cafe",
        skuId: "sku_latte",
        customerEmail: overlong,
      }),
    );
    expect(res.status).toBe(200);
    const capped = overlong.slice(0, MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH);
    const [params] = sessionsCreate.mock.calls[0] as [
      { customer_email?: string },
    ];
    expect(params.customer_email).toBe(capped);
    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: capped,
        kind: "commerce_sku",
      }),
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

  it("returns 502 and does not hand out a URL when Convex-primary tracking fails, and reports it via captureError (checkout_session_record)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const convexError = new ConvexPrimaryWriteError("recordCheckoutSessionCreated", new Error("convex down"));
    recordCheckoutSessionCreated.mockRejectedValue(convexError);
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Checkout tracking unavailable");
    expect(body).not.toHaveProperty("url");
    expect(captureError).toHaveBeenCalledWith(convexError, {
      component: "commerce-checkout",
      failureKind: "checkout_session_record",
    });
  });

  it("returns 502 when non-Convex tracking fails (still fail-closed), and reports it via captureError", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const trackingError = new Error("disk full");
    recordCheckoutSessionCreated.mockRejectedValue(trackingError);
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }),
    );
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({
      error: "Checkout tracking unavailable",
    });
    expect(captureError).toHaveBeenCalledWith(trackingError, {
      component: "commerce-checkout",
      failureKind: "checkout_session_record",
    });
  });

  it("does not call captureError when commerce checkout session creation succeeds", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    await POST(commerceRequest({ slug: "demo-cafe", skuId: "sku_latte" }));
    expect(captureError).not.toHaveBeenCalled();
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

  it("passes a valid client idempotencyKey through to Stripe as the request options", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({
        slug: "demo-cafe",
        skuId: "sku_latte",
        idempotencyKey: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      }),
    );
    expect(res.status).toBe(200);
    const options = sessionsCreate.mock.calls[0]![1] as
      | { idempotencyKey?: string }
      | undefined;
    expect(options).toEqual({ idempotencyKey: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });
  });

  it("omits Stripe request options when idempotencyKey is missing or malformed", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_commerce";
    const { POST } = await import("./route");
    const res = await POST(
      commerceRequest({ slug: "demo-cafe", skuId: "sku_latte", idempotencyKey: "nope" }),
    );
    expect(res.status).toBe(200);
    expect(sessionsCreate.mock.calls[0]![1]).toBeUndefined();
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
