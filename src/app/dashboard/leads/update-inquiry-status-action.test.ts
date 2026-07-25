import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientInquiryStatus } from "@/lib/inquiries/types";

/**
 * Action-level orchestration for updateInquiryStatusAction — the operator
 * mark-read (composer open) / Archive path (INQUIRY_REPLY_CONVEX_PRIMARY
 * fail-closed).
 *
 * reply.test.ts + reply-persist.ts cover pure auto-mark-read helpers and the
 * requireConvex constant. reply-to-inquiry-action.test.ts locks the Reply
 * persist-then-notify path. This suite locks the status-only dashboard glue:
 * requireOperatorAuth, empty inquiry id, invalid status, INQUIRY_REPLY_CONVEX_PRIMARY
 * on updateClientInquiryStatus, ConvexPrimaryWriteError fail-closed (no
 * revalidate), null update not-found, and success revalidate for read /
 * archived / replied / new.
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

const updateClientInquiryStatus = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: (...args: unknown[]) =>
    updateClientInquiryStatus(...args),
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

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
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

const baseInquiry = {
  id: "inq_demo_1",
  leadSlug: "demo-cafe",
  businessName: "Demo Cafe",
  name: "Alex Visitor",
  email: "alex@visitor.example",
  phone: null,
  message: "Do you take walk-ins?",
  source: "contact_form" as const,
  status: "new" as const,
  createdAt: "2026-07-10T12:00:00.000Z",
};

describe("updateInquiryStatusAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    headersMock.mockReset().mockResolvedValue(headerStore());
    updateClientInquiryStatus.mockReset().mockResolvedValue({
      ...baseInquiry,
      status: "read",
    });
  });

  it("rate-limits repeated calls from the same IP (auth alone is not a throttle)", async () => {
    const { updateInquiryStatusAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await updateInquiryStatusAction("inq_demo_1", "read");
      expect(res.success).toBe(true);
    }
    updateClientInquiryStatus.mockClear();
    revalidatePath.mockClear();
    const res = await updateInquiryStatusAction("inq_demo_1", "read");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(updateClientInquiryStatus).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns auth error without updating status", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction("inq_demo_1", "read");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(updateClientInquiryStatus).not.toHaveBeenCalled();
  });

  it("rejects an empty inquiry id", async () => {
    const { updateInquiryStatusAction } = await import("./actions");
    expect(await updateInquiryStatusAction("", "read")).toEqual({
      success: false,
      error: "Inquiry id is required",
    });
    expect(updateClientInquiryStatus).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long inquiryId before status write", async () => {
    const { updateInquiryStatusAction } = await import("./actions");
    const { MAX_INQUIRY_ID_LENGTH } = await import("@/lib/inquiries/inquiry-id");
    const over = `inq_${"a".repeat(MAX_INQUIRY_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_INQUIRY_ID_LENGTH);
    expect(await updateInquiryStatusAction(over, "read")).toEqual({
      success: false,
      error: "Inquiry id is too long",
    });
    expect(updateClientInquiryStatus).not.toHaveBeenCalled();
  });

  it("accepts exactly MAX_INQUIRY_ID_LENGTH inquiryId (still updates)", async () => {
    const { updateInquiryStatusAction } = await import("./actions");
    const { MAX_INQUIRY_ID_LENGTH } = await import("@/lib/inquiries/inquiry-id");
    const exact = "i".repeat(MAX_INQUIRY_ID_LENGTH);
    const readInquiry = { ...baseInquiry, id: exact, status: "read" as const };
    updateClientInquiryStatus.mockResolvedValue(readInquiry);
    const res = await updateInquiryStatusAction(exact, "read");
    expect(res).toEqual({ success: true, inquiry: readInquiry });
    expect(updateClientInquiryStatus).toHaveBeenCalledWith(
      exact,
      "read",
      { requireConvex: true },
    );
  });

  it("rejects an invalid status", async () => {
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction(
      "inq_demo_1",
      "spam" as ClientInquiryStatus,
    );
    expect(res).toEqual({
      success: false,
      error: "Invalid status",
    });
    expect(updateClientInquiryStatus).not.toHaveBeenCalled();
  });

  it("marks read with INQUIRY_REPLY_CONVEX_PRIMARY and revalidates", async () => {
    const readInquiry = { ...baseInquiry, status: "read" as const };
    updateClientInquiryStatus.mockResolvedValue(readInquiry);
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction("inq_demo_1", "read");

    expect(res).toEqual({ success: true, inquiry: readInquiry });
    expect(updateClientInquiryStatus).toHaveBeenCalledOnce();
    expect(updateClientInquiryStatus).toHaveBeenCalledWith(
      "inq_demo_1",
      "read",
      { requireConvex: true },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("archives with requireConvex and revalidates", async () => {
    const archived = { ...baseInquiry, status: "archived" as const };
    updateClientInquiryStatus.mockResolvedValue(archived);
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction("inq_demo_1", "archived");

    expect(res).toEqual({ success: true, inquiry: archived });
    expect(updateClientInquiryStatus).toHaveBeenCalledWith(
      "inq_demo_1",
      "archived",
      { requireConvex: true },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("allows setting replied and new statuses", async () => {
    const replied = { ...baseInquiry, status: "replied" as const };
    updateClientInquiryStatus.mockResolvedValueOnce(replied);
    const { updateInquiryStatusAction } = await import("./actions");
    expect(await updateInquiryStatusAction("inq_demo_1", "replied")).toEqual({
      success: true,
      inquiry: replied,
    });

    const asNew = { ...baseInquiry, status: "new" as const };
    updateClientInquiryStatus.mockResolvedValueOnce(asNew);
    expect(await updateInquiryStatusAction("inq_demo_1", "new")).toEqual({
      success: true,
      inquiry: asNew,
    });
    expect(updateClientInquiryStatus).toHaveBeenCalledTimes(2);
  });

  it("fails closed when Convex primary write rejects", async () => {
    updateClientInquiryStatus.mockRejectedValue(
      new MockConvexPrimaryWriteError(),
    );
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction("inq_demo_1", "read");
    expect(res).toEqual({
      success: false,
      error:
        "Could not update inquiry status in the shared store — retry in a moment.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces not-found when the update returns null", async () => {
    updateClientInquiryStatus.mockResolvedValue(null);
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction("inq_demo_1", "archived");
    expect(res).toEqual({
      success: false,
      error: "Inquiry not found",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages", async () => {
    updateClientInquiryStatus.mockRejectedValue(new Error("db offline"));
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction("inq_demo_1", "read");
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    updateClientInquiryStatus.mockRejectedValue("boom");
    const { updateInquiryStatusAction } = await import("./actions");
    const res = await updateInquiryStatusAction("inq_demo_1", "read");
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
