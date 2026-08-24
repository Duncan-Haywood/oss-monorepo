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
 * actions. sendStripeConnectOnboardingLinkToClientAction's sent-marker runs
 * BEFORE the send (persist-then-notify, mirroring
 * checkout-recovery-send-race-guard) — a lost CAS or a thrown mark error both
 * skip the send entirely, never a duplicate real email.
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
const recordStripeConnectOnboardingLinkSent = vi.fn();
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
  recordStripeConnectOnboardingLinkSent: (...args: unknown[]) =>
    recordStripeConnectOnboardingLinkSent(...args),
}));

const createExpressConnectAccount = vi.fn();
const createConnectOnboardingLink = vi.fn();
const fetchConnectAccountStatus = vi.fn();
vi.mock("@/lib/commerce/stripe-connect", () => ({
  createExpressConnectAccount: (...args: unknown[]) => createExpressConnectAccount(...args),
  createConnectOnboardingLink: (...args: unknown[]) => createConnectOnboardingLink(...args),
  fetchConnectAccountStatus: (...args: unknown[]) => fetchConnectAccountStatus(...args),
}));

const sendStripeConnectOnboardingLinkEmail = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendCheckoutAbandonedRecovery: vi.fn(),
  sendCommerceAbandonedRecovery: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
  sendCommerceBuyNowClientReceipt: vi.fn(),
  sendStripeConnectOnboardingLinkEmail: (...args: unknown[]) =>
    sendStripeConnectOnboardingLinkEmail(...args),
}));

