import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for sendFollowUpAction — the operator Email 2/3
 * outreach path (OUTREACH_CADENCE_CONVEX_PRIMARY persist-then-notify).
 *
 * outreach-followups.test.ts covers pure cadence helpers (nextFollowUpStep /
 * isFollowUpDue). This suite locks the dashboard action glue: requireOperatorAuth,
 * empty slug, missing lead / email, paid/live/closed stage gates, Email 1
 * prerequisite / sequence-complete, mark-before-Resend, ConvexPrimaryWriteError
 * skip-send, Email 2 vs Email 3 dispatch, suppression / send failure (still
 * returns advanced outreachStep; no revalidate), mock send flag, and success
 * revalidate.
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
const recordLeadOutreach = vi.fn();

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
  listOrders: vi.fn(),
  listOrdersByLeadSlug: vi.fn(),
  recordLeadOutreach: (...args: unknown[]) => recordLeadOutreach(...args),
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

const sendOutreachFollowUp2 = vi.fn();
const sendOutreachFollowUp3 = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: (...args: unknown[]) => sendOutreachFollowUp2(...args),
  sendOutreachFollowUp3: (...args: unknown[]) => sendOutreachFollowUp3(...args),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
}));

vi.mock("@/lib/leads/outreach-persist", () => ({
  OUTREACH_CADENCE_CONVEX_PRIMARY: { requireConvex: true },
}));

class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}

vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

const outreachLead = {
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
  stage: "outreach_sent" as const,
  outreachStep: 1,
  recommendedTier: "growth" as const,
  dataSource: "manual_entry" as const,
};

describe("sendFollowUpAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(outreachLead);
    recordLeadOutreach.mockReset().mockResolvedValue(true);
    sendOutreachFollowUp2.mockReset().mockResolvedValue({
      success: true,
      id: "email_2",
    });
    sendOutreachFollowUp3.mockReset().mockResolvedValue({
      success: true,
      id: "email_3",
    });
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachFollowUp2).not.toHaveBeenCalled();
    expect(sendOutreachFollowUp3).not.toHaveBeenCalled();
  });

  it("rate-limits repeated follow-ups from the same IP (auth alone is not a throttle)", async () => {
    const { sendFollowUpAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await sendFollowUpAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    getLeadBySlug.mockClear();
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { sendFollowUpAction } = await import("./actions");
    expect(await sendFollowUpAction("")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long slug before getLeadBySlug", async () => {
    const { MAX_LEAD_SLUG_LENGTH } = await import("@/lib/leads/slug");
    const { sendFollowUpAction } = await import("./actions");
    const over = "a".repeat(MAX_LEAD_SLUG_LENGTH + 1);
    const res = await sendFollowUpAction(over);
    expect(res).toEqual({
      success: false,
      error: "Slug is too long",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("rejects when the lead has no email", async () => {
    getLeadBySlug.mockResolvedValue({ ...outreachLead, email: undefined });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead has no email address",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("rejects paid / live leads", async () => {
    getLeadBySlug.mockResolvedValue({ ...outreachLead, stage: "paid" });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead already paid or live — skip follow-ups",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("rejects closed leads with a re-engage hint", async () => {
    getLeadBySlug.mockResolvedValue({ ...outreachLead, stage: "closed" });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead is closed — re-engage first or change stage manually",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("rejects when Email 1 has not been sent yet", async () => {
    getLeadBySlug.mockResolvedValue({ ...outreachLead, outreachStep: 0 });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Send Email 1 first by setting stage to Outreach Sent",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("rejects when the outreach sequence is already complete", async () => {
    getLeadBySlug.mockResolvedValue({ ...outreachLead, outreachStep: 3 });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Outreach sequence already complete (Email 3 sent)",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("marks Email 2 before Resend and revalidates on success", async () => {
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      outreachStep: 2,
      mock: false,
    });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledWith(
      "demo-cafe",
      2,
      undefined,
      { requireConvex: true },
    );
    expect(sendOutreachFollowUp2).toHaveBeenCalledOnce();
    expect(sendOutreachFollowUp2).toHaveBeenCalledWith(
      "hello@demo-cafe.example",
      "Demo Cafe",
      "demo-cafe",
    );
    expect(sendOutreachFollowUp3).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("dispatches Email 3 when outreachStep is 2", async () => {
    getLeadBySlug.mockResolvedValue({
      ...outreachLead,
      outreachStep: 2,
      stage: "discovery_call",
    });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      outreachStep: 3,
      mock: false,
    });
    expect(recordLeadOutreach).toHaveBeenCalledWith(
      "demo-cafe",
      3,
      undefined,
      { requireConvex: true },
    );
    expect(sendOutreachFollowUp3).toHaveBeenCalledOnce();
    expect(sendOutreachFollowUp3).toHaveBeenCalledWith(
      "hello@demo-cafe.example",
      "Demo Cafe",
      "demo-cafe",
    );
    expect(sendOutreachFollowUp2).not.toHaveBeenCalled();
  });

  it("skips Resend when the outreach mark fails closed on Convex", async () => {
    recordLeadOutreach.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Could not record the outreach mark in the shared store — follow-up was not sent. Retry in a moment.",
    });
    expect(sendOutreachFollowUp2).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects when recordLeadOutreach resolves false (paid/live/closed race guard) and never sends", async () => {
    recordLeadOutreach.mockResolvedValue(false);
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Lead was paid, went live, or was closed after this page loaded — refresh and check its status; the follow-up was not sent",
    });
    expect(sendOutreachFollowUp2).not.toHaveBeenCalled();
    expect(sendOutreachFollowUp3).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces suppression after a durable mark without revalidate", async () => {
    sendOutreachFollowUp2.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Email is on the suppression list",
      outreachStep: 2,
    });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend failures after a durable mark without revalidate", async () => {
    sendOutreachFollowUp2.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Resend 429",
      outreachStep: 2,
    });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns mock:true when the email layer mocks the send", async () => {
    sendOutreachFollowUp2.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { sendFollowUpAction } = await import("./actions");
    const res = await sendFollowUpAction("demo-cafe");
    expect(res).toEqual({
      success: true,
      outreachStep: 2,
      mock: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });
});
