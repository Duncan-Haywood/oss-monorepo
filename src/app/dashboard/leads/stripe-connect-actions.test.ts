import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "@/lib/leads/types";

class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}

vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

/**
 * Action-level coverage for the Stripe Connect Express account-creation
 * scaffold (commerce-payouts-stripe-connect tier-6 empty-backlog scaffold):
 * createStripeConnectAccountAction, createStripeConnectOnboardingLinkAction,
 * checkStripeConnectAccountStatusAction.
 *
 * stripe-connect-gate.test.ts + stripe-connect.test.ts already cover the
 * shared gate and pure Stripe-calling helpers. This suite locks the
 * server-action glue: requireOperatorAuth rejection, per-IP rate limit (auth
 * alone is not a throttle), gate 403/501, lead-not-found, idempotent no-op
 * when an account already exists, ConvexPrimaryWriteError fail-closed (no
 * revalidate), success shapes, and missing-account errors on the link/status
 * actions.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const headerGet = vi.fn();
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (...args: unknown[]) => headerGet(...(args as [string])),
  })),
}));

const getLeadBySlug = vi.fn();
const updateLeadStripeConnectAccountId = vi.fn();
const updateLeadStripeConnectStatus = vi.fn();
vi.mock("@/lib/db", () => ({
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getLeads: vi.fn(),
  listOrders: vi.fn(),
  listOrdersByLeadSlug: vi.fn(),
  recordLeadOutreach: vi.fn(),
  listOpenCheckoutSessions: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: vi.fn(),
  getCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  markCommerceOrderClientReceiptSent: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
  listCommerceOrdersRefunded: vi.fn(),
  listCommerceOrdersDisputed: vi.fn(),
  listCommerceOrdersMissingClientReceipt: vi.fn(),
  listDeployHandoffs: vi.fn(),
  getLeadSlugByCustomDomain: vi.fn(),
  getDeployHandoffBySlug: vi.fn(),
  updateLeadStripeConnectAccountId: (...args: unknown[]) =>
    updateLeadStripeConnectAccountId(...args),
  updateLeadStripeConnectStatus: (...args: unknown[]) =>
    updateLeadStripeConnectStatus(...args),
}));

const createExpressConnectAccount = vi.fn();
const createConnectOnboardingLink = vi.fn();
const fetchConnectAccountStatus = vi.fn();
vi.mock("@/lib/commerce/stripe-connect", () => ({
  createExpressConnectAccount: (...args: unknown[]) => createExpressConnectAccount(...args),
  createConnectOnboardingLink: (...args: unknown[]) => createConnectOnboardingLink(...args),
  fetchConnectAccountStatus: (...args: unknown[]) => fetchConnectAccountStatus(...args),
}));

const stripeCtor = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(secretKey: string) {
      stripeCtor(secretKey);
    }
  },
}));

function fakeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    slug: "demo-cafe",
    businessName: "Demo Cafe",
    category: "restaurant",
    city: "Boulder",
    state: "CO",
    tagline: "Fresh daily",
    description: "A cozy neighborhood cafe.",
    phone: "(555) 000-0000",
    email: "owner@demo-cafe.example",
    services: ["coffee"],
    hours: { weekday: "Mon-Fri 7am-5pm", weekend: "Sat-Sun 8am-2pm" },
    stage: "paid",
    recommendedTier: "growth",
    ...overrides,
  };
}

describe("Stripe Connect dashboard actions", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headerGet.mockReset().mockReturnValue("203.0.113.5");
    getLeadBySlug.mockReset();
    updateLeadStripeConnectAccountId.mockReset().mockResolvedValue(undefined);
    updateLeadStripeConnectStatus.mockReset().mockResolvedValue(undefined);
    createExpressConnectAccount.mockReset();
    createConnectOnboardingLink.mockReset();
    fetchConnectAccountStatus.mockReset();
    stripeCtor.mockReset();
    revalidatePath.mockReset();
    process.env = { ...originalEnv };
    process.env.ALLOW_STRIPE_CONNECT_ONBOARDING = "1";
    process.env.STRIPE_SECRET_KEY = "sk_test_connect";
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe("createStripeConnectAccountAction", () => {
    it("returns auth error when requireOperatorAuth fails", async () => {
      requireOperatorAuth.mockResolvedValue({ ok: false, error: "Unauthorized" });
      const { createStripeConnectAccountAction } = await import("./actions");
      const result = await createStripeConnectAccountAction("demo-cafe");
      expect(result).toEqual({ success: false, error: "Unauthorized" });
      expect(createExpressConnectAccount).not.toHaveBeenCalled();
    });

    it("rate-limits repeated calls from the same IP (auth alone is not a throttle)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      createExpressConnectAccount.mockResolvedValue({ accountId: "acct_1", created: true });
      const { createStripeConnectAccountAction } = await import("./actions");

      for (let i = 0; i < 20; i++) {
        const res = await createStripeConnectAccountAction("demo-cafe");
        expect(res.success).toBe(true);
      }
      createExpressConnectAccount.mockClear();
      const rateLimited = await createStripeConnectAccountAction("demo-cafe");
      expect(rateLimited).toEqual({
        success: false,
        error: "Too many requests — please try again shortly.",
      });
      expect(createExpressConnectAccount).not.toHaveBeenCalled();
    });

    it("returns the gate message when ALLOW_STRIPE_CONNECT_ONBOARDING is unset", async () => {
      delete process.env.ALLOW_STRIPE_CONNECT_ONBOARDING;
      const { createStripeConnectAccountAction } = await import("./actions");
      const result = await createStripeConnectAccountAction("demo-cafe");
      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/ALLOW_STRIPE_CONNECT_ONBOARDING/);
      expect(getLeadBySlug).not.toHaveBeenCalled();
    });

    it("returns lead-not-found for an unknown slug", async () => {
      getLeadBySlug.mockResolvedValue(null);
      const { createStripeConnectAccountAction } = await import("./actions");
      const result = await createStripeConnectAccountAction("no-such-lead");
      expect(result).toEqual({ success: false, error: "Lead not found" });
      expect(createExpressConnectAccount).not.toHaveBeenCalled();
    });

    it("is a no-op when the lead already has an account (idempotent, never re-creates)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      const { createStripeConnectAccountAction } = await import("./actions");
      const result = await createStripeConnectAccountAction("demo-cafe");
      expect(result).toEqual({ success: true, accountId: "acct_existing", created: false });
      expect(createExpressConnectAccount).not.toHaveBeenCalled();
      expect(stripeCtor).not.toHaveBeenCalled();
    });

    it("creates an account, persists it, and revalidates on success", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      createExpressConnectAccount.mockResolvedValue({ accountId: "acct_new", created: true });
      const { createStripeConnectAccountAction } = await import("./actions");
      const result = await createStripeConnectAccountAction("demo-cafe");

      expect(stripeCtor).toHaveBeenCalledWith("sk_test_connect");
      expect(createExpressConnectAccount).toHaveBeenCalledWith(expect.anything(), {
        leadSlug: "demo-cafe",
        email: "owner@demo-cafe.example",
        businessName: "Demo Cafe",
      });
      expect(updateLeadStripeConnectAccountId).toHaveBeenCalledWith(
        "demo-cafe",
        "acct_new",
        expect.objectContaining({ requireConvex: true }),
        expect.any(String),
      );
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
      expect(result).toEqual({ success: true, accountId: "acct_new", created: true });
    });

    it("fails closed with a retry message when the Convex persist throws (account already created on Stripe)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      createExpressConnectAccount.mockResolvedValue({ accountId: "acct_new", created: true });
      updateLeadStripeConnectAccountId.mockRejectedValue(new MockConvexPrimaryWriteError());
      const { createStripeConnectAccountAction } = await import("./actions");
      const result = await createStripeConnectAccountAction("demo-cafe");

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/retry/i);
      expect(revalidatePath).not.toHaveBeenCalled();
    });
  });

  describe("createStripeConnectOnboardingLinkAction", () => {
    it("errors when the lead has no Connect account yet", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { createStripeConnectOnboardingLinkAction } = await import("./actions");
      const result = await createStripeConnectOnboardingLinkAction("demo-cafe");
      expect(result).toEqual({
        success: false,
        error: "Create a Connect account for this lead first",
      });
      expect(createConnectOnboardingLink).not.toHaveBeenCalled();
    });

    it("returns the onboarding URL on success", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      createConnectOnboardingLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      const { createStripeConnectOnboardingLinkAction } = await import("./actions");
      const result = await createStripeConnectOnboardingLinkAction("demo-cafe");

      expect(createConnectOnboardingLink).toHaveBeenCalledWith(
        expect.anything(),
        "acct_existing",
        expect.objectContaining({
          refreshUrl: expect.stringContaining("/dashboard/leads"),
          returnUrl: expect.stringContaining("/dashboard/leads"),
        }),
      );
      expect(result).toEqual({
        success: true,
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
    });
  });

  describe("checkStripeConnectAccountStatusAction", () => {
    it("errors when the lead has no Connect account yet", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { checkStripeConnectAccountStatusAction } = await import("./actions");
      const result = await checkStripeConnectAccountStatusAction("demo-cafe");
      expect(result).toEqual({
        success: false,
        error: "Create a Connect account for this lead first",
      });
      expect(fetchConnectAccountStatus).not.toHaveBeenCalled();
    });

    it("returns the live status on success", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      fetchConnectAccountStatus.mockResolvedValue({
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
      });
      const { checkStripeConnectAccountStatusAction } = await import("./actions");
      const result = await checkStripeConnectAccountStatusAction("demo-cafe");

      expect(fetchConnectAccountStatus).toHaveBeenCalledWith(expect.anything(), "acct_existing");
      expect(result).toEqual({
        success: true,
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
      });
    });

    it("persists the checked status for pipeline-health/digest visibility", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      fetchConnectAccountStatus.mockResolvedValue({
        chargesEnabled: true,
        payoutsEnabled: false,
        detailsSubmitted: true,
      });
      const { checkStripeConnectAccountStatusAction } = await import("./actions");
      await checkStripeConnectAccountStatusAction("demo-cafe");

      expect(updateLeadStripeConnectStatus).toHaveBeenCalledWith(
        "demo-cafe",
        { chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true },
        expect.any(String),
      );
    });

    it("still returns the live status when persisting it fails (best-effort, never surfaces as an error)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      fetchConnectAccountStatus.mockResolvedValue({
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      });
      updateLeadStripeConnectStatus.mockRejectedValue(new Error("Convex down"));
      const { checkStripeConnectAccountStatusAction } = await import("./actions");
      const result = await checkStripeConnectAccountStatusAction("demo-cafe");

      expect(result).toEqual({
        success: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      });
    });
  });
});
