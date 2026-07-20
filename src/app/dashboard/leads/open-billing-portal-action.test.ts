import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for openBillingPortalAction — the operator
 * Manage billing path for Growth/Complete/Commerce subscribers.
 *
 * create-portal-session.test.ts + billing-portal/route.test.ts cover the
 * helper and customer self-serve route. This suite locks the dashboard
 * action glue: requireOperatorAuth, empty slug, STRIPE_SECRET_KEY gate,
 * returnUrl derivation (NEXT_PUBLIC_APP_URL > forwarded host > localhost),
 * createBillingPortalForLead success/error passthrough, and unexpected throws.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const headersMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => headersMock(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeads: vi.fn(),
  listOrders: vi.fn(),
  listOrdersByLeadSlug: vi.fn(),
  recordLeadOutreach: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

const createBillingPortalForLead = vi.fn();
vi.mock("@/lib/billing/create-portal-session", () => ({
  createBillingPortalForLead: (...args: unknown[]) =>
    createBillingPortalForLead(...args),
}));

const stripeCtor = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(secretKey: string) {
      stripeCtor(secretKey);
    }
  },
}));

function headerStore(entries: Record<string, string | null> = {}) {
  return {
    get(name: string) {
      return entries[name] ?? null;
    },
  };
}

describe("openBillingPortalAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    createBillingPortalForLead.mockReset();
    stripeCtor.mockReset();
    headersMock.mockReset().mockResolvedValue(headerStore());
    process.env = { ...originalEnv };
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.VERCEL_URL;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error when requireOperatorAuth fails", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";

    const { openBillingPortalAction } = await import("./actions");
    const result = await openBillingPortalAction("demo-cafe");

    expect(result).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(createBillingPortalForLead).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("rate-limits repeated portal opens from the same IP (auth alone is not a throttle)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    createBillingPortalForLead.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/session/1",
    });

    const { openBillingPortalAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await openBillingPortalAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    createBillingPortalForLead.mockClear();
    stripeCtor.mockClear();
    const res = await openBillingPortalAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(createBillingPortalForLead).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns error when slug is empty or whitespace", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";

    const { openBillingPortalAction } = await import("./actions");
    expect(await openBillingPortalAction("")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(await openBillingPortalAction("   ")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(createBillingPortalForLead).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns gate error when STRIPE_SECRET_KEY is missing", async () => {
    const { openBillingPortalAction } = await import("./actions");
    const result = await openBillingPortalAction("demo-cafe");

    expect(result).toEqual({
      success: false,
      error: "Set STRIPE_SECRET_KEY before opening the billing portal.",
    });
    expect(createBillingPortalForLead).not.toHaveBeenCalled();
    expect(stripeCtor).not.toHaveBeenCalled();
  });

  it("returns portal url and uses NEXT_PUBLIC_APP_URL for returnUrl", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    createBillingPortalForLead.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/session/1",
    });

    const { openBillingPortalAction } = await import("./actions");
    const result = await openBillingPortalAction("demo-cafe");

    expect(result).toEqual({
      success: true,
      url: "https://billing.stripe.com/session/1",
    });
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_portal");
    expect(createBillingPortalForLead).toHaveBeenCalledTimes(1);
    const [stripeArg, slugArg, returnUrl] = createBillingPortalForLead.mock.calls[0]!;
    expect(stripeArg).toBeInstanceOf(Object);
    expect(slugArg).toBe("demo-cafe");
    expect(returnUrl).toBe("https://app.example/dashboard/leads");
  });

  it("falls back to localhost when NEXT_PUBLIC_APP_URL is unset (never trusts forwarded Host)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    delete process.env.VERCEL_URL;
    headersMock.mockResolvedValue(
      headerStore({
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      }),
    );
    createBillingPortalForLead.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/session/host",
    });

    const { openBillingPortalAction } = await import("./actions");
    const result = await openBillingPortalAction("demo-cafe");

    expect(result.success).toBe(true);
    expect(createBillingPortalForLead.mock.calls[0]![2]).toBe(
      "http://localhost:3000/dashboard/leads",
    );
  });

  it("uses VERCEL_URL when APP_URL is unset and still ignores forwarded Host", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.VERCEL_URL = "preview-abc.vercel.app";
    headersMock.mockResolvedValue(
      headerStore({
        "x-forwarded-host": "attacker.example",
        "x-forwarded-proto": "https",
      }),
    );
    createBillingPortalForLead.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/session/vercel",
    });

    const { openBillingPortalAction } = await import("./actions");
    await openBillingPortalAction("demo-cafe");

    expect(createBillingPortalForLead.mock.calls[0]![2]).toBe(
      "https://preview-abc.vercel.app/dashboard/leads",
    );
  });

  it("falls back to localhost when no APP_URL and no VERCEL_URL", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    delete process.env.VERCEL_URL;
    createBillingPortalForLead.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/session/local",
    });

    const { openBillingPortalAction } = await import("./actions");
    await openBillingPortalAction("demo-cafe");

    expect(createBillingPortalForLead.mock.calls[0]![2]).toBe(
      "http://localhost:3000/dashboard/leads",
    );
  });

  it("falls back to localhost instead of trusting a malformed forwarded-host header verbatim", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    delete process.env.VERCEL_URL;
    headersMock.mockResolvedValue(
      headerStore({
        "x-forwarded-host": '"><script>alert(1)</script>',
        "x-forwarded-proto": "https",
      }),
    );
    createBillingPortalForLead.mockResolvedValue({
      ok: true,
      url: "https://billing.stripe.com/session/local",
    });

    const { openBillingPortalAction } = await import("./actions");
    await openBillingPortalAction("demo-cafe");

    expect(createBillingPortalForLead.mock.calls[0]![2]).toBe(
      "http://localhost:3000/dashboard/leads",
    );
  });

  it("passes helper error through without inventing a new message", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    createBillingPortalForLead.mockResolvedValue({
      ok: false,
      error: "No eligible subscription order for this lead.",
      status: 400,
    });

    const { openBillingPortalAction } = await import("./actions");
    const result = await openBillingPortalAction("demo-cafe");

    expect(result).toEqual({
      success: false,
      error: "No eligible subscription order for this lead.",
    });
  });

  it("returns Error.message when createBillingPortalForLead throws", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    createBillingPortalForLead.mockRejectedValue(new Error("Stripe timeout"));

    const { openBillingPortalAction } = await import("./actions");
    const result = await openBillingPortalAction("demo-cafe");

    expect(result).toEqual({
      success: false,
      error: "Stripe timeout",
    });
  });

  it("returns Unknown error when a non-Error is thrown", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_portal";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example";
    createBillingPortalForLead.mockRejectedValue("boom");

    const { openBillingPortalAction } = await import("./actions");
    const result = await openBillingPortalAction("demo-cafe");

    expect(result).toEqual({
      success: false,
      error: "Unknown error",
    });
  });
});
