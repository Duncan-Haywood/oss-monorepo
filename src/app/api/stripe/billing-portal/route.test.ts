import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";

/**
 * Route-level coverage for the customer self-serve Billing Portal entry
 * point (twin of the stripe/checkout + stripe/webhook route suites).
 *
 * createBillingPortalForCheckoutSession (src/lib/billing/create-portal-session.ts)
 * already has direct unit coverage for its branching logic — this suite
 * exercises the route itself: body parsing, STRIPE_SECRET_KEY gating,
 * returnUrl derivation (explicit body value vs NEXT_PUBLIC_APP_URL vs
 * request origin, rejecting a cross-origin/malformed value as an
 * open-redirect guard), and status/error passthrough from the helper's result.
 * Only the Stripe SDK is mocked.
 */

const sessionsRetrieve = vi.fn();
const sessionsListLineItems = vi.fn();
const billingPortalCreate = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    checkout = {
      sessions: {
        retrieve: (...args: unknown[]) => sessionsRetrieve(...args),
        listLineItems: (...args: unknown[]) => sessionsListLineItems(...args),
      },
    };
    billingPortal = {
      sessions: {
        create: (...args: unknown[]) => billingPortalCreate(...args),
      },
    };
  },
}));

// createBillingPortalForCheckoutSession never calls listOrders (that's the
// createBillingPortalForLead path), but importing the real "@/lib/db" module
// pulls in the "server-only" guard, which throws outside a Next.js server
// component render. Stub it so this suite exercises only the route +
// createBillingPortalForCheckoutSession, matching the other route suites'
// "mock Stripe SDK and @/lib/db" pattern.
vi.mock("@/lib/db", () => ({
  listOrders: vi.fn(),
  listOrdersByLeadSlug: vi.fn().mockResolvedValue([]),
}));

