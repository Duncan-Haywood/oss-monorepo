import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH } from "@/lib/billing/checkout-session-id";

/**
 * Action-level orchestration for markCommerceOrderPaidOutAction — the operator
 * Mark paid out path that drops Commerce pass-through liability from the payout
 * panel, pipeline-health unpaid owed, and daily digest.
 *
 * paid-out-persist.test.ts + orders.test.ts cover the requireConvex constant
 * and unpaid math. This suite locks the dashboard action glue: requireOperatorAuth,
 * missing/empty/over-long session id, not-found, already-paid-out guard,
 * COMMERCE_PAID_OUT_CONVEX_PRIMARY persist, ConvexPrimaryWriteError fail-closed
 * (no revalidate), success revalidate, the markCommerceOrderPaidOut
 * false-return race guard (see commerce-order-paid-out-refund-race-guard):
 * markCommerceOrderPaidOut re-checks refundedAt/disputedAt/paidOutAt
 * atomically with its write and returns false when a Stripe webhook
 * refunded/disputed the order in the window between this action's own
 * snapshot read and that write — the action must surface that as a failure,
 * not silently report success on a write that never applied — and the
 * per-IP rate limit (see dashboard-action-rate-limit-gaps; this action is a
 * state-changing money-payout write and was the last one in this file's
 * ~29-action set found still missing the standard
 * requireOperatorAuth() -> checkRateLimit -> work pattern).
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
const markCommerceOrderPaidOut = vi.fn();

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
  getCommerceOrderByStripeSessionId: (...args: unknown[]) =>
    getCommerceOrderByStripeSessionId(...args),
  markCommerceOrderPaidOut: (...args: unknown[]) =>
    markCommerceOrderPaidOut(...args),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

vi.mock("@/lib/commerce/paid-out-persist", () => ({
  COMMERCE_PAID_OUT_CONVEX_PRIMARY: { requireConvex: true },
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

const unpaidOrder = {
  id: "co_1",
  leadSlug: "demo-cafe",
  stripeSessionId: "cs_test_commerce_paid",
  skuId: "sku_latte",
  skuName: "Latte",
  amountPaidCents: 500,
  currency: "usd",
  customerEmail: "shopper@example.com",
  createdAt: "2026-07-13T10:00:00.000Z",
};

describe("markCommerceOrderPaidOutAction", () => {
  beforeEach(() => {
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    getCommerceOrderByStripeSessionId.mockReset().mockResolvedValue(unpaidOrder);
    markCommerceOrderPaidOut.mockReset().mockResolvedValue(true);
  });

  it("returns auth error without looking up the order", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
    expect(markCommerceOrderPaidOut).not.toHaveBeenCalled();
  });

  it("rate-limits repeated mark-paid-out calls from the same IP (auth alone is not a throttle)", async () => {
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    // The mock always resolves the same unpaid snapshot regardless of prior
    // calls, so every one of the 20 succeeds; only the 21st should be
    // throttled.
    for (let i = 0; i < 20; i++) {
      const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");
      expect(res.success).toBe(true);
    }
    getCommerceOrderByStripeSessionId.mockClear();
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
  });

  it("rejects an empty session id", async () => {
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("");
    expect(res).toEqual({
      success: false,
      error: "Checkout session id is required",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
  });

  it("hard-rejects an over-long session id before lookup", async () => {
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction(over);
    expect(res).toEqual({
      success: false,
      error: "Checkout session id is too long",
    });
    expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
    expect(markCommerceOrderPaidOut).not.toHaveBeenCalled();
  });

  it("accepts an exact-max-length session id for lookup", async () => {
    const exact = "c".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    getCommerceOrderByStripeSessionId.mockResolvedValue({
      ...unpaidOrder,
      stripeSessionId: exact,
    });
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction(exact);
    expect(res.success).toBe(true);
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledWith(exact);
    expect(markCommerceOrderPaidOut).toHaveBeenCalledWith(
      exact,
      expect.any(String),
      { requireConvex: true },
    );
  });

  it("rejects a missing commerce order", async () => {
    getCommerceOrderByStripeSessionId.mockResolvedValue(null);
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_missing");
    expect(res).toEqual({
      success: false,
      error: "Commerce order not found",
    });
    expect(markCommerceOrderPaidOut).not.toHaveBeenCalled();
  });

  it("rejects an order that is already marked paid out", async () => {
    getCommerceOrderByStripeSessionId.mockResolvedValue({
      ...unpaidOrder,
      paidOutAt: "2026-07-13T12:00:00.000Z",
    });
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");
    expect(res).toEqual({
      success: false,
      error: "Order is already marked paid out",
    });
    expect(markCommerceOrderPaidOut).not.toHaveBeenCalled();
  });

  it("rejects an order that has been refunded to the customer (clawback safety)", async () => {
    getCommerceOrderByStripeSessionId.mockResolvedValue({
      ...unpaidOrder,
      refundedAt: "2026-07-14T09:00:00.000Z",
    });
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");
    expect(res).toEqual({
      success: false,
      error: "Order was refunded to the customer — nothing is owed to the client",
    });
    expect(markCommerceOrderPaidOut).not.toHaveBeenCalled();
  });

  it("reports the ACTUAL reason (refund) when a refund lands in the race window between read and write", async () => {
    // The action's own read sees a clean order (no refundedAt/disputedAt), so
    // the pre-write guards above pass — but markCommerceOrderPaidOut's own
    // atomic re-check finds the order was refunded a moment later (an
    // independent Stripe webhook) and returns false without writing. The
    // action re-fetches to report the real current state rather than a
    // generic guess.
    getCommerceOrderByStripeSessionId
      .mockReset()
      .mockResolvedValueOnce(unpaidOrder)
      .mockResolvedValueOnce({
        ...unpaidOrder,
        refundedAt: "2026-07-14T09:05:00.000Z",
      });
    markCommerceOrderPaidOut.mockResolvedValue(false);
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");

    expect(res).toEqual({
      success: false,
      error: "Order was refunded to the customer — nothing is owed to the client",
    });
    expect(markCommerceOrderPaidOut).toHaveBeenCalledOnce();
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledTimes(2);
    // Revalidate anyway — the underlying order state genuinely changed
    // (the refund that caused the false return), so the dashboard
    // should reflect it rather than keep showing stale "owed" state.
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("reports the ACTUAL reason (dispute) when a dispute lands in the race window between read and write", async () => {
    getCommerceOrderByStripeSessionId
      .mockReset()
      .mockResolvedValueOnce(unpaidOrder)
      .mockResolvedValueOnce({
        ...unpaidOrder,
        disputedAt: "2026-07-14T09:05:00.000Z",
      });
    markCommerceOrderPaidOut.mockResolvedValue(false);
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");

    expect(res).toEqual({
      success: false,
      error: "Order is disputed with Stripe — nothing is owed to the client",
    });
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledTimes(2);
  });

  it("reports 'already paid out' — not refund/dispute — when a concurrent duplicate click (two tabs) wins the race", async () => {
    // Neither refundedAt nor disputedAt is set on re-fetch — the OTHER call's
    // own markCommerceOrderPaidOut succeeded first and set paidOutAt, so this
    // call's atomic guard fails on the paidOutAt clause, not refund/dispute.
    // Before this fix, the action reported a false "refunded or disputed"
    // message for this exact case.
    getCommerceOrderByStripeSessionId
      .mockReset()
      .mockResolvedValueOnce(unpaidOrder)
      .mockResolvedValueOnce({
        ...unpaidOrder,
        paidOutAt: "2026-07-14T09:05:00.000Z",
      });
    markCommerceOrderPaidOut.mockResolvedValue(false);
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");

    expect(res).toEqual({
      success: false,
      error:
        "This order was already marked paid out (likely from another tab or a duplicate click) — no action needed",
    });
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledTimes(2);
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("falls back to the generic race message when the re-fetch is inconclusive (e.g. order vanished)", async () => {
    getCommerceOrderByStripeSessionId
      .mockReset()
      .mockResolvedValueOnce(unpaidOrder)
      .mockResolvedValueOnce(null);
    markCommerceOrderPaidOut.mockResolvedValue(false);
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");

    expect(res).toEqual({
      success: false,
      error:
        "Order was refunded or disputed after this page loaded — refresh and check its status; nothing was paid out",
    });
  });

  it("persists paidOutAt with COMMERCE_PAID_OUT_CONVEX_PRIMARY and revalidates", async () => {
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");

    expect(res.success).toBe(true);
    if (!res.success) throw new Error("expected success");
    expect(typeof res.paidOutAt).toBe("string");
    expect(Number.isNaN(Date.parse(res.paidOutAt))).toBe(false);

    expect(markCommerceOrderPaidOut).toHaveBeenCalledOnce();
    const [sessionId, paidOutAt, options] = markCommerceOrderPaidOut.mock.calls[0]!;
    expect(sessionId).toBe("cs_test_commerce_paid");
    expect(paidOutAt).toBe(res.paidOutAt);
    expect(options).toEqual({ requireConvex: true });
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
  });

  it("fails closed on ConvexPrimaryWriteError without revalidate", async () => {
    markCommerceOrderPaidOut.mockRejectedValue(
      new MockConvexPrimaryWriteError("mutation failed"),
    );
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");

    expect(res).toEqual({
      success: false,
      error:
        "Could not record payout in the shared store — order still shows as owed. Retry in a moment.",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces unexpected persist errors as action failures", async () => {
    markCommerceOrderPaidOut.mockRejectedValue(new Error("disk full"));
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    const res = await markCommerceOrderPaidOutAction("cs_test_commerce_paid");

    expect(res).toEqual({
      success: false,
      error: "disk full",
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("looks up by stripeSessionId before marking (never a truncated list scan)", async () => {
    const { markCommerceOrderPaidOutAction } = await import("./actions");
    await markCommerceOrderPaidOutAction("cs_test_commerce_paid");
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledWith(
      "cs_test_commerce_paid",
    );
    expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledOnce();
  });
});
