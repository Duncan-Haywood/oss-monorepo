import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_OPERATOR_NOTES_LENGTH } from "@/lib/leads/notes";

/**
 * Action-level orchestration for updateLeadNotesAction — the operator
 * discovery-call / Email 3 notes path (LEAD_NOTES_CONVEX_PRIMARY fail-closed).
 *
 * notes.test.ts + notes-persist.test.ts cover pure normalize/cap helpers and
 * the requireConvex constant. This suite locks the dashboard action glue:
 * requireOperatorAuth, empty slug, over-long notes, missing lead,
 * LEAD_NOTES_CONVEX_PRIMARY on updateLeadNotes (save + clear), trim,
 * ConvexPrimaryWriteError fail-closed (no revalidate), success revalidate,
 * and Error / non-Error throws.
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
const updateLeadNotes = vi.fn();

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
  recordLeadOutreach: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  updateLeadNotes: (...args: unknown[]) => updateLeadNotes(...args),
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

vi.mock("@/lib/leads/notes-persist", () => ({
  LEAD_NOTES_CONVEX_PRIMARY: { requireConvex: true },
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
  city: "Boulder",
  state: "CO",
  tagline: "Coffee and pastry",
  description: "Neighborhood cafe",
  phone: "(303) 555-0100",
  email: "owner@demo.cafe",
  services: ["Coffee", "Pastry"],
  hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
  stage: "discovery_call" as const,
  outreachStep: 3 as const,
  lastOutreachAt: "2026-07-12T12:00:00.000Z",
  recommendedTier: "starter" as const,
  dataSource: "manual_entry" as const,
};

describe("updateLeadNotesAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(baseLead);
    updateLeadNotes.mockReset().mockResolvedValue(undefined);
  });

  it("returns auth error without updating notes", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { updateLeadNotesAction } = await import("./actions");
    const res = await updateLeadNotesAction("demo-cafe", "Called; left VM");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(updateLeadNotes).not.toHaveBeenCalled();
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { updateLeadNotesAction } = await import("./actions");
    expect(await updateLeadNotesAction("", "Called")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(updateLeadNotes).not.toHaveBeenCalled();
  });

  it("rejects notes over the soft cap before looking up the lead", async () => {
    const tooLong = "x".repeat(MAX_OPERATOR_NOTES_LENGTH + 1);
    const { updateLeadNotesAction } = await import("./actions");
    expect(await updateLeadNotesAction("demo-cafe", tooLong)).toEqual({
      success: false,
      error: `Notes must be ${MAX_OPERATOR_NOTES_LENGTH} characters or fewer`,
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(updateLeadNotes).not.toHaveBeenCalled();
  });

  it("surfaces lead-not-found without writing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { updateLeadNotesAction } = await import("./actions");
    expect(await updateLeadNotesAction("missing", "Called")).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(updateLeadNotes).not.toHaveBeenCalled();
  });

  it("saves trimmed notes with LEAD_NOTES_CONVEX_PRIMARY and revalidates", async () => {
    const { updateLeadNotesAction } = await import("./actions");
    const res = await updateLeadNotesAction(
      "demo-cafe",
      "  Called; left voicemail  ",
    );

    expect(res).toEqual({
      success: true,
      notes: "Called; left voicemail",
    });
    expect(updateLeadNotes).toHaveBeenCalledOnce();
    expect(updateLeadNotes).toHaveBeenCalledWith(
      "demo-cafe",
      "Called; left voicemail",
      { requireConvex: true },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("clears notes when input is empty or whitespace", async () => {
    const { updateLeadNotesAction } = await import("./actions");
    expect(await updateLeadNotesAction("demo-cafe", "   ")).toEqual({
      success: true,
      notes: undefined,
    });
    expect(updateLeadNotes).toHaveBeenCalledWith("demo-cafe", undefined, {
      requireConvex: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("accepts notes at the exact soft cap", async () => {
    const exact = "y".repeat(MAX_OPERATOR_NOTES_LENGTH);
    const { updateLeadNotesAction } = await import("./actions");
    const res = await updateLeadNotesAction("demo-cafe", exact);
    expect(res).toEqual({ success: true, notes: exact });
    expect(updateLeadNotes).toHaveBeenCalledWith("demo-cafe", exact, {
      requireConvex: true,
    });
  });

  it("fails closed when Convex primary write rejects", async () => {
    updateLeadNotes.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { updateLeadNotesAction } = await import("./actions");
    const res = await updateLeadNotesAction("demo-cafe", "Called");
    expect(res).toEqual({
      success: false,
      error:
        "Could not save notes in the shared store — other instances may not see this update. Retry in a moment.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages", async () => {
    updateLeadNotes.mockRejectedValue(new Error("db offline"));
    const { updateLeadNotesAction } = await import("./actions");
    const res = await updateLeadNotesAction("demo-cafe", "Called");
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    updateLeadNotes.mockRejectedValue("boom");
    const { updateLeadNotesAction } = await import("./actions");
    const res = await updateLeadNotesAction("demo-cafe", "Called");
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
