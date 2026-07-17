import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for sendDailyDigestAction — the operator
 * Send daily digest path that surfaces Work next / follow-ups / abandoned
 * carts / unreplied inquiries / packs due / Commerce payouts owed /
 * production handoffs open.
 *
 * daily-digest.test.ts covers the pure builder. This suite locks the
 * dashboard action glue: requireOperatorAuth, OPERATOR_DIGEST_EMAIL trim
 * gate, uncapped list* wiring (listUnrepliedInquiries /
 * listUnpaidCommerceOrders / listMarketingPacksForMonth /
 * listDeployHandoffs), and sendOperatorDailyDigest success / failure /
 * mock labeling.
 */

const requireOperatorAuth = vi.fn();
vi.mock("@/lib/auth/operator", () => ({
  requireOperatorAuth: (...args: unknown[]) => requireOperatorAuth(...args),
}));

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

const headers = vi.fn();
vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => headers(...args),
}));

const getLeads = vi.fn();
const listUnrepliedInquiries = vi.fn();
const listOpenCheckoutSessions = vi.fn();
const listOrders = vi.fn();
const listMarketingPacksForMonth = vi.fn();
const listCommerceCatalogs = vi.fn();
const listClientVoicePacks = vi.fn();
const listUnpaidCommerceOrders = vi.fn();
const listCommerceOrdersRefunded = vi.fn();
const listCommerceOrdersDisputed = vi.fn();
const listClientInquiries = vi.fn();
const listCommerceOrders = vi.fn();
const listDeployHandoffs = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: (...args: unknown[]) =>
    listOpenCheckoutSessions(...args),
  getLeadBySlug: vi.fn(),
  recordCheckoutRecoverySent: vi.fn(),
  getCommerceCatalog: vi.fn(),
  updateLeadStage: vi.fn(),
  upsertLead: vi.fn(),
  updateClientInquiryStatus: vi.fn(),
  getClientInquiryById: vi.fn(),
  recordClientInquiryReply: vi.fn(),
  getLeads: (...args: unknown[]) => getLeads(...args),
  listOrders: (...args: unknown[]) => listOrders(...args),
  recordLeadOutreach: vi.fn(),
  listUnrepliedInquiries: (...args: unknown[]) =>
    listUnrepliedInquiries(...args),
  listClientInquiries: (...args: unknown[]) => listClientInquiries(...args),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: (...args: unknown[]) =>
    listMarketingPacksForMonth(...args),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: vi.fn(),
  listCommerceCatalogs: (...args: unknown[]) => listCommerceCatalogs(...args),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: (...args: unknown[]) => listClientVoicePacks(...args),
  listUnpaidCommerceOrders: (...args: unknown[]) =>
    listUnpaidCommerceOrders(...args),
  listCommerceOrdersRefunded: (...args: unknown[]) =>
    listCommerceOrdersRefunded(...args),
  listCommerceOrdersDisputed: (...args: unknown[]) =>
    listCommerceOrdersDisputed(...args),
  listCommerceOrders: (...args: unknown[]) => listCommerceOrders(...args),
  listDeployHandoffs: (...args: unknown[]) => listDeployHandoffs(...args),
}));

const sendOperatorDailyDigest = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendCheckoutAbandonedRecovery: vi.fn(),
  sendCommerceAbandonedRecovery: vi.fn(),
  sendOutreachEmail: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: (...args: unknown[]) =>
    sendOperatorDailyDigest(...args),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
}));

