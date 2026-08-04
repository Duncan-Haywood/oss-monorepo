import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConvexPrimaryWriteError } from "@/lib/payments/convex-primary";
import { CHECKOUT_SESSION_CREATE_CONVEX_PRIMARY } from "@/lib/checkout/session-persist";
import { BUNDLES, COMMERCE_ADDON } from "@/lib/pricing/bundles";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";

/**
 * Route-level coverage for the create-side twin of the webhook suite:
 * every Starter/Growth/Complete (+ Commerce add-on) sale starts here.
 *
 * Pure helpers (resolveBundleCheckoutLeadSlug, session-persist constants)
 * stay real so this exercises actual route orchestration — Price ID line
 * items, organic slug minting, cancel URL attribution, the advertised-price
 * guarantee, and requireConvex fail-closed session tracking — not a
 * restatement of mocks. Only the Stripe SDK and @/lib/db persistence are
 * stubbed; the guarantee itself runs for real, so a Stripe account that would
 * charge the wrong amount is expressed the only way it can be — as a Stripe
 * answer — rather than by stubbing out the code under test.
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

type StubPrice = {
  id: string;
  unit_amount: number;
  currency: string;
  active: boolean;
  type: "one_time" | "recurring";
  recurring: { interval: string } | null;
};

/**
 * What Stripe would answer for each configured Price ID on a correctly set up
 * account: exactly the advertised amount.
 *
 * Derived from BUNDLES / COMMERCE_ADDON rather than typed, so a price change
 * moves the honest baseline with it — a hardcoded 50000 here would turn every
 * test below into an assertion about a number nobody sells any more.
 */
function honestStripePrices(): Record<string, StubPrice> {
  const oneTime = (id: string, usd: number): StubPrice => ({
    id,
    unit_amount: Math.round(usd * 100),
    currency: "usd",
    active: true,
    type: "one_time",
    recurring: null,
  });
  const monthly = (id: string, usd: number): StubPrice => ({
    id,
    unit_amount: Math.round(usd * 100),
    currency: "usd",
    active: true,
    type: "recurring",
    recurring: { interval: "month" },
  });

  const prices: Record<string, StubPrice> = {};
  for (const bundle of BUNDLES) {
    prices[`price_${bundle.id}_setup`] = oneTime(`price_${bundle.id}_setup`, bundle.setupPriceUsd);
    if (bundle.monthlyPriceUsd != null) {
      prices[`price_${bundle.id}_monthly`] = monthly(
        `price_${bundle.id}_monthly`,
        bundle.monthlyPriceUsd,
      );
    }
  }
  prices.price_commerce_setup = oneTime("price_commerce_setup", COMMERCE_ADDON.setupPriceUsd);
  prices.price_commerce_monthly = monthly(
    "price_commerce_monthly",
    COMMERCE_ADDON.monthlyPriceUsd,
  );
  return prices;
}

