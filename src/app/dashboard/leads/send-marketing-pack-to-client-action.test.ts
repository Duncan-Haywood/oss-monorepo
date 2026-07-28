import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Action-level orchestration for sendMarketingPackToClientAction — the operator
 * Email pack path for sold Growth/Complete content handoff.
 *
 * deliver-pack.test.ts covers eligibility + HTML formatting; resend/marketing
 * helpers cover transport (including skipSuppression on sold pack delivery).
 * This suite locks the dashboard action glue: requireOperatorAuth, eligibility
 * (paid/live Growth/Complete + email), existing month pack gate, send failure,
 * preview URL from NEXT_PUBLIC_APP_URL, and revalidate on success. A suppressed
 * helper return is defense-in-depth only — sendMarketingPackToClientEmail now
 * passes skipSuppression: true (marketing-voice-pack-skip-suppression).
 *
 * The sent-marker reservation now runs BEFORE the send, and is released on a
 * failed send (marketing-voice-pack-client-send-race-guard-ordering-fix) —
 * see the "reserves the sent-marker before sending" / "skips the send" /
 * "releases the reservation" tests below for the ordering this closes.
 */

class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}

// Mocked (not imported from the real module) so the class reference stays
// identical across this suite's per-test vi.resetModules() calls — mirrors
// send-starter-upsell-action.test.ts / stripe-connect-actions.test.ts.
vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

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
const listOrdersByLeadSlug = vi.fn();
const getMarketingPack = vi.fn();
const markMarketingPackSentToClient = vi.fn();
const clearMarketingPackSentToClient = vi.fn();

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
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  listOrders: vi.fn(),
  recordLeadOutreach: vi.fn(),
  listUnrepliedInquiries: vi.fn(),
  updateLeadNotes: vi.fn(),
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: (...args: unknown[]) => getMarketingPack(...args),
  upsertCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
  markMarketingPackSentToClient: (...args: unknown[]) =>
    markMarketingPackSentToClient(...args),
  clearMarketingPackSentToClient: (...args: unknown[]) =>
    clearMarketingPackSentToClient(...args),
}));

const sendMarketingPackToClientEmail = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: (...args: unknown[]) =>
    sendMarketingPackToClientEmail(...args),
  sendClientVoicePackToClientEmail: vi.fn(),
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
  recommendedTier: "growth" as const,
  dataSource: "manual_entry" as const,
};

const growthOrder = {
  id: "ord_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_growth",
  tier: "growth",
  commerceAddon: false,
  amountPaid: 599,
  createdAt: "2026-07-13T10:00:00.000Z",
};

const packVariants = [
  {
    contentType: "gbp_post" as const,
    title: "Stub post",
    body: "[Stub] Come visit Demo Cafe this week.",
  },
];

