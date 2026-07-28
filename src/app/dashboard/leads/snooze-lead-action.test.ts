import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for snoozeLeadAction — the operator Work next
 * park path (LEAD_SNOOZE_CONVEX_PRIMARY fail-closed).
 *
 * snooze.test.ts + snooze-persist.test.ts cover pure preset/normalize helpers
 * and the requireConvex constant. This suite locks the dashboard action glue:
 * requireOperatorAuth, empty slug, missing lead, invalid preset, missing
 * preset/clear, LEAD_SNOOZE_CONVEX_PRIMARY on updateLeadSnooze for 1d/3d/7d +
 * Unsnooze, ConvexPrimaryWriteError fail-closed (no revalidate), success
 * revalidate, and Error / non-Error throws.
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
const updateLeadSnooze = vi.fn();

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
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: (...args: unknown[]) => updateLeadSnooze(...args),
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

vi.mock("@/lib/leads/snooze-persist", () => ({
  LEAD_SNOOZE_CONVEX_PRIMARY: { requireConvex: true },
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

const NOW_MS = Date.parse("2026-07-14T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

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
  stage: "outreach_sent" as const,
  outreachStep: 1 as const,
  lastOutreachAt: "2026-07-12T12:00:00.000Z",
  recommendedTier: "starter" as const,
  dataSource: "manual_entry" as const,
};

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("snoozeLeadAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    vi.useFakeTimers();
    vi.setSystemTime(NOW_MS);
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    headersMock.mockReset().mockResolvedValue(headerStore());
    getLeadBySlug.mockReset().mockResolvedValue(baseLead);
    updateLeadSnooze.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("rate-limits repeated calls from the same IP (auth alone is not a throttle)", async () => {
    const { snoozeLeadAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await snoozeLeadAction("demo-cafe", { preset: "1d" });
      expect(res.success).toBe(true);
    }
    getLeadBySlug.mockClear();
    updateLeadSnooze.mockClear();
    revalidatePath.mockClear();
    const res = await snoozeLeadAction("demo-cafe", { preset: "1d" });
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(updateLeadSnooze).not.toHaveBeenCalled();
  });

  it("returns auth error without loading or snoozing", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { snoozeLeadAction } = await import("./actions");
    const res = await snoozeLeadAction("demo-cafe", { preset: "1d" });
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(updateLeadSnooze).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { snoozeLeadAction } = await import("./actions");
    expect(await snoozeLeadAction("", { preset: "1d" })).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(updateLeadSnooze).not.toHaveBeenCalled();
  });

  it("surfaces lead not found", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { snoozeLeadAction } = await import("./actions");
    expect(await snoozeLeadAction("missing", { preset: "1d" })).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(updateLeadSnooze).not.toHaveBeenCalled();
  });

  it("rejects an invalid snooze preset", async () => {
    const { snoozeLeadAction } = await import("./actions");
    expect(await snoozeLeadAction("demo-cafe", { preset: "2d" })).toEqual({
      success: false,
      error: "Invalid snooze preset",
    });
    expect(updateLeadSnooze).not.toHaveBeenCalled();
  });

  it("requires a preset or clear: true", async () => {
    const { snoozeLeadAction } = await import("./actions");
    expect(await snoozeLeadAction("demo-cafe", {})).toEqual({
      success: false,
      error: "Provide a snooze preset or clear: true",
    });
    expect(updateLeadSnooze).not.toHaveBeenCalled();
  });

  it("parks 1d with LEAD_SNOOZE_CONVEX_PRIMARY and revalidates", async () => {
    const expectedUntil = new Date(NOW_MS + 1 * DAY_MS).toISOString();
    const { snoozeLeadAction } = await import("./actions");
    const res = await snoozeLeadAction("demo-cafe", { preset: "1d" });

    expect(res).toEqual({ success: true, snoozedUntil: expectedUntil });
    expect(updateLeadSnooze).toHaveBeenCalledOnce();
    expect(updateLeadSnooze).toHaveBeenCalledWith("demo-cafe", expectedUntil, {
      requireConvex: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("parks 3d and 7d presets with requireConvex", async () => {
    const { snoozeLeadAction } = await import("./actions");

    const until3d = new Date(NOW_MS + 3 * DAY_MS).toISOString();
    expect(await snoozeLeadAction("demo-cafe", { preset: "3d" })).toEqual({
      success: true,
      snoozedUntil: until3d,
    });
    expect(updateLeadSnooze).toHaveBeenLastCalledWith("demo-cafe", until3d, {
      requireConvex: true,
    });

    const until7d = new Date(NOW_MS + 7 * DAY_MS).toISOString();
    expect(await snoozeLeadAction("demo-cafe", { preset: "7d" })).toEqual({
      success: true,
      snoozedUntil: until7d,
    });
    expect(updateLeadSnooze).toHaveBeenLastCalledWith("demo-cafe", until7d, {
      requireConvex: true,
    });
    expect(updateLeadSnooze).toHaveBeenCalledTimes(2);
  });

  it("clears snooze (Unsnooze) with requireConvex and revalidates", async () => {
    const { snoozeLeadAction } = await import("./actions");
    const res = await snoozeLeadAction("demo-cafe", { clear: true });

    expect(res).toEqual({ success: true, snoozedUntil: undefined });
    expect(updateLeadSnooze).toHaveBeenCalledOnce();
    expect(updateLeadSnooze).toHaveBeenCalledWith("demo-cafe", undefined, {
      requireConvex: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("prefers clear over preset when both are provided", async () => {
    const { snoozeLeadAction } = await import("./actions");
    const res = await snoozeLeadAction("demo-cafe", {
      clear: true,
      preset: "7d",
    });
    expect(res).toEqual({ success: true, snoozedUntil: undefined });
    expect(updateLeadSnooze).toHaveBeenCalledWith("demo-cafe", undefined, {
      requireConvex: true,
    });
  });

  it("fails closed when Convex primary write rejects", async () => {
    updateLeadSnooze.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { snoozeLeadAction } = await import("./actions");
    const res = await snoozeLeadAction("demo-cafe", { preset: "1d" });
    expect(res).toEqual({
      success: false,
      error:
        "Could not save the snooze in the shared store — lead may still show as due elsewhere. Retry in a moment.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages", async () => {
    updateLeadSnooze.mockRejectedValue(new Error("db offline"));
    const { snoozeLeadAction } = await import("./actions");
    const res = await snoozeLeadAction("demo-cafe", { preset: "1d" });
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "snoozeLeadAction",
    });
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    updateLeadSnooze.mockRejectedValue("boom");
    const { snoozeLeadAction } = await import("./actions");
    const res = await snoozeLeadAction("demo-cafe", { preset: "1d" });
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