/** Answer as a healthy Stripe account would, except for the given overrides. */
function stripeAnswersWith(overrides: Record<string, Partial<StubPrice> | "missing"> = {}) {
  const honest = honestStripePrices();
  pricesRetrieve.mockImplementation(async (id: string) => {
    const override = overrides[id];
    if (override === "missing") {
      throw new Error(`No such price: '${id}'`);
    }
    const base = honest[id];
    if (!base) throw new Error(`No such price: '${id}'`);
    return { ...base, ...override };
  });
}

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
    pricesRetrieve.mockReset();
    stripeAnswersWith();
    recordCheckoutSessionCreated.mockReset().mockResolvedValue(undefined);
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

  /**
   * The organic path has no CRM lead, so this metadata key is the only thing
   * that ever knows who bought. Without it webhook fulfillment names the
   * customer after the minted slug — see buildPaymentStubLeadFields.
   */
  it("carries the buyer's business name into session metadata on an organic checkout", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({
      id: "cs_test_named",
      url: "https://checkout.stripe.com/named",
    });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", businessName: "  Rivera Plumbing  " }),
    );
    expect(res.status).toBe(200);

    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata.slug).toMatch(/^organic-/);
    expect(createArgs.metadata.businessName).toBe("Rivera Plumbing");
  });

  it("omits the metadata key entirely when no business name was given", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({ id: "cs_test_x", url: "https://checkout.stripe.com/x" });
    const { POST } = await import("./route");
    await POST(checkoutRequest({ tier: "starter", businessName: "   " }));

    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata).not.toHaveProperty("businessName");
  });

  /** Stripe rejects the whole session create above 500 chars of metadata value. */
  it("truncates an over-long business name instead of failing checkout", async () => {
    setBundlePriceEnv();
    sessionsCreate.mockResolvedValue({ id: "cs_test_long", url: "https://checkout.stripe.com/l" });
    const { POST } = await import("./route");
    const res = await POST(
      checkoutRequest({ tier: "starter", businessName: "N".repeat(900) }),
    );
    expect(res.status).toBe(200);

    const createArgs = sessionsCreate.mock.calls[0]![0] as {
      metadata: Record<string, string>;
    };
    expect(createArgs.metadata.businessName!.length).toBe(200);
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

  /**
   * The gap this closes: bundles.ts is the single field every page derives the
   * advertised figure from, and the STRIPE_PRICE_ID_* env var is a separate
   * paste an operator makes by hand. Nothing compared the two, so a stale id —
   * or a test-mode id pasted into live secrets — charged whatever it happened
   * to hold while every pricing test stayed green.
   *
   * These drive the route through the Stripe SDK stub, the only place a wrong
   * Stripe account can be expressed, rather than stubbing the guarantee.
   */
  describe("guarantees the advertised price before taking money", () => {
    const starter = BUNDLES.find((bundle) => bundle.id === "starter")!;
    const growth = BUNDLES.find((bundle) => bundle.id === "growth")!;

    const usd = (amountUsd: number) =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amountUsd);

    async function refusalFor(body: unknown) {
      const { POST } = await import("./route");
      const res = await POST(checkoutRequest(body));
      return { res, json: await res.json() };
    }

    it("refuses the sale when Stripe would charge less than the page advertises", async () => {
      setBundlePriceEnv();
      // The audited case verbatim: $250 taken for the advertised $500 setup fee.
      stripeAnswersWith({ price_starter_setup: { unit_amount: 25_000 } });
      sessionsCreate.mockResolvedValue({ id: "cs_never", url: "https://checkout.stripe.com/never" });

      const { res, json } = await refusalFor({ tier: "starter", slug: "demo-cafe" });

      expect(res.status).toBe(500);
      expect(json.error).toBe("Advertised price mismatch");
      const reasons = json.reasons.join(" ");
      expect(reasons).toContain(`${starter.name} setup`);
      expect(reasons).toContain(usd(starter.setupPriceUsd));
      expect(reasons).toContain(usd(250));
      // Names the paste an operator has to redo.
      expect(reasons).toContain(starter.setupPriceIdEnv);

      // Fail closed both ways: no session at Stripe's amount, none at ours,
      // and no checkout tracked for a sale that never happened.
      expect(sessionsCreate).not.toHaveBeenCalled();
      expect(recordCheckoutSessionCreated).not.toHaveBeenCalled();
      expect(json).not.toHaveProperty("url");
    });

    it("refuses an overcharge just as hard as an undercharge", async () => {
      setBundlePriceEnv();
      stripeAnswersWith({ price_growth_monthly: { unit_amount: 12_900 } });
      sessionsCreate.mockResolvedValue({ id: "cs_never", url: "https://checkout.stripe.com/never" });

      const { res, json } = await refusalFor({ tier: "growth", slug: "demo-cafe" });

      expect(res.status).toBe(500);
      expect(json.error).toBe("Advertised price mismatch");
      expect(json.reasons.join(" ")).toContain(`${growth.name} monthly`);
      expect(json.reasons.join(" ")).toContain(usd(129));
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses when the account does not know the Price ID at all", async () => {
      setBundlePriceEnv();
      // A test-mode id left in live secrets: the live key gets "No such price".
      stripeAnswersWith({ price_starter_setup: "missing" });
      sessionsCreate.mockResolvedValue({ id: "cs_never", url: "https://checkout.stripe.com/never" });

      const { res, json } = await refusalFor({ tier: "starter", slug: "demo-cafe" });

      expect(res.status).toBe(502);
      expect(json.error).toBe("Advertised price unverified");
      expect(json.reasons.join(" ")).toContain("price_starter_setup");
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses when the amount matches but the currency does not", async () => {
      setBundlePriceEnv();
      stripeAnswersWith({ price_starter_setup: { currency: "eur" } });
      sessionsCreate.mockResolvedValue({ id: "cs_never", url: "https://checkout.stripe.com/never" });

      const { res, json } = await refusalFor({ tier: "starter", slug: "demo-cafe" });

      expect(res.status).toBe(500);
      expect(json.reasons.join(" ")).toContain("EUR");
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses when a /mo figure points at a one-time Price", async () => {
      setBundlePriceEnv();
      // Same number, wrong cadence: the buyer was quoted $99 every month and
      // would be billed $99 once.
      stripeAnswersWith({
        price_growth_monthly: { type: "one_time", recurring: null },
      });
      sessionsCreate.mockResolvedValue({ id: "cs_never", url: "https://checkout.stripe.com/never" });

      const { res, json } = await refusalFor({ tier: "growth", slug: "demo-cafe" });

      expect(res.status).toBe(500);
      expect(json.reasons.join(" ")).toContain("every month");
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("refuses an archived Price rather than letting Stripe reject the buyer", async () => {
      setBundlePriceEnv();
      stripeAnswersWith({ price_starter_setup: { active: false } });
      sessionsCreate.mockResolvedValue({ id: "cs_never", url: "https://checkout.stripe.com/never" });

      const { res } = await refusalFor({ tier: "starter", slug: "demo-cafe" });

      expect(res.status).toBe(500);
      expect(sessionsCreate).not.toHaveBeenCalled();
    });

    it("checks every line item it is about to bill, and checks them first", async () => {
      setBundlePriceEnv();
      sessionsCreate.mockResolvedValue({
        id: "cs_test_checked",
        url: "https://checkout.stripe.com/checked",
      });
      const { POST } = await import("./route");
      const res = await POST(
        checkoutRequest({ tier: "growth", slug: "demo-cafe", commerceAddon: true }),
      );
      expect(res.status).toBe(200);

      const billed = (
        sessionsCreate.mock.calls[0]![0] as { line_items: { price: string }[] }
      ).line_items.map((item) => item.price);
      const verified = pricesRetrieve.mock.calls.map((call) => call[0] as string);

      // Four line items on this checkout; none of them unverified.
      expect(billed).toHaveLength(4);
      expect([...billed].sort()).toEqual([...verified].sort());

      // "Before" is the whole point — a check after the session exists is a
      // check after Stripe already has a payable link.
      const lastRetrieve = Math.max(...pricesRetrieve.mock.invocationCallOrder);
      expect(lastRetrieve).toBeLessThan(sessionsCreate.mock.invocationCallOrder[0]!);
    });
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
