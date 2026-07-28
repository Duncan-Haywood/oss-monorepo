import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for replyToInquiryAction — the operator Starter
 * inquiry reply path (INQUIRY_REPLY_CONVEX_PRIMARY persist-then-notify).
 *
 * reply.test.ts + reply-persist.ts cover pure normalize / canReceive helpers
 * and the requireConvex constant. This suite locks the dashboard action glue:
 * requireOperatorAuth, empty inquiry id, empty / over-long body, missing
 * inquiry, archived / no-email gates, mark-before-Resend, email trim,
 * ConvexPrimaryWriteError skip-send, null-mark not-found, suppression /
 * Resend failure after durable mark (returns inquiry; no revalidate), mock
 * send flag, and success revalidate.
 *
 * Folded complementary coverage from cursor/business-process-evolution-fff2
 * (email trim + null-mark not-found) into the earlier f9b1 claim body.
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

const getClientInquiryById = vi.fn();
const recordClientInquiryReply = vi.fn();
const getLeadBySlug = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: (...args: unknown[]) => getClientInquiryById(...args),
  recordClientInquiryReply: (...args: unknown[]) =>
    recordClientInquiryReply(...args),
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

const sendInquiryReply = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: (...args: unknown[]) => sendInquiryReply(...args),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
}));

