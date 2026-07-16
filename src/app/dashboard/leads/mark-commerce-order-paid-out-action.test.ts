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
 * (no revalidate), and success revalidate.
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
    revalidatePath.mockReset();
    getCommerceOrderByStripeSessionId.mockReset().mockResolvedValue(unpaidOrder);
    markCommerceOrderPaidOut.mockReset().mockResolvedValue(undefined);
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
