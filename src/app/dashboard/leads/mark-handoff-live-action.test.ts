import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "@/lib/deploy/types";

/**
 * Action-level orchestration for markHandoffLiveAction — the operator Mark
 * live fulfill path (DEPLOY_HANDOFF_CONVEX_PRIMARY via markHandoffLive + lead
 * stage → live).
 *
 * handoff-persist / handoff helper suites cover the requireConvex constant
 * and the field writes. This suite locks the dashboard action glue:
 * requireOperatorAuth, empty/over-long slug, no-handoff null, ConvexPrimaryWriteError
 * fail-closed (no revalidate), success revalidate, and Error / non-Error
 * throws.
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

const markHandoffLive = vi.fn();

vi.mock("@/lib/deploy/handoff", () => ({
  markHandoffLive: (...args: unknown[]) => markHandoffLive(...args),
  assignVercelProjectAndProvision: vi.fn(),
  assignCustomDomainAndProvision: vi.fn(),
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

const liveHandoff: DeployHandoff = {
  id: "handoff_demo",
  leadSlug: "demo-cafe",
  businessName: "Demo Cafe",
  tier: "starter",
  commerceAddon: false,
  stripeSessionId: "cs_test_demo",
  customerEmail: "owner@demo.cafe",
  previewUrl: "https://example.com/preview/demo-cafe",
  suggestedHost: "demo-cafe.example.com",
  contactFormUrl: "https://example.com/api/contact/demo-cafe",
  dnsInstructions: [],
  status: "live",
  notes: ["Marked live"],
  createdAt: "2026-07-14T00:00:00.000Z",
  updatedAt: "2026-07-14T12:00:00.000Z",
};

describe("markHandoffLiveAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    headersMock.mockReset().mockResolvedValue(headerStore());
    markHandoffLive.mockReset().mockResolvedValue(liveHandoff);
  });

  it("rate-limits repeated calls from the same IP (auth alone is not a throttle)", async () => {
    const { markHandoffLiveAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await markHandoffLiveAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    markHandoffLive.mockClear();
    revalidatePath.mockClear();
    const res = await markHandoffLiveAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(markHandoffLive).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns auth error without marking live", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(markHandoffLive).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects an empty slug without calling markHandoffLive", async () => {
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(markHandoffLive).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long slug before markHandoffLive", async () => {
    const { MAX_LEAD_SLUG_LENGTH } = await import("@/lib/leads/slug");
    const { markHandoffLiveAction } = await import("./actions");
    const over = "a".repeat(MAX_LEAD_SLUG_LENGTH + 1);
    const res = await markHandoffLiveAction(over);
    expect(res).toEqual({
      success: false,
      error: "Slug is too long",
    });
    expect(markHandoffLive).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts exactly MAX_LEAD_SLUG_LENGTH and still marks live", async () => {
    const { MAX_LEAD_SLUG_LENGTH } = await import("@/lib/leads/slug");
    const exact = "c".repeat(MAX_LEAD_SLUG_LENGTH);
    markHandoffLive.mockResolvedValue({ ...liveHandoff, leadSlug: exact });
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction(exact);
    expect(res.success).toBe(true);
    expect(markHandoffLive).toHaveBeenCalledWith(exact);
  });

  it("returns not-found when markHandoffLive yields null", async () => {
    markHandoffLive.mockResolvedValue(null);
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "No deploy handoff found for this lead",
    });
    expect(markHandoffLive).toHaveBeenCalledWith("missing-cafe");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when Convex primary Mark live rejects", async () => {
    markHandoffLive.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Could not record Mark live in the shared store — handoff/lead stage may still show as pre-live elsewhere. Retry in a moment.",
    });
    expect(markHandoffLive).toHaveBeenCalledWith("demo-cafe");
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("marks live and revalidates dashboard + preview", async () => {
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction("demo-cafe");
    expect(res).toEqual({ success: true, handoff: liveHandoff });
    expect(markHandoffLive).toHaveBeenCalledOnce();
    expect(markHandoffLive).toHaveBeenCalledWith("demo-cafe");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
  });

  it("surfaces unexpected Error messages from markHandoffLive", async () => {
    markHandoffLive.mockRejectedValue(new Error("handoff store offline"));
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "handoff store offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    markHandoffLive.mockRejectedValue("boom");
    const { markHandoffLiveAction } = await import("./actions");
    const res = await markHandoffLiveAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