vi.mock("@/lib/inquiries/reply-persist", () => ({
  INQUIRY_REPLY_CONVEX_PRIMARY: { requireConvex: true },
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

const openInquiry = {
  id: "inq_demo_1",
  leadSlug: "demo-cafe",
  businessName: "Demo Cafe",
  name: "Alex Visitor",
  email: "alex@visitor.example",
  phone: null,
  message: "Do you take walk-ins?",
  source: "contact_form" as const,
  status: "new" as const,
  replySentCount: 0,
  createdAt: "2026-07-10T12:00:00.000Z",
};

const repliedInquiry = {
  ...openInquiry,
  status: "replied" as const,
  operatorReply: "Thanks — yes, walk-ins welcome after 2pm.",
  repliedAt: "2026-07-14T02:10:00.000Z",
  replySentCount: 1,
};

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("replyToInquiryAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getClientInquiryById.mockReset().mockResolvedValue(openInquiry);
    getLeadBySlug.mockReset().mockResolvedValue({
      slug: "demo-cafe",
      email: "owner@democafe.example",
    });
    recordClientInquiryReply.mockReset().mockResolvedValue(repliedInquiry);
    sendInquiryReply.mockReset().mockResolvedValue({
      success: true,
      id: "email_reply_1",
    });
  });

  it("returns auth error without loading the inquiry", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
    expect(sendInquiryReply).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from the inquiry lookup and reports it via captureError", async () => {
    getClientInquiryById.mockRejectedValue(new Error("db offline"));
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "replyToInquiryAction",
    });
  });

  it("rate-limits repeated replies from the same IP (auth alone is not a throttle)", async () => {
    const { replyToInquiryAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
      expect(res.success).toBe(true);
    }
    getClientInquiryById.mockClear();
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
  });

  it("rejects an empty inquiry id", async () => {
    const { replyToInquiryAction } = await import("./actions");
    expect(await replyToInquiryAction("", "Thanks for writing.")).toEqual({
      success: false,
      error: "Inquiry id is required",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long inquiryId before DB/email work", async () => {
    const { replyToInquiryAction } = await import("./actions");
    const { MAX_INQUIRY_ID_LENGTH } = await import("@/lib/inquiries/inquiry-id");
    const over = `inq_${"a".repeat(MAX_INQUIRY_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_INQUIRY_ID_LENGTH);
    expect(await replyToInquiryAction(over, "Thanks for writing.")).toEqual({
      success: false,
      error: "Inquiry id is too long",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
    expect(sendInquiryReply).not.toHaveBeenCalled();
  });

  it("accepts exactly MAX_INQUIRY_ID_LENGTH inquiryId (still looks up)", async () => {
    const { replyToInquiryAction } = await import("./actions");
    const { MAX_INQUIRY_ID_LENGTH } = await import("@/lib/inquiries/inquiry-id");
    const exact = "i".repeat(MAX_INQUIRY_ID_LENGTH);
    getClientInquiryById.mockResolvedValue({ ...openInquiry, id: exact });
    recordClientInquiryReply.mockResolvedValue({
      ...repliedInquiry,
      id: exact,
    });
    const res = await replyToInquiryAction(exact, "Thanks for writing.");
    expect(res.success).toBe(true);
    expect(getClientInquiryById).toHaveBeenCalledWith(exact);
  });

  it("rejects an empty reply body", async () => {
    const { replyToInquiryAction } = await import("./actions");
    expect(await replyToInquiryAction("inq_demo_1", "   ")).toEqual({
      success: false,
      error: "Reply body is required",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
  });

  it("rejects an over-long reply body", async () => {
    const { replyToInquiryAction } = await import("./actions");
    const { MAX_INQUIRY_REPLY_LENGTH } = await import("@/lib/inquiries/reply");
    const res = await replyToInquiryAction(
      "inq_demo_1",
      "x".repeat(MAX_INQUIRY_REPLY_LENGTH + 1),
    );
    expect(res).toEqual({
      success: false,
      error: `Reply must be ${MAX_INQUIRY_REPLY_LENGTH} characters or fewer`,
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
  });

  it("rejects when the inquiry is missing", async () => {
    getClientInquiryById.mockResolvedValue(null);
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_missing", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error: "Inquiry not found",
    });
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
  });

  it("rejects archived inquiries", async () => {
    getClientInquiryById.mockResolvedValue({
      ...openInquiry,
      status: "archived",
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error:
        "Inquiry is archived — unarchive is not supported; leave a lead note instead",
    });
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
  });

  it("rejects inquiries without an email address", async () => {
    getClientInquiryById.mockResolvedValue({
      ...openInquiry,
      email: null,
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error: "Inquiry has no email address to reply to",
    });
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
  });

  it("marks replied before Resend and revalidates on success", async () => {
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction(
      "inq_demo_1",
      "  Thanks — yes, walk-ins welcome after 2pm.  ",
    );

    expect(res).toEqual({
      success: true,
      inquiry: repliedInquiry,
      mock: false,
    });
    expect(recordClientInquiryReply).toHaveBeenCalledOnce();
    expect(recordClientInquiryReply).toHaveBeenCalledWith(
      "inq_demo_1",
      "Thanks — yes, walk-ins welcome after 2pm.",
      0,
      { requireConvex: true },
    );
    expect(sendInquiryReply).toHaveBeenCalledOnce();
    expect(sendInquiryReply).toHaveBeenCalledWith({
      to: "alex@visitor.example",
      businessName: "Demo Cafe",
      leadSlug: "demo-cafe",
      replyBody: "Thanks — yes, walk-ins welcome after 2pm.",
      originalMessage: "Do you take walk-ins?",
      inquirerName: "Alex Visitor",
      replyTo: "owner@democafe.example",
    });
    expect(getLeadBySlug).toHaveBeenCalledWith("demo-cafe");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("omits replyTo when the lead has no email on file", async () => {
    getLeadBySlug.mockResolvedValue({ slug: "demo-cafe", email: undefined });
    const { replyToInquiryAction } = await import("./actions");
    await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(sendInquiryReply).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: undefined }),
    );
  });

  it("omits replyTo when the lead lookup finds no record", async () => {
    getLeadBySlug.mockResolvedValue(undefined);
    const { replyToInquiryAction } = await import("./actions");
    await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(sendInquiryReply).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: undefined }),
    );
  });

  it("trims the inquiry email before sending", async () => {
    getClientInquiryById.mockResolvedValue({
      ...openInquiry,
      email: "  alex@visitor.example  ",
    });
    const { replyToInquiryAction } = await import("./actions");
    await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(sendInquiryReply).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alex@visitor.example" }),
    );
  });

  it("skips Resend when the replied mark fails closed on Convex", async () => {
    recordClientInquiryReply.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error:
        "Could not record the reply in the shared store — email was not sent. Retry in a moment.",
    });
    expect(sendInquiryReply).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces not-found when the mark returns null and a re-fetch finds no row", async () => {
    // Null from recordClientInquiryReply is ambiguous (missing row / archived
    // race / duplicate-send race) — the action re-fetches to report the
    // accurate current reason instead of guessing, mirroring
    // commerce-order-paid-out-race-message-accuracy.
    recordClientInquiryReply.mockResolvedValue(null);
    getClientInquiryById.mockResolvedValueOnce(openInquiry).mockResolvedValueOnce(null);
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error: "Inquiry not found — it may have been deleted",
    });
    expect(sendInquiryReply).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces the archive-race when the mark returns null and a re-fetch shows archived (inquiry-reply-archive-race-guard)", async () => {
    recordClientInquiryReply.mockResolvedValue(null);
    getClientInquiryById
      .mockResolvedValueOnce(openInquiry)
      .mockResolvedValueOnce({ ...openInquiry, status: "archived" });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error: "Inquiry was archived after this page loaded — refresh and check its status",
    });
    expect(sendInquiryReply).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate-send race when the mark returns null and a re-fetch shows still-not-archived (inquiry-reply-send-race-guard)", async () => {
    // A concurrent second tab / double-click captured the same stale
    // expectedReplySentCount and lost the CAS — the row is neither missing
    // nor archived, so this must be the duplicate-send race, not a guess.
    recordClientInquiryReply.mockResolvedValue(null);
    getClientInquiryById
      .mockResolvedValueOnce(openInquiry)
      .mockResolvedValueOnce({ ...openInquiry, status: "replied", replySentCount: 1 });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error:
        "This inquiry was already replied to moments ago by a concurrent request — this click may have sent a duplicate reply email.",
    });
    expect(sendInquiryReply).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("still surfaces a suppressed send after durable mark (defense if helper regresses)", async () => {
    // sendInquiryReply now passes skipSuppression: true, so this path is
    // unreachable in production — keep the action's error branch covered.
    sendInquiryReply.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error:
        "Email is on the suppression list — inquiry is marked replied; leave a lead note if needed",
      inquiry: repliedInquiry,
    });
    expect(recordClientInquiryReply).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend failures after a durable mark without revalidate", async () => {
    sendInquiryReply.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: false,
      error:
        "Resend 429 — inquiry is marked replied; retry send or leave a lead note",
      inquiry: repliedInquiry,
    });
    expect(recordClientInquiryReply).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns mock:true when the email layer mocks the send", async () => {
    sendInquiryReply.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks for writing.");
    expect(res).toEqual({
      success: true,
      inquiry: repliedInquiry,
      mock: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });
});
