import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderRecord } from "@/lib/orders/types";
import {
  createBillingPortalForCheckoutSession,
  createBillingPortalForLead,
  type StripeBillingPortalClient,
} from "./create-portal-session";

const listOrders = vi.fn<() => Promise<OrderRecord[]>>();

vi.mock("@/lib/db", () => ({
  listOrders: () => listOrders(),
}));

function baseOrder(overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: "order_1",
    leadSlug: "demo-cafe",
    stripeSessionId: "cs_1",
    tier: "growth",
    commerceAddon: false,
    amountPaid: 99,
    status: "paid",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function fakeStripe(overrides: Partial<StripeBillingPortalClient> = {}): StripeBillingPortalClient {
  return {
    checkout: {
      sessions: {
        retrieve: vi.fn().mockResolvedValue({ customer: "cus_fallback" }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" }),
      },
    },
    ...overrides,
  } as StripeBillingPortalClient;
}

beforeEach(() => {
  listOrders.mockReset();
});

describe("createBillingPortalForLead", () => {
  it("rejects an empty slug without touching Stripe or the order store", async () => {
    const stripe = fakeStripe();
    const result = await createBillingPortalForLead(stripe, "   ", "https://app/return");
    expect(result).toEqual({ ok: false, error: "Lead slug is required", status: 400 });
    expect(listOrders).not.toHaveBeenCalled();
  });

  it("404s when the lead has no eligible (Growth/Complete/Commerce) order", async () => {
    listOrders.mockResolvedValue([baseOrder({ tier: "starter", commerceAddon: false })]);
    const stripe = fakeStripe();
    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/Starter one-time payments/);
    }
  });

  it("only considers orders for the requested lead slug", async () => {
    listOrders.mockResolvedValue([
      baseOrder({ leadSlug: "other-lead", tier: "growth", stripeCustomerId: "cus_other" }),
    ]);
    const stripe = fakeStripe();
    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("uses the order's stored stripeCustomerId without calling Stripe to resolve it", async () => {
    listOrders.mockResolvedValue([baseOrder({ stripeCustomerId: "cus_stored" })]);
    const retrieve = vi.fn();
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" });
    const stripe = fakeStripe({
      checkout: { sessions: { retrieve } },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(retrieve).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith({
      customer: "cus_stored",
      return_url: "https://app/return",
    });
    expect(result).toEqual({ ok: true, url: "https://billing.stripe.com/session/1" });
  });

  it("falls back to retrieving the Checkout Session when no customer id is stored", async () => {
    listOrders.mockResolvedValue([baseOrder({ stripeCustomerId: undefined, stripeSessionId: "cs_42" })]);
    const retrieve = vi.fn().mockResolvedValue({ customer: { id: "cus_from_session" } });
    const stripe = fakeStripe({ checkout: { sessions: { retrieve } } });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(retrieve).toHaveBeenCalledWith("cs_42");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.url).toBe("https://billing.stripe.com/session/1");
  });

  it("404s when the Checkout Session retrieve throws and no customer id can be resolved", async () => {
    listOrders.mockResolvedValue([baseOrder({ stripeCustomerId: undefined })]);
    const retrieve = vi.fn().mockRejectedValue(new Error("Stripe unavailable"));
    const stripe = fakeStripe({ checkout: { sessions: { retrieve } } });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.status).toBe(404);
      expect(result.error).toMatch(/Could not resolve a Stripe Customer/);
    }
  });

  it("404s when neither a stored customer id nor a stripeSessionId is available", async () => {
    listOrders.mockResolvedValue([
      baseOrder({ stripeCustomerId: undefined, stripeSessionId: "" }),
    ]);
    const retrieve = vi.fn();
    const stripe = fakeStripe({ checkout: { sessions: { retrieve } } });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(retrieve).not.toHaveBeenCalled();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });

  it("502s when Stripe does not return a portal url", async () => {
    listOrders.mockResolvedValue([baseOrder({ stripeCustomerId: "cus_stored" })]);
    const stripe = fakeStripe({
      billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: null }) } },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(result).toEqual({
      ok: false,
      error: "Stripe did not return a billing portal URL",
      status: 502,
    });
  });

  it("502s when billingPortal.sessions.create throws", async () => {
    listOrders.mockResolvedValue([baseOrder({ stripeCustomerId: "cus_stored" })]);
    const stripe = fakeStripe({
      billingPortal: {
        sessions: { create: vi.fn().mockRejectedValue(new Error("card declined")) },
      },
    });

    const result = await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(result).toEqual({ ok: false, error: "card declined", status: 502 });
  });

  it("prefers a Commerce add-on order over an ineligible Starter order", async () => {
    listOrders.mockResolvedValue([
      baseOrder({ id: "o2", tier: "starter", commerceAddon: true, stripeCustomerId: "cus_commerce" }),
      baseOrder({ id: "o1", tier: "starter", commerceAddon: false, stripeCustomerId: "cus_starter" }),
    ]);
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" });
    const stripe = fakeStripe({ billingPortal: { sessions: { create } } });

    await createBillingPortalForLead(stripe, "demo-cafe", "https://app/return");

    expect(create).toHaveBeenCalledWith({
      customer: "cus_commerce",
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

    expect(result).toEqual({ ok: false, error: "Checkout session is not complete", status: 400 });
  });

  it("400s when the completed session has no recurring plan or Commerce add-on", async () => {
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            mode: "payment",
            metadata: { tier: "starter", commerceAddon: "false" },
            customer: "cus_1",
          }),
        },
      },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result).toEqual({
      ok: false,
      error: "This checkout has no recurring subscription to manage",
      status: 400,
    });
  });

  it("is eligible when the Checkout Session mode is subscription, even if bundle metadata looks ineligible", async () => {
    const create = vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/session/1" });
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            mode: "subscription",
            metadata: { tier: "starter", commerceAddon: "false" },
            customer: "cus_1",
          }),
        },
      },
      billingPortal: { sessions: { create } },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result.ok).toBe(true);
    expect(create).toHaveBeenCalledWith({ customer: "cus_1", return_url: "https://app/return" });
  });

  it("is eligible for a Growth/Complete tier one-time-mode session via metadata", async () => {
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            mode: "payment",
            metadata: { tier: "growth", commerceAddon: "false" },
            customer: "cus_1",
          }),
        },
      },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result.ok).toBe(true);
  });

  it("404s when the completed, eligible session has no Stripe Customer", async () => {
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            mode: "subscription",
            metadata: {},
            customer: null,
          }),
        },
      },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result).toEqual({
      ok: false,
      error: "Checkout session has no Stripe Customer (portal requires a customer)",
      status: 404,
    });
  });

  it("502s when the retrieve call throws", async () => {
    const stripe = fakeStripe({
      checkout: { sessions: { retrieve: vi.fn().mockRejectedValue(new Error("no such session")) } },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result).toEqual({ ok: false, error: "no such session", status: 502 });
  });

  it("502s when Stripe does not return a portal url", async () => {
    const stripe = fakeStripe({
      checkout: {
        sessions: {
          retrieve: vi.fn().mockResolvedValue({
            status: "complete",
            mode: "subscription",
            metadata: {},
            customer: "cus_1",
          }),
        },
      },
      billingPortal: { sessions: { create: vi.fn().mockResolvedValue({ url: null }) } },
    });

    const result = await createBillingPortalForCheckoutSession(stripe, "cs_1", "https://app/return");

    expect(result).toEqual({
      ok: false,
      error: "Stripe did not return a billing portal URL",
      status: 502,
    });
  });
});
