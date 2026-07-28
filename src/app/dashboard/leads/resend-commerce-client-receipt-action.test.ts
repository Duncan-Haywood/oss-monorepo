import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH } from "@/lib/billing/checkout-session-id";

/**
 * Action-level orchestration for resendCommerceClientReceiptAction — the
 * operator row-level remedy for listCommerceOrdersMissingClientReceipt (see
 * commerce-buy-now-client-receipt-manual-resend). Visibility alone
 * (commerce-buy-now-client-receipt-visibility-shipped) left the operator with
 * only an aggregate count and no way to identify or act on which order was
 * stuck; this action + its row list close that gap.
 *
 * Locks: requireOperatorAuth, missing/empty/over-long session id, not-found,
 * already-sent guard, lead not-found, missing lead email, send failure
 * (including suppression defense-in-depth), COMMERCE_CLIENT_RECEIPT_RESEND_CONVEX_PRIMARY
 * persist + ConvexPrimaryWriteError fail-closed, and success revalidate.
 *
 * The sent-marker reservation now runs BEFORE the send, and is released on a
 * failed send (commerce-client-receipt-resend-race-guard-ordering-fix,
 * mirroring marketing-voice-pack-client-send-race-guard-ordering-fix) — see
 * the "reserves the sent-marker before sending" / "skips the send" /
 * "releases the reservation" tests below for the ordering this closes.
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

const getCommerceOrderByStripeSessionId = vi.fn();
const getLeadBySlug = vi.fn();
const markCommerceOrderClientReceiptSent = vi.fn();
const clearCommerceOrderClientReceiptSent = vi.fn();

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
  updateLeadSnooze: vi.fn(),
  applyColdLeadDisposition: vi.fn(),
  upsertMarketingPack: vi.fn(),
  listMarketingPacksForMonth: vi.fn(),
  getMarketingPack: vi.fn(),
  upsertCommerceCatalog: vi.fn(),
  listCommerceCatalogs: vi.fn(),
  getCommerceOrderByStripeSessionId: (...args: unknown[]) =>
    getCommerceOrderByStripeSessionId(...args),
  markCommerceOrderPaidOut: vi.fn(),
  markCommerceOrderClientReceiptSent: (...args: unknown[]) =>
    markCommerceOrderClientReceiptSent(...args),
  clearCommerceOrderClientReceiptSent: (...args: unknown[]) =>
    clearCommerceOrderClientReceiptSent(...args),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

vi.mock("@/lib/commerce/client-receipt-persist", () => ({
  COMMERCE_CLIENT_RECEIPT_RESEND_CONVEX_PRIMARY: { requireConvex: true },
}));

const sendCommerceBuyNowClientReceipt = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendOutreachEmail1: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
  sendCommerceBuyNowClientReceipt: (...args: unknown[]) =>
    sendCommerceBuyNowClientReceipt(...args),
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

const missingReceiptOrder = {
  id: "co_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_commerce_receipt",
  skuId: "sku_latte",
  skuName: "Latte",
  amountPaidUsd: 5,
  createdAt: "2026-07-13T10:00:00.000Z",
};

const leadWithEmail = {
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

describe("resendCommerceClientReceiptAction", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
    delete process.env.NEXT_PUBLIC_APP_URL;
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getCommerceOrderByStripeSessionId
      .mockReset()
      .mockResolvedValue(missingReceiptOrder);
    getLeadBySlug.mockReset().mockResolvedValue(leadWithEmail);
    sendCommerceBuyNowClientReceipt
      .mockReset()
      .mockResolvedValue({ success: true, id: "email_1" });
    markCommerceOrderClientReceiptSent.mockReset().mockResolvedValue(true);
    clearCommerceOrderClientReceiptSent.mockReset().mockResolvedValue(true);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns auth error without looking up the order", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
  });

  it("rate-limits repeated resends from the same IP (auth alone is not a throttle)", async () => {
    const { resendCommerceClientReceiptAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
      expect(res.success).toBe(true);
    }
    getCommerceOrderByStripeSessionId.mockClear();
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
  });

  it("rejects an empty session id", async () => {
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("");
    expect(res).toEqual({
      success: false,
      error: "Checkout session id is required",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
  });

  it("hard-rejects an over-long session id before lookup", async () => {
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction(over);
    expect(res).toEqual({
      success: false,
      error: "Checkout session id is too long",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
  });

  it("rejects a missing commerce order", async () => {
    getCommerceOrderByStripeSessionId.mockResolvedValue(null);
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_missing");
    expect(res).toEqual({
      success: false,
      error: "Commerce order not found",
    });
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
  });

  it("rejects an order whose receipt already sent (race-safe re-check)", async () => {
    getCommerceOrderByStripeSessionId.mockResolvedValue({
      ...missingReceiptOrder,
      clientReceiptEmailSentAt: "2026-07-14T09:00:00.000Z",
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "Client receipt was already sent for this order",
    });
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
  });

  it("rejects when the lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "Lead not found for this order",
    });
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
  });

  it("rejects when the lead has no email on file", async () => {
    getLeadBySlug.mockResolvedValue({ ...leadWithEmail, email: undefined });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "No email on file for this lead — add one first",
    });
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
  });

  it("reserves the sent-marker before sending, and revalidates on success", async () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    const callOrder: string[] = [];
    markCommerceOrderClientReceiptSent.mockImplementation(async () => {
      callOrder.push("mark");
      return true;
    });
    sendCommerceBuyNowClientReceipt.mockImplementation(async () => {
      callOrder.push("send");
      return { success: true, id: "email_1" };
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(typeof res.clientReceiptEmailSentAt).toBe("string");
    expect(Number.isNaN(Date.parse(res.clientReceiptEmailSentAt))).toBe(false);
    expect(callOrder).toEqual(["mark", "send"]);

    expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledWith({
      to: "hello@demo-cafe.example",
      businessName: "Demo Cafe",
      slug: "demo-cafe",
      skuName: "Latte",
      amountTotalUsd: 5,
      stripeSessionId: "cs_test_commerce_receipt",
      previewUrl: "https://app.example.com/preview/demo-cafe#catalog",
      quantity: undefined,
      customerEmail: undefined,
    });
    expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledWith(
      "cs_test_commerce_receipt",
      res.clientReceiptEmailSentAt,
      { requireConvex: true },
    );
    expect(clearCommerceOrderClientReceiptSent).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("passes the order's persisted quantity through to the resend (adjustable_quantity Buy now)", async () => {
    getCommerceOrderByStripeSessionId.mockResolvedValue({
      ...missingReceiptOrder,
      quantity: 4,
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res.success).toBe(true);
    expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ quantity: 4 }),
    );
  });

  it("passes the order's persisted customerEmail through to the resend as replyTo (so the manual resend can reach the shopper too)", async () => {
    getCommerceOrderByStripeSessionId.mockResolvedValue({
      ...missingReceiptOrder,
      customerEmail: "shopper@example.com",
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res.success).toBe(true);
    expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledWith(
      expect.objectContaining({ customerEmail: "shopper@example.com" }),
    );
  });

  it("defaults preview base URL to localhost when NEXT_PUBLIC_APP_URL is unset", async () => {
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res.success).toBe(true);
    expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        previewUrl: "http://localhost:3000/preview/demo-cafe#catalog",
      }),
    );
  });

  it("surfaces a suppressed helper return, releases the reservation, and does not revalidate (defense-in-depth)", async () => {
    // sendCommerceBuyNowClientReceipt passes skipSuppression: true, so
    // production should not hit this path — keep the mapping in case a
    // future change to that helper regresses it.
    sendCommerceBuyNowClientReceipt.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "Email is on the suppression list",
    });
    expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledOnce();
    expect(clearCommerceOrderClientReceiptSent).toHaveBeenCalledWith(
      "cs_test_commerce_receipt",
      expect.any(String),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces Resend send failures, releases the reservation, and does not revalidate", async () => {
    sendCommerceBuyNowClientReceipt.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "Resend 429",
    });
    expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledOnce();
    expect(clearCommerceOrderClientReceiptSent).toHaveBeenCalledWith(
      "cs_test_commerce_receipt",
      expect.any(String),
    );
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("still reports the original send failure when the release itself also fails (logged, not thrown)", async () => {
    sendCommerceBuyNowClientReceipt.mockResolvedValue({
      success: false,
      error: "Resend 429",
    });
    clearCommerceOrderClientReceiptSent.mockRejectedValue(new Error("convex outage"));
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({ success: false, error: "Resend 429" });
  });

  it("returns mock:true when the email layer mocks the send", async () => {
    sendCommerceBuyNowClientReceipt.mockResolvedValue({
      success: true,
      mock: true,
    });
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toMatchObject({ success: true, mock: true });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("skips the send and reports a not-sent error when the reservation write fails closed on Convex (ConvexPrimaryWriteError)", async () => {
    markCommerceOrderClientReceiptSent.mockRejectedValue(
      new MockConvexPrimaryWriteError("mutation failed"),
    );
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error:
        "Could not reserve the client receipt sent-marker in the shared store — email was not sent. Retry in a moment.",
    });
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("skips the send entirely and reports a duplicate-risk error when a concurrent writer (e.g. webhook redelivery) already reserved the marker (commerce-client-receipt-resend-race-guard-ordering-fix)", async () => {
    // markCommerceOrderClientReceiptSent's atomic CAS write resolves false
    // (not throw) when a racing caller (a Stripe webhook redelivery, or a
    // second dashboard tab) already set it between this action's read and
    // its reservation write — since the reservation now runs BEFORE the
    // send, this must skip the send entirely rather than detect the
    // duplicate only after a real second email already went out.
    markCommerceOrderClientReceiptSent.mockResolvedValue(false);
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error:
        "Client receipt was already marked sent by a concurrent request (e.g. a webhook redelivery) — skipped duplicate send.",
    });
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("re-throws a non-ConvexPrimaryWriteError from the reservation write (unexpected bug, not a fail-closed guard)", async () => {
    markCommerceOrderClientReceiptSent.mockRejectedValue(new Error("disk full"));
    const { resendCommerceClientReceiptAction } = await import("./actions");
    const res = await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(res).toEqual({
      success: false,
      error: "disk full",
    });
    expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("looks up by stripeSessionId before sending (never a truncated list scan)", async () => {
    const { resendCommerceClientReceiptAction } = await import("./actions");
    await resendCommerceClientReceiptAction("cs_test_commerce_receipt");
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledWith(
      "cs_test_commerce_receipt",
    );
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledOnce();
  });
});
