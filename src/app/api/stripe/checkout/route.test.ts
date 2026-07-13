import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";

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
      success_url: string;
      cancel_url: string;
      metadata: Record<string, string>;
    };
    expect(createArgs.mode).toBe("payment");
    expect(createArgs.line_items).toEqual([
      { price: "price_starter_setup", quantity: 1 },
    ]);
    expect(createArgs.customer_email).toBe("owner@demo-cafe.test");
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

  it("returns 502 when Stripe session creation throws", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockRejectedValue(new Error("card_declined_sim"));
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Stripe session creation failed");
    expect(body.message).toBe("card_declined_sim");
  });

  it("returns 502 (fail-closed) when checkout tracking hits ConvexPrimaryWriteError", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_convex",
      url: "https://checkout.stripe.com/convex",
    });
    recordCheckoutSessionCreated.mockRejectedValue(
      new ConvexPrimaryWriteError("checkout_session_create", new Error("convex down")),
    );
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toBe("Checkout tracking unavailable");
    // Must not leak the Stripe URL after a failed durable track
  });

  it("returns 502 when checkout tracking fails for a non-Convex reason", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_track",
      url: "https://checkout.stripe.com/track",
    });
    recordCheckoutSessionCreated.mockRejectedValue(new Error("sqlite busy"));
    const { POST } = await import("./route");
    const res = await POST(checkoutRequest({ tier: "starter", slug: "demo-cafe" }));
    expect(res.status).toBe(502);
    expect(await res.json()).toMatchObject({ error: "Checkout tracking unavailable" });
  });
});