describe("sendDailyDigestAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    process.env.OPERATOR_DIGEST_EMAIL = "ops@localsitestudio.com";
    delete process.env.NEXT_PUBLIC_APP_URL;

    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headers.mockReset().mockResolvedValue({
      get: (name: string) => {
        if (name === "host") return "localhost:3000";
        if (name === "x-forwarded-proto") return "http";
        return null;
      },
    });
    getLeads.mockReset().mockResolvedValue([]);
    listUnrepliedInquiries.mockReset().mockResolvedValue([]);
    listOpenCheckoutSessions.mockReset().mockResolvedValue([]);
    listOrders.mockReset().mockResolvedValue([]);
    listMarketingPacksForMonth.mockReset().mockResolvedValue([]);
    listCommerceCatalogs.mockReset().mockResolvedValue([]);
    listClientVoicePacks.mockReset().mockResolvedValue([]);
    listUnpaidCommerceOrders.mockReset().mockResolvedValue([]);
    listCommerceOrdersRefunded.mockReset().mockResolvedValue([]);
    listCommerceOrdersDisputed.mockReset().mockResolvedValue([]);
    listDeployHandoffs.mockReset().mockResolvedValue([]);
    listClientInquiries.mockReset();
    listCommerceOrders.mockReset();
    sendOperatorDailyDigest.mockReset().mockResolvedValue({
      success: true,
      mock: true,
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading digest inputs or sending", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeads).not.toHaveBeenCalled();
    expect(listUnrepliedInquiries).not.toHaveBeenCalled();
    expect(sendOperatorDailyDigest).not.toHaveBeenCalled();
  });

  it("rejects when OPERATOR_DIGEST_EMAIL is unset", async () => {
    delete process.env.OPERATOR_DIGEST_EMAIL;
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res).toEqual({
      success: false,
      error:
        "Set OPERATOR_DIGEST_EMAIL in your environment to enable the daily digest.",
    });
    expect(getLeads).not.toHaveBeenCalled();
    expect(sendOperatorDailyDigest).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only OPERATOR_DIGEST_EMAIL (same trim gate as readiness banner)", async () => {
    process.env.OPERATOR_DIGEST_EMAIL = "   \t  ";
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res).toEqual({
      success: false,
      error:
        "Set OPERATOR_DIGEST_EMAIL in your environment to enable the daily digest.",
    });
    expect(sendOperatorDailyDigest).not.toHaveBeenCalled();
  });

  it("loads uncapped list* feeds (not capped inquiry/order pages) and sends digest", async () => {
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");

    expect(getLeads).toHaveBeenCalledOnce();
    expect(listUnrepliedInquiries).toHaveBeenCalledOnce();
    expect(listClientInquiries).not.toHaveBeenCalled();
    expect(listOpenCheckoutSessions).toHaveBeenCalledOnce();
    expect(listOrders).toHaveBeenCalledOnce();
    expect(listMarketingPacksForMonth).toHaveBeenCalledOnce();
    const [yearMonth] = listMarketingPacksForMonth.mock.calls[0]!;
    expect(yearMonth).toMatch(/^\d{4}-\d{2}$/);
    expect(listCommerceCatalogs).toHaveBeenCalledOnce();
    expect(listClientVoicePacks).toHaveBeenCalledOnce();
    expect(listUnpaidCommerceOrders).toHaveBeenCalledOnce();
    expect(listCommerceOrdersRefunded).toHaveBeenCalledOnce();
    expect(listDeployHandoffs).toHaveBeenCalledOnce();
    expect(listCommerceOrders).not.toHaveBeenCalled();

    expect(sendOperatorDailyDigest).toHaveBeenCalledOnce();
    const [to, html] = sendOperatorDailyDigest.mock.calls[0]!;
    expect(to).toBe("ops@localsitestudio.com");
    expect(typeof html).toBe("string");
    expect(html).toContain("Nothing urgent today");

    expect(res.mock).toBe(true);
    expect(res.digest).toMatchObject({
      workNext: [],
      followUpsDue: [],
      unrepliedInquiries: [],
      isEmpty: true,
    });
  });

  it("trims OPERATOR_DIGEST_EMAIL before sending", async () => {
    process.env.OPERATOR_DIGEST_EMAIL = "  ops@localsitestudio.com  ";
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res.success).toBe(true);
    expect(sendOperatorDailyDigest.mock.calls[0]![0]).toBe(
      "ops@localsitestudio.com",
    );
  });

  it("prefers NEXT_PUBLIC_APP_URL over request Host headers in dashboard links", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.localsitestudio.com";
    listUnrepliedInquiries.mockResolvedValue([
      {
        id: "inq_1",
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        name: "Alex",
        email: "alex@example.com",
        message: "Need a site by Friday",
        status: "new",
        source: "contact_form",
        createdAt: "2026-07-13T10:00:00.000Z",
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    ]);
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(res.digest.isEmpty).toBe(false);
    const html = sendOperatorDailyDigest.mock.calls[0]![1] as string;
    expect(html).toContain(
      "https://app.localsitestudio.com/dashboard/leads",
    );
    expect(html).not.toContain("http://localhost:3000");
  });

  it("never trusts a malformed/injection x-forwarded-host header verbatim into the digest link", async () => {
    headers.mockResolvedValue({
      get: (name: string) => {
        if (name === "x-forwarded-host") return '"><script>alert(1)</script>';
        if (name === "x-forwarded-proto") return "https";
        return null;
      },
    });
    listUnrepliedInquiries.mockResolvedValue([
      {
        id: "inq_1",
        leadSlug: "demo-cafe",
        businessName: "Demo Cafe",
        name: "Alex",
        email: "alex@example.com",
        message: "Need a site by Friday",
        status: "new",
        source: "contact_form",
        createdAt: "2026-07-13T10:00:00.000Z",
        updatedAt: "2026-07-13T10:00:00.000Z",
      },
    ]);
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res.success).toBe(true);
    const html = sendOperatorDailyDigest.mock.calls[0]![1] as string;
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("http://localhost:3000/dashboard/leads");
  });

  it("surfaces sendOperatorDailyDigest failures", async () => {
    sendOperatorDailyDigest.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res).toEqual({
      success: false,
      error: "Resend 429",
    });
  });

  it("uses a generic send failure when the sender omits error", async () => {
    sendOperatorDailyDigest.mockResolvedValue({ success: false });
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res).toEqual({
      success: false,
      error: "Failed to send daily digest",
    });
  });

  it("surfaces unexpected list/load errors as action failures", async () => {
    getLeads.mockRejectedValue(new Error("db unavailable"));
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res).toEqual({
      success: false,
      error: "db unavailable",
    });
    expect(sendOperatorDailyDigest).not.toHaveBeenCalled();
  });

  it("reports mock:false when Resend actually sends", async () => {
    sendOperatorDailyDigest.mockResolvedValue({ success: true, mock: false });
    const { sendDailyDigestAction } = await import("./actions");
    const res = await sendDailyDigestAction();
    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(res.mock).toBe(false);
  });
});