const stripeCtor = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(secretKey: string) {
      stripeCtor(secretKey);
    }
  },
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
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
    sendStripeConnectOnboardingLinkEmail.mockReset();
    recordStripeConnectOnboardingLinkSent.mockReset().mockResolvedValue(true);
    stripeCtor.mockReset();
    revalidatePath.mockReset();
    captureError.mockReset().mockResolvedValue(undefined);
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

    it("surfaces unexpected Error messages from the lead lookup and reports it via captureError", async () => {
      getLeadBySlug.mockRejectedValue(new Error("db offline"));
      const { createStripeConnectAccountAction } = await import("./actions");
      const result = await createStripeConnectAccountAction("demo-cafe");
      expect(result).toEqual({ success: false, error: "db offline" });
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "dashboard-leads-actions",
        failureKind: "createStripeConnectAccountAction",
      });
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
          refreshUrl: expect.stringContaining("/preview/demo-cafe"),
          returnUrl: expect.stringContaining("/preview/demo-cafe"),
        }),
      );
      // Never the operator-auth-gated dashboard — this link is routinely
      // handed off to the external client (stripe-connect-onboarding-link-
      // client-facing-redirect).
      expect(createConnectOnboardingLink).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({
          refreshUrl: expect.stringContaining("/dashboard"),
        }),
      );
      expect(result).toEqual({
        success: true,
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
    });

    it("surfaces unexpected Error messages from createConnectOnboardingLink and reports it via captureError", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      createConnectOnboardingLink.mockRejectedValue(new Error("Stripe timeout"));
      const { createStripeConnectOnboardingLinkAction } = await import("./actions");
      const result = await createStripeConnectOnboardingLinkAction("demo-cafe");
      expect(result).toEqual({ success: false, error: "Stripe timeout" });
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "dashboard-leads-actions",
        failureKind: "createStripeConnectOnboardingLinkAction",
      });
    });
  });

  describe("sendStripeConnectOnboardingLinkToClientAction", () => {
    it("errors when the lead has no Connect account yet", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead());
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");
      expect(result).toEqual({
        success: false,
        error: "Create a Connect account for this lead first",
      });
      expect(createConnectOnboardingLink).not.toHaveBeenCalled();
      expect(sendStripeConnectOnboardingLinkEmail).not.toHaveBeenCalled();
    });

    it("errors when the lead has no email on file", async () => {
      getLeadBySlug.mockResolvedValue(
        fakeLead({ stripeConnectAccountId: "acct_existing", email: undefined }),
      );
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");
      expect(result).toEqual({
        success: false,
        error: "Lead has no email on file to send the onboarding link to",
      });
      expect(createConnectOnboardingLink).not.toHaveBeenCalled();
      expect(sendStripeConnectOnboardingLinkEmail).not.toHaveBeenCalled();
    });

    it("generates a fresh link and emails it to the lead on success", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      createConnectOnboardingLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      sendStripeConnectOnboardingLinkEmail.mockResolvedValue({ success: true, mock: false });
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");

      expect(createConnectOnboardingLink).toHaveBeenCalledWith(
        expect.anything(),
        "acct_existing",
        expect.objectContaining({
          refreshUrl: expect.stringContaining("/preview/demo-cafe"),
          returnUrl: expect.stringContaining("/preview/demo-cafe"),
        }),
      );
      expect(sendStripeConnectOnboardingLinkEmail).toHaveBeenCalledWith({
        to: "owner@demo-cafe.example",
        businessName: "Demo Cafe",
        slug: "demo-cafe",
        onboardingUrl: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      expect(recordStripeConnectOnboardingLinkSent).toHaveBeenCalledWith(
        "demo-cafe",
        expect.any(String),
        0,
        expect.objectContaining({ requireConvex: true }),
      );
      expect(result).toEqual({ success: true, mock: false });
    });

    it("returns a failure when the send fails, but the mark was already recorded before the send attempt (persist-then-notify)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      createConnectOnboardingLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      sendStripeConnectOnboardingLinkEmail.mockResolvedValue({
        success: false,
        error: "Resend API down",
      });
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");

      expect(result).toEqual({
        success: false,
        error:
          "Resend API down (sent-marker was recorded — click Send onboarding link again to retry)",
      });
      // The CAS mark runs before the send (persist-then-notify), so it's
      // already recorded by the time the send fails — never gated on send
      // success.
      expect(recordStripeConnectOnboardingLinkSent).toHaveBeenCalledWith(
        "demo-cafe",
        expect.any(String),
        0,
        expect.objectContaining({ requireConvex: true }),
      );
    });

    it("passes the lead's current stripeConnectOnboardingLinkSentCount as the CAS expected value on a repeat send", async () => {
      getLeadBySlug.mockResolvedValue(
        fakeLead({
          stripeConnectAccountId: "acct_existing",
          stripeConnectOnboardingLinkSentCount: 3,
        }),
      );
      createConnectOnboardingLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      sendStripeConnectOnboardingLinkEmail.mockResolvedValue({ success: true, mock: false });
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");

      expect(result.success).toBe(true);
      expect(recordStripeConnectOnboardingLinkSent).toHaveBeenCalledWith(
        "demo-cafe",
        expect.any(String),
        3,
        expect.objectContaining({ requireConvex: true }),
      );
    });

    it("skips the send entirely when a concurrent request already advanced the sent count (stripe-connect-onboarding-link-send-race-guard)", async () => {
      // recordStripeConnectOnboardingLinkSent's atomic CAS write resolves
      // false (not throw) when a second tab or a double-click before the
      // button's isPending-disabled state applied already advanced this
      // exact count. The mark runs BEFORE the send (persist-then-notify,
      // mirroring checkout-recovery-send-race-guard), so a lost CAS means
      // this call's own send never fires — a real duplicate email is only
      // ever sent by the concurrent call that actually won the race, never
      // by both.
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      createConnectOnboardingLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      sendStripeConnectOnboardingLinkEmail.mockResolvedValue({ success: true, mock: false });
      recordStripeConnectOnboardingLinkSent.mockResolvedValue(false);
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");

      expect(result).toEqual({
        success: false,
        error:
          "The onboarding link was already sent moments ago by a concurrent request — skipped duplicate send",
      });
      expect(sendStripeConnectOnboardingLinkEmail).not.toHaveBeenCalled();
    });

    it("skips the send and reports a not-sent error when the mark write fails closed on Convex (ConvexPrimaryWriteError)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      createConnectOnboardingLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      recordStripeConnectOnboardingLinkSent.mockRejectedValue(new MockConvexPrimaryWriteError());
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");

      expect(result.success).toBe(false);
      if (result.success) return;
      expect(result.error).toMatch(/shared store/);
      expect(sendStripeConnectOnboardingLinkEmail).not.toHaveBeenCalled();
    });

    it("fails closed (does not send) when the sent-marker write throws a non-Convex error", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      createConnectOnboardingLink.mockResolvedValue({
        url: "https://connect.stripe.com/setup/e/acct_existing/fake",
      });
      recordStripeConnectOnboardingLinkSent.mockRejectedValue(new Error("disk full"));
      const { sendStripeConnectOnboardingLinkToClientAction } = await import("./actions");
      const result = await sendStripeConnectOnboardingLinkToClientAction("demo-cafe");

      expect(result).toEqual({ success: false, error: "disk full" });
      expect(sendStripeConnectOnboardingLinkEmail).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "dashboard-leads-actions",
        failureKind: "sendStripeConnectOnboardingLinkToClientAction",
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

    it("surfaces unexpected Error messages from fetchConnectAccountStatus and reports it via captureError", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      fetchConnectAccountStatus.mockRejectedValue(new Error("Stripe timeout"));
      const { checkStripeConnectAccountStatusAction } = await import("./actions");
      const result = await checkStripeConnectAccountStatusAction("demo-cafe");
      expect(result).toEqual({ success: false, error: "Stripe timeout" });
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "dashboard-leads-actions",
        failureKind: "checkStripeConnectAccountStatusAction",
      });
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

    it("persists the checked status for pipeline-health/digest visibility and revalidates the leads dashboard", async () => {
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
        expect.objectContaining({ requireConvex: true }),
      );
      // Without this, pipeline-health's connectOnboardingIncompleteCount
      // MetricCard and the daily digest (both computed server-side from
      // getLeads() on /dashboard/leads) stay stale after a status check
      // flips charges_enabled/payouts_enabled true — the same
      // missing-revalidatePath bug class buffer-schedule-action-revalidate-path
      // closed for the Buffer scheduling action one session earlier.
      expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    });

    it("still returns the live status when persisting it fails (best-effort, never surfaces as an error) but does not revalidate a stale cache, and reports the failure via captureError (stripe-connect-status-cache-write-capture-error)", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      fetchConnectAccountStatus.mockResolvedValue({
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      });
      const persistError = new Error("Convex down");
      updateLeadStripeConnectStatus.mockRejectedValue(persistError);
      const { checkStripeConnectAccountStatusAction } = await import("./actions");
      const result = await checkStripeConnectAccountStatusAction("demo-cafe");

      expect(result).toEqual({
        success: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      });
      // The store write never landed, so there is nothing new for the
      // SSR'd pipeline-health/digest read to pick up — revalidating here
      // would just be a wasted re-render, not a correctness fix.
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(persistError, {
        component: "stripe-connect-status",
        failureKind: "check_status_action",
        leadSlug: "demo-cafe",
      });
    });

    it("still returns the live status when the persist fails closed (ConvexPrimaryWriteError, not just a generic error) and does not revalidate", async () => {
      getLeadBySlug.mockResolvedValue(fakeLead({ stripeConnectAccountId: "acct_existing" }));
      fetchConnectAccountStatus.mockResolvedValue({
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      });
      updateLeadStripeConnectStatus.mockRejectedValue(new MockConvexPrimaryWriteError());
      const { checkStripeConnectAccountStatusAction } = await import("./actions");
      const result = await checkStripeConnectAccountStatusAction("demo-cafe");

      expect(result).toEqual({
        success: true,
        chargesEnabled: true,
        payoutsEnabled: true,
        detailsSubmitted: true,
      });
      expect(revalidatePath).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(MockConvexPrimaryWriteError), {
        component: "stripe-connect-status",
        failureKind: "check_status_action",
        leadSlug: "demo-cafe",
      });
    });
  });
});
