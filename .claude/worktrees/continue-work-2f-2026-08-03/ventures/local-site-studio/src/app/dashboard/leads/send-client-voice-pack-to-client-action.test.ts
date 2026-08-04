import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for sendClientVoicePackToClientAction — the
 * operator Email voice pack path for sold Complete phone-script handoff.
 *
 * deliver-pack.test.ts covers eligibility + HTML formatting; resend/voice
 * helpers cover transport. This suite locks the dashboard action glue:
 * requireOperatorAuth, eligibility (paid/live Complete + email), existing
 * pack gate, suppression / send failure, preview URL from
 * NEXT_PUBLIC_APP_URL, and revalidate on success.
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
const listOrders = vi.fn();
const getClientVoicePackByLeadSlug = vi.fn();

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
  listOrders: (...args: unknown[]) => listOrders(...args),
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
  getClientVoicePackByLeadSlug: (...args: unknown[]) =>
    getClientVoicePackByLeadSlug(...args),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

const sendClientVoicePackToClientEmail = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: (...args: unknown[]) =>
    sendClientVoicePackToClientEmail(...args),
}));

const eligibleLead = {
  slug: "demo-cafe",
  businessName: "Demo Cafe",
  category: "restaurant" as const,
  city: "Boulder",
  state: "CO",
  tagline: "Coffee and pastry",
  description: "Neighborhood cafe",
  phone: "(303) 555-0100",
  email: "hello@demo-cafe.example",
  services: ["Coffee", "Pastries"],
  hours: { weekday: "Mon–Fri 7am–3pm", weekend: "Sat 8am–2pm" },
  stage: "paid" as const,
  recommendedTier: "complete" as const,
  dataSource: "manual_entry" as const,
};

const completeOrder = {
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_complete",
  tier: "complete",
  commerceAddon: false,
  amountPaid: 699,
  status: "paid",
  createdAt: "2026-07-13T10:00:00.000Z",
};

const packVariants = [
  {
    scriptType: "inbound_greeting" as const,
    title: "Greeting",
    body: "[Stub] Thanks for calling Demo Cafe.",
  },
];

describe("sendClientVoicePackToClientAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrders.mockReset().mockResolvedValue([completeOrder]);
    getClientVoicePackByLeadSlug.mockReset().mockResolvedValue({
      id: "voice_pack_1",
      leadSlug: "demo-cafe",
      generator: "stub",
      variants: packVariants,
      generatedAt: "2026-07-13T12:00:00.000Z",
    });
    sendClientVoicePackToClientEmail.mockReset().mockResolvedValue({
      success: true,
      id: "email_1",
    });
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(sendClientVoicePackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(sendClientVoicePackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects Growth-only / unpaid leads (eligibility)", async () => {
    listOrders.mockResolvedValue([
      { ...completeOrder, tier: "growth", amountPaid: 599 },
    ]);
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email voice pack requires a paid/live Complete lead with an email on file",
    });
    expect(getClientVoicePackByLeadSlug).not.toHaveBeenCalled();
    expect(sendClientVoicePackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects paid Complete leads without an email on file", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, email: undefined });
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email voice pack requires a paid/live Complete lead with an email on file",
    });
    expect(getClientVoicePackByLeadSlug).not.toHaveBeenCalled();
    expect(sendClientVoicePackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects when no voice pack exists", async () => {
    getClientVoicePackByLeadSlug.mockResolvedValue(null);
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "No voice FAQ pack — generate one first",
    });
    expect(getClientVoicePackByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(sendClientVoicePackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects when the pack has zero variants", async () => {
    getClientVoicePackByLeadSlug.mockResolvedValue({
      id: "voice_pack_empty",
      leadSlug: "demo-cafe",
      generator: "stub",
      variants: [],
      generatedAt: "2026-07-13T12:00:00.000Z",
    });
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "No voice FAQ pack — generate one first",
    });
    expect(sendClientVoicePackToClientEmail).not.toHaveBeenCalled();
  });

  it("sends the pack with preview URL and revalidates on success", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      mock: false,
    });
    expect(sendClientVoicePackToClientEmail).toHaveBeenCalledOnce();
    expect(sendClientVoicePackToClientEmail).toHaveBeenCalledWith({
      to: "hello@demo-cafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      variants: packVariants,
      previewUrl: "https://app.example.com/preview/demo-cafe",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("defaults preview base URL to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res.success).toBe(true);
    expect(sendClientVoicePackToClientEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "http://localhost:3000/preview/demo-cafe",
      }),
    );
  });

  it("surfaces suppression without revalidate", async () => {
    sendClientVoicePackToClientEmail.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Email is on the suppression list",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend send failures without revalidate", async () => {
    sendClientVoicePackToClientEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Resend 429",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns mock:true when the email layer mocks the send", async () => {
    sendClientVoicePackToClientEmail.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: true,
      mock: true,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("filters orders to the requested lead slug before eligibility", async () => {
    listOrders.mockResolvedValue([
      { ...completeOrder, leadSlug: "other-cafe", tier: "complete" },
      { ...completeOrder, leadSlug: "demo-cafe", tier: "growth" },
    ]);
    const { sendClientVoicePackToClientAction } = await import("./actions");
    const res = await sendClientVoicePackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email voice pack requires a paid/live Complete lead with an email on file",
    });
    expect(sendClientVoicePackToClientEmail).not.toHaveBeenCalled();
  });
});
