import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetRateLimiterForTests } from "@/lib/security/rate-limit";
import type { CheckoutSessionRecord } from "@/lib/checkout/types";

/**
 * GET /api/cron/checkout-recovery — the automated trigger for
 * abandoned-checkout recovery emails (see checkout-recovery-cron-automation
 * in BUSINESS_DECISIONS). Locks: CRON_SECRET bearer-auth gate (shared with
 * the daily-digest cron via src/lib/security/cron-secret.ts), per-IP rate
 * limiting after auth, the bundle/commerce due-queue split, and
 * per-session success/failure aggregation — the actual mark-then-send body
 * is already covered directly by recover-abandoned-checkout.test.ts.
 */

const recoverAbandonedBundleCheckout = vi.fn();
const recoverAbandonedCommerceCheckout = vi.fn();
vi.mock("@/lib/checkout/recover-abandoned-checkout", () => ({
  recoverAbandonedBundleCheckout: (...args: unknown[]) => recoverAbandonedBundleCheckout(...args),
  recoverAbandonedCommerceCheckout: (...args: unknown[]) => recoverAbandonedCommerceCheckout(...args),
}));

const listOpenCheckoutSessions = vi.fn();
const getLeads = vi.fn();
const listOrders = vi.fn();
const recordCronRunOutcome = vi.fn();
vi.mock("@/lib/db", () => ({
  listOpenCheckoutSessions: (...args: unknown[]) => listOpenCheckoutSessions(...args),
  getLeads: (...args: unknown[]) => getLeads(...args),
  listOrders: (...args: unknown[]) => listOrders(...args),
  recordCronRunOutcome: (...args: unknown[]) => recordCronRunOutcome(...args),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

function cronRequest(options?: { bearer?: string; ip?: string }) {
  const headers: Record<string, string> = { "x-forwarded-for": options?.ip ?? "203.0.113.9" };
  if (options?.bearer !== undefined) {
    headers.authorization = `Bearer ${options.bearer}`;
  }
  return new Request("http://localhost/api/cron/checkout-recovery", { headers });
}

const OLD_ISO = new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString();

function bundleDueSession(overrides: Partial<CheckoutSessionRecord> = {}): CheckoutSessionRecord {
  return {
    stripeSessionId: "cs_bundle_1",
    leadSlug: "demo-cafe",
    tier: "starter",
    commerceAddon: false,
    status: "open",
    createdAt: OLD_ISO,
    ...overrides,
  };
}

function commerceDueSession(overrides: Partial<CheckoutSessionRecord> = {}): CheckoutSessionRecord {
  return {
    stripeSessionId: "cs_commerce_1",
    leadSlug: "demo-cafe",
    tier: "",
    kind: "commerce_sku",
    skuId: "sku_1",
    commerceAddon: true,
    customerEmail: "shopper@example.com",
    status: "open",
    createdAt: OLD_ISO,
    ...overrides,
  };
}

describe("GET /api/cron/checkout-recovery", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    resetRateLimiterForTests();
    process.env = { ...originalEnv };
    process.env.CRON_SECRET = "test-cron-secret-value";
    listOpenCheckoutSessions.mockReset().mockResolvedValue([]);
    getLeads.mockReset().mockResolvedValue([]);
    listOrders.mockReset().mockResolvedValue([]);
    recoverAbandonedBundleCheckout.mockReset().mockResolvedValue({ success: true, mock: true });
    recoverAbandonedCommerceCheckout.mockReset().mockResolvedValue({ success: true, mock: true });
    captureError.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns 501 and never reads sessions when CRON_SECRET is unset", async () => {
    delete process.env.CRON_SECRET;
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "anything" }));
    expect(response.status).toBe(501);
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
  });

  it("returns 401 with no Authorization header", async () => {
    const { GET } = await import("./route");
    const response = await GET(cronRequest());
    expect(response.status).toBe(401);
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
  });

  it("returns 401 for a same-length wrong bearer token", async () => {
    const wrongSameLength = "x".repeat(process.env.CRON_SECRET!.length);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: wrongSameLength }));
    expect(response.status).toBe(401);
  });

  it("returns 200 with nothing attempted when no session is due", async () => {
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, attempted: 0, sent: 0, failed: 0, failures: [] });
    expect(recoverAbandonedBundleCheckout).not.toHaveBeenCalled();
    expect(recoverAbandonedCommerceCheckout).not.toHaveBeenCalled();
    expect(recordCronRunOutcome).toHaveBeenCalledWith(
      "checkout-recovery",
      expect.objectContaining({ success: true, atIso: expect.any(String) }),
    );
  });

  it("recovers a due bundle session via the shared helper", async () => {
    listOpenCheckoutSessions.mockResolvedValue([bundleDueSession()]);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, attempted: 1, sent: 1, failed: 0, failures: [] });
    expect(recoverAbandonedBundleCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSessionId: "cs_bundle_1" }),
    );
    expect(recoverAbandonedCommerceCheckout).not.toHaveBeenCalled();
  });

  it("recovers a due Commerce cart for an eligible lead via the shared helper", async () => {
    listOpenCheckoutSessions.mockResolvedValue([commerceDueSession()]);
    getLeads.mockResolvedValue([{ slug: "demo-cafe", stage: "paid" }]);
    listOrders.mockResolvedValue([
      { leadSlug: "demo-cafe", commerceAddon: true, tier: "growth", recurringCanceledAt: null },
    ]);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({ success: true, attempted: 1, sent: 1, failed: 0, failures: [] });
    expect(recoverAbandonedCommerceCheckout).toHaveBeenCalledWith(
      expect.objectContaining({ stripeSessionId: "cs_commerce_1" }),
    );
  });

  it("excludes a Commerce cart for a lead whose Commerce entitlement is paused/canceled", async () => {
    listOpenCheckoutSessions.mockResolvedValue([commerceDueSession()]);
    getLeads.mockResolvedValue([{ slug: "demo-cafe", stage: "paid" }]);
    listOrders.mockResolvedValue([
      { leadSlug: "demo-cafe", commerceAddon: true, tier: "growth", recurringCanceledAt: Date.now() },
    ]);
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    const body = await response.json();
    expect(body).toEqual({ success: true, attempted: 0, sent: 0, failed: 0, failures: [] });
    expect(recoverAbandonedCommerceCheckout).not.toHaveBeenCalled();
  });

  it("aggregates a per-session failure without aborting the batch, and captures it", async () => {
    listOpenCheckoutSessions.mockResolvedValue([bundleDueSession(), bundleDueSession({ stripeSessionId: "cs_bundle_2" })]);
    recoverAbandonedBundleCheckout
      .mockResolvedValueOnce({ success: false, error: "No email on file for this checkout session" })
      .mockResolvedValueOnce({ success: true, mock: true });
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      success: true,
      attempted: 2,
      sent: 1,
      failed: 1,
      failures: [{ stripeSessionId: "cs_bundle_1", error: "No email on file for this checkout session" }],
    });
    expect(recoverAbandonedBundleCheckout).toHaveBeenCalledTimes(2);
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
      component: "cron-checkout-recovery",
      failures: [{ stripeSessionId: "cs_bundle_1", error: "No email on file for this checkout session" }],
    });
    expect(recordCronRunOutcome).toHaveBeenCalledWith(
      "checkout-recovery",
      expect.objectContaining({
        success: false,
        error: "1 of 2 recovery sends failed",
      }),
    );
  });

  it("records run health as failed when every attempted send fails, even though the HTTP response is still 200", async () => {
    listOpenCheckoutSessions.mockResolvedValue([bundleDueSession(), bundleDueSession({ stripeSessionId: "cs_bundle_2" })]);
    recoverAbandonedBundleCheckout.mockResolvedValue({ success: false, error: "Resend API key revoked" });
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.failed).toBe(2);
    expect(recordCronRunOutcome).toHaveBeenCalledWith(
      "checkout-recovery",
      expect.objectContaining({
        success: false,
        error: "2 of 2 recovery sends failed",
      }),
    );
  });

  it("returns 500 and captures the error when a ledger read throws", async () => {
    listOpenCheckoutSessions.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body).toEqual({ success: false, error: "db unavailable" });
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), { component: "cron-checkout-recovery" });
    expect(recordCronRunOutcome).toHaveBeenCalledWith(
      "checkout-recovery",
      expect.objectContaining({ success: false, error: "db unavailable" }),
    );
  });

  it("rate-limits repeated calls from the same IP after auth succeeds", async () => {
    const { GET } = await import("./route");
    for (let i = 0; i < 5; i++) {
      const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
      expect(response.status).toBe(200);
    }
    listOpenCheckoutSessions.mockClear();
    const response = await GET(cronRequest({ bearer: "test-cron-secret-value" }));
    expect(response.status).toBe(429);
    expect(listOpenCheckoutSessions).not.toHaveBeenCalled();
  });
});
