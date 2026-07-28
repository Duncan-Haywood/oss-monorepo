import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "@/lib/deploy/types";

/**
 * Action-level orchestration for resendBundleBuyerEmailAction — the operator
 * row-level remedy for isBundleHandoffMissingBuyerEmail (see
 * bundle-order-missing-buyer-email-visibility, PR #765), which shipped
 * visibility only and deliberately deferred a manual resend until the DNS
 * handoff email was extracted out of the webhook route into a reusable
 * helper (sendBundleDnsHandoffEmail, see bundle-dns-handoff-email-manual-resend).
 *
 * Locks: requireOperatorAuth, per-IP rate limit, missing/empty/over-long
 * slug, handoff not-found, missing buyer email, both-already-sent guard,
 * sends only the still-missing half (receipt and/or DNS), reserves only the
 * marker(s) for the half(s) actually sent, partial-failure reporting,
 * DEPLOY_HANDOFF_CONVEX_PRIMARY reservation + ConvexPrimaryWriteError
 * fail-closed, success revalidate.
 *
 * The sent-marker reservation now runs BEFORE the send and is released on a
 * failed send (bundle-buyer-email-resend-race-guard-ordering-fix, mirroring
 * commerce-client-receipt-resend-race-guard-ordering-fix /
 * marketing-voice-pack-client-send-race-guard-ordering-fix) — this closes
 * the prior version's gap, where a fresh re-read after both sends completed
 * could only DETECT a lost race and warn the operator, never PREVENT the
 * real duplicate email from having already gone out. See the "reserves
 * before sending" / "skips the send when the race is already lost" /
 * "releases the reservation on a failed send" tests below for the ordering
 * this fix enforces.
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

const getDeployHandoffBySlug = vi.fn();
const reserveBundleBuyerEmailNotes = vi.fn();
const releaseBundleBuyerEmailNotes = vi.fn();
const getOrderByStripeSessionId = vi.fn();

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
  getDeployHandoffBySlug: (...args: unknown[]) => getDeployHandoffBySlug(...args),
  reserveBundleBuyerEmailNotes: (...args: unknown[]) => reserveBundleBuyerEmailNotes(...args),
  releaseBundleBuyerEmailNotes: (...args: unknown[]) => releaseBundleBuyerEmailNotes(...args),
  getOrderByStripeSessionId: (...args: unknown[]) => getOrderByStripeSessionId(...args),
}));

vi.mock("@/lib/deploy/handoff-persist", () => ({
  DEPLOY_HANDOFF_CONVEX_PRIMARY: { requireConvex: true },
}));

const sendReceiptEmail = vi.fn();
const sendBundleDnsHandoffEmail = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
  sendCommerceBuyNowClientReceipt: vi.fn(),
  sendReceiptEmail: (...args: unknown[]) => sendReceiptEmail(...args),
  sendBundleDnsHandoffEmail: (...args: unknown[]) => sendBundleDnsHandoffEmail(...args),
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

function sampleHandoff(overrides: Partial<DeployHandoff> = {}): DeployHandoff {
  return {
    id: "deploy_demo-cafe_1",
    leadSlug: "demo-cafe",
    businessName: "Demo Cafe",
    tier: "growth",
    commerceAddon: false,
    stripeSessionId: "cs_test_1",
    customerEmail: "owner@demo-cafe.test",
    previewUrl: "http://localhost:3000/preview/demo-cafe",
    suggestedHost: "demo-cafe.preview.localsitestudio.com",
    contactFormUrl: "http://localhost:3000/api/contact/demo-cafe",
    dnsInstructions: [{ type: "A", host: "@", value: "76.76.21.21", purpose: "Root domain" }],
    status: "awaiting_dns",
    notes: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const missingBothHandoff = sampleHandoff();

/** Default reservation mock: reserves exactly what's asked, mirroring the real mutation. */
function reserveBothByDefault(
  _leadSlug: string,
  stripeSessionId: string,
  wantReceipt: boolean,
  wantDns: boolean,
) {
  const notesToAdd: string[] = [];
  if (wantReceipt) notesToAdd.push(`Buyer receipt email sent — Stripe session ${stripeSessionId}`);
  if (wantDns) notesToAdd.push(`DNS handoff email sent — Stripe session ${stripeSessionId}`);
  return Promise.resolve({
    handoff: { ...missingBothHandoff, notes: notesToAdd },
    reservedReceipt: wantReceipt,
    reservedDns: wantDns,
  });
}

describe("resendBundleBuyerEmailAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getDeployHandoffBySlug.mockReset().mockResolvedValue(missingBothHandoff);
    getOrderByStripeSessionId.mockReset().mockResolvedValue({ amountPaid: 599 });
    reserveBundleBuyerEmailNotes.mockReset().mockImplementation(reserveBothByDefault);
    releaseBundleBuyerEmailNotes.mockReset().mockResolvedValue(true);
    sendReceiptEmail.mockReset().mockResolvedValue({ success: true });
    sendBundleDnsHandoffEmail.mockReset().mockResolvedValue({ success: true });
  });

  it("returns auth error without looking up the handoff", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getDeployHandoffBySlug).not.toHaveBeenCalled();
  });

  it("rate-limits repeated resends from the same IP (auth alone is not a throttle)", async () => {
    const { resendBundleBuyerEmailAction } = await import("./actions");
    for (let i = 0; i < 20; i++) {
      const res = await resendBundleBuyerEmailAction("demo-cafe");
      expect(res.success).toBe(true);
    }
    getDeployHandoffBySlug.mockClear();
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getDeployHandoffBySlug).not.toHaveBeenCalled();
  });

  it("rejects an empty slug", async () => {
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("");
    expect(res).toEqual({ success: false, error: "Slug is required" });
    expect(getDeployHandoffBySlug).not.toHaveBeenCalled();
  });

  it("hard-rejects an over-long slug before lookup", async () => {
    const over = "a".repeat(500);
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction(over);
    expect(res).toEqual({ success: false, error: "Slug is too long" });
    expect(getDeployHandoffBySlug).not.toHaveBeenCalled();
  });

  it("rejects a missing deploy handoff", async () => {
    getDeployHandoffBySlug.mockResolvedValue(null);
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "No deploy handoff found for this lead",
    });
    expect(reserveBundleBuyerEmailNotes).not.toHaveBeenCalled();
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(sendBundleDnsHandoffEmail).not.toHaveBeenCalled();
  });

  it("rejects a handoff with no buyer email on file", async () => {
    getDeployHandoffBySlug.mockResolvedValue(sampleHandoff({ customerEmail: "  " }));
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "No buyer email on file for this handoff",
    });
    expect(reserveBundleBuyerEmailNotes).not.toHaveBeenCalled();
    expect(sendReceiptEmail).not.toHaveBeenCalled();
  });

  it("rejects a handoff whose receipt and DNS emails are already both marked sent", async () => {
    getDeployHandoffBySlug.mockResolvedValue(
      sampleHandoff({
        notes: [
          "Buyer receipt email sent — Stripe session cs_test_1",
          "DNS handoff email sent — Stripe session cs_test_1",
        ],
      }),
    );
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Both buyer emails were already sent for this handoff",
    });
    expect(reserveBundleBuyerEmailNotes).not.toHaveBeenCalled();
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(sendBundleDnsHandoffEmail).not.toHaveBeenCalled();
  });

  it("reserves before sending, sends both emails, and revalidates when both are missing", async () => {
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res.success).toBe(true);
    expect(reserveBundleBuyerEmailNotes).toHaveBeenCalledWith(
      "demo-cafe",
      "cs_test_1",
      true,
      true,
      { requireConvex: true },
    );
    // Reservation happens before either send.
    const reserveOrder = reserveBundleBuyerEmailNotes.mock.invocationCallOrder[0];
    const receiptOrder = sendReceiptEmail.mock.invocationCallOrder[0];
    const dnsOrder = sendBundleDnsHandoffEmail.mock.invocationCallOrder[0];
    expect(reserveOrder).toBeLessThan(receiptOrder);
    expect(reserveOrder).toBeLessThan(dnsOrder);
    expect(sendReceiptEmail).toHaveBeenCalledWith(
      "owner@demo-cafe.test",
      "Demo Cafe",
      "growth",
      599,
    );
    expect(sendBundleDnsHandoffEmail).toHaveBeenCalledWith({
      to: "owner@demo-cafe.test",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      handoff: missingBothHandoff,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("only reserves and sends the missing half when the receipt was already sent", async () => {
    getDeployHandoffBySlug.mockResolvedValue(
      sampleHandoff({ notes: ["Buyer receipt email sent — Stripe session cs_test_1"] }),
    );
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res.success).toBe(true);
    expect(reserveBundleBuyerEmailNotes).toHaveBeenCalledWith(
      "demo-cafe",
      "cs_test_1",
      false,
      true,
      { requireConvex: true },
    );
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(sendBundleDnsHandoffEmail).toHaveBeenCalledOnce();
  });

  it("falls back to $0 when no bundle order is found for the amount lookup", async () => {
    getOrderByStripeSessionId.mockResolvedValue(null);
    const { resendBundleBuyerEmailAction } = await import("./actions");
    await resendBundleBuyerEmailAction("demo-cafe");
    expect(sendReceiptEmail).toHaveBeenCalledWith("owner@demo-cafe.test", "Demo Cafe", "growth", 0);
  });

  it("reports a partial failure, releases the failed half's reservation, and keeps the other marker", async () => {
    sendBundleDnsHandoffEmail.mockResolvedValue({ success: false, error: "Resend 500" });
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.error).toContain("Sent the receipt email");
    expect(res.error).toContain("DNS handoff");
    expect(res.handoff).toBeDefined();
    expect(releaseBundleBuyerEmailNotes).toHaveBeenCalledWith("demo-cafe", "cs_test_1", false, true);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("releases both reservations and reports failure when both sends fail", async () => {
    sendReceiptEmail.mockResolvedValue({ success: false, error: "Resend 500" });
    sendBundleDnsHandoffEmail.mockResolvedValue({ success: false, error: "Resend 500" });
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "Failed to send the buyer email(s) — check Resend delivery status and try again",
      handoff: expect.anything(),
    });
    expect(releaseBundleBuyerEmailNotes).toHaveBeenCalledWith("demo-cafe", "cs_test_1", true, false);
    expect(releaseBundleBuyerEmailNotes).toHaveBeenCalledWith("demo-cafe", "cs_test_1", false, true);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("skips the send entirely and reports the race when the reservation fails closed on ConvexPrimaryWriteError", async () => {
    reserveBundleBuyerEmailNotes.mockRejectedValue(new MockConvexPrimaryWriteError("mutation failed"));
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error:
        "Could not reserve the sent-marker(s) in the shared store — no email was sent. Retry in a moment.",
    });
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(sendBundleDnsHandoffEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected reservation errors as action failures", async () => {
    reserveBundleBuyerEmailNotes.mockRejectedValue(new Error("disk full"));
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({ success: false, error: "disk full" });
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces a null reservation result (handoff vanished mid-request) as not-found", async () => {
    reserveBundleBuyerEmailNotes.mockResolvedValue(null);
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res).toEqual({
      success: false,
      error: "No deploy handoff found for this lead",
    });
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("skips both sends entirely — no email goes out — when a concurrent request already reserved both markers", async () => {
    reserveBundleBuyerEmailNotes.mockResolvedValue({
      handoff: missingBothHandoff,
      reservedReceipt: false,
      reservedDns: false,
    });
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.error).toContain("already sent (or reserved) by a concurrent request");
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(sendBundleDnsHandoffEmail).not.toHaveBeenCalled();
    // This is the fix over the old detect-after-send guard: the race is
    // caught BEFORE any email is sent, not just reported afterward.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("sends only the reserved half and reports the other as already claimed when the race is lost for one marker", async () => {
    reserveBundleBuyerEmailNotes.mockResolvedValue({
      handoff: { ...missingBothHandoff, notes: ["DNS handoff email sent — Stripe session cs_test_1"] },
      reservedReceipt: false,
      reservedDns: true,
    });
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(sendReceiptEmail).not.toHaveBeenCalled();
    expect(sendBundleDnsHandoffEmail).toHaveBeenCalledOnce();
    expect(res.error).toContain("Sent the DNS handoff email");
    expect(res.error).toContain("receipt");
    expect(res.error).toContain("already sent (or reserved) by a concurrent request");
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("logs but does not fail the action when the best-effort release itself fails after a send failure", async () => {
    sendReceiptEmail.mockResolvedValue({ success: false, error: "Resend 500" });
    releaseBundleBuyerEmailNotes.mockRejectedValue(new Error("release failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { resendBundleBuyerEmailAction } = await import("./actions");
    const res = await resendBundleBuyerEmailAction("demo-cafe");
    expect(res.success).toBe(false);
    if (res.success) throw new Error("expected failure");
    expect(res.error).toContain("Sent the DNS handoff email");
    consoleErrorSpy.mockRestore();
  });
});
