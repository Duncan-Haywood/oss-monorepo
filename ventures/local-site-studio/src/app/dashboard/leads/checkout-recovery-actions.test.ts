import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH } from "@/lib/billing/checkout-session-id";

/**
 * Action-level orchestration for abandoned-checkout recovery:
 * sendCheckoutRecoveryAction (bundle) + sendCommerceCheckoutRecoveryAction
 * (Buy now). session-persist + abandoned-recovery helper suites are not
 * enough — they do not lock auth, kind mismatch, missing email, over-long
 * session id, persist-then-notify (mark before Resend), or
 * ConvexPrimaryWriteError skip-send.
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

const listOpenCheckoutSessions = vi.fn();
const getLeadBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const recordCheckoutRecoverySent = vi.fn();
const getCommerceCatalog = vi.fn();

vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: (...args: unknown[]) => listOpenCheckoutSessions(...args),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  recordCheckoutRecoverySent: (...args: unknown[]) =>
    recordCheckoutRecoverySent(...args),
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
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
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderPaidOut: vi.fn(),
  upsertClientVoicePack: vi.fn(),
  getClientVoicePackByLeadSlug: vi.fn(),
  listClientVoicePacks: vi.fn(),
  listUnpaidCommerceOrders: vi.fn(),
}));

const sendCheckoutAbandonedRecovery = vi.fn();
const sendCommerceAbandonedRecovery = vi.fn();

vi.mock("@/lib/email/resend", () => ({
  sendCheckoutAbandonedRecovery: (...args: unknown[]) =>
    sendCheckoutAbandonedRecovery(...args),
  sendCommerceAbandonedRecovery: (...args: unknown[]) =>
    sendCommerceAbandonedRecovery(...args),
  sendOutreachEmail: vi.fn(),
  sendOutreachFollowUp2: vi.fn(),
  sendOutreachFollowUp3: vi.fn(),
  sendInquiryReply: vi.fn(),
  sendOperatorDailyDigest: vi.fn(),
  sendStarterUpsellEmail: vi.fn(),
  sendMarketingPackToClientEmail: vi.fn(),
  sendClientVoicePackToClientEmail: vi.fn(),
}));

vi.mock("@/lib/checkout/session-persist", () => ({
  CHECKOUT_RECOVERY_SENT_CONVEX_PRIMARY: { requireConvex: true },
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

const bundleSession = {
  stripeSessionId: "cs_test_bundle",
  leadSlug: "demo-cafe",
  tier: "growth",
  status: "open" as const,
  kind: "bundle" as const,
  customerEmail: "buyer@example.com",
  createdAt: "2026-07-13T10:00:00.000Z",
  recoverySentAt: null,
};

const commerceSession = {
  stripeSessionId: "cs_test_commerce",
  leadSlug: "demo-cafe",
  tier: null,
  status: "open" as const,
  kind: "commerce_sku" as const,
  skuId: "sku_latte",
  customerEmail: "shopper@example.com",
  createdAt: "2026-07-13T10:00:00.000Z",
  recoverySentAt: null,
};

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

describe("sendCheckoutRecoveryAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    listOpenCheckoutSessions.mockReset().mockResolvedValue([bundleSession]);
    getLeadBySlug.mockReset().mockResolvedValue({
      slug: "demo-cafe",
      businessName: "Demo Cafe",
      email: "lead@example.com",
    });
    recordCheckoutRecoverySent.mockReset().mockResolvedValue(true);
    sendCheckoutAbandonedRecovery.mockReset().mockResolvedValue({
      success: true,
      mock: false,
    });
    sendCommerceAbandonedRecovery.mockReset();
    getCommerceCatalog.mockReset();
  });

  it("returns auth error without listing sessions", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
    expect(sendCheckoutAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("surfaces unexpected Error messages from the session list and reports it via captureError", async () => {
    listOpenCheckoutSessions.mockRejectedValue(new Error("db offline"));
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "sendCheckoutRecoveryAction",
    });
  });

  it("rate-limits repeated recovery sends from the same IP (auth alone is not a throttle)", async () => {
    const { sendCheckoutRecoveryAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await sendCheckoutRecoveryAction("cs_test_bundle");
      expect(res.success).toBe(true);
    }
    listOpenCheckoutSessions.mockClear();
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
  });

  it("rejects an empty session id", async () => {
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("");
    expect(res).toEqual({
      success: false,
      error: "Checkout session id is required",
    });
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
  });

  it("hard-rejects an over-long session id before listing sessions", async () => {
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction(over);
    expect(res).toEqual({
      success: false,
      error: "Checkout session id is too long",
    });
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("rejects a missing / already-completed session", async () => {
    listOpenCheckoutSessions.mockResolvedValue([]);
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_missing");
    expect(res).toEqual({
      success: false,
      error: "Checkout session not found or already completed",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("rejects commerce_sku sessions (kind mismatch)", async () => {
    listOpenCheckoutSessions.mockResolvedValue([commerceSession]);
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error: "Use Send Buy now recovery for commerce catalog carts",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
    expect(sendCheckoutAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("rejects when neither session nor lead has an email", async () => {
    listOpenCheckoutSessions.mockResolvedValue([
      { ...bundleSession, customerEmail: null },
    ]);
    getLeadBySlug.mockResolvedValue({
      slug: "demo-cafe",
      businessName: "Demo Cafe",
      email: null,
    });
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({
      success: false,
      error: "No email on file for this checkout session",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("marks recoverySentAt before Resend and revalidates on success", async () => {
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({ success: true, mock: false });
    expect(recordCheckoutRecoverySent).toHaveBeenCalledWith(
      "cs_test_bundle",
      expect.any(String),
      0,
      { requireConvex: true },
    );
    expect(sendCheckoutAbandonedRecovery).toHaveBeenCalledWith(
      "buyer@example.com",
      "Demo Cafe",
      "demo-cafe",
      "growth",
      1,
      undefined,
    );
    expect(revalidatePath).toHaveBeenCalledWith("/dashboard/leads");
    const markOrder = recordCheckoutRecoverySent.mock.invocationCallOrder[0]!;
    const sendOrder = sendCheckoutAbandonedRecovery.mock.invocationCallOrder[0]!;
    expect(markOrder).toBeLessThan(sendOrder);
  });

  it("passes an escalated nudge number (recoverySentCount + 1) into sendCheckoutAbandonedRecovery on a repeat send (recovery-email-escalating-cadence)", async () => {
    listOpenCheckoutSessions.mockResolvedValue([
      { ...bundleSession, recoverySentAt: "2026-07-13T12:00:00.000Z", recoverySentCount: 2 },
    ]);
    const { sendCheckoutRecoveryAction } = await import("./actions");
    await sendCheckoutRecoveryAction("cs_test_bundle");
    // The pre-write snapshot's own recoverySentCount (2) is what gets passed
    // through as the CAS guard's expected value — a legitimate re-nudge
    // still succeeds and still escalates the copy tier.
    expect(recordCheckoutRecoverySent).toHaveBeenCalledWith(
      "cs_test_bundle",
      expect.any(String),
      2,
      { requireConvex: true },
    );
    expect(sendCheckoutAbandonedRecovery).toHaveBeenCalledWith(
      "buyer@example.com",
      "Demo Cafe",
      "demo-cafe",
      "growth",
      3,
      undefined,
    );
  });

  it("skips Resend when Convex primary mark fails", async () => {
    recordCheckoutRecoverySent.mockRejectedValue(
      new MockConvexPrimaryWriteError(),
    );
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/shared store/);
    }
    expect(sendCheckoutAbandonedRecovery).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("surfaces send failure after a durable mark (no re-queue)", async () => {
    sendCheckoutAbandonedRecovery.mockResolvedValue({
      success: false,
      reason: "suppressed",
    });
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/suppression list/);
      expect(res.error).toMatch(/already marked recovered/);
    }
    expect(recordCheckoutRecoverySent).toHaveBeenCalled();
  });

  it("skips the send when the session completed (real payment) after the listOpen snapshot but before the mark", async () => {
    recordCheckoutRecoverySent.mockResolvedValue(false);
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({
      success: false,
      error:
        "Checkout session was completed after this page loaded — refresh; recovery email was not sent",
    });
    expect(sendCheckoutAbandonedRecovery).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("reports a duplicate-send race instead of a false 'session completed' message when a concurrent call already recorded its own send (checkout-recovery-send-race-guard)", async () => {
    // First read (the gating snapshot) shows no prior send; the mark then
    // fails (simulating a second tab's concurrent call winning the CAS
    // write first); the re-fetch inside the action shows the session is
    // still open but its recoverySentCount has already moved forward —
    // proof this was a duplicate-send race, not a completed payment.
    listOpenCheckoutSessions
      .mockResolvedValueOnce([bundleSession])
      .mockResolvedValueOnce([
        { ...bundleSession, recoverySentAt: "2026-07-13T12:00:00.000Z", recoverySentCount: 1 },
      ]);
    recordCheckoutRecoverySent.mockResolvedValue(false);
    const { sendCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({
      success: false,
      error:
        "A recovery email was already sent for this session moments ago (likely from another tab or a duplicate click) — skipped duplicate send",
    });
    expect(listOpenCheckoutSessions).toHaveBeenCalledTimes(2);
    expect(sendCheckoutAbandonedRecovery).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("sendCommerceCheckoutRecoveryAction", () => {
  beforeEach(() => {
    captureError.mockReset().mockResolvedValue(undefined);
    vi.resetModules();
    requireOperatorAuth.mockReset().mockResolvedValue({ ok: true });
    headersMock.mockReset().mockResolvedValue(headerStore());
    revalidatePath.mockReset();
    listOpenCheckoutSessions.mockReset().mockResolvedValue([commerceSession]);
    getLeadBySlug.mockReset().mockResolvedValue({
      slug: "demo-cafe",
      businessName: "Demo Cafe",
      email: "lead@example.com",
      stage: "paid",
    });
    listOrdersByLeadSlug.mockReset().mockResolvedValue([
      { leadSlug: "demo-cafe", commerceAddon: true },
    ]);
    getCommerceCatalog.mockReset().mockResolvedValue({
      leadSlug: "demo-cafe",
      items: [{ id: "sku_latte", name: "Latte" }],
    });
    recordCheckoutRecoverySent.mockReset().mockResolvedValue(true);
    sendCommerceAbandonedRecovery.mockReset().mockResolvedValue({
      success: true,
      mock: false,
    });
    sendCheckoutAbandonedRecovery.mockReset();
  });

  it("surfaces unexpected Error messages from the session list and reports it via captureError", async () => {
    listOpenCheckoutSessions.mockRejectedValue(new Error("db offline"));
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error: "db offline",
    });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "dashboard-leads-actions",
      failureKind: "sendCommerceCheckoutRecoveryAction",
    });
  });

  it("returns auth error without listing sessions", async () => {
    requireOperatorAuth.mockResolvedValue({
      ok: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error: "Unauthorized — sign in at /dashboard/login",
    });
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
  });

  it("rate-limits repeated recovery sends from the same IP (auth alone is not a throttle)", async () => {
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    // DEFAULT_RATE_LIMIT is 20 requests/60s per key — exhaust the window.
    for (let i = 0; i < 20; i++) {
      const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
      expect(res.success).toBe(true);
    }
    listOpenCheckoutSessions.mockClear();
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error: "Too many requests — please try again shortly.",
    });
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
  });

  it("hard-rejects an over-long session id before listing sessions", async () => {
    const over = `cs_test_${"a".repeat(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH)}`;
    expect(over.length).toBeGreaterThan(MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction(over);
    expect(res).toEqual({
      success: false,
      error: "Checkout session id is too long",
    });
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("rejects bundle sessions (kind mismatch)", async () => {
    listOpenCheckoutSessions.mockResolvedValue([bundleSession]);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_bundle");
    expect(res).toEqual({
      success: false,
      error: "Use Send recovery email for Local Site Studio plan checkouts",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
    expect(sendCommerceAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("rejects when shopper email is missing", async () => {
    listOpenCheckoutSessions.mockResolvedValue([
      { ...commerceSession, customerEmail: null },
    ]);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error:
        "No customer email on this Buy now session — recovery needs the shopper's email",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
  });

  it("rejects when lead is missing", async () => {
    getLeadBySlug.mockResolvedValue(null);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error: "Lead not found for this Buy now session",
    });
    expect(listOrdersByLeadSlug).not.toHaveBeenCalled();
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
    expect(sendCommerceAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("rejects when Commerce recurring entitlement is paused", async () => {
    listOrdersByLeadSlug.mockResolvedValue([
      {
        leadSlug: "demo-cafe",
        commerceAddon: true,
        recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z"),
      },
    ]);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error:
        "Commerce catalogs require a paid/live lead with a Commerce add-on order",
    });
    expect(recordCheckoutRecoverySent).not.toHaveBeenCalled();
    expect(sendCommerceAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("marks before Resend with SKU name from catalog", async () => {
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({ success: true, mock: false });
    expect(recordCheckoutRecoverySent).toHaveBeenCalledWith(
      "cs_test_commerce",
      expect.any(String),
      0,
      { requireConvex: true },
    );
    expect(sendCommerceAbandonedRecovery).toHaveBeenCalledWith(
      "shopper@example.com",
      "Demo Cafe",
      "demo-cafe",
      "Latte",
      1,
    );
    const markOrder = recordCheckoutRecoverySent.mock.invocationCallOrder[0]!;
    const sendOrder = sendCommerceAbandonedRecovery.mock.invocationCallOrder[0]!;
    expect(markOrder).toBeLessThan(sendOrder);
  });

  it("passes an escalated nudge number (recoverySentCount + 1) into sendCommerceAbandonedRecovery on a repeat send (recovery-email-escalating-cadence)", async () => {
    listOpenCheckoutSessions.mockResolvedValue([
      { ...commerceSession, recoverySentAt: "2026-07-13T12:00:00.000Z", recoverySentCount: 1 },
    ]);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(recordCheckoutRecoverySent).toHaveBeenCalledWith(
      "cs_test_commerce",
      expect.any(String),
      1,
      { requireConvex: true },
    );
    expect(sendCommerceAbandonedRecovery).toHaveBeenCalledWith(
      "shopper@example.com",
      "Demo Cafe",
      "demo-cafe",
      "Latte",
      2,
    );
  });

  it("skips Resend when Convex primary mark fails", async () => {
    recordCheckoutRecoverySent.mockRejectedValue(
      new MockConvexPrimaryWriteError(),
    );
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error).toMatch(/shared store/);
    }
    expect(sendCommerceAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("skips the send when the shopper's cart completed (real payment) after the listOpen snapshot but before the mark", async () => {
    recordCheckoutRecoverySent.mockResolvedValue(false);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error:
        "Checkout session was completed after this page loaded — refresh; recovery email was not sent",
    });
    expect(sendCommerceAbandonedRecovery).not.toHaveBeenCalled();
  });

  it("reports a duplicate-send race instead of a false 'session completed' message when a concurrent call already recorded its own send (checkout-recovery-send-race-guard)", async () => {
    listOpenCheckoutSessions
      .mockResolvedValueOnce([commerceSession])
      .mockResolvedValueOnce([
        { ...commerceSession, recoverySentAt: "2026-07-13T12:00:00.000Z", recoverySentCount: 1 },
      ]);
    recordCheckoutRecoverySent.mockResolvedValue(false);
    const { sendCommerceCheckoutRecoveryAction } = await import("./actions");
    const res = await sendCommerceCheckoutRecoveryAction("cs_test_commerce");
    expect(res).toEqual({
      success: false,
      error:
        "A recovery email was already sent for this session moments ago (likely from another tab or a duplicate click) — skipped duplicate send",
    });
    expect(listOpenCheckoutSessions).toHaveBeenCalledTimes(2);
    expect(sendCommerceAbandonedRecovery).not.toHaveBeenCalled();
  });
});
