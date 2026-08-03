import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Fulfillment requires collected money, not a finished Checkout flow.
 *
 * `checkout.session.completed` fires when the customer leaves Checkout. For a
 * delayed-notification method (ACH `us_bank_account`, Klarna, Bacs) it arrives
 * with `payment_status: "unpaid"` and settles later — or fails. The handler
 * used to fulfill unconditionally: lead marked paid at full `amount_total`,
 * production handoff enqueued, receipt and DNS go-live instructions emailed,
 * with no `async_payment_failed` case to reverse any of it. Enabling one of
 * those payment methods is a Stripe Dashboard toggle that touches no code, so
 * the guard has to hold whatever the account is set to.
 *
 * route.test.ts covers the settled-card fulfillment orchestration; this file
 * covers only the paid/unpaid decision and the delayed-settlement events.
 */

const constructEvent = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: (...args: unknown[]) => constructEvent(...args) };
  },
}));

const markCheckoutSessionComplete = vi.fn();
const recordLeadPayment = vi.fn();
const getLeadBySlug = vi.fn();
const insertDeployHandoff = vi.fn();
const listDeployHandoffs = vi.fn();
const getDeployHandoffBySlug = vi.fn();
const updateLeadStage = vi.fn();

vi.mock("@/lib/db", () => ({
  markCheckoutSessionComplete: (...args: unknown[]) => markCheckoutSessionComplete(...args),
  recordLeadPayment: (...args: unknown[]) => recordLeadPayment(...args),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  insertDeployHandoff: (...args: unknown[]) => insertDeployHandoff(...args),
  listDeployHandoffs: (...args: unknown[]) => listDeployHandoffs(...args),
  getDeployHandoffBySlug: (...args: unknown[]) => getDeployHandoffBySlug(...args),
  updateLeadStage: (...args: unknown[]) => updateLeadStage(...args),
  getCommerceCatalog: vi.fn(),
  insertClientInquiry: vi.fn(),
  insertCommerceOrder: vi.fn(),
  listCommerceCheckoutInquiriesBySlug: vi.fn(),
  getCommerceOrderByStripeSessionId: vi.fn(),
  markCommerceOrderClientReceiptSent: vi.fn(),
  updateDeployHandoffCustomDomain: vi.fn(),
  updateDeployHandoffStatus: vi.fn(),
  updateDeployHandoffVercelProject: vi.fn(),
}));

const sendEmail = vi.fn();
const sendReceiptEmail = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  sendReceiptEmail: (...args: unknown[]) => sendReceiptEmail(...args),
  sendCommerceBuyNowClientReceipt: vi.fn(),
}));

function bundleSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_ach_1",
    metadata: { slug: "demo-cafe", tier: "growth" },
    customer_details: { email: "owner@demo-cafe.test" },
    customer_email: "owner@demo-cafe.test",
    amount_total: 50000,
    payment_status: "paid",
    customer: null,
    ...overrides,
  };
}

function event(type: string, session: Record<string, unknown>) {
  return { type, data: { object: session } };
}

function webhookRequest() {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "stripe-signature": "sig_test" },
    body: "{}",
  });
}

/** Every durable write and customer-visible send the fulfillment path performs. */
function fulfillmentSideEffects() {
  return [recordLeadPayment, insertDeployHandoff, sendReceiptEmail, sendEmail];
}

describe("webhook payment_status guard", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    constructEvent.mockReset();
    markCheckoutSessionComplete.mockReset().mockResolvedValue(undefined);
    recordLeadPayment.mockReset().mockResolvedValue({ alreadyRecorded: false });
    getLeadBySlug.mockReset().mockResolvedValue(null);
    insertDeployHandoff.mockReset().mockResolvedValue(undefined);
    listDeployHandoffs.mockReset().mockResolvedValue([]);
    getDeployHandoffBySlug.mockReset().mockResolvedValue(null);
    updateLeadStage.mockReset();
    sendEmail.mockReset().mockResolvedValue({ success: true });
    sendReceiptEmail.mockReset().mockResolvedValue({ success: true });

    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
  });

  afterEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  it("does not fulfill an unpaid session, and acknowledges so Stripe stops retrying", async () => {
    constructEvent.mockReturnValue(
      event("checkout.session.completed", bundleSession({ payment_status: "unpaid" })),
    );
    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ fulfilled: false, reason: "payment_pending" });
    for (const effect of fulfillmentSideEffects()) {
      expect(effect, effect.getMockName()).not.toHaveBeenCalled();
    }
  });

  it("emails the customer nothing while the payment is pending", async () => {
    // The specific harm: DNS go-live instructions before money exists.
    constructEvent.mockReturnValue(
      event("checkout.session.completed", bundleSession({ payment_status: "unpaid" })),
    );
    const { POST } = await import("./route");
    await POST(webhookRequest());

    expect(sendEmail).not.toHaveBeenCalled();
    expect(sendReceiptEmail).not.toHaveBeenCalled();
  });

  it("does not record revenue for an unpaid session", async () => {
    constructEvent.mockReturnValue(
      event("checkout.session.completed", bundleSession({ payment_status: "unpaid" })),
    );
    const { POST } = await import("./route");
    await POST(webhookRequest());

    expect(recordLeadPayment).not.toHaveBeenCalled();
  });

  it("treats a missing payment_status as not paid", async () => {
    const withoutStatus: Record<string, unknown> = bundleSession();
    delete withoutStatus.payment_status;
    constructEvent.mockReturnValue(event("checkout.session.completed", withoutStatus));
    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(recordLeadPayment).not.toHaveBeenCalled();
  });

  it("fulfills a paid session, unchanged", async () => {
    constructEvent.mockReturnValue(event("checkout.session.completed", bundleSession()));
    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(recordLeadPayment).toHaveBeenCalled();
  });

  it("fulfills a zero-total session (100% coupon) — no_payment_required is paid", async () => {
    constructEvent.mockReturnValue(
      event(
        "checkout.session.completed",
        bundleSession({ payment_status: "no_payment_required", amount_total: 0 }),
      ),
    );
    const { POST } = await import("./route");
    await POST(webhookRequest());

    expect(recordLeadPayment).toHaveBeenCalled();
  });

  it("fulfills when the delayed payment later settles", async () => {
    // The other half of the guard: refusing the unpaid completed event is only
    // correct if settlement still gets fulfilled. Same session id, so the
    // existing idempotency makes this exactly-once.
    constructEvent.mockReturnValue(
      event(
        "checkout.session.async_payment_succeeded",
        bundleSession({ payment_status: "paid" }),
      ),
    );
    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    expect(recordLeadPayment).toHaveBeenCalled();
    expect(insertDeployHandoff).toHaveBeenCalled();
  });

  it("acknowledges a failed delayed payment without fulfilling anything", async () => {
    constructEvent.mockReturnValue(
      event("checkout.session.async_payment_failed", bundleSession({ payment_status: "unpaid" })),
    );
    const { POST } = await import("./route");
    const response = await POST(webhookRequest());

    expect(response.status).toBe(200);
    for (const effect of fulfillmentSideEffects()) {
      expect(effect, effect.getMockName()).not.toHaveBeenCalled();
    }
  });
});
