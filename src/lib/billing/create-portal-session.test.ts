import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRecord } from "@/lib/orders/types";
import {
  createBillingPortalForCheckoutSession,
  createBillingPortalForLead,
  type StripeBillingPortalClient,
} from "./create-portal-session";

const listOrdersByLeadSlug = vi.fn<(slug: string) => Promise<OrderRecord[]>>();

vi.mock("@/lib/db", () => ({
  listOrdersByLeadSlug: (...args: unknown[]) =>
    listOrdersByLeadSlug(...(args as [string])),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

function baseOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order_1",
    leadSlug: "demo-cafe",
    stripeSessionId: "cs_1",
    tier: "growth",
    commerceAddon: false,
    amountPaid: 99,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

type FakeStripeOverrides = Partial<Omit<StripeBillingPortalClient, "checkout">> & {
  checkout?: {
    sessions?: Partial<StripeBillingPortalClient["checkout"]["sessions"]>;
  };
};

function fakeStripe(overrides: FakeStripeOverrides = {}): StripeBillingPortalClient {
  const base: StripeBillingPortalClient = {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ customer: "cus_fallback" }),
        listLineItems: vi.fn().mockResolvedValue({ data: [] }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" }),
      },
    },
  };
  // Deep-merge checkout.sessions so tests can override retrieve without
  // dropping the default listLineItems stub.
  return {
    ...base,
    ...overrides,
    checkout: {
      sessions: {
        ...base.checkout.sessions,
        ...overrides.checkout?.sessions,
      },
    },
  };
}

beforeEach(() => {
  listOrdersByLeadSlug.mockReset();
  captureError.mockReset().mockResolvedValue(undefined);
});

describe("createBillingPortalForLead", () => {
  const prevGrowth = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
  const prevCommerceSetup = process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
  const prevCommerceMonthly = process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;

  beforeEach(() => {
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
  });

  afterEach(() => {
    if (prevGrowth === undefined) delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    else process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = prevGrowth;
    if (prevCommerceSetup === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
    else process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = prevCommerceSetup;
    if (prevCommerceMonthly === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    else process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = prevCommerceMonthly;
  });

  it("rejects an empty slug without touching Stripe or the order store", async () => {
    const stripe = fakeStripe();
    const result = await createBillingPortalForLead(stripe, "   ", "https://app/return");
    expect(result).toEqual({ ok: false, error: "Lead slug is required", status: 400 });
    expect(listOrdersByLeadSlug).not.toHaveBeenCalled();
  });

  it("404s when the lead has no eligible (Growth/Complete/Commerce) order", async () => {
    listOrdersByLeadSlug.mockResolvedValue([baseOrder({ tier: "starter", commerceAddon: false })]);
    const stripe = fakeStripe();
    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/Starter one-time payments/);
    }
  });

  it("404s when the slug-scoped order list is empty (other leads never loaded)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([]);
    const stripe = fakeStripe();
    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("404s when the CRM-eligible order has no stripeSessionId (cannot re-prove)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      baseOrder({ stripeCustomerId: "cus_stored", stripeSessionId: "" }),
    ]);
    const retrieve = vi.fn();
    const create = vi.fn();
    const stripe = fakeStripe({
      checkout: { sessions: { retrieve } },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(retrieve).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/Checkout Session/);
    }
  });

  it("does not open portal from CRM tier alone when Session has a foreign recurring Price", async () => {
    // Twin of #339 Session path — CRM growth + stored customer is not enough.
    listOrdersByLeadSlug.mockResolvedValue([
      baseOrder({ tier: "growth", stripeCustomerId: "cus_stored", stripeSessionId: "cs_foreign" }),
    ]);
    const create = vi.fn();
    const listLineItems = vi.fn().mockResolvedValue({
      data: [{ price: { id: "price_foreign_recurring" } }],
    });
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "subscription",
            customer: "cus_from_session",
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(listLineItems).toHaveBeenCalledWith("cs_foreign", { limit: 100 });
    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/subscription/);
    }
  });

  it("opens portal when Session proves catalog recurring Price (prefers Session customer)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      baseOrder({
        tier: "growth",
        stripeCustomerId: "cus_stale_crm",
        stripeSessionId: "cs_growth",
      }),
    ]);
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" });
    const listLineItems = vi.fn().mockResolvedValue({
      data: [
        { price: { id: "price_growth_setup" } },
        { price: { id: "price_growth_monthly" } },
      ],
    });
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "subscription",
            customer: "cus_from_session",
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(listLineItems).toHaveBeenCalledWith("cs_growth", { limit: 100 });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_from_session",
      return_url: "https://app/return",
    });
    expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/session/1" });
  });

  it("400s when the Checkout Session is complete but unpaid (async ACH)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      baseOrder({ stripeCustomerId: "cus_stored", stripeSessionId: "cs_unpaid" }),
    ]);
    const create = vi.fn();
    const listLineItems = vi.fn();
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "unpaid",
            mode: "subscription",
            customer: "cus_from_session",
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(listLineItems).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/not paid/);
    }
  });

  it("502s when listLineItems fails on the lead Session path", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      baseOrder({ stripeCustomerId: "cus_stored", stripeSessionId: "cs_1" }),
    ]);
    const create = vi.fn();
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "subscription",
            customer: "cus_from_session",
          }),
          listLineItems: vi.fn().mockRejectedValue(new Error("stripe line items down")),
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toMatch(/catalog recurring line items/);
    }
  });

  it("502s when checkout.sessions.retrieve throws", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      baseOrder({ stripeCustomerId: undefined, stripeSessionId: "cs_1" }),
    ]);
    const stripe = fakeStripe({
      checkout: {
        sessions: { retrieve: vi.fn().mockRejectedValue(new Error("Stripe unavailable")) },
      },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(result).toEqual({ ok: false, error: "Stripe unavailable", status: 502 });
  });

  it("prefers a Commerce add-on order and proves Commerce Prices on that Session", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      baseOrder({
        id: "o2",
        tier: "starter",
        commerceAddon: true,
        stripeCustomerId: "cus_commerce",
        stripeSessionId: "cs_commerce",
      }),
      baseOrder({
        id: "o1",
        tier: "starter",
        commerceAddon: false,
        stripeCustomerId: "cus_starter",
        stripeSessionId: "cs_starter",
      }),
    ]);
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" });
    const listLineItems = vi.fn().mockResolvedValue({
      data: [
        { price: { id: "price_starter_setup" } },
        { price: { id: "price_commerce_setup" } },
        { price: { id: "price_commerce_monthly" } },
      ],
    });
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "subscription",
            customer: "cus_from_commerce_session",
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(listLineItems).toHaveBeenCalledWith("cs_commerce", { limit: 100 });
    expect(create).toHaveBeenCalledWith({
      customer: "cus_from_commerce_session",
      return_url: "https://app/return",
    });
  });
});

