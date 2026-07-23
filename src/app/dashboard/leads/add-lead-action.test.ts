import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for addLeadAction — the operator manual create
 * path (LEAD_UPSERT_CONVEX_PRIMARY fail-closed + optional Email 1 via
 * OUTREACH_CADENCE_CONVEX_PRIMARY persist-then-notify when stage →
 * outreach_sent with an email).
 *
 * upsert-persist / outreach-persist / csv-import helper suites cover the
 * requireConvex constants and collision message. This suite locks the
 * dashboard action glue: requireOperatorAuth, missing slug/businessName,
 * slug sanitize, default stage/dataSource, existing-slug conflict (no
 * upsert), LEAD_UPSERT_CONVEX_PRIMARY on upsertLead, ConvexPrimaryWriteError
 * fail-closed (no revalidate), success revalidate, field-length soft-caps /
 * hard-reject (shared with CSV), outreach_sent mark-before-Resend,
 * missing-email skip send, outreach-mark ConvexPrimaryWriteError (lead saved;
 * Email 1 not sent), and Error / non-Error throws.
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
const upsertLead = vi.fn();
const recordLeadOutreach = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: vi.fn(),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: vi.fn(),
  upsertLead: (...args: unknown[]) => upsertLead(...args),
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

vi.mock("@/lib/leads/upsert-persist", () => ({
  LEAD_UPSERT_CONVEX_PRIMARY: { requireConvex: true },
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

const baseLeadInput = {
  slug: "Demo Cafe!",
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
  outreachStep: 0 as const,
  recommendedTier: "starter" as const,
};

describe("addLeadAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(null);
    upsertLead.mockReset().mockResolvedValue(true);
    recordLeadOutreach.mockReset().mockResolvedValue(undefined);
    sendOutreachEmail.mockReset().mockResolvedValue({
      success: true,
      id: "email_1",
      mock: false,
    });
  });

  it("returns auth error without creating a lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction(baseLeadInput);
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(upsertLead).not.toHaveBeenCalled();
    expect(recordLeadOutreach).not.toHaveBeenCalled();
  });

  it("rate-limits repeated creates from the same IP (auth alone is not a throttle)", async () => {
    const { addLeadAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await addLeadAction(baseLeadInput);
      expect(res.success).toBe(true);
    }
    getLeadBySlug.mockClear();
    const res = await addLeadAction(baseLeadInput);
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("rejects missing slug without upserting", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({ ...baseLeadInput, slug: "" });
    expect(res).toEqual({
      success: false,
      error: "Slug and Business Name are required",
    });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("rejects all-symbol slugs that sanitize to empty", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({ ...baseLeadInput, slug: "!!!" });
    expect(res).toEqual({
      success: false,
      error: "Slug must contain at least one letter or number",
    });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("rejects missing businessName without upserting", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({ ...baseLeadInput, businessName: "" });
    expect(res).toEqual({
      success: false,
      error: "Slug and Business Name are required",
    });
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("hard-rejects over-long businessName before upsert", async () => {
    const { MAX_BUSINESS_NAME_LENGTH } = await import(
      "@/lib/leads/create-fields"
    );
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      businessName: "A".repeat(MAX_BUSINESS_NAME_LENGTH + 1),
    });
    expect(res).toEqual({
      success: false,
      error: `Business Name must be ${MAX_BUSINESS_NAME_LENGTH} characters or fewer`,
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(upsertLead).not.toHaveBeenCalled();
  });

  it("soft-caps optional create fields before upsert (CSV parity)", async () => {
    const {
      MAX_CITY_LENGTH,
      MAX_DESCRIPTION_LENGTH,
      MAX_TAGLINE_LENGTH,
    } = await import("@/lib/leads/create-fields");
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      city: "c".repeat(MAX_CITY_LENGTH + 40),
      tagline: "t".repeat(MAX_TAGLINE_LENGTH + 10),
      description: "d".repeat(MAX_DESCRIPTION_LENGTH + 50),
    });
    expect(res).toEqual({ success: true, slug: "demo-cafe" });
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        city: "c".repeat(MAX_CITY_LENGTH),
        tagline: "t".repeat(MAX_TAGLINE_LENGTH),
        description: "d".repeat(MAX_DESCRIPTION_LENGTH),
      }),
      { requireConvex: true },
    );
  });

  it("sanitizes slug, defaults stage/dataSource, passes LEAD_UPSERT_CONVEX_PRIMARY, and revalidates", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction(baseLeadInput);

    // Edge dashes stripped so CRM slug matches leadSlugAsDnsLabel / Host lookup
    // (create-path-slug-edge-dash-normalize — "Demo Cafe!" must not become demo-cafe-).
    expect(res).toEqual({ success: true, slug: "demo-cafe" });
    expect(getLeadBySlug).toHaveBeenCalledWith("demo-cafe");
    expect(upsertLead).toHaveBeenCalledOnce();
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        stage: "discovered",
        dataSource: "manual_entry",
        email: "owner@demo.cafe",
      }),
      { requireConvex: true },
    );
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/demo-cafe");
  });

  it("preserves an explicit stage and dataSource on create", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "blue-river-salon",
      stage: "site_built",
      dataSource: "csv_import",
    });

    expect(res).toEqual({ success: true, slug: "blue-river-salon" });
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "blue-river-salon",
        stage: "site_built",
        dataSource: "csv_import",
      }),
      { requireConvex: true },
    );
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("soft-caps an over-long dataSource before upsert", async () => {
    const { MAX_LEAD_DATA_SOURCE_LENGTH } = await import(
      "@/lib/leads/create-fields"
    );
    const long = "x".repeat(MAX_LEAD_DATA_SOURCE_LENGTH + 25);
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "soft-cap-source",
      dataSource: long,
    });

    expect(res).toEqual({ success: true, slug: "soft-cap-source" });
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "soft-cap-source",
        dataSource: "x".repeat(MAX_LEAD_DATA_SOURCE_LENGTH),
      }),
      { requireConvex: true },
    );
  });

  it("rejects an existing slug without calling upsertLead", async () => {
    getLeadBySlug.mockResolvedValue({
      ...baseLeadInput,
      slug: "demo-cafe",
      stage: "paid",
      dataSource: "manual_entry",
    });
    const { existingLeadSlugConflictMessage } = await import(
      "@/lib/leads/csv-import"
    );
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "demo-cafe",
    });
    expect(res).toEqual({
      success: false,
      error: existingLeadSlugConflictMessage("demo-cafe"),
    });
    expect(upsertLead).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns a conflict error and skips outreach/revalidate when upsertLead loses the create-only race (lead-upsert-create-only-race-guard)", async () => {
    upsertLead.mockResolvedValue(false);
    const { existingLeadSlugConflictMessage } = await import(
      "@/lib/leads/csv-import"
    );
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "race-cafe",
      stage: "outreach_sent",
    });
    expect(res).toEqual({
      success: false,
      error: existingLeadSlugConflictMessage("race-cafe"),
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("fails closed when Convex primary upsert rejects", async () => {
    upsertLead.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "new-bakery",
    });
    expect(res).toEqual({
      success: false,
      error:
        "Could not save the lead in the shared store — other instances may not see it. Retry in a moment.",
    });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("on outreach_sent marks Email 1 before Resend with OUTREACH_CADENCE_CONVEX_PRIMARY", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "outreach-cafe",
      stage: "outreach_sent",
    });

    expect(res).toEqual({ success: true, slug: "outreach-cafe" });
    expect(upsertLead).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "outreach-cafe",
        stage: "outreach_sent",
        email: "owner@demo.cafe",
      }),
      { requireConvex: true },
    );
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledWith(
      "outreach-cafe",
      1,
      undefined,
      { requireConvex: true },
    );
    expect(sendOutreachEmail).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).toHaveBeenCalledWith(
      "owner@demo.cafe",
      "Demo Cafe",
      "outreach-cafe",
    );
    expect(recordLeadOutreach.mock.invocationCallOrder[0]).toBeLessThan(
      sendOutreachEmail.mock.invocationCallOrder[0]!,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(revalidatePath).toHaveBeenCalledWith("/preview/outreach-cafe");
  });

  it("on outreach_sent skips Email 1 when the lead has no email", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "no-email-cafe",
      stage: "outreach_sent",
      email: "",
    });

    expect(res).toEqual({ success: true, slug: "no-email-cafe" });
    expect(upsertLead).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("fails closed on outreach mark Convex error after lead save (skips Email 1)", async () => {
    recordLeadOutreach.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "mark-fail-cafe",
      stage: "outreach_sent",
    });

    expect(res).toEqual({
      success: false,
      error:
        "Lead saved, but could not record the outreach mark in the shared store — Email 1 was not sent. Retry Email 1 from the dashboard in a moment.",
      slug: "mark-fail-cafe",
    });
    expect(upsertLead).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("on discovery_call records outreach cadence step 1 without sending Email 1 (add-lead-discovery-call-outreach-cadence-gap)", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "discovery-cafe",
      stage: "discovery_call",
    });

    expect(res).toEqual({ success: true, slug: "discovery-cafe" });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledWith(
      "discovery-cafe",
      1,
      undefined,
      { requireConvex: true },
    );
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("on discovery_call skips the outreach mark when the lead has no email", async () => {
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "discovery-no-email-cafe",
      stage: "discovery_call",
      email: "",
    });

    expect(res).toEqual({ success: true, slug: "discovery-no-email-cafe" });
    expect(recordLeadOutreach).not.toHaveBeenCalled();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
  });

  it("fails closed on discovery_call outreach mark Convex error after lead save", async () => {
    recordLeadOutreach.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "discovery-mark-fail-cafe",
      stage: "discovery_call",
    });

    expect(res).toEqual({
      success: false,
      error:
        "Lead saved, but could not record the outreach mark in the shared store. Retry in a moment.",
      slug: "discovery-mark-fail-cafe",
    });
    expect(upsertLead).toHaveBeenCalledOnce();
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from the upsert", async () => {
    upsertLead.mockRejectedValue(new Error("db offline"));
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "err-cafe",
    });
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces non-Error throws as Unknown error", async () => {
    upsertLead.mockRejectedValue("boom");
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "boom-cafe",
    });
    expect(res).toEqual({
      success: false,
      error: "Unknown error",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from Email 1 send after durable marks", async () => {
    sendOutreachEmail.mockRejectedValue(new Error("resend down"));
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "send-fail-cafe",
      stage: "outreach_sent",
    });
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
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "suppressed-cafe",
      stage: "outreach_sent",
    });
    expect(res).toEqual({
      success: false,
      error:
        "Lead saved and marked Outreach Sent, but Email 1 was not delivered — email is on the suppression list",
      slug: "suppressed-cafe",
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
    const { addLeadAction } = await import("./actions");
    const res = await addLeadAction({
      ...baseLeadInput,
      slug: "resend-fail-cafe",
      stage: "outreach_sent",
    });
    expect(res).toEqual({
      success: false,
      error:
        "Lead saved and marked Outreach Sent, but Email 1 failed to send — Resend 429",
      slug: "resend-fail-cafe",
    });
    expect(recordLeadOutreach).toHaveBeenCalledOnce();
    expect(sendOutreachEmail).toHaveBeenCalledOnce();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
