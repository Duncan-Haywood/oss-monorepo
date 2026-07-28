import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";

/**
 * Route-level coverage for the create-side twin of the webhook suite:
 * every Starter/Growth/Complete (+ Commerce add-on) sale starts here.
 *
 * Pure helpers (resolveBundleCheckoutLeadSlug, session-persist constants)
 * stay real so this exercises actual route orchestration — Price ID line
 * items, organic slug minting, cancel URL attribution, and requireConvex
 * fail-closed session tracking — not a restatement of mocks. Only the
 * Stripe SDK and @/lib/db persistence are stubbed.
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

const recordCheckoutSessionCreated = vi.fn();
vi.mock("@/lib/db", () => ({
  recordCheckoutSessionCreated: (...args: unknown[]) =>
    recordCheckoutSessionCreated(...args),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

function checkoutRequest(body: unknown) {
  return new Request("http://localhost/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function setBundlePriceEnv() {
  process.env.STRIPE_SECRET_KEY = "sk_test_checkout";
  process.env.STRIPE_PRICE_ID_STARTER_SETUP = "price_starter_setup";
  process.env.STRIPE_PRICE_ID_GROWTH_SETUP = "price_growth_setup";
  process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
  process.env.STRIPE_PRICE_ID_COMPLETE_SETUP = "price_complete_setup";
  process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY = "price_complete_monthly";
  process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
  process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
}

describe("POST /api/stripe/checkout", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    sessionsCreate.mockReset();
    recordCheckoutSessionCreated.mockReset().mockResolvedValue(undefined);
    captureError.mockReset().mockResolvedValue(undefined);
    // Each `it` below issues its own POST(s) from the same synthetic (no
    // x-forwarded-for) client — reset the limiter so route-level tests don't
    // interfere with each other regardless of run order.
    resetRateLimiterForTests();
    process.env = { ...originalEnv };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_PRICE_ID_STARTER_SETUP;
    delete process.env.STRIPE_PRICE_ID_GROWTH_SETUP;
    delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMPLETE_SETUP;
    delete process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY;
    delete process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
    delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    delete process.env.NEXT_PUBLIC_APP_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 501 when STRIPE_SECRET_KEY is missing", async () => {
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.error).toBe("Stripe checkout not configured");
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 on invalid JSON", async () => {
    setBundlePriceEnv();
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest("{not-json"));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid JSON body" });
  });

  it("returns 400 when the raw JSON body exceeds MAX_PUBLIC_JSON_BODY_BYTES", async () => {
    setBundlePriceEnv();
    const { MAX_PUBLIC_JSON_BODY_BYTES } = await import(
      "@/lib/security/json-body"
    );
    const { POST } = await import("./route");
    const huge = JSON.stringify({
      tier: "starter",
      slug: "demo-cafe",
      pad: "p".repeat(MAX_PUBLIC_JSON_BODY_BYTES),
    });
    const res = await POST(checkoutRequest(huge));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Request body is too large" });
    expect(sessionsCreate).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown tier", async () => {
    setBundlePriceEnv();
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "enterprise", slug: "demo-cafe" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Unknown bundle tier");
    expect(body.validTiers).toEqual(["starter", "growth", "complete"]);
  });

  it("returns 501 when the Starter setup Price ID env is missing", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_checkout";
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.message).toMatch(/STRIPE_PRICE_ID_STARTER_SETUP/);
  });

  it("returns 501 when Growth monthly Price ID env is missing", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_checkout";
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = "price_growth_setup";
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "growth", slug: "demo-cafe" }));
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.message).toMatch(/STRIPE_PRICE_ID_GROWTH_MONTHLY/);
  });

  it("returns 501 when Commerce add-on Price ID envs are missing", async () => {
    setBundlePriceEnv();
    delete process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
    delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", slug: "demo-cafe", commerceAddon: true }),
    );
    expect(res.status).toBe(501);
    const body = await res.json();
    expect(body.message).toMatch(/Commerce add-on/);
  });

  it("creates a Starter payment session, tracks kind=bundle, and returns the URL", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_starter",
      url: "https://checkout.stripe.com/starter",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({
        tier: "starter",
        slug: "demo-cafe",
        customerEmail: "owner@demo-cafe.test",
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/starter" });

    expect(sessionsCreate).toHaveBeenCalledOnce();
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      mode: string;
      line_items: { price: string; quantity: number }[];
      customer_email?: string;
      allow_promotion_codes?: boolean;
      success_url: string;
      cancel_url: string;
      metadata: Record<string, string>;
    };
    expect(createArgs.mode).toBe("payment");
    expect(createArgs.line_items).toEqual([
      { price: "price_starter_setup", quantity: 1 },
    ]);
    expect(createArgs.customer_email).toBe("owner@demo-cafe.test");
    expect(createArgs.allow_promotion_codes).toBe(true);
    expect(createArgs.success_url).toContain("/checkout/success?session_id={CHECKOUT_SESSION_ID}");
    expect(createArgs.cancel_url).toBe(
      "https://app.example.com/checkout?cancelled=1&slug=demo-cafe&tier=starter",
    );
    expect(createArgs.metadata).toEqual({
      tier: "starter",
      commerceAddon: "false",
      slug: "demo-cafe",
    });

    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      {
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_test_starter",
        tier: "starter",
        commerceAddon: false,
        customerEmail: "owner@demo-cafe.test",
        kind: "bundle",
      },
      CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
    );
  });

  it("soft-caps over-long customerEmail before Stripe + session tracking", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_email_cap",
      url: "https://checkout.stripe.com/email-cap",
    });
    const { MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH } = await import(
      "@/lib/checkout/customer-email"
    );
    const overlong = `${"a".repeat(MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH + 50)}@x.com`;
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({
        tier: "starter",
        slug: "demo-cafe",
        customerEmail: `  ${overlong}  `,
      }),
    );
    expect(res.status).toBe(200);
    const capped = overlong.trim().slice(0, MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      customer_email?: string;
    };
    expect(createArgs.customer_email).toBe(capped);
    expect(createArgs.customer_email).toHaveLength(
      MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH,
    );
    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: capped,
        kind: "bundle",
      }),
      CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
    );
  });

  it("omits blank customerEmail rather than sending whitespace to Stripe", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_blank_email",
      url: "https://checkout.stripe.com/blank-email",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({
        tier: "starter",
        slug: "demo-cafe",
        customerEmail: "   ",
      }),
    );
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      customer_email?: string;
    };
    expect(createArgs.customer_email).toBeUndefined();
    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        customerEmail: undefined,
      }),
      CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
    );
  });

  it("creates a Growth subscription session with setup + monthly line items", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_growth",
      url: "https://checkout.stripe.com/growth",
    });
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "growth", slug: "demo-cafe" }));
    expect(res.status).toBe(200);

    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      mode: string;
      line_items: { price: string; quantity: number }[];
    };
    expect(createArgs.mode).toBe("subscription");
    expect(createArgs.line_items).toEqual([
      { price: "price_growth_setup", quantity: 1 },
      { price: "price_growth_monthly", quantity: 1 },
    ]);
  });

  it("adds Commerce add-on line items and cancel URL commerce=1", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_commerce",
      url: "https://checkout.stripe.com/commerce",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", slug: "demo-cafe", commerceAddon: true }),
    );
    expect(res.status).toBe(200);

    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      mode: string;
      line_items: { price: string; quantity: number }[];
      cancel_url: string;
      metadata: Record<string, string>;
    };
    // Starter + commerce monthly → subscription mode
    expect(createArgs.mode).toBe("subscription");
    expect(createArgs.line_items).toEqual([
      { price: "price_starter_setup", quantity: 1 },
      { price: "price_commerce_setup", quantity: 1 },
      { price: "price_commerce_monthly", quantity: 1 },
    ]);
    expect(createArgs.cancel_url).toContain("commerce=1");
    expect(createArgs.metadata.commerceAddon).toBe("true");

    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({ commerceAddon: true, kind: "bundle" }),
      CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
    );
  });

  it("mints organic-* slug + organicAttribution when request omits slug", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_organic",
      url: "https://checkout.stripe.com/organic",
    });
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter" }));
    expect(res.status).toBe(200);

    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
      cancel_url: string;
    };
    expect(createArgs.metadata.slug).toMatch(/^organic-[0-9a-f]+$/);
    expect(createArgs.metadata.organicAttribution).toBe("1");
    expect(createArgs.cancel_url).toContain(`slug=${createArgs.metadata.slug}`);

    expect(recordCheckoutSessionCreated).toHaveBeenCalledWith(
      expect.objectContaining({
        leadSlug: createArgs.metadata.slug,
        kind: "bundle",
      }),
      CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY,
    );
  });

  it("mints the SAME organic-* slug across a retry that reuses the client idempotency key", async () => {
    // Regression for the bug this fix closes: resolveBundleCheckoutLeadSlug
    // used to mint a fresh random slug on every call even when the client
    // sent the same Idempotency-Key for a same-params retry (network-error
    // resend, double-click) — a different metadata.slug on that retry would
    // make Stripe itself reject the reused key with idempotency_error, since
    // Stripe treats a key reused with different parameters as an error.
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_organic_retry",
      url: "https://checkout.stripe.com/organic-retry",
    });
    const { POST } = await import("./route");
    const idempotencyKey = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

    const first = await POST(checkoutRequest({ tier: "starter", idempotencyKey }));
    expect(first.status).toBe(200);
    const second = await POST(checkoutRequest({ tier: "starter", idempotencyKey }));
    expect(second.status).toBe(200);

    const firstSlug = (sessionsCreate.mock.calls[0]![0] as { metadata: Record<string, string> })
      .metadata.slug;
    const secondSlug = (sessionsCreate.mock.calls[1]![0] as { metadata: Record<string, string> })
      .metadata.slug;
    expect(firstSlug).toMatch(/^organic-[0-9a-f]+$/);
    expect(secondSlug).toBe(firstSlug);
  });

  it("treats whitespace-only slug as missing and mints organic-*", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_blank",
      url: "https://checkout.stripe.com/blank",
    });
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "   " }));
    expect(res.status).toBe(200);

    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata.slug).toMatch(/^organic-/);
    expect(createArgs.metadata.organicAttribution).toBe("1");
  });

  it("includes a valid acquisitionSource in Stripe Checkout metadata", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_source",
      url: "https://checkout.stripe.com/source",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", slug: "demo-cafe", acquisitionSource: "cat-salon" }),
    );
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata.acquisitionSource).toBe("cat-salon");
  });

  it("drops an unrecognized acquisitionSource rather than passing it through", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_bad_source",
      url: "https://checkout.stripe.com/bad-source",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({
        tier: "starter",
        slug: "demo-cafe",
        acquisitionSource: "<script>alert(1)</script>",
      }),
    );
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata).toEqual({
      tier: "starter",
      commerceAddon: "false",
      slug: "demo-cafe",
    });
    expect(createArgs.metadata.acquisitionSource).toBeUndefined();
  });

  it("includes a trimmed businessName/businessPhone in Stripe Checkout metadata when supplied (organic no-preexisting-lead path)", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_business_fields",
      url: "https://checkout.stripe.com/business-fields",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({
        tier: "starter",
        businessName: "  Riverside Plumbing  ",
        businessPhone: "  555-867-5309  ",
      }),
    );
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata.businessName).toBe("Riverside Plumbing");
    expect(createArgs.metadata.businessPhone).toBe("555-867-5309");
  });

  it("omits businessName/businessPhone from Stripe Checkout metadata when absent or blank", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_no_business_fields",
      url: "https://checkout.stripe.com/no-business-fields",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", slug: "demo-cafe", businessName: "   " }),
    );
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata.businessName).toBeUndefined();
    expect(createArgs.metadata.businessPhone).toBeUndefined();
  });

  it("carries a valid acquisitionSource onto cancel_url so a Stripe back-out/retry doesn't lose attribution", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_source_cancel",
      url: "https://checkout.stripe.com/source-cancel",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", slug: "demo-cafe", acquisitionSource: "outreach-email" }),
    );
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      cancel_url: string;
    };
    expect(createArgs.cancel_url).toContain("source=outreach-email");
  });

  it("omits source from cancel_url when acquisitionSource is absent or unrecognized", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_no_source_cancel",
      url: "https://checkout.stripe.com/no-source-cancel",
    });
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      cancel_url: string;
    };
    expect(createArgs.cancel_url).not.toContain("source=");
  });

  it("returns 502 when Stripe session has no checkout URL", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({ id: "cs_test_nourl", url: null });
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Stripe session missing checkout URL");
    expect(recordCheckoutSessionCreated).not.toHaveBeenCalled();
  });

  it("returns 502 when Stripe session creation throws, and reports it via captureError (session_create)", async () => {
    setBundlePriceEnv();
    const stripeError = new Error("card_declined_sim");
    sessionsCreate.mockRejectedValue(stripeError);
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Stripe session creation failed");
    expect(body.message).toBe("card_declined_sim");
    expect(captureError).toHaveBeenCalledWith(stripeError, {
      component: "stripe-checkout",
      failureKind: "session_create",
    });
  });

  it("returns 502 (fail-closed) when checkout tracking hits ConvexPrimaryWriteError, and reports it via captureError (checkout_session_record)", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_convex",
      url: "https://checkout.stripe.com/convex",
    });
    const convexError = new ConvexPrimaryWriteError("checkout_session_create", new Error("convex down"));
    recordCheckoutSessionCreated.mockRejectedValue(convexError);
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Checkout tracking unavailable");
    // Must not leak the Stripe URL after a failed durable track
    expect(captureError).toHaveBeenCalledWith(convexError, {
      component: "stripe-checkout",
      failureKind: "checkout_session_record",
    });
  });

  it("returns 502 when checkout tracking fails for a non-Convex reason, and reports it via captureError", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_track",
      url: "https://checkout.stripe.com/track",
    });
    const trackingError = new Error("sqlite busy");
    recordCheckoutSessionCreated.mockRejectedValue(trackingError);
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "Checkout tracking unavailable" });
    expect(captureError).toHaveBeenCalledWith(trackingError, {
      component: "stripe-checkout",
      failureKind: "checkout_session_record",
    });
  });

  it("does not call captureError when checkout session creation succeeds", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_clean",
      url: "https://checkout.stripe.com/clean",
    });
    const { POST } = await import("./route");
    await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(captureError).not.toHaveBeenCalled();
  });

  it("never trusts a spoofed request origin for success_url / cancel_url when APP_URL is unset", async () => {
    setBundlePriceEnv();
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
    sessionsCreate.mockResolvedValue({
      id: "cs_test_host_spoof",
      url: "https://checkout.stripe.com/spoof",
    });
    const { POST } = await import("./route");
    const res = await POST(
      new Request("https://attacker.example.com/api/stripe/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tier: "starter", slug: "demo-cafe" }),
      }),
    );
    expect(res.status).toBe(200);
    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      success_url: string;
      cancel_url: string;
    };
    expect(createArgs.success_url).toBe(
      "http://localhost:3000/checkout/success?session_id={CHECKOUT_SESSION_ID}",
    );
    expect(createArgs.cancel_url).toContain("http://localhost:3000/checkout?");
    expect(createArgs.success_url).not.toContain("attacker.example.com");
  });

  it("passes a valid client idempotencyKey through to Stripe as the request options", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_idem",
      url: "https://checkout.stripe.com/idem",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({
        tier: "starter",
        slug: "demo-cafe",
        idempotencyKey: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
      }),
    );
    expect(res.status).toBe(200);
    expect(sessionsCreate).toHaveBeenCalledOnce();
    const options = sessionsCreate.mock.calls[0]![1] as
      | { idempotencyKey?: string }
      | undefined;
    expect(options).toEqual({ idempotencyKey: "3fa85f64-5717-4562-b3fc-2c963f66afa6" });
  });

  it("omits Stripe request options when idempotencyKey is missing or malformed", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_no_idem",
      url: "https://checkout.stripe.com/no-idem",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", slug: "demo-cafe", idempotencyKey: "not-a-uuid" }),
    );
    expect(res.status).toBe(200);
    expect(sessionsCreate.mock.calls[0]![1]).toBeUndefined();
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_rate",
      url: "https://checkout.stripe.com/rate",
    });
    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": "203.0.113.9",
        },
        body: JSON.stringify({ tier: "starter", slug: "demo-cafe" }),
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
