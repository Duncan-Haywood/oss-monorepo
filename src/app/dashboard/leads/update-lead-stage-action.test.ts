import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LeadPipelineStage } from "@/lib/leads/types";

/**
 * Action-level orchestration for updateLeadStageAction — the operator
 * dashboard stage dropdown path (LEAD_STAGE_CONVEX_PRIMARY fail-closed +
 * optional Email 1 via OUTREACH_CADENCE_CONVEX_PRIMARY persist-then-notify
 * when stage → outreach_sent).
 *
 * stage-persist / outreach-persist helper suites cover the requireConvex
 * constants. This suite locks the dashboard action glue: requireOperatorAuth,
 * LEAD_STAGE_CONVEX_PRIMARY on updateLeadStage, ConvexPrimaryWriteError
 * fail-closed (no revalidate), non-outreach success revalidate, outreach_sent
 * mark-before-Resend, missing-email skip send, ConvexPrimaryWriteError on the
 * outreach mark (stage saved; Email 1 not sent), and Error / non-Error throws.
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

const updateLeadStage = vi.fn();
const getLeadBySlug = vi.fn();
const recordLeadOutreach = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: (...args: unknown[]) => updateLeadStage(...args),
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

const sendOutreachEmail = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail: (...args: unknown[]) => sendOutreachEmail(...args),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
}));

vi.mock("@/lib/leads/stage-persist", () => ({
  LEAD_STAGE_CONVEX_PRIMARY: { requireConvex: true },
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

const baseLead = {
  slug: "demo-cafe",
  businessName: "Demo Cafe",
  category: "restaurant" as const,
  city: "Austin",
  state: "TX",
  tagline: "Coffee",
  description: "A neighborhood cafe",
  phone: "(512) 555-0100",
  email: "owner@demo.cafe",
  services: ["Coffee", "Pastries"],
  hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
  stage: "site_built" as const,
  outreachStep: 0 as const,
  recommendedTier: "starter" as const,
  dataSource: "manual_entry" as const,
};

describe("updateLeadStageAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    updateLeadStage.mockReset().mockResolvedValue(true);
    getLeadBySlug.mockReset().mockResolvedValue(baseLead);
    recordLeadOutreach.mockReset().mockResolvedValue(true);
    sendOutreachEmail.mockReset().mockResolvedValue({
      success: true,
      id: "email_1",
      mock: false,
    });
  });

  it("returns auth error without updating stage", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "discovery_call");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(updateLeadStage).not.toHaveBeenCalled();
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("rate-limits repeated stage moves from the same IP (auth alone is not a throttle)", async () => {
    const { updateLeadStageAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await updateLeadStageAction("demo-cafe", "discovery_call");
      expect(res.success).toBe(true);
    }
    updateLeadStage.mockClear();
    const res = await updateLeadStageAction("demo-cafe", "discovery_call");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(updateLeadStage).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long slug before getLeadBySlug", async () => {
    const { MAX_LEAD_SLUG_LENGTH } = await import("@/lib/leads/slug");
    const { updateLeadStageAction } = await import("./actions");
    const over = "a".repeat(MAX_LEAD_SLUG_LENGTH + 1);
    const res = await updateLeadStageAction(over, "discovery_call");
    expect(res).toEqual({
      success: false,
      error: "Slug is too long",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(updateLeadStage).not.toHaveBeenCalled();
  });

  it("moves a non-outreach stage with LEAD_STAGE_CONVEX_PRIMARY and revalidates", async () => {
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "paid");

    expect(res).toEqual({ success: true });
    expect(updateLeadStage).toHaveBeenCalledOnce();
    expect(updateLeadStage).toHaveBeenCalledWith("demo-cafe", "paid", {
      requireConvex: true,
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
  });

  it.each(["discovered", "site_built", "paid", "live", "closed"] as LeadPipelineStage[])(
    "revalidates after a successful %s stage move without recording outreach or sending Email 1",
    async (stage) => {
      const { updateLeadStageAction } = await import("./actions");
      expect(await updateLeadStageAction("demo-cafe", stage)).toEqual({
        success: true,
      });
      expect(updateLeadStage).toHaveBeenCalledWith("demo-cafe", stage, {
        requireConvex: true,
      });
      expect(recordLeadOutreach).not.toHaveBeenCalled();
      expect(sendOutreachEmail).not.toHaveBeenCalled();
    },
  );

  it("records outreach cadence step 1 for a move to discovery_call, without sending Email 1 (discovery-call-outreach-cadence-gap)", async () => {
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "discovery_call");

    expect(res).toEqual({ success: true });
    expect(updateLeadStage).toHaveBeenCalledWith("demo-cafe", "discovery_call", {
      requireConvex: true,
    });
    expect(recordLeadOutreach).toHaveBeenCalledWith(
      "demo-cafe",
      1,
      undefined,
      { requireConvex: true },
    );
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("does not record outreach for a discovery_call move when the lead has no email", async () => {
    getLeadBySlug.mockResolvedValue({ ...baseLead, email: undefined });
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "discovery_call");

    expect(res).toEqual({ success: true });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("silently no-ops a discovery_call move when recordLeadOutreach resolves false (already recorded, or a paid/live/closed race)", async () => {
    recordLeadOutreach.mockResolvedValue(false);
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "discovery_call");

    // Unlike outreach_sent, a false return here is not an error — there is
    // no send to have skipped, and recording is best-effort bookkeeping.
    expect(res).toEqual({ success: true });
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("fails closed on a discovery_call move when the outreach mark rejects Convex primary", async () => {
    recordLeadOutreach.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "discovery_call");

    expect(res).toEqual({
      success: false,
      error:
        "Stage saved, but could not record the outreach mark in the shared store. Retry in a moment.",
    });
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("returns the paid/live race-guard error and never records outreach when updateLeadStage resolves false", async () => {
    updateLeadStage.mockResolvedValue(false);
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");
    expect(res).toEqual({
      success: false,
      error:
        "Lead was paid or went live after this page loaded — refresh and check its status; the stage was not changed",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a race-guard error and skips Email 1 when recordLeadOutreach resolves false", async () => {
    recordLeadOutreach.mockResolvedValue(false);
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");
    expect(res).toEqual({
      success: false,
      error:
        "Stage saved, but the lead went paid/live/closed, or Email 1 was already sent by another request, before this could record it — Email 1 was not sent here",
    });
    expect(updateLeadStage).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when Convex primary stage write rejects", async () => {
    updateLeadStage.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "paid");
    expect(res).toEqual({
      success: false,
      error:
        "Could not save the stage in the shared store — other instances may not see this move. Retry in a moment.",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("on outreach_sent marks Email 1 before Resend with OUTREACH_CADENCE_CONVEX_PRIMARY", async () => {
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");

    expect(res).toEqual({ success: true });
    expect(updateLeadStage).toHaveBeenCalledWith("demo-cafe", "outreach_sent", {
      requireConvex: true,
    });
    expect(getLeadBySlug).toHaveBeenCalledWith("demo-cafe");
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledWith(
      "demo-cafe",
      1,
      undefined,
      { requireConvex: true },
    );
    expect(sendOutreachEmail).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).toHaveBeenCalledWith(
      "owner@demo.cafe",
      "Demo Cafe",
      "demo-cafe",
    );
    expect(recordLeadOutreach.mock.invocationCallOrder[0]).toBeLessThan(
      sendOutreachEmail.mock.invocationCallOrder[0]!,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
  });

  it("on outreach_sent skips Email 1 when the lead has no email", async () => {
    getLeadBySlug.mockResolvedValue({ ...baseLead, email: "" });
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");

    expect(res).toEqual({ success: true });
    expect(updateLeadStage).toHaveBeenCalledWith("demo-cafe", "outreach_sent", {
      requireConvex: true,
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("returns Lead not found and never writes the stage when the slug does not exist", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("missing-slug", "outreach_sent");

    expect(res).toEqual({ success: false, error: "Lead not found" });
    expect(updateLeadStage).not.toHaveBeenCalled();
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns Lead not found for a non-outreach stage move on an unknown slug, without writing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("missing-slug", "paid");

    expect(res).toEqual({ success: false, error: "Lead not found" });
    expect(updateLeadStage).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed on outreach mark Convex error after stage save (skips Email 1)", async () => {
    recordLeadOutreach.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");

    expect(res).toEqual({
      success: false,
      error:
        "Stage saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry in a moment.",
    });
    expect(updateLeadStage).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from the stage write", async () => {
    updateLeadStage.mockRejectedValue(new Error("db offline"));
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "live");
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    updateLeadStage.mockRejectedValue("boom");
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "live");
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from Email 1 send after durable marks", async () => {
    sendOutreachEmail.mockRejectedValue(new Error("resend down"));
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");
    expect(res).toEqual({
      success: false,
      error: "resend down",
    });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces suppression after durable outreach mark without revalidate", async () => {
    sendOutreachEmail.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");
    expect(res).toEqual({
      success: false,
      error:
        "Stage saved and marked Outreach Sent, but Email 1 was not delivered — email is on the suppression list",
    });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend failure after durable outreach mark without revalidate", async () => {
    sendOutreachEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { updateLeadStageAction } = await import("./actions");
    const res = await updateLeadStageAction("demo-cafe", "outreach_sent");
    expect(res).toEqual({
      success: false,
      error:
        "Stage saved and marked Outreach Sent, but Email 1 failed to send — Resend 429",
    });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
