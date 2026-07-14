import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for replyToInquiryAction — the operator Starter
 * inquiry reply path (INQUIRY_REPLY_CONVEX_PRIMARY persist-then-notify).
 *
 * reply-persist.test.ts + reply.ts helpers cover the requireConvex constant and
 * pure normalize / can-receive predicates. This suite locks the dashboard
 * action glue: requireOperatorAuth, empty inquiry id, reply-body validation,
 * missing / archived / no-email inquiry gates, mark-before-Resend,
 * ConvexPrimaryWriteError skip-send, suppression / send failure after durable
 * mark (returns inquiry; no revalidate), mock send flag, and success revalidate.
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

const getClientInquiryById = vi.fn();
const recordClientInquiryReply = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: vi.fn(),
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
  message: "Do you do catering?",
  status: "new" as const,
  source: "preview",
  createdAt: "2026-07-01T12:00:00.000Z",
  updatedAt: "2026-07-01T12:00:00.000Z",
};

const repliedInquiry = {
  ...openInquiry,
  status: "replied" as const,
  operatorReply: "Thanks for reaching out — yes, we do catering.",
  repliedAt: "2026-07-14T02:00:00.000Z",
  updatedAt: "2026-07-14T02:00:00.000Z",
};

describe("replyToInquiryAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getClientInquiryById.mockReset().mockResolvedValue(openInquiry);
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
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
    expect(sendInquiryReply).not.toHaveBeenCalled();
  });

  it("rejects an empty inquiry id", async () => {
    const { replyToInquiryAction } = await import("./actions");
    expect(await replyToInquiryAction("", "Thanks!")).toEqual({
      success: false,
      error: "Inquiry id is required",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
  });

  it("rejects an empty / whitespace-only reply body", async () => {
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
    const tooLong = "x".repeat(4001);
    expect(await replyToInquiryAction("inq_demo_1", tooLong)).toEqual({
      success: false,
      error: "Reply must be 4000 characters or fewer",
    });
    expect(getClientInquiryById).not.toHaveBeenCalled();
  });

  it("rejects when the inquiry is missing", async () => {
    getClientInquiryById.mockResolvedValue(null);
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("missing", "Thanks!");
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
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
    expect(res).toEqual({
      success: false,
      error:
        "Inquiry is archived — unarchive is not supported; leave a lead note instead",
    });
    expect(recordClientInquiryReply).not.toHaveBeenCalled();
  });

  it("rejects inquiries with no email", async () => {
    getClientInquiryById.mockResolvedValue({
      ...openInquiry,
      email: undefined,
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
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
      "  Thanks for reaching out — yes, we do catering.  ",
    );

    expect(res).toEqual({
      success: true,
      inquiry: repliedInquiry,
      mock: false,
    });
    expect(recordClientInquiryReply).toHaveBeenCalledOnce();
    expect(recordClientInquiryReply).toHaveBeenCalledWith(
      "inq_demo_1",
      "Thanks for reaching out — yes, we do catering.",
      { requireConvex: true },
    );
    expect(sendInquiryReply).toHaveBeenCalledOnce();
    expect(sendInquiryReply).toHaveBeenCalledWith({
      to: "alex@visitor.example",
      businessName: "Demo Cafe",
      leadSlug: "demo-cafe",
      replyBody: "Thanks for reaching out — yes, we do catering.",
      originalMessage: "Do you do catering?",
      inquirerName: "Alex Visitor",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("trims the inquiry email before sending", async () => {
    getClientInquiryById.mockResolvedValue({
      ...openInquiry,
      email: "  alex@visitor.example  ",
    });
    const { replyToInquiryAction } = await import("./actions");
    await replyToInquiryAction("inq_demo_1", "Thanks!");
    expect(sendInquiryReply).toHaveBeenCalledWith(
      expect.objectContaining({ to: "alex@visitor.example" }),
    );
  });

  it("skips Resend when the replied mark fails closed on Convex", async () => {
    recordClientInquiryReply.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
    expect(res).toEqual({
      success: false,
      error:
        "Could not record the reply in the shared store — email was not sent. Retry in a moment.",
    });
    expect(sendInquiryReply).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces not-found when the mark returns null", async () => {
    recordClientInquiryReply.mockResolvedValue(null);
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
    expect(res).toEqual({
      success: false,
      error: "Inquiry not found",
    });
    expect(sendInquiryReply).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces suppression after a durable mark without revalidate", async () => {
    sendInquiryReply.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { replyToInquiryAction } = await import("./actions");
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
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
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
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
    const res = await replyToInquiryAction("inq_demo_1", "Thanks!");
    expect(res).toEqual({
      success: true,
      inquiry: repliedInquiry,
      mock: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });
});