describe("createBillingPortalForCheckoutSession", () => {
  it("rejects an empty session id", async () => {
    const stripe = fakeStripe();
    const result = await createBillingPortalForCheckoutSession(stripe, "  ", "https://app/return");
    expect(result).toEqual({ ok: false, error: "Checkout session id is required", status: 400 });
  });

  it("400s when the session is not complete", async () => {
    const stripe = fakeStripe({
      checkout: {
        sessions: { retrieve: vi.fn().mockResolvedValue({ status: "open", customer: "cus_1" }) },
      },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/not complete/);
    }
  });

  it("400s when the session is complete but not paid (async ACH)", async () => {
    // Twin of webhook + success SSR payment_status gate — complete ≠ paid.
    const create = vi.fn();
    const listLineItems = vi.fn();
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "unpaid",
            mode: "subscription",
            customer: "cus_1",
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(listLineItems).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/not paid/);
    }
  });

  it("400s when the session is not a subscription", async () => {
    const listLineItems = vi.fn().mockResolvedValue({ data: [] });
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "payment",
            customer: "cus_1",
            metadata: { tier: "starter", commerceAddon: "false" },
          }),
          listLineItems,
        },
      },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(listLineItems).toHaveBeenCalledWith("cs_1", { limit: 100 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/subscription/);
    }
  });

  it("does not trust metadata.tier=growth|complete on payment-mode sessions", async () => {
    // Create path never emits payment+growth/complete (hasRecurring → subscription).
    const create = vi.fn();
    const listLineItems = vi.fn().mockResolvedValue({
      data: [{ price: { id: "price_one_time" } }],
    });
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "payment",
            customer: "cus_1",
            metadata: { tier: "growth", commerceAddon: "false" },
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForCheckoutSession(
      stripe,
      "cs_forged_tier",
      "https://app/return",
    );

    expect(listLineItems).toHaveBeenCalledWith("cs_forged_tier", { limit: 100 });
    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(400);
      expect(result.error).toMatch(/subscription/);
    }
  });
  it("does not trust metadata.commerceAddon=true without Commerce Price line items", async () => {
    const prevSetup = process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
    const prevMonthly = process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
    try {
      const create = vi.fn();
      const listLineItems = vi.fn().mockResolvedValue({
        data: [{ price: { id: "price_starter_setup" } }],
      });
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              mode: "payment",
              customer: "cus_1",
              metadata: { tier: "starter", commerceAddon: "true" },
            }),
            listLineItems,
          },
        },
        billingPortal: { sessions: { create } },
      });

      const result = await createBillingPortalForCheckoutSession(
        stripe,
        "cs_forged",
        "https://app/return",
      );

      expect(listLineItems).toHaveBeenCalledWith("cs_forged", { limit: 100 });
      expect(create).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toMatch(/subscription/);
      }
    } finally {
      if (prevSetup === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
      else process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = prevSetup;
      if (prevMonthly === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
      else process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = prevMonthly;
    }
  });

  it("opens portal for payment-mode Starter when both Commerce Prices are on line items", async () => {
    const prevSetup = process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
    const prevMonthly = process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
    process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
    try {
      const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" });
      const listLineItems = vi.fn().mockResolvedValue({
        data: [
          { price: { id: "price_starter_setup" } },
          { price: { id: "price_commerce_setup" } },
          { price: { id: "price_commerce_monthly" } },
        ],
      });
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              // Unusual vs create-path (which would set subscription), but
              // line items still prove Commerce was charged.
              mode: "payment",
              customer: "cus_commerce",
              metadata: { tier: "starter", commerceAddon: "false" },
            }),
            listLineItems,
          },
        },
        billingPortal: { sessions: { create } },
      });

      const result = await createBillingPortalForCheckoutSession(
        stripe,
        "cs_commerce",
        "https://app/return",
      );

      expect(listLineItems).toHaveBeenCalledWith("cs_commerce", { limit: 100 });
      expect(create).toHaveBeenCalledWith({
        customer: "cus_commerce",
        return_url: "https://app/return",
      });
      expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/session/1" });
    } finally {
      if (prevSetup === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_SETUP;
      else process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = prevSetup;
      if (prevMonthly === undefined) delete process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY;
      else process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = prevMonthly;
    }
  });

  it("502s when listLineItems fails on a payment-mode session, and reports it via captureError (line_items_verify)", async () => {
    const lineItemsError = new Error("stripe line items down");
    const listLineItems = vi.fn().mockRejectedValue(lineItemsError);
    const create = vi.fn();
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "payment",
            customer: "cus_1",
            metadata: { tier: "starter", commerceAddon: "true" },
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForCheckoutSession(
      stripe,
      "cs_1",
      "https://app/return",
    );

    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toMatch(/Commerce line items/);
    }
    expect(captureError).toHaveBeenCalledWith(lineItemsError, {
      component: "billing-portal",
      failureKind: "line_items_verify",
    });
  });

  it("requires catalog recurring Price on listLineItems for subscription mode", async () => {
    const prevGrowth = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    try {
      const listLineItems = vi.fn().mockResolvedValue({
        data: [{ price: { id: "price_foreign_recurring" } }],
      });
      const create = vi.fn();
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              mode: "subscription",
              customer: "cus_from_cs",
            }),
            listLineItems,
          },
        },
        billingPortal: { sessions: { create } },
      });

      const result = await createBillingPortalForCheckoutSession(
        stripe,
        "cs_sub_foreign",
        "https://app/return",
      );

      expect(listLineItems).toHaveBeenCalledWith("cs_sub_foreign", { limit: 100 });
      expect(create).not.toHaveBeenCalled();
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(400);
        expect(result.error).toMatch(/subscription/);
      }
    } finally {
      if (prevGrowth === undefined) delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
      else process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = prevGrowth;
    }
  });

  it("creates a portal session from a completed subscription with catalog monthly Price", async () => {
    const prevGrowth = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    try {
      const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" });
      const listLineItems = vi.fn().mockResolvedValue({
        data: [
          { price: { id: "price_growth_setup" } },
          { price: { id: "price_growth_monthly" } },
        ],
      });
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              mode: "subscription",
              customer: "cus_from_cs",
            }),
            listLineItems,
          },
        },
        billingPortal: { sessions: { create } },
      });

      const result = await createBillingPortalForCheckoutSession(
        stripe,
        "cs_sub_1",
        "https://app/return",
      );

      expect(listLineItems).toHaveBeenCalledWith("cs_sub_1", { limit: 100 });
      expect(create).toHaveBeenCalledWith({
        customer: "cus_from_cs",
        return_url: "https://app/return",
      });
      expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/session/1" });
    } finally {
      if (prevGrowth === undefined) delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
      else process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = prevGrowth;
    }
  });

  it("502s when listLineItems fails on a subscription-mode session", async () => {
    const listLineItems = vi.fn().mockRejectedValue(new Error("stripe line items down"));
    const create = vi.fn();
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            payment_status: "paid",
            mode: "subscription",
            customer: "cus_1",
          }),
          listLineItems,
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForCheckoutSession(
      stripe,
      "cs_sub_1",
      "https://app/return",
    );

    expect(create).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(502);
      expect(result.error).toMatch(/catalog recurring line items/);
    }
  });

  it("404s when the completed session has no resolvable customer", async () => {
    const prevGrowth = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    try {
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              mode: "subscription",
              customer: null,
            }),
            listLineItems: vi.fn().mockResolvedValue({
              data: [{ price: { id: "price_growth_monthly" } }],
            }),
          },
        },
      });

      const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.status).toBe(404);
        expect(result.error).toMatch(/customer/i);
      }
    } finally {
      if (prevGrowth === undefined) delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
      else process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = prevGrowth;
    }
  });

  it("502s when checkout.sessions.retrieve throws, and reports it via captureError (session_create)", async () => {
    const retrieveError = new Error("stripe down");
    const stripe = fakeStripe({
      checkout: {
        sessions: { retrieve: vi.fn().mockRejectedValue(retrieveError) },
      },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result).toEqual({ ok: false, error: "stripe down", status: 502 });
    expect(captureError).toHaveBeenCalledWith(retrieveError, {
      component: "billing-portal",
      failureKind: "session_create",
    });
  });

  it("502s when billingPortal.sessions.create throws, and reports it via captureError (session_create)", async () => {
    const prevGrowth = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    try {
      const createError = new Error("portal unavailable");
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              mode: "subscription",
              customer: "cus_1",
            }),
            listLineItems: vi.fn().mockResolvedValue({
              data: [{ price: { id: "price_growth_monthly" } }],
            }),
          },
        },
        billingPortal: {
          sessions: { create: vi.fn().mockRejectedValue(createError) },
        },
      });

      const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

      expect(result).toEqual({ ok: false, error: "portal unavailable", status: 502 });
      expect(captureError).toHaveBeenCalledWith(createError, {
        component: "billing-portal",
        failureKind: "session_create",
      });
    } finally {
      if (prevGrowth === undefined) delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
      else process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = prevGrowth;
    }
  });

  it("does not call captureError when the billing portal session is created successfully", async () => {
    const prevGrowth = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    try {
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              mode: "subscription",
              customer: "cus_1",
            }),
            listLineItems: vi.fn().mockResolvedValue({
              data: [{ price: { id: "price_growth_monthly" } }],
            }),
          },
        },
        billingPortal: {
          sessions: { create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" }) },
        },
      });

      await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");
      expect(captureError).not.toHaveBeenCalled();
    } finally {
      if (prevGrowth === undefined) delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
      else process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = prevGrowth;
    }
  });

  it("502s when Stripe returns a null portal url", async () => {
    const prevGrowth = process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = "price_growth_monthly";
    try {
      const stripe = fakeStripe({
        checkout: {
          sessions: {
            retrieve: vi.fn().mockResolvedValue({
              status: "complete",
              payment_status: "paid",
              mode: "subscription",
              customer: "cus_1",
            }),
            listLineItems: vi.fn().mockResolvedValue({
              data: [{ price: { id: "price_growth_monthly" } }],
            }),
          },
        },
        billingPortal: {
          sessions: { create: vi.fn().mockResolvedValue({ url: null }) },
        },
      });

      const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

      expect(result).toEqual({
        ok: false,
        error: "Stripe did not return a billing portal URL",
        status: 502,
      });
    } finally {
      if (prevGrowth === undefined) delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
      else process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = prevGrowth;
    }
  });
});
