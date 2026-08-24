import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}

// Mocked (not imported from the real module) so the class reference stays
// identical across this suite's per-test vi.resetModules() calls — mirrors
// send-starter-upsell-action.test.ts's own identical setup.
vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

// Minimal constructor-only mock — mirrors open-billing-portal-action.test.ts's
// identical pattern. The real Stripe client is never used to make a network
// call in this suite: resolveGrowthOrderBillingInterval (the only consumer of
// the constructed client) is itself mocked below.
const stripeCtor = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    constructor(secretKey: string) {
      stripeCtor(secretKey);
    }
  },
}));

/**
 * Action-level orchestration for sendGrowthUpsellAction — the operator
 * Growth → Complete upsell path (second upgrade step, mirroring
 * sendStarterUpsellAction's shape exactly).
 *
 * growth-upsell.test.ts covers pure eligibility + checkout path helpers;
 * resend/upsell helpers cover transport. This suite locks the dashboard
 * action glue: requireOperatorAuth, empty slug, missing lead, eligibility
 * (paid/live Growth-only + email, no Complete order), suppression / send
 * failure (no revalidate), mock send flag, leadSlug order filtering, success
 * revalidate, and the recordGrowthUpsellSent CAS sent-marker
 * (growth-upsell-send-race-guard) — the mark runs BEFORE the send
 * (persist-then-notify), so a `false` CAS return (a concurrent duplicate) or
 * a thrown write error both skip the send entirely and surface as
 * success:false, never silent success or a duplicate real email.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

const headersMock = vi.fn();
vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => headersMock(...args),
}));

function headerStore(entries: Record<string, string | null> = {}) {
  return {
    get(name: string) {
      return entries[name] ?? null;
    },
  };
}

const getLeadBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const recordGrowthUpsellSent = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeads: vi.fn(),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  listOrders: vi.fn(),
  recordLeadOutreach: vi.fn(),
  recordStarterUpsellSent: vi.fn(),
  recordGrowthUpsellSent: (...args: unknown[]) => recordGrowthUpsellSent(...args),
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

const resolveGrowthOrderBillingInterval = vi.fn();
vi.mock("@/lib/billing/growth-upsell-billing-interval", () => ({
  resolveGrowthOrderBillingInterval: (...args: unknown[]) =>
    resolveGrowthOrderBillingInterval(...args),
}));

const sendGrowthUpsellEmail = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendGrowthUpsellEmail: (...args: unknown[]) => sendGrowthUpsellEmail(...args),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
}));

const eligibleLead = {
  slug: "demo-cafe",
  businessName: "Demo Cafe",
  category: "restaurant" as const,
  city: "Boulder",
  state: "CO",
  tagline: "Coffee and pastry",
  description: "Neighborhood cafe",
  phone: "(303) 555-0100",
  email: "hello@demo-cafe.example",
  services: ["Coffee", "Pastries"],
  hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
  stage: "paid" as const,
  recommendedTier: "growth" as const,
  dataSource: "manual_entry" as const,
};

const growthOrder = {
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_growth",
  tier: "growth",
  commerceAddon: false,
  amountPaid: 599,
  createdAt: "2026-07-13T10:00:00.000Z",
};

const eligibilityError =
  "Upsell only applies to paid/live Growth leads with email and no Complete order yet";

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("sendGrowthUpsellAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.STRIPE_SECRET_KEY;
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrdersByLeadSlug.mockReset().mockResolvedValue([growthOrder]);
    sendGrowthUpsellEmail.mockReset().mockResolvedValue({
      success: true,
      id: "email_1",
    });
    recordGrowthUpsellSent.mockReset().mockResolvedValue(true);
    stripeCtor.mockReset();
    resolveGrowthOrderBillingInterval.mockReset().mockResolvedValue("monthly");
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
  });

  it("rate-limits repeated upsell sends from the same IP (auth alone is not a throttle)", async () => {
    const { sendGrowthUpsellAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await sendGrowthUpsellAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    getLeadBySlug.mockClear();
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects an empty or whitespace slug", async () => {
    const { sendGrowthUpsellAction } = await import("./actions");
    expect(await sendGrowthUpsellAction("")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(await sendGrowthUpsellAction("   ")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects unpaid / pre-paid stages (eligibility)", async () => {
    getLeadBySlug.mockResolvedValue({
      ...eligibleLead,
      stage: "outreach_sent",
    });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects paid Growth leads without an email on file", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, email: undefined });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects a lead with no Growth order at all (e.g. Starter-only)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([{ ...growthOrder, tier: "starter" }]);
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects a lead whose only Growth order's Subscription was already canceled (growth-upsell-canceled-exclusion) — a lapsed subscriber must not be pitched an upgrade to a subscription that no longer exists", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...growthOrder, recurringCanceledAt: Date.parse("2026-07-14T00:00:00.000Z") },
    ]);
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects when Complete already exists, regardless of refund/dispute status", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      growthOrder,
      {
        ...growthOrder,
        id: "ord_complete",
        stripeSessionId: "cs_test_complete",
        tier: "complete",
        amountPaid: 699,
        disputedAt: "2026-07-14T00:00:00.000Z",
      },
    ]);
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
  });

  it("sends the Complete upsell and revalidates on success", async () => {
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      mock: false,
    });
    expect(sendGrowthUpsellEmail).toHaveBeenCalledOnce();
    expect(sendGrowthUpsellEmail).toHaveBeenCalledWith({
      to: "hello@demo-cafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
      annualPriceUsd: 1990,
      billingInterval: "monthly",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(resolveGrowthOrderBillingInterval).not.toHaveBeenCalled();
    expect(recordGrowthUpsellSent).toHaveBeenCalledWith(
      "demo-cafe",
      expect.any(String),
      0,
      expect.objectContaining({ requireConvex: true }),
    );
  });

  it("carries an annual Growth subscriber's cadence onto the Complete upsell email (growth-upsell-annual-billing-carry-through)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_growth_upsell";
    resolveGrowthOrderBillingInterval.mockResolvedValue("annual");
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");

    expect(res).toEqual({ success: true, mock: false });
    expect(stripeCtor).toHaveBeenCalledWith("sk_test_growth_upsell");
    expect(resolveGrowthOrderBillingInterval).toHaveBeenCalledWith(
      expect.anything(),
      "cs_test_growth",
    );
    expect(sendGrowthUpsellEmail).toHaveBeenCalledWith({
      to: "hello@demo-cafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      monthlyPriceUsd: 199,
      annualPriceUsd: 1990,
      billingInterval: "annual",
    });
  });

  it("skips the billing-cadence lookup entirely when STRIPE_SECRET_KEY is unset, defaulting to monthly", async () => {
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");

    expect(res).toEqual({ success: true, mock: false });
    expect(stripeCtor).not.toHaveBeenCalled();
    expect(resolveGrowthOrderBillingInterval).not.toHaveBeenCalled();
    expect(sendGrowthUpsellEmail).toHaveBeenCalledWith(
      expect.objectContaining({ billingInterval: "monthly" }),
    );
  });

  it("passes the lead's current growthUpsellSentCount as the CAS expected value on a repeat nudge", async () => {
    getLeadBySlug.mockResolvedValue({
      ...eligibleLead,
      growthUpsellSentCount: 2,
    });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res.success).toBe(true);
    expect(recordGrowthUpsellSent).toHaveBeenCalledWith(
      "demo-cafe",
      expect.any(String),
      2,
      expect.objectContaining({ requireConvex: true }),
    );
  });

  it("skips the send entirely when a concurrent request already advanced the sent count (growth-upsell-send-race-guard)", async () => {
    recordGrowthUpsellSent.mockResolvedValue(false);
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Growth upsell was already sent moments ago by a concurrent request — skipped duplicate send",
    });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("skips the send and reports a not-sent error when the mark write fails closed on Convex (ConvexPrimaryWriteError)", async () => {
    recordGrowthUpsellSent.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toMatch(/shared store/);
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed (does not send) when the sent-marker write throws a non-Convex error", async () => {
    recordGrowthUpsellSent.mockRejectedValue(new Error("disk full"));
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "disk full" });
    expect(sendGrowthUpsellEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "sendGrowthUpsellAction",
    });
  });

  it("surfaces suppression without revalidate", async () => {
    sendGrowthUpsellEmail.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email is on the suppression list (sent-marker was recorded — click Send Complete upsell again to retry)",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend send failures without revalidate", async () => {
    sendGrowthUpsellEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Resend 429 (sent-marker was recorded — click Send Complete upsell again to retry)",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns mock:true when the email layer mocks the send", async () => {
    sendGrowthUpsellEmail.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: true,
      mock: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("loads orders via listOrdersByLeadSlug for the requested slug", async () => {
    listOrdersByLeadSlug.mockResolvedValue([growthOrder]);
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(res).toEqual({
      success: true,
      mock: false,
    });
    expect(sendGrowthUpsellEmail).toHaveBeenCalledOnce();
  });

  it("trims lead email before send", async () => {
    getLeadBySlug.mockResolvedValue({
      ...eligibleLead,
      email: "  hello@demo-cafe.example  ",
    });
    const { sendGrowthUpsellAction } = await import("./actions");
    const res = await sendGrowthUpsellAction("demo-cafe");
    expect(res.success).toBe(true);
    expect(sendGrowthUpsellEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hello@demo-cafe.example" }),
    );
  });
});
