import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for disposeColdLeadAction — the operator cold
 * Re-engage / Close path (COLD_DISPOSITION_CONVEX_PRIMARY + optional Email 1
 * via OUTREACH_CADENCE_CONVEX_PRIMARY persist-then-notify).
 *
 * cold-archive.test.ts covers pure planColdLeadDisposition helpers.
 * This suite locks the dashboard action glue: requireOperatorAuth, empty slug,
 * invalid disposition, missing lead, not-cold / paid / closed gates,
 * requireConvex disposition fail-closed, Close + Re-engage patches,
 * Email 1 mark-before-Resend, ConvexPrimaryWriteError skip-send on both
 * disposition and outreach mark, suppression / send failure after durable
 * marks (returns stage/outreachStep; no revalidate), and mock send flag.
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
const applyColdLeadDisposition = vi.fn();
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
  recordLeadOutreach: (...args: unknown[]) => recordLeadOutreach(...args),
  listUnrepliedInquiries: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: (...args: unknown[]) =>
    applyColdLeadDisposition(...args),
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

vi.mock("@/lib/leads/cold-disposition-persist", () => ({
  COLD_DISPOSITION_CONVEX_PRIMARY: { requireConvex: true },
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

const DAY_MS = 24 * 60 * 60 * 1000;

const coldLead = {
  slug: "cold-bakery",
  businessName: "Cold Bakery",
  category: "restaurant" as const,
  city: "Denver",
  state: "CO",
  tagline: "Fresh bread",
  description: "A neighborhood bakery",
  phone: "(303) 555-0199",
  email: "owner@cold.bakery",
  services: ["Bread", "Pastries"],
  hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
  stage: "outreach_sent" as const,
  outreachStep: 3 as const,
  lastOutreachAt: new Date(Date.now() - 30 * DAY_MS).toISOString(),
  recommendedTier: "starter" as const,
  dataSource: "manual_entry" as const,
};

describe("disposeColdLeadAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(coldLead);
    applyColdLeadDisposition.mockReset().mockResolvedValue(undefined);
    recordLeadOutreach.mockReset().mockResolvedValue(undefined);
    sendOutreachEmail.mockReset().mockResolvedValue({
      success: true,
      id: "email_1",
    });
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "close");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(applyColdLeadDisposition).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { disposeColdLeadAction } = await import("./actions");
    expect(await disposeColdLeadAction("", "close")).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects an invalid disposition", async () => {
    const { disposeColdLeadAction } = await import("./actions");
    expect(await disposeColdLeadAction("cold-bakery", "archive")).toEqual({
      success: false,
      error: "Invalid cold-lead disposition",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("missing-bakery", "close");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(applyColdLeadDisposition).not.toHaveBeenCalled();
  });

  it("rejects when the lead is not cold yet", async () => {
    getLeadBySlug.mockResolvedValue({
      ...coldLead,
      lastOutreachAt: new Date().toISOString(),
    });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "close");
    expect(res).toEqual({
      success: false,
      error:
        "Lead is not cold yet — wait until Email 3 + quiet days, or edit stage/notes manually",
    });
    expect(applyColdLeadDisposition).not.toHaveBeenCalled();
  });

  it("rejects paid / live leads", async () => {
    getLeadBySlug.mockResolvedValue({ ...coldLead, stage: "paid" });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage");
    expect(res).toEqual({
      success: false,
      error: "Paid or live leads cannot be re-engaged or closed as cold",
    });
    expect(applyColdLeadDisposition).not.toHaveBeenCalled();
  });

  it("rejects already-closed leads", async () => {
    getLeadBySlug.mockResolvedValue({ ...coldLead, stage: "closed" });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "close");
    expect(res).toEqual({
      success: false,
      error: "Lead is already closed",
    });
    expect(applyColdLeadDisposition).not.toHaveBeenCalled();
  });

  it("closes a cold lead with requireConvex and revalidates", async () => {
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "close");

    expect(res).toEqual({
      success: true,
      stage: "closed",
      outreachStep: 3,
      lastOutreachAt: coldLead.lastOutreachAt,
      snoozedUntil: undefined,
      emailSent: false,
      mock: false,
    });
    expect(applyColdLeadDisposition).toHaveBeenCalledOnce();
    expect(applyColdLeadDisposition).toHaveBeenCalledWith(
      "cold-bakery",
      {
        stage: "closed",
        outreachStep: 3,
        lastOutreachAt: coldLead.lastOutreachAt,
        snoozedUntil: undefined,
      },
      { requireConvex: true },
    );
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/cold-bakery");
  });

  it("re-engages to discovered without sending Email 1", async () => {
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage");

    expect(res).toEqual({
      success: true,
      stage: "discovered",
      outreachStep: 0,
      lastOutreachAt: undefined,
      snoozedUntil: undefined,
      emailSent: false,
      mock: false,
    });
    expect(applyColdLeadDisposition).toHaveBeenCalledWith(
      "cold-bakery",
      {
        stage: "discovered",
        outreachStep: 0,
        lastOutreachAt: undefined,
        snoozedUntil: undefined,
      },
      { requireConvex: true },
    );
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("skips Email 1 when the disposition write fails closed on Convex", async () => {
    applyColdLeadDisposition.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage", {
      sendEmail1: true,
    });
    expect(res).toEqual({
      success: false,
      error:
        "Could not save the cold-lead disposition in the shared store — other instances may still show this lead as cold. Retry in a moment.",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("marks Email 1 before Resend on re-engage + sendEmail1", async () => {
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage", {
      sendEmail1: true,
    });

    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.stage).toBe("outreach_sent");
    expect(res.outreachStep).toBe(1);
    expect(res.emailSent).toBe(true);
    expect(res.mock).toBe(false);
    expect(typeof res.lastOutreachAt).toBe("string");

    expect(applyColdLeadDisposition).toHaveBeenCalledWith(
      "cold-bakery",
      {
        stage: "outreach_sent",
        outreachStep: 0,
        lastOutreachAt: undefined,
        snoozedUntil: undefined,
      },
      { requireConvex: true },
    );
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledWith(
      "cold-bakery",
      1,
      expect.any(String),
      { requireConvex: true },
    );
    expect(sendOutreachEmail).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).toHaveBeenCalledWith(
      "owner@cold.bakery",
      "Cold Bakery",
      "cold-bakery",
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/cold-bakery");
  });

  it("skips Resend when the outreach mark fails closed after disposition", async () => {
    recordLeadOutreach.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage", {
      sendEmail1: true,
    });
    expect(res).toEqual({
      success: false,
      error:
        "Re-engage saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry in a moment.",
      stage: "outreach_sent",
      outreachStep: 0,
      lastOutreachAt: undefined,
      snoozedUntil: undefined,
      emailSent: false,
    });
    expect(applyColdLeadDisposition).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects re-engage + sendEmail1 when the lead has no email", async () => {
    getLeadBySlug.mockResolvedValue({ ...coldLead, email: "   " });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage", {
      sendEmail1: true,
    });
    expect(res).toEqual({
      success: false,
      error: "Cannot send Email 1 on re-engage — lead has no email address",
    });
    expect(applyColdLeadDisposition).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("surfaces suppression after durable disposition + mark without revalidate", async () => {
    sendOutreachEmail.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage", {
      sendEmail1: true,
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toBe("Email is on the suppression list");
    expect(res.stage).toBe("outreach_sent");
    expect(res.outreachStep).toBe(1);
    expect(res.emailSent).toBe(false);
    expect(applyColdLeadDisposition).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend failures after durable disposition + mark without revalidate", async () => {
    sendOutreachEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage", {
      sendEmail1: true,
    });
    expect(res.success).toBe(false);
    if (res.success) return;
    expect(res.error).toBe("Resend 429");
    expect(res.stage).toBe("outreach_sent");
    expect(res.outreachStep).toBe(1);
    expect(res.emailSent).toBe(false);
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns mock:true when the email layer mocks Email 1", async () => {
    sendOutreachEmail.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { disposeColdLeadAction } = await import("./actions");
    const res = await disposeColdLeadAction("cold-bakery", "reengage", {
      sendEmail1: true,
    });
    expect(res.success).toBe(true);
    if (!res.success) return;
    expect(res.emailSent).toBe(true);
    expect(res.mock).toBe(true);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("trims lead email before sending Email 1", async () => {
    getLeadBySlug.mockResolvedValue({
      ...coldLead,
      email: "  owner@cold.bakery  ",
    });
    const { disposeColdLeadAction } = await import("./actions");
    await disposeColdLeadAction("cold-bakery", "reengage", { sendEmail1: true });
    expect(sendOutreachEmail).toHaveBeenCalledWith(
      "owner@cold.bakery",
      "Cold Bakery",
      "cold-bakery",
    );
  });
});