function currentYearMonth(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

describe("sendMarketingPackToClientAction", () => {
  const originalEnv = { ...process.env };
  const yearMonth = currentYearMonth();

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(eligibleLead);
    listOrdersByLeadSlug.mockReset().mockResolvedValue([growthOrder]);
    getMarketingPack.mockReset().mockResolvedValue({
      id: "pack_1",
      leadSlug: "demo-cafe",
      yearMonth,
      generator: "stub",
      packageTier: "social_email",
      variants: packVariants,
      generatedAt: "2026-07-13T12:00:00.000Z",
    });
    sendMarketingPackToClientEmail.mockReset().mockResolvedValue({
      success: true,
      id: "email_1",
    });
    markMarketingPackSentToClient.mockReset().mockResolvedValue(true);
    clearMarketingPackSentToClient.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without loading the lead", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("rate-limits repeated pack sends from the same IP (auth alone is not a throttle)", async () => {
    const { sendMarketingPackToClientAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await sendMarketingPackToClientAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    getLeadBySlug.mockClear();
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("");
    expect(res).toEqual({
      success: false,
      error: "Slug is required",
    });
    expect(getLeadBySlug).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("missing-cafe");
    expect(res).toEqual({
      success: false,
      error: "Lead not found",
    });
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects Starter-only / unpaid leads (eligibility)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...growthOrder, tier: "starter", amountPaid: 500 },
    ]);
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email pack requires a paid/live Growth or Complete lead with an email on file",
    });
    expect(getMarketingPack).not.toHaveBeenCalled();
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects paid Growth leads without an email on file", async () => {
    getLeadBySlug.mockResolvedValue({ ...eligibleLead, email: undefined });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email pack requires a paid/live Growth or Complete lead with an email on file",
    });
    expect(getMarketingPack).not.toHaveBeenCalled();
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects when no pack exists for the current UTC month", async () => {
    getMarketingPack.mockResolvedValue(null);
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: `No marketing pack for ${yearMonth} — generate one first`,
    });
    expect(getMarketingPack).toHaveBeenCalledWith("demo-cafe", yearMonth);
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects when the pack has zero variants", async () => {
    getMarketingPack.mockResolvedValue({
      id: "pack_empty",
      leadSlug: "demo-cafe",
      yearMonth,
      generator: "stub",
      packageTier: "social_email",
      variants: [],
      generatedAt: "2026-07-13T12:00:00.000Z",
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: `No marketing pack for ${yearMonth} — generate one first`,
    });
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("reserves the sent-marker before sending, and revalidates on success", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const callOrder: string[] = [];
    markMarketingPackSentToClient.mockImplementation(async () => {
      callOrder.push("mark");
      return true;
    });
    sendMarketingPackToClientEmail.mockImplementation(async () => {
      callOrder.push("send");
      return { success: true, id: "email_1" };
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");

    expect(res).toEqual({
      success: true,
      yearMonth,
      mock: false,
      sentToClientAt: expect.any(String),
    });
    expect(callOrder).toEqual(["mark", "send"]);
    expect(sendMarketingPackToClientEmail).toHaveBeenCalledOnce();
    expect(sendMarketingPackToClientEmail).toHaveBeenCalledWith({
      to: "hello@demo-cafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      yearMonth,
      variants: packVariants,
      previewUrl: "https://app.example.com/preview/demo-cafe",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    expect(markMarketingPackSentToClient).toHaveBeenCalledWith(
      "demo-cafe",
      yearMonth,
      "2026-07-13T12:00:00.000Z",
      expect.any(String),
      expect.objectContaining({ requireConvex: true }),
    );
    expect(clearMarketingPackSentToClient).not.toHaveBeenCalled();
  });

  it("skips the send entirely and reports a duplicate-risk error when a concurrent request already reserved the marker (marketing-voice-pack-client-send-race-guard-ordering-fix)", async () => {
    // markMarketingPackSentToClient's atomic CAS write resolves false (not
    // throw) when a second tab or a double-click before the button's
    // isPending-disabled state applied already reserved this exact marker —
    // since the reservation now runs BEFORE the send, this must skip the
    // send entirely rather than detect the duplicate only after a real
    // second email already went out. The re-fetch used to distinguish this
    // from a version mismatch sees the SAME generatedAt (no regenerate
    // happened), so the duplicate-send message applies.
    markMarketingPackSentToClient.mockResolvedValue(false);
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Marketing pack was already marked sent by a concurrent request — skipped duplicate send.",
    });
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("skips the send and reports a regenerated-pack error (not the duplicate-send message) when the pack was regenerated while the send was in flight (marketing-voice-pack-send-stale-content-race-guard)", async () => {
    // Simulates a concurrent Regenerate landing between this action's read of
    // the pack and its reservation call: the reservation is lost (the real
    // fix — markMarketingPackSentToClient itself rejects a stale
    // expectedGeneratedAt — is exercised at the db.ts/Convex/SQLite layers;
    // this test only proves the action surfaces the right operator-facing
    // message, distinct from an ordinary duplicate-send race).
    markMarketingPackSentToClient.mockResolvedValue(false);
    getMarketingPack.mockResolvedValueOnce({
      id: "pack_1",
      leadSlug: "demo-cafe",
      yearMonth,
      generator: "stub",
      packageTier: "social_email",
      variants: packVariants,
      generatedAt: "2026-07-13T12:00:00.000Z",
    });
    getMarketingPack.mockResolvedValueOnce({
      id: "pack_1_v2",
      leadSlug: "demo-cafe",
      yearMonth,
      generator: "stub",
      packageTier: "social_email",
      variants: [{ contentType: "gbp_post" as const, body: "Regenerated content" }],
      generatedAt: "2026-07-14T00:00:00.000Z",
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Marketing pack was regenerated while this send was in flight — refresh and resend to deliver the current version.",
    });
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("skips the send and reports a not-sent error when the reservation write fails closed on Convex (ConvexPrimaryWriteError)", async () => {
    markMarketingPackSentToClient.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Could not reserve the marketing pack sent-to-client marker in the shared store — email was not sent. Retry in a moment.",
    });
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("re-throws a non-ConvexPrimaryWriteError from the reservation write (unexpected bug, not a fail-closed guard)", async () => {
    markMarketingPackSentToClient.mockRejectedValue(new Error("unexpected bug"));
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "unexpected bug" });
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("releases the reservation and reports the send failure when the email fails after a successful reservation", async () => {
    sendMarketingPackToClientEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "Resend 429" });
    expect(clearMarketingPackSentToClient).toHaveBeenCalledWith(
      "demo-cafe",
      yearMonth,
      expect.any(String),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("still reports the original send failure when the release itself also fails (logged, not thrown)", async () => {
    sendMarketingPackToClientEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    clearMarketingPackSentToClient.mockRejectedValue(new Error("convex outage"));
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "Resend 429" });
  });

  it("defaults preview base URL to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res.success).toBe(true);
    expect(sendMarketingPackToClientEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "http://localhost:3000/preview/demo-cafe",
      }),
    );
  });

  it("surfaces a suppressed helper return without revalidate (defense-in-depth)", async () => {
    // Pack delivery passes skipSuppression: true, so production should not hit
    // this path — keep the action mapping if a future helper regresses.
    sendMarketingPackToClientEmail.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Email is on the suppression list",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend send failures without revalidate", async () => {
    sendMarketingPackToClientEmail.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Resend 429",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("returns mock:true when the email layer mocks the send", async () => {
    sendMarketingPackToClientEmail.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: true,
      yearMonth,
      mock: true,
      sentToClientAt: expect.any(String),
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("loads orders via listOrdersByLeadSlug (ineligible starter does not pass)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...growthOrder, leadSlug: "demo-cafe", tier: "starter" },
    ]);
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email pack requires a paid/live Growth or Complete lead with an email on file",
    });
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });

  it("rejects Growth orders after recurringCanceledAt (paused/canceled MRR)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { ...growthOrder, recurringCanceledAt: 1_720_000_000_000 },
    ]);
    const { sendMarketingPackToClientAction } = await import("./actions");
    const res = await sendMarketingPackToClientAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Email pack requires a paid/live Growth or Complete lead with an email on file",
    });
    expect(getMarketingPack).not.toHaveBeenCalled();
    expect(sendMarketingPackToClientEmail).not.toHaveBeenCalled();
  });
});
