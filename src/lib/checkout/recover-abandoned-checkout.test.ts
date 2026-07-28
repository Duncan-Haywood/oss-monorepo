import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CheckoutSessionRecord } from "./types";

// Mocked (not the real class) so instanceof checks survive vi.resetModules()
// between tests — mirrors checkout-recovery-actions.test.ts's own pattern.
class MockConvexPrimaryWriteError extends Error {
  constructor(message = "Convex primary write failed") {
    super(message);
    this.name = "ConvexPrimaryWriteError";
  }
}
vi.mock("@/lib/payments/convex-primary", () => ({
  ConvexPrimaryWriteError: MockConvexPrimaryWriteError,
}));

/**
 * recoverAbandonedBundleCheckout / recoverAbandonedCommerceCheckout
 * (src/lib/checkout/recover-abandoned-checkout.ts) are the send-and-mark
 * body shared by BOTH triggers: the operator's manual "Send recovery email"
 * dashboard buttons (already covered end to end by
 * checkout-recovery-actions.test.ts) and the automated
 * GET /api/cron/checkout-recovery route (route.test.ts). This suite locks
 * the shared helper's own contract directly — mark-then-send ordering, the
 * CAS race-guard branches, and email delegation — independent of either
 * caller's own auth/rate-limit/session-lookup gating.
 */

const getLeadBySlug = vi.fn();
const listOpenCheckoutSessions = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const getCommerceCatalog = vi.fn();
const recordCheckoutRecoverySent = vi.fn();

vi.mock("@/lib/db", () => ({
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  listOpenCheckoutSessions: (...args: unknown[]) => listOpenCheckoutSessions(...args),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  recordCheckoutRecoverySent: (...args: unknown[]) => recordCheckoutRecoverySent(...args),
}));

const sendCheckoutAbandonedRecovery = vi.fn();
const sendCommerceAbandonedRecovery = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendCheckoutAbandonedRecovery: (...args: unknown[]) => sendCheckoutAbandonedRecovery(...args),
  sendCommerceAbandonedRecovery: (...args: unknown[]) => sendCommerceAbandonedRecovery(...args),
}));