function portalRequest(body: unknown, url = "http://localhost/api/stripe/billing-portal") {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function completeSubscriptionSession(overrides: Record<string, unknown> = {}) {
  return {
    status: "complete",
    mode: "subscription",
    metadata: {},
    customer: "cus_1",
    ...overrides,
  };
}

describe("POST /api/stripe/billing-portal", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sessionsRetrieve.mockReset();
    sessionsListLineItems.mockReset().mockResolvedValue({ data: [] });
    billingPortalCreate.mockReset();
    process.env = { ...originalEnv };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    // Each `it` below issues its own POST(s) from the same synthetic (no
    // x-forwarded-for) client — reset the limiter so route-level tests don't
    // interfere with each other regardless of run order.
    resetRateLimiterForTests();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 400 on invalid JSON", async () => {
    const { POST } = await import("./route");
    const res = await POST(portalRequest("{not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns 400 when the raw JSON body exceeds MAX_PUBLIC_JSON_BODY_BYTES", async () => {
    const { MAX_PUBLIC_JSON_BODY_BYTES } = await import(
      "@/lib/security/json-body"
    );
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    const { POST } = await import("./route");
    const huge = JSON.stringify({
      sessionId: "cs_test_abc",
      pad: "p".repeat(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const res = await POST(portalRequest(huge));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body is too large" });
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns 400 when sessionId is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(portalRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sessionId is required/);
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns 400 when sessionId is whitespace-only", async () => {
    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "   " }));
    expect(res.status).toBe(400);
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns 400 when sessionId exceeds MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH (no Stripe call)", async () => {
    const { MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH } = await import(
      "@/lib/billing/checkout-session-id"
    );
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    const { POST } = await import("./route");
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    const res = await POST(portalRequest({ sessionId: over }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sessionId is too long/);
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  it("returns 501 when STRIPE_SECRET_KEY is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_test_1" }));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toMatch(/STRIPE_SECRET_KEY/);
    expect(sessionsRetrieve).not.toHaveBeenCalled();
  });

  it("creates a portal session and defaults returnUrl to /checkout/success with the session id", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_test_1" }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://billing.stripe.com/session/1" });
    expect(sessionsRetrieve).toHaveBeenCalledWith("cs_test_1");
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.example.com/checkout/success?session_id=cs_test_1",
    });
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset (never trusts request origin / Host)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    delete process.env.VERCEL_URL;
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const res = await POST(
      portalRequest({ sessionId: "cs_test_1" }, "https://attacker.example.com/api/stripe/billing-portal"),
    );

    expect(res.status).toBe(200);
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "http://localhost:3000/checkout/success?session_id=cs_test_1",
    });
  });

  it("uses VERCEL_URL when APP_URL is unset (preview deploys) and still ignores request origin", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.VERCEL_URL = "preview-abc.vercel.app";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const res = await POST(
      portalRequest({ sessionId: "cs_test_1" }, "https://attacker.example.com/api/stripe/billing-portal"),
    );

    expect(res.status).toBe(200);
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://preview-abc.vercel.app/checkout/success?session_id=cs_test_1",
    });
  });

  it("rejects a body returnUrl that only matches a spoofed request origin when APP_URL is unset", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    delete process.env.VERCEL_URL;
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const res = await POST(
      portalRequest(
        { sessionId: "cs_test_1", returnUrl: "https://attacker.example.com/phish" },
        "https://attacker.example.com/api/stripe/billing-portal",
      ),
    );

    expect(res.status).toBe(200);
    // Comparison origin is localhost (not the spoofed request origin), so the
    // attacker returnUrl fails isSameOriginReturnUrl and we keep the default.
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "http://localhost:3000/checkout/success?session_id=cs_test_1",
    });
  });

  it("uses an explicit body returnUrl over the derived default", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const res = await POST(
      portalRequest({ sessionId: "cs_test_1", returnUrl: "https://app.example.com/dashboard/leads" }),
    );

    expect(res.status).toBe(200);
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.example.com/dashboard/leads",
    });
  });

  it("ignores a cross-origin body returnUrl and falls back to the derived default (open-redirect guard)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const res = await POST(
      portalRequest({ sessionId: "cs_test_1", returnUrl: "https://attacker.example.net/phish" }),
    );

    expect(res.status).toBe(200);
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.example.com/checkout/success?session_id=cs_test_1",
    });
  });

  it("ignores a malformed body returnUrl and falls back to the derived default", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const res = await POST(
      portalRequest({ sessionId: "cs_test_1", returnUrl: "not a url" }),
    );

    expect(res.status).toBe(200);
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.example.com/checkout/success?session_id=cs_test_1",
    });
  });

  it("ignores an over-long same-origin returnUrl and falls back to the derived default", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { MAX_BILLING_PORTAL_RETURN_URL_LENGTH } = await import(
      "@/lib/billing/return-url"
    );
    const over = `https://app.example.com/${"a".repeat(MAX_BILLING_PORTAL_RETURN_URL_LENGTH)}`;

    const { POST } = await import("./route");
    const res = await POST(
      portalRequest({ sessionId: "cs_test_1", returnUrl: over }),
    );

    expect(res.status).toBe(200);
    expect(billingPortalCreate).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://app.example.com/checkout/success?session_id=cs_test_1",
    });
  });

  it("passes through a 400 when the checkout session is not complete", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    sessionsRetrieve.mockResolvedValue({ status: "open", customer: "cus_1" });

    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_test_1" }));

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Checkout session is not complete" });
    expect(billingPortalCreate).not.toHaveBeenCalled();
  });

  it("passes through a 400 when the session has no recurring plan or Commerce add-on", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    sessionsRetrieve.mockResolvedValue(
      completeSubscriptionSession({ mode: "payment", metadata: { tier: "starter", commerceAddon: "false" } }),
    );

    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_test_1" }));

    expect(sessionsListLineItems).toHaveBeenCalledWith("cs_test_1", { limit: 100 });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no recurring subscription/);
  });

  it("does not trust metadata.commerceAddon=true without Commerce Price line items", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
    sessionsRetrieve.mockResolvedValue(
      completeSubscriptionSession({
        mode: "payment",
        metadata: { tier: "starter", commerceAddon: "true" },
      }),
    );
    sessionsListLineItems.mockResolvedValue({
      data: [{ price: { id: "price_starter_setup" } }],
    });

    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_forged" }));

    expect(sessionsListLineItems).toHaveBeenCalledWith("cs_forged", { limit: 100 });
    expect(billingPortalCreate).not.toHaveBeenCalled();
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/no recurring subscription/);
  });

  it("passes through a 404 when the completed session has no Stripe Customer", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession({ customer: null }));

    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_test_1" }));

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/no Stripe Customer/);
  });

  it("passes through a 502 when Stripe does not return a portal url", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: null });

    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_test_1" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Stripe did not return a billing portal URL" });
  });

  it("passes through a 502 when the Checkout Session retrieve throws", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    sessionsRetrieve.mockRejectedValue(new Error("no such session"));

    const { POST } = await import("./route");
    const res = await POST(portalRequest({ sessionId: "cs_test_1" }));

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "no such session" });
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    sessionsRetrieve.mockResolvedValue(completeSubscriptionSession());
    billingPortalCreate.mockResolvedValue({ url: "https://billing.stripe.com/session/1" });

    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/stripe/billing-portal", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.20",
        },
        body: JSON.stringify({ sessionId: "cs_test_1" }),
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
    expect(sessionsRetrieve).toHaveBeenCalledTimes(20);
  });
});
