import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for sendStarterUpsellAction — the operator
 * Starter → MRR Upsell path (eligibility inverse of billing portal + Resend).
 *
 * starter-upsell.test.ts covers pure eligibility + checkout path helpers;
 * resend/upsell helpers cover transport. This suite locks the dashboard
 * action glue: requireOperatorAuth, empty slug, missing lead, eligibility
 * (paid/live Starter-only + email, no Growth/Complete/Commerce), target
 * tier from recommendedTier, suppression / send failure (no revalidate),
 * mock send flag, leadSlug order filtering, and success revalidate.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

const revalidatePath = vi.fn();
vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

const getLeadBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();

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

const sendStarterUpsellEmail = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: (...args: unknown[]) => sendStarterUpsellEmail(...args),
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

const starterOrder = {
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_starter",
  tier: "starter",
  commerceAddon: false,
  amountPaid: 500,
  status: "paid",
  createdAt: "2026-07-13T10:00:00.000Z",
};

const eligibilityError =
  "Upsell only applies to paid/live Starter leads with email and no Growth/Complete/Commerce order yet";

describe("sendStarterUpsellAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrdersByLeadSlug.mockReset().mockResolvedValue([starterOrder]);
    sendStarterUpsellEmail.mockReset().mockResolvedValue({
      success: true,
      id: "email_1",
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(sendStarterUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty or whitespace slug", async () => {
    const { sendStarterUpsellAction } = await import("./actions");
    expect(await sendStarterUpsellAction("")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(await sendStarterUpsellAction("   ")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(sendStarterUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects unpaid / pre-paid stages (eligibility)", async () => {
    getLeadBySlug.mockResolvedValue({
      ...eligibleLead,
      stage: "outreach_sent",
    });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendStarterUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects paid Starter leads without an email on file", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, email: undefined });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendStarterUpsellEmail).not.toHaveBeenCalled();
  });

  it("rejects when Growth/Complete already exists (billing-portal eligible)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      starterOrder,
      {
        ...starterOrder,
        id: "ord_growth",
        stripeSessionId: "cs_test_growth",
        tier: "growth",
        amountPaid: 599,
      },
    ]);
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendStarterUpsellEmail).not.toHaveBeenCalled();
  });

  it("still rejects when the existing Growth order was refunded — a refund does not always cancel the underlying Subscription (mutual-exclusion-restore)", async () => {
    // orderEligibleForBillingPortal never excludes refunded/disputed orders
    // (a disputed-but-still-billing subscriber keeps Manage billing on
    // purpose) — leadEligibleForStarterUpsell must stay in lockstep with it,
    // or the operator could nudge a still-subscribed customer to buy Growth
    // again, risking two simultaneously active recurring subscriptions.
    listOrdersByLeadSlug.mockResolvedValue([
      starterOrder,
      {
        ...starterOrder,
        id: "ord_growth",
        stripeSessionId: "cs_test_growth",
        tier: "growth",
        amountPaid: 599,
        refundedAt: "2026-07-14T00:00:00.000Z",
      },
    ]);
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: eligibilityError,
    });
    expect(sendStarterUpsellEmail).not.toHaveBeenCalled();
  });

  it("sends Growth upsell by default and revalidates on success", async () => {
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      targetTier: "growth",
      mock: false,
    });
    expect(sendStarterUpsellEmail).toHaveBeenCalledOnce();
    expect(sendStarterUpsellEmail).toHaveBeenCalledWith({
      to: "hello@demo-cafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      targetTier: "growth",
      monthlyPriceUsd: 99,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("targets Complete when recommendedTier is complete", async () => {
    getLeadBySlug.mockResolvedValue({
      ...eligibleLead,
      recommendedTier: "complete",
      stage: "live",
    });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      targetTier: "complete",
      mock: false,
    });
    expect(sendStarterUpsellEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        targetTier: "complete",
        monthlyPriceUsd: 199,
      }),
    );
  });

  it("surfaces suppression without revalidate", async () => {
    sendStarterUpsellEmail.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Email is on the suppression list",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend send failures without revalidate", async () => {
    sendStarterUpsellEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Resend 429",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns mock:true when the email layer mocks the send", async () => {
    sendStarterUpsellEmail.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res).toEqual({
      success: true,
      targetTier: "growth",
      mock: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("loads orders via listOrdersByLeadSlug for the requested slug", async () => {
    listOrdersByLeadSlug.mockResolvedValue([starterOrder]);
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(res).toEqual({
      success: true,
      targetTier: "growth",
      mock: false,
    });
    expect(sendStarterUpsellEmail).toHaveBeenCalledOnce();
  });

  it("trims lead email before send", async () => {
    getLeadBySlug.mockResolvedValue({
      ...eligibleLead,
      email: "  hello@demo-cafe.example  ",
    });
    const { sendStarterUpsellAction } = await import("./actions");
    const res = await sendStarterUpsellAction("demo-cafe");
    expect(res.success).toBe(true);
    expect(sendStarterUpsellEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hello@demo-cafe.example" }),
    );
  });
});