function bundleSession(overrides: Partial<CheckoutSessionRecord> = {}): CheckoutSessionRecord {
  return {
    stripeSessionId: "cs_bundle_1",
    leadSlug: "demo-cafe",
    tier: "starter",
    commerceAddon: false,
    customerEmail: "buyer@example.com",
    status: "open",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

function commerceSession(overrides: Partial<CheckoutSessionRecord> = {}): CheckoutSessionRecord {
  return {
    stripeSessionId: "cs_commerce_1",
    leadSlug: "demo-cafe",
    tier: "",
    kind: "commerce_sku",
    skuId: "sku_1",
    commerceAddon: true,
    customerEmail: "shopper@example.com",
    status: "open",
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(),
    ...overrides,
  };
}

describe("recoverAbandonedBundleCheckout", () => {
  beforeEach(() => {
    vi.resetModules();
    getLeadBySlug.mockReset().mockResolvedValue({ slug: "demo-cafe", businessName: "Demo Cafe", email: null });
    listOpenCheckoutSessions.mockReset().mockResolvedValue([]);
    recordCheckoutRecoverySent.mockReset().mockResolvedValue(true);
    sendCheckoutAbandonedRecovery.mockReset().mockResolvedValue({ success: true, mock: true });
  });

  it("marks then sends, using session.customerEmail over lead.email", async () => {
    const { recoverAbandonedBundleCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedBundleCheckout(bundleSession());
    expect(result).toEqual({ success: true, mock: true });
    expect(recordCheckoutRecoverySent).toHaveBeenCalledWith(
      "cs_bundle_1",
      expect.any(String),
      0,
      expect.anything(),
    );
    expect(sendCheckoutAbandonedRecovery).toHaveBeenCalledWith(
      "buyer@example.com",
      "Demo Cafe",
      "demo-cafe",
      "starter",
      1,
    );
  });

  it("falls back to lead.email when the session has no customerEmail", async () => {
    getLeadBySlug.mockResolvedValue({ slug: "demo-cafe", businessName: "Demo Cafe", email: "lead@example.com" });
    const { recoverAbandonedBundleCheckout } = await import("./recover-abandoned-checkout");
    await recoverAbandonedBundleCheckout(bundleSession({ customerEmail: undefined }));
    expect(sendCheckoutAbandonedRecovery).toHaveBeenCalledWith(
      "lead@example.com",
      "Demo Cafe",
      "demo-cafe",
      "starter",
      1,
    );
  });

  it("fails without sending when there is no email anywhere", async () => {
    getLeadBySlug.mockResolvedValue({ slug: "demo-cafe", businessName: "Demo Cafe", email: null });
    const { recoverAbandonedBundleCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedBundleCheckout(bundleSession({ customerEmail: undefined }));
    expect(result).toEqual({ success: false, error: "No email on file for this checkout session" });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("fails closed on a ConvexPrimaryWriteError without sending", async () => {
    recordCheckoutRecoverySent.mockRejectedValue(new MockConvexPrimaryWriteError());
    const { recoverAbandonedBundleCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedBundleCheckout(bundleSession());
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("Could not record recovery send");
    expect(sendCheckoutAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("reports a duplicate-send race when a concurrent call already recorded a send", async () => {
    recordCheckoutRecoverySent.mockResolvedValue(false);
    listOpenCheckoutSessions.mockResolvedValue([bundleSession({ recoverySentCount: 1 })]);
    const { recoverAbandonedBundleCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedBundleCheckout(bundleSession());
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("already sent");
    expect(sendCheckoutAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("reports the session-completed race when a concurrent payment landed", async () => {
    recordCheckoutRecoverySent.mockResolvedValue(false);
    listOpenCheckoutSessions.mockResolvedValue([]);
    const { recoverAbandonedBundleCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedBundleCheckout(bundleSession());
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("completed after this page loaded");
  });

  it("surfaces a suppressed send outcome after the mark already applied", async () => {
    sendCheckoutAbandonedRecovery.mockResolvedValue({ success: false, reason: "suppressed" });
    const { recoverAbandonedBundleCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedBundleCheckout(bundleSession());
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("suppression list");
  });
});

describe("recoverAbandonedCommerceCheckout", () => {
  beforeEach(() => {
    vi.resetModules();
    getLeadBySlug.mockReset().mockResolvedValue({
      slug: "demo-cafe",
      businessName: "Demo Cafe",
      stage: "paid",
    });
    listOrdersByLeadSlug.mockReset().mockResolvedValue([
      { leadSlug: "demo-cafe", commerceAddon: true, tier: "growth", recurringCanceledAt: null },
    ]);
    getCommerceCatalog.mockReset().mockResolvedValue({
      items: [{ id: "sku_1", name: "Cold brew 12oz" }],
    });
    listOpenCheckoutSessions.mockReset().mockResolvedValue([]);
    recordCheckoutRecoverySent.mockReset().mockResolvedValue(true);
    sendCommerceAbandonedRecovery.mockReset().mockResolvedValue({ success: true, mock: true });
  });

  it("marks then sends with the resolved SKU name", async () => {
    const { recoverAbandonedCommerceCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedCommerceCheckout(commerceSession());
    expect(result).toEqual({ success: true, mock: true });
    expect(sendCommerceAbandonedRecovery).toHaveBeenCalledWith(
      "shopper@example.com",
      "Demo Cafe",
      "demo-cafe",
      "Cold brew 12oz",
      1,
    );
  });

  it("fails without sending when the session has no customerEmail", async () => {
    const { recoverAbandonedCommerceCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedCommerceCheckout(commerceSession({ customerEmail: undefined }));
    expect(result).toEqual({
      success: false,
      error: "No customer email on this Buy now session — recovery needs the shopper's email",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("fails when the lead no longer exists", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { recoverAbandonedCommerceCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedCommerceCheckout(commerceSession());
    expect(result).toEqual({ success: false, error: "Lead not found for this Buy now session" });
  });

  it("fails closed when Commerce entitlement is no longer active (paused/canceled)", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      { leadSlug: "demo-cafe", commerceAddon: true, tier: "growth", recurringCanceledAt: Date.now() },
    ]);
    const { recoverAbandonedCommerceCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedCommerceCheckout(commerceSession());
    expect(result).toEqual({
      success: false,
      error: "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("falls back to the raw skuId when the catalog no longer has that item", async () => {
    getCommerceCatalog.mockResolvedValue({ items: [] });
    const { recoverAbandonedCommerceCheckout } = await import("./recover-abandoned-checkout");
    await recoverAbandonedCommerceCheckout(commerceSession());
    expect(sendCommerceAbandonedRecovery).toHaveBeenCalledWith(
      "shopper@example.com",
      "Demo Cafe",
      "demo-cafe",
      "sku_1",
      1,
    );
  });

  it("reports a duplicate-send race when a concurrent call already recorded a send", async () => {
    recordCheckoutRecoverySent.mockResolvedValue(false);
    listOpenCheckoutSessions.mockResolvedValue([commerceSession({ recoverySentCount: 1 })]);
    const { recoverAbandonedCommerceCheckout } = await import("./recover-abandoned-checkout");
    const result = await recoverAbandonedCommerceCheckout(commerceSession());
    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("already sent");
  });
});
