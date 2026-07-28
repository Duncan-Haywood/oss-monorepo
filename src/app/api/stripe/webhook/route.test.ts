import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "@/lib/deploy/types";
import { commerceSkuStripeKey } from "@/lib/commerce/stripe-sync";

/**
 * Route-level coverage for the highest money-criticality code in the repo:
 * signature verification, the bundle (Starter/Growth/Complete) fulfillment
 * path, and the Commerce Buy now path, including Stripe redelivery recovery.
 *
 * @/lib/deploy/handoff, @/lib/commerce/{catalog,side-effect-recovery}, and
 * @/lib/payments/bundle-side-effect-recovery stay real (pure decision logic
 * already unit-tested in isolation elsewhere) so this test exercises the
 * actual orchestration in route.ts, not a re-statement of its own mocks.
 * Only @/lib/db (persistence), @/lib/email/resend (network), and the Stripe
 * SDK (signature verification) are stubbed.
 */

const constructEvent = vi.fn();
const listLineItems = vi.fn();
const retrieveSubscription = vi.fn();
const listSubscriptions = vi.fn();
const cancelSubscription = vi.fn();
const listCheckoutSessions = vi.fn();
const retrieveCharge = vi.fn();
const retrievePaymentIntent = vi.fn();
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: (...args: unknown[]) => constructEvent(...args) };
    checkout = {
      sessions: {
        listLineItems: (...args: unknown[]) => listLineItems(...args),
        list: (...args: unknown[]) => listCheckoutSessions(...args),
      },
    };
    subscriptions = {
      retrieve: (...args: unknown[]) => retrieveSubscription(...args),
      list: (...args: unknown[]) => listSubscriptions(...args),
      cancel: (...args: unknown[]) => cancelSubscription(...args),
    };
    charges = {
      retrieve: (...args: unknown[]) => retrieveCharge(...args),
    };
    paymentIntents = {
      retrieve: (...args: unknown[]) => retrievePaymentIntent(...args),
    };
  },
}));

const markCheckoutSessionComplete = vi.fn();
const markCheckoutSessionOpen = vi.fn();
const markCompleteOpenBundleCheckoutSessionsForLead = vi.fn();
const markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer = vi.fn();
const markOrdersRecurringCanceledByCustomer = vi.fn();
const markOrderRecurringCanceledBySessionId = vi.fn();
const clearOrdersRecurringCanceledByCustomer = vi.fn();
const syncOrdersRecurringEntitlementByCustomer = vi.fn();
const recordLeadPayment = vi.fn();
const recordSubscriptionRenewalPayment = vi.fn();
const getLeadBySlug = vi.fn();
const getLeads = vi.fn();
const updateLeadStripeConnectStatus = vi.fn();
const getCommerceCatalog = vi.fn();
const insertClientInquiry = vi.fn();
const insertCommerceOrder = vi.fn();
const listCommerceCheckoutInquiriesBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const getCommerceOrderByStripeSessionId = vi.fn();
const getOrderByStripeSessionId = vi.fn();
const getOrdersByStripeCustomerId = vi.fn();
const recordBillingNoticeSendOutcome = vi.fn();
const markCommerceOrderClientReceiptSent = vi.fn();
const markCommerceOrderRefunded = vi.fn();
const markOrderRefunded = vi.fn();
const clearOrderRefunded = vi.fn();
const clearCommerceOrderRefunded = vi.fn();
const markOrderDisputed = vi.fn();
const clearOrderDisputed = vi.fn();
const markCommerceOrderDisputed = vi.fn();
const clearCommerceOrderDisputed = vi.fn();
const getDeployHandoffBySlug = vi.fn();
const insertDeployHandoff = vi.fn();
const listDeployHandoffs = vi.fn();
const updateDeployHandoffCustomDomain = vi.fn();
const updateDeployHandoffStatus = vi.fn();
const updateDeployHandoffVercelProject = vi.fn();
const updateLeadStage = vi.fn();

/** Eligible Commerce lead fixture — webhook mirrors create-path entitlement. */
const eligibleCommerceLead = {
  businessName: "Demo Cafe",
  email: "owner@demo-cafe.test",
  stage: "paid" as const,
};
const activeCommerceOrders = [{ commerceAddon: true, tier: "growth" }];

vi.mock("@/lib/db", () => ({
  markCheckoutSessionComplete: (...args: unknown[]) => markCheckoutSessionComplete(...args),
  markCheckoutSessionOpen: (...args: unknown[]) => markCheckoutSessionOpen(...args),
  markCompleteOpenBundleCheckoutSessionsForLead: (...args: unknown[]) =>
    markCompleteOpenBundleCheckoutSessionsForLead(...args),
  markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer: (...args: unknown[]) =>
    markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer(...args),
  markOrdersRecurringCanceledByCustomer: (...args: unknown[]) =>
    markOrdersRecurringCanceledByCustomer(...args),
  markOrderRecurringCanceledBySessionId: (...args: unknown[]) =>
    markOrderRecurringCanceledBySessionId(...args),
  clearOrdersRecurringCanceledByCustomer: (...args: unknown[]) =>
    clearOrdersRecurringCanceledByCustomer(...args),
  syncOrdersRecurringEntitlementByCustomer: (...args: unknown[]) =>
    syncOrdersRecurringEntitlementByCustomer(...args),
  recordLeadPayment: (...args: unknown[]) => recordLeadPayment(...args),
  recordSubscriptionRenewalPayment: (...args: unknown[]) =>
    recordSubscriptionRenewalPayment(...args),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getLeads: (...args: unknown[]) => getLeads(...args),
  updateLeadStripeConnectStatus: (...args: unknown[]) => updateLeadStripeConnectStatus(...args),
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  insertClientInquiry: (...args: unknown[]) => insertClientInquiry(...args),
  insertCommerceOrder: (...args: unknown[]) => insertCommerceOrder(...args),
  listCommerceCheckoutInquiriesBySlug: (...args: unknown[]) =>
    listCommerceCheckoutInquiriesBySlug(...args),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  getCommerceOrderByStripeSessionId: (...args: unknown[]) =>
    getCommerceOrderByStripeSessionId(...args),
  getOrderByStripeSessionId: (...args: unknown[]) => getOrderByStripeSessionId(...args),
  getOrdersByStripeCustomerId: (...args: unknown[]) => getOrdersByStripeCustomerId(...args),
  recordBillingNoticeSendOutcome: (...args: unknown[]) => recordBillingNoticeSendOutcome(...args),
  markCommerceOrderClientReceiptSent: (...args: unknown[]) =>
    markCommerceOrderClientReceiptSent(...args),
  markCommerceOrderRefunded: (...args: unknown[]) => markCommerceOrderRefunded(...args),
  markOrderRefunded: (...args: unknown[]) => markOrderRefunded(...args),
  clearOrderRefunded: (...args: unknown[]) => clearOrderRefunded(...args),
  clearCommerceOrderRefunded: (...args: unknown[]) => clearCommerceOrderRefunded(...args),
  markOrderDisputed: (...args: unknown[]) => markOrderDisputed(...args),
  clearOrderDisputed: (...args: unknown[]) => clearOrderDisputed(...args),
  markCommerceOrderDisputed: (...args: unknown[]) => markCommerceOrderDisputed(...args),
  clearCommerceOrderDisputed: (...args: unknown[]) => clearCommerceOrderDisputed(...args),
  getDeployHandoffBySlug: (...args: unknown[]) => getDeployHandoffBySlug(...args),
  insertDeployHandoff: (...args: unknown[]) => insertDeployHandoff(...args),
  listDeployHandoffs: (...args: unknown[]) => listDeployHandoffs(...args),
  updateDeployHandoffCustomDomain: (...args: unknown[]) =>
    updateDeployHandoffCustomDomain(...args),
  updateDeployHandoffStatus: (...args: unknown[]) => updateDeployHandoffStatus(...args),
  updateDeployHandoffVercelProject: (...args: unknown[]) =>
    updateDeployHandoffVercelProject(...args),
  updateLeadStage: (...args: unknown[]) => updateLeadStage(...args),
}));

const sendEmail = vi.fn();
const sendReceiptEmail = vi.fn();
const sendBundleDnsHandoffEmail = vi.fn();
const sendCommerceBuyNowClientReceipt = vi.fn();
const sendPaymentFailedNotice = vi.fn();
const sendPaymentRecoveredNotice = vi.fn();
const sendSubscriptionPausedNotice = vi.fn();
const sendSubscriptionResumedNotice = vi.fn();
const sendSubscriptionCanceledNotice = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  sendReceiptEmail: (...args: unknown[]) => sendReceiptEmail(...args),
  sendBundleDnsHandoffEmail: (...args: unknown[]) => sendBundleDnsHandoffEmail(...args),
  sendCommerceBuyNowClientReceipt: (...args: unknown[]) => sendCommerceBuyNowClientReceipt(...args),
  sendPaymentFailedNotice: (...args: unknown[]) => sendPaymentFailedNotice(...args),
  sendPaymentRecoveredNotice: (...args: unknown[]) => sendPaymentRecoveredNotice(...args),
  sendSubscriptionPausedNotice: (...args: unknown[]) => sendSubscriptionPausedNotice(...args),
  sendSubscriptionResumedNotice: (...args: unknown[]) => sendSubscriptionResumedNotice(...args),
  sendSubscriptionCanceledNotice: (...args: unknown[]) => sendSubscriptionCanceledNotice(...args),
}));

const captureError = vi.fn();
vi.mock("@/lib/observability/error-tracking", () => ({
  captureError: (...args: unknown[]) => captureError(...args),
}));

/** Growth setup ($500) + first month ($99) — matches expectedBundleCheckoutAmountCents. */
const GROWTH_CHECKOUT_AMOUNT_CENTS = 59_900;
/** Growth setup ($500) + first year ($990), annual-billing-option. */
const GROWTH_ANNUAL_CHECKOUT_AMOUNT_CENTS = 149_000;
/** Create-path Growth Price IDs — webhook catalog Price line-item gate requires these. */
const GROWTH_SETUP_PRICE_ID = "price_growth_setup";
const GROWTH_MONTHLY_PRICE_ID = "price_growth_monthly";
const GROWTH_ANNUAL_PRICE_ID = "price_growth_annual";
/** Commerce Buy now catalog Price — webhook requires it on listLineItems. */
const COMMERCE_SKU_PRICE_ID = "price_commerce_sku_1";
/** Complete / Commerce monthly — subscription-items CRM sync. */
const COMPLETE_MONTHLY_PRICE_ID = "price_complete_monthly";
const COMMERCE_MONTHLY_PRICE_ID = "price_commerce_monthly";

function growthLineItems() {
  return {
    data: [
      { price: { id: GROWTH_SETUP_PRICE_ID } },
      { price: { id: GROWTH_MONTHLY_PRICE_ID } },
    ],
  };
}

/** Live Subscription items with a create-path catalog monthly Price. */
function catalogSubscriptionItems(
  ...priceIds: string[]
): { data: Array<{ price: { id: string } }> } {
  return {
    data: priceIds.map((id) => ({ price: { id } })),
  };
}

/**
 * Default matches the default commerceSession() lead/sku pairing
 * (demo-cafe/sku_1) — the webhook now proves a line item's Price by stable
 * metadata key (commerceSkuStripeKey), not by exact id match against the
 * catalog's *current* stripePriceId (commerce-sku-price-resync-metadata-match).
 * Callers using a different leadSlug/skuId (e.g. "sku_latte") must pass a
 * matching metadataKey explicitly; pass metadataKey: null to simulate a
 * foreign/unrelated Price with no local_site_studio_key at all.
 */
function commerceSkuLineItems(
  priceId: string = COMMERCE_SKU_PRICE_ID,
  metadataKey: string | null = commerceSkuStripeKey("demo-cafe", "sku_1"),
  quantity?: number,
) {
  return {
    data: [
      {
        price: {
          id: priceId,
          metadata: metadataKey ? { local_site_studio_key: metadataKey } : {},
        },
        ...(quantity !== undefined ? { quantity } : {}),
      },
    ],
  };
}

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    metadata: {},
    customer_details: { email: null },
    customer_email: null,
    amount_total: GROWTH_CHECKOUT_AMOUNT_CENTS,
    // Create path always charges USD Prices — webhook currency gate requires this.
    currency: "usd",
    // Card settles immediately; unpaid async completed must not fulfill.
    payment_status: "paid",
    customer: null,
    ...overrides,
  };
}

function completedEvent(session: Record<string, unknown>) {
  return { type: "checkout.session.completed", data: { object: session } };
}

function asyncPaymentSucceededEvent(session: Record<string, unknown>) {
  return {
    type: "checkout.session.async_payment_succeeded",
    data: { object: session },
  };
}

function asyncPaymentFailedEvent(session: Record<string, unknown>) {
  return {
    type: "checkout.session.async_payment_failed",
    data: { object: session },
  };
}

function webhookRequest(signature: string | null = "sig_test") {
  const headers: Record<string, string> = {};
  if (signature !== null) headers["stripe-signature"] = signature;
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers,
    body: "{}",
  });
}

function existingHandoff(overrides: Partial<DeployHandoff> = {}): DeployHandoff {
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
    dnsInstructions: [],
    status: "awaiting_dns",
    notes: ["Payment received — production handoff queued."],
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("POST /api/stripe/webhook", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    constructEvent.mockReset();
    // Default: Growth catalog Prices on the session (commerceAddon=false).
    // Bundle webhook requires setup+monthly env Prices ∈ listLineItems.
    listLineItems.mockReset().mockResolvedValue(growthLineItems());
    // Invoice CRM twins retrieve Subscription before clear/mark.
    retrieveSubscription.mockReset().mockResolvedValue({
      id: "sub_default",
      customer: "cus_default",
      status: "past_due",
      pause_collection: null,
    });
    // Default: no other active Subscription found for a superseded Customer
    // — most tests' listOrdersByLeadSlug fixture (activeCommerceOrders) has
    // no stripeCustomerId, so this is never reached, but tests that do
    // reach it default to "nothing to cancel" unless overridden.
    listSubscriptions.mockReset().mockResolvedValue({ data: [] });
    cancelSubscription.mockReset().mockResolvedValue({ status: "canceled" });
    markCheckoutSessionComplete.mockReset().mockResolvedValue(undefined);
    markCheckoutSessionOpen.mockReset().mockResolvedValue(undefined);
    markCompleteOpenBundleCheckoutSessionsForLead.mockReset().mockResolvedValue(0);
    markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer
      .mockReset()
      .mockResolvedValue(0);
    markOrdersRecurringCanceledByCustomer.mockReset().mockResolvedValue(1);
    markOrderRecurringCanceledBySessionId.mockReset().mockResolvedValue(undefined);
    clearOrdersRecurringCanceledByCustomer.mockReset().mockResolvedValue(1);
    syncOrdersRecurringEntitlementByCustomer.mockReset().mockResolvedValue(1);
    recordLeadPayment.mockReset();
    recordSubscriptionRenewalPayment.mockReset().mockResolvedValue({ recorded: true });
    getLeadBySlug.mockReset().mockResolvedValue(null);
    getLeads.mockReset().mockResolvedValue([]);
    updateLeadStripeConnectStatus.mockReset().mockResolvedValue(undefined);
    getCommerceCatalog.mockReset().mockResolvedValue(null);
    insertClientInquiry.mockReset().mockResolvedValue({ id: "inq_1" });
    insertCommerceOrder.mockReset();
    listCommerceCheckoutInquiriesBySlug.mockReset().mockResolvedValue([]);
    listOrdersByLeadSlug.mockReset().mockResolvedValue(activeCommerceOrders);
    getCommerceOrderByStripeSessionId.mockReset().mockResolvedValue(null);
    getOrderByStripeSessionId.mockReset().mockResolvedValue(null);
    getOrdersByStripeCustomerId.mockReset().mockResolvedValue([]);
    recordBillingNoticeSendOutcome.mockReset().mockResolvedValue(undefined);
    markCommerceOrderClientReceiptSent.mockReset().mockResolvedValue(true);
    markCommerceOrderRefunded.mockReset().mockResolvedValue(undefined);
    markOrderRefunded.mockReset().mockResolvedValue(undefined);
    clearOrderRefunded.mockReset().mockResolvedValue(undefined);
    clearCommerceOrderRefunded.mockReset().mockResolvedValue(undefined);
    markOrderDisputed.mockReset().mockResolvedValue(undefined);
    clearOrderDisputed.mockReset().mockResolvedValue(undefined);
    markCommerceOrderDisputed.mockReset().mockResolvedValue(undefined);
    clearCommerceOrderDisputed.mockReset().mockResolvedValue(undefined);
    listCheckoutSessions.mockReset().mockResolvedValue({ data: [] });
    // Default: the re-fetched charge shows zero net refund remaining, so
    // existing refund.updated reversal tests clear as before; individual
    // tests override this to simulate a still-refunded charge (a different,
    // still-successful refund on the same charge).
    retrieveCharge.mockReset().mockResolvedValue({ amount_refunded: 0 });
    // Default: no customer on the retrieved PaymentIntent, so the
    // charge.dispute.created renewal-cycle correlation fallback finds nothing
    // and falls through to the existing "not one of our orders" skip path.
    retrievePaymentIntent.mockReset().mockResolvedValue({ customer: null });
    getDeployHandoffBySlug.mockReset().mockResolvedValue(null);
    insertDeployHandoff.mockReset().mockResolvedValue(undefined);
    listDeployHandoffs.mockReset().mockResolvedValue([]);
    updateDeployHandoffCustomDomain.mockReset();
    updateDeployHandoffStatus.mockReset();
    updateDeployHandoffVercelProject.mockReset();
    updateLeadStage.mockReset();
    sendEmail.mockReset().mockResolvedValue({ success: true });
    sendReceiptEmail.mockReset().mockResolvedValue({ success: true });
    sendBundleDnsHandoffEmail.mockReset().mockResolvedValue({ success: true });
    sendCommerceBuyNowClientReceipt.mockReset().mockResolvedValue({ success: true });
    sendPaymentFailedNotice.mockReset().mockResolvedValue({ success: true });
    sendPaymentRecoveredNotice.mockReset().mockResolvedValue({ success: true });
    sendSubscriptionPausedNotice.mockReset().mockResolvedValue({ success: true });
    sendSubscriptionResumedNotice.mockReset().mockResolvedValue({ success: true });
    sendSubscriptionCanceledNotice.mockReset().mockResolvedValue({ success: true });
    captureError.mockReset().mockResolvedValue(undefined);

    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    process.env.STRIPE_PRICE_ID_GROWTH_SETUP = GROWTH_SETUP_PRICE_ID;
    process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY = GROWTH_MONTHLY_PRICE_ID;
    process.env.STRIPE_PRICE_ID_COMPLETE_MONTHLY = COMPLETE_MONTHLY_PRICE_ID;
    process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = COMMERCE_MONTHLY_PRICE_ID;
    delete process.env.VERCEL_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("returns 501 when Stripe env vars are not configured", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { POST } = await import("./route");

    const response = await POST(webhookRequest());
    expect(response.status).toBe(501);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when the stripe-signature header is missing", async () => {
    const { POST } = await import("./route");

    const response = await POST(webhookRequest(null));
    expect(response.status).toBe(400);
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("returns 400 when signature verification fails", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest());
    const json = await response.json();
    expect(response.status).toBe(400);
    expect(json.message).toBe("bad signature");
    expect(markCheckoutSessionComplete).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After once a client IP exceeds the rate limit", async () => {
    constructEvent.mockReturnValue({ type: "charge.succeeded", data: { object: {} } });
    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_test", "x-forwarded-for": "203.0.113.20" },
        body: "{}",
      });

    let lastResponse;
    for (let i = 0; i < 121; i += 1) {
      lastResponse = await POST(request());
    }

    expect(lastResponse!.status).toBe(429);
    expect(lastResponse!.headers.get("Retry-After")).toBeTruthy();
    const body = await lastResponse!.json();
    expect(body.error).toBe("Too many requests");
    // The gate runs after signature verification, so every request —
    // including the 121st that gets rate-limited — is still verified first
    // (stripe-webhook-rate-limit-post-verify: gating on verified events only
    // means an unverified attacker request, whatever IP it claims, can never
    // occupy a slot in the bucket a real Stripe IP's traffic lands in).
    expect(constructEvent).toHaveBeenCalledTimes(121);
  });

  it("never rate-limits a request that fails signature verification, regardless of claimed IP", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad signature");
    });
    const { POST } = await import("./route");
    const request = () =>
      new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        // A real Stripe webhook IP an attacker could impersonate to try to
        // exhaust the bucket real Stripe traffic would otherwise land in.
        headers: { "stripe-signature": "sig_test", "x-forwarded-for": "3.18.12.63" },
        body: "{}",
      });

    let lastResponse;
    for (let i = 0; i < 200; i += 1) {
      lastResponse = await POST(request());
    }

    // Every one of the 200 unverified requests gets 400, never 429 — the
    // rate limiter bucket for this IP was never touched.
    expect(lastResponse!.status).toBe(400);
    const json = await lastResponse!.json();
    expect(json.error).toBe("Signature verification failed");
  });

  it("acknowledges an unhandled event type without touching fulfillment", async () => {
    constructEvent.mockReturnValue({ type: "charge.succeeded", data: { object: {} } });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
    expect(markCheckoutSessionComplete).not.toHaveBeenCalled();
    expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    expect(retrieveSubscription).not.toHaveBeenCalled();
  });

  describe("customer.subscription.deleted CRM sync", () => {
    it("marks recurringCanceledAt by stripeCustomerId (ended_at → ms)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_test_1",
            customer: "cus_test_1",
            ended_at: 1_720_000_000,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_test_1",
        1_720_000_000_000,
        { requireConvex: true },
      );
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(markCheckoutSessionComplete).not.toHaveBeenCalled();
    });

    it("skips when customer is missing (no 5xx)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_no_cus", customer: null } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("returns 500 orders_recurring_canceled when CRM write fails", async () => {
      markOrdersRecurringCanceledByCustomer.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: { id: "sub_fail", customer: "cus_fail" },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("orders_recurring_canceled");
      expect(json.received).toBe(false);
      // This catch returns a 5xx instead of re-throwing, so it never reaches
      // the outer try/catch's own captureError call — must be wired directly
      // (orders-recurring-canceled-capture-error).
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "customer.subscription.deleted",
        eventId: undefined,
        failureKind: "orders_recurring_canceled",
      });
    });

    it("clears a live payment_failed/subscription_paused billing-notice marker for this customer's orders — see billing-notice-failed-pause-gate-terminal-clear", async () => {
      // A fully deleted Subscription will never fire another lifecycle event,
      // so a marker left over from a pre-cancellation dunning/pause-notice
      // failure would never otherwise get a success:true send to clear it.
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "churned-cafe",
          stripeSessionId: "cs_churned",
          tier: "growth",
          commerceAddon: false,
          lastBillingNoticeSendFailedAt: 1_720_000_000_000,
          lastBillingNoticeSendFailedType: "payment_failed",
        },
        {
          leadSlug: "clean-cafe",
          stripeSessionId: "cs_clean",
          tier: "growth",
          commerceAddon: false,
        },
      ]);
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: { id: "sub_test_2", customer: "cus_test_2", ended_at: 1_720_000_500 },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_test_2");
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledTimes(1);
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_churned",
        "payment_failed",
        true,
        1_720_000_500_000,
      );
    });

    it("does not throw/5xx and skips the clear when no order has a live marker", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        { leadSlug: "clean-cafe", stripeSessionId: "cs_clean", tier: "growth", commerceAddon: false },
      ]);
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_test_3", customer: "cus_test_3" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordBillingNoticeSendOutcome).not.toHaveBeenCalled();
    });

    it("stays 200 even when the marker-clear cleanup itself throws (best-effort, never retried)", async () => {
      getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("read failed"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_test_4", customer: "cus_test_4" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
    });
  });

  describe("customer.subscription.deleted win-back notice (subscription-canceled-win-back-notice)", () => {
    it("sends a subscription-canceled win-back notice to the canceled recurring order's lead", async () => {
      // First call is the stale-marker-clear block (no live marker here);
      // second call is this win-back block's own recipient lookup.
      getOrdersByStripeCustomerId.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          leadSlug: "churned-cafe",
          stripeSessionId: "cs_churned_win_back",
          tier: "growth",
          commerceAddon: false,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "churned-cafe",
        businessName: "Churned Cafe",
        email: "owner@churned-cafe.test",
      });
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: { id: "sub_win_back_1", customer: "cus_win_back_1", ended_at: 1_720_002_000 },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendSubscriptionCanceledNotice).toHaveBeenCalledWith({
        to: "owner@churned-cafe.test",
        businessName: "Churned Cafe",
        slug: "churned-cafe",
        tier: "growth",
        commerceAddon: false,
        billingInterval: "monthly",
      });
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_churned_win_back",
        "subscription_canceled",
        true,
        1_720_002_000_000,
      );
    });

    it("passes billingInterval: \"annual\" when the canceled Subscription's own Price recurring.interval is \"year\" (subscription-canceled-notice-annual-billing-copy)", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          leadSlug: "annual-churned-cafe",
          stripeSessionId: "cs_annual_churned",
          tier: "growth",
          commerceAddon: false,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "annual-churned-cafe",
        businessName: "Annual Churned Cafe",
        email: "owner@annual-churned-cafe.test",
      });
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_annual_win_back",
            customer: "cus_annual_win_back",
            ended_at: 1_720_002_000,
            items: { data: [{ price: { recurring: { interval: "year" } } }] },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendSubscriptionCanceledNotice).toHaveBeenCalledWith({
        to: "owner@annual-churned-cafe.test",
        businessName: "Annual Churned Cafe",
        slug: "annual-churned-cafe",
        tier: "growth",
        commerceAddon: false,
        billingInterval: "annual",
      });
    });

    it("records a failed send via recordBillingNoticeSendOutcome without turning it into a 5xx", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([]).mockResolvedValueOnce([
        {
          leadSlug: "churned-cafe-2",
          stripeSessionId: "cs_churned_win_back_2",
          tier: "complete",
          commerceAddon: false,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "churned-cafe-2",
        businessName: "Churned Cafe 2",
        email: "owner@churned-cafe-2.test",
      });
      sendSubscriptionCanceledNotice.mockResolvedValueOnce({ success: false, reason: "suppressed" });
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_win_back_2", customer: "cus_win_back_2" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_churned_win_back_2",
        "subscription_canceled",
        false,
        expect.any(Number),
      );
    });

    it("skips the send when the recurring order's lead has no email on file", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { leadSlug: "no-email-cafe", stripeSessionId: "cs_no_email", tier: "growth", commerceAddon: false },
      ]);
      getLeadBySlug.mockResolvedValueOnce({ slug: "no-email-cafe", businessName: "No Email Cafe" });
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_win_back_3", customer: "cus_win_back_3" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendSubscriptionCanceledNotice).not.toHaveBeenCalled();
      expect(recordBillingNoticeSendOutcome).not.toHaveBeenCalled();
    });

    it("skips the send when no order in this customer's set had a recurring entitlement", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { leadSlug: "starter-only", stripeSessionId: "cs_starter_only", tier: "starter", commerceAddon: false },
      ]);
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_win_back_4", customer: "cus_win_back_4" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendSubscriptionCanceledNotice).not.toHaveBeenCalled();
    });

    it("stays 200 and never 5xx when the win-back lookup itself throws (best-effort, never retried)", async () => {
      getOrdersByStripeCustomerId
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error("read failed"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_win_back_5", customer: "cus_win_back_5" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
    });

    it("does not clear a fresh subscription_canceled failure marker via the stale-marker-clear block (ordering guard)", async () => {
      // The win-back send below fails, so its recordBillingNoticeSendOutcome
      // call sets a fresh subscription_canceled failure marker. Because the
      // notify block runs AFTER the stale-marker-clear block (not before),
      // that fresh marker is never clobbered back to cleared within this same
      // event — regression guard for the ordering called out at the call
      // site's own comment.
      getOrdersByStripeCustomerId.mockResolvedValueOnce([]).mockResolvedValueOnce([
        { leadSlug: "ordering-cafe", stripeSessionId: "cs_ordering", tier: "growth", commerceAddon: false },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "ordering-cafe",
        businessName: "Ordering Cafe",
        email: "owner@ordering-cafe.test",
      });
      sendSubscriptionCanceledNotice.mockResolvedValueOnce({ success: false, reason: "suppressed" });
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: { id: "sub_ordering", customer: "cus_ordering" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledTimes(1);
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_ordering",
        "subscription_canceled",
        false,
        expect.any(Number),
      );
    });

    it("skips the win-back notice when this app canceled the Subscription itself for a recurring-upgrade supersede (stripe-checkout-recurring-upgrade-dedup)", async () => {
      // The CRM cancel-marking and stale-marker-clear blocks still run
      // (harmless/idempotent — the bundle-order handler already marked this
      // customer's order recurringCanceledAt synchronously); only the
      // customer-facing win-back email must not fire.
      getOrdersByStripeCustomerId.mockResolvedValueOnce([]);
      constructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_superseded",
            customer: "cus_superseded",
            cancellation_details: { comment: "superseded_by_recurring_upgrade" },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_superseded",
        expect.any(Number),
        { requireConvex: true },
      );
      // Only the stale-marker-clear lookup ran (one call) — the win-back
      // block's own second lookup never happened.
      expect(getOrdersByStripeCustomerId).toHaveBeenCalledTimes(1);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(sendSubscriptionCanceledNotice).not.toHaveBeenCalled();
      expect(recordBillingNoticeSendOutcome).not.toHaveBeenCalled();
    });
  });

  describe("customer.subscription.created|updated CRM reactivate", () => {
    it("clears recurringCanceledAt and syncs tier on created+active with catalog Price", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_new_1",
            customer: "cus_resub_1",
            status: "active",
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith("cus_resub_1", {
        requireConvex: true,
      });
      expect(syncOrdersRecurringEntitlementByCustomer).toHaveBeenCalledWith(
        "cus_resub_1",
        { tier: "growth", commerceAddon: false },
        { requireConvex: true },
      );
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("syncs Complete→Growth downgrade from subscription items", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_downgrade",
            customer: "cus_downgrade",
            status: "active",
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(syncOrdersRecurringEntitlementByCustomer).toHaveBeenCalledWith(
        "cus_downgrade",
        { tier: "growth", commerceAddon: false },
        { requireConvex: true },
      );
    });

    it("pauses CRM when active Subscription has only a foreign Price", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_foreign",
            customer: "cus_foreign",
            status: "active",
            items: {
              data: [
                {
                  price: { id: "price_foreign_monthly" },
                  current_period_start: 1_720_000_500,
                },
              ],
            },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(syncOrdersRecurringEntitlementByCustomer).not.toHaveBeenCalled();
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_foreign",
        1_720_000_500_000,
        { requireConvex: true },
      );
    });

    it("returns 500 orders_recurring_canceled and reports it via captureError when the foreign-Price pause write fails (orders-recurring-canceled-capture-error)", async () => {
      markOrdersRecurringCanceledByCustomer.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_foreign",
            customer: "cus_foreign",
            status: "active",
            items: {
              data: [
                {
                  price: { id: "price_foreign_monthly" },
                  current_period_start: 1_720_000_500,
                },
              ],
            },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("orders_recurring_canceled");
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "customer.subscription.updated",
        eventId: undefined,
        failureKind: "orders_recurring_canceled",
      });
    });

    it("pauses CRM on active+pause_collection (does not clear)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_paused_1",
            customer: "cus_paused_1",
            status: "active",
            pause_collection: { behavior: "void" },
            items: { data: [{ current_period_start: 1_720_000_300 }] },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_paused_1",
        1_720_000_300_000,
        { requireConvex: true },
      );
    });

    it("pauses CRM on trialing+pause_collection", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_paused_trial",
            customer: "cus_paused_trial",
            status: "trialing",
            pause_collection: { behavior: "keep_as_draft" },
            items: { data: [{ current_period_start: 1_720_000_400 }] },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_paused_trial",
        1_720_000_400_000,
        { requireConvex: true },
      );
    });

    it("clears recurringCanceledAt on updated+trialing with catalog Price", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_trial_1",
            customer: "cus_trial_1",
            status: "trialing",
            items: catalogSubscriptionItems(
              COMPLETE_MONTHLY_PRICE_ID,
              COMMERCE_MONTHLY_PRICE_ID,
            ),
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith("cus_trial_1", {
        requireConvex: true,
      });
      expect(syncOrdersRecurringEntitlementByCustomer).toHaveBeenCalledWith(
        "cus_trial_1",
        { tier: "complete", commerceAddon: true },
        { requireConvex: true },
      );
    });

    it("pauses CRM on updated+past_due (current_period_start → ms)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_past_due",
            customer: "cus_past_due",
            status: "past_due",
            items: { data: [{ current_period_start: 1_720_000_100 }] },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_past_due",
        1_720_000_100_000,
        { requireConvex: true },
      );
    });

    it("pauses CRM on updated+unpaid", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_unpaid",
            customer: "cus_unpaid",
            status: "unpaid",
            items: { data: [{ current_period_start: 1_720_000_200 }] },
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_unpaid",
        1_720_000_200_000,
        { requireConvex: true },
      );
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("skips incomplete without CRM write", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_incomplete",
            customer: "cus_incomplete",
            status: "incomplete",
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("skips when customer is missing (no 5xx)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.created",
        data: { object: { id: "sub_no_cus", customer: null, status: "active" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("returns 500 orders_recurring_reactivated when CRM write fails", async () => {
      clearOrdersRecurringCanceledByCustomer.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_fail_clear",
            customer: "cus_fail_clear",
            status: "active",
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("orders_recurring_reactivated");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "customer.subscription.updated",
        eventId: undefined,
        failureKind: "orders_recurring_reactivated",
      });
    });

    it("returns 500 orders_recurring_canceled when past_due pause write fails", async () => {
      markOrdersRecurringCanceledByCustomer.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_fail_pause",
            customer: "cus_fail_pause",
            status: "past_due",
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("orders_recurring_canceled");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "customer.subscription.updated",
        eventId: undefined,
        failureKind: "orders_recurring_canceled",
      });
    });
  });

  describe("customer.subscription.updated pause_collection notice", () => {
    it("emails a subscription-paused notice when pause_collection is newly set", async () => {
      // recurringCanceledAt is set here because the handler already called
      // markOrdersRecurringCanceledByCustomer (the pause write) before this
      // read — this is the actual post-write shape, not an idealized one; a
      // predicate that requires recurringCanceledAt to be unset would always
      // reject this order and silently drop the notice (regression guard for
      // billing-notice-pause-recipient-write-before-read-fix).
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_paused_1",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: 1_720_000_900_000,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        email: "owner@demo-cafe.test",
      });
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_pause_notice_1",
            customer: "cus_pause_notice_1",
            status: "active",
            pause_collection: { behavior: "void" },
            items: { data: [{ current_period_start: 1_720_000_900 }] },
          },
          previous_attributes: { pause_collection: null },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_pause_notice_1");
      expect(sendSubscriptionPausedNotice).toHaveBeenCalledWith({
        to: "owner@demo-cafe.test",
        businessName: "Demo Cafe",
        slug: "demo-cafe",
        stripeSessionId: "cs_paused_1",
      });
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_paused_1",
        "subscription_paused",
        true,
        expect.any(Number),
      );
    });

    it("does not re-send when pause_collection was already set (no previous_attributes change)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_pause_notice_2",
            customer: "cus_pause_notice_2",
            status: "active",
            pause_collection: { behavior: "void" },
            items: { data: [{ current_period_start: 1_720_001_000 }] },
          },
          // pause_collection unchanged this event — Stripe omits it from
          // previous_attributes when it did not change.
          previous_attributes: { metadata: {} },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalled();
      expect(sendSubscriptionPausedNotice).not.toHaveBeenCalled();
      expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
    });

    it("redelivery of the same event: does not re-send once the pause write already applied", async () => {
      // Stripe redelivers the identical event (same previous_attributes,
      // still showing pause_collection as changed) when our first response
      // was too slow/failed. markOrdersRecurringCanceledByCustomer is itself
      // idempotent — a row already paused updates 0 orders on replay — so the
      // notice must key off that, not off previous_attributes alone, or a
      // pure webhook redelivery double-emails "your billing is now paused".
      markOrdersRecurringCanceledByCustomer.mockResolvedValueOnce(0);
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_pause_notice_redelivery",
            customer: "cus_pause_notice_redelivery",
            status: "active",
            pause_collection: { behavior: "void" },
            items: { data: [{ current_period_start: 1_720_001_050 }] },
          },
          previous_attributes: { pause_collection: null },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalled();
      expect(sendSubscriptionPausedNotice).not.toHaveBeenCalled();
      expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
    });

    it("does not send for an ordinary past_due pause (no pause_collection) — invoice.payment_failed covers it", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_pause_notice_3",
            customer: "cus_pause_notice_3",
            status: "past_due",
            items: { data: [{ current_period_start: 1_720_001_100 }] },
          },
          previous_attributes: { status: "active" },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalled();
      expect(sendSubscriptionPausedNotice).not.toHaveBeenCalled();
    });

    it("does not 5xx when the notice lookup throws (pause already durable)", async () => {
      getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_pause_notice_4",
            customer: "cus_pause_notice_4",
            status: "active",
            pause_collection: { behavior: "void" },
            items: { data: [{ current_period_start: 1_720_001_200 }] },
          },
          previous_attributes: { pause_collection: null },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendSubscriptionPausedNotice).not.toHaveBeenCalled();
    });

    it("skips refunded or disputed historical recurring orders", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "refunded-cafe",
          stripeSessionId: "cs_refunded",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: 1_720_001_300_000,
          refundedAt: "2026-07-18T00:00:00.000Z",
        },
        {
          leadSlug: "disputed-cafe",
          stripeSessionId: "cs_disputed",
          tier: "complete",
          commerceAddon: false,
          recurringCanceledAt: 1_720_001_300_000,
          disputedAt: "2026-07-18T00:00:00.000Z",
        },
      ]);
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_pause_notice_5",
            customer: "cus_pause_notice_5",
            status: "active",
            pause_collection: { behavior: "void" },
            items: { data: [{ current_period_start: 1_720_001_300 }] },
          },
          previous_attributes: { pause_collection: null },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(sendSubscriptionPausedNotice).not.toHaveBeenCalled();
    });

    it("emails a subscription-resumed notice when pause_collection is cleared and CRM was actually cleared", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_resumed_1",
          tier: "growth",
          commerceAddon: false,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        email: "owner@demo-cafe.test",
      });
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_resume_notice_1",
            customer: "cus_resume_notice_1",
            status: "active",
            pause_collection: null,
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
          previous_attributes: { pause_collection: { behavior: "void" } },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_resume_notice_1");
      expect(sendSubscriptionResumedNotice).toHaveBeenCalledWith({
        to: "owner@demo-cafe.test",
        businessName: "Demo Cafe",
        slug: "demo-cafe",
        stripeSessionId: "cs_resumed_1",
      });
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_resumed_1",
        "subscription_resumed",
        true,
        expect.any(Number),
      );
    });

    it("does not send the resumed notice for an ordinary catalog-Price restore (no pause_collection change)", async () => {
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_resume_notice_2",
            customer: "cus_resume_notice_2",
            status: "active",
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
          previous_attributes: { status: "past_due" },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).toHaveBeenCalled();
      expect(sendSubscriptionResumedNotice).not.toHaveBeenCalled();
      expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
    });

    it("does not send the resumed notice when nothing was actually cleared", async () => {
      clearOrdersRecurringCanceledByCustomer.mockResolvedValueOnce(0);
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_resume_notice_3",
            customer: "cus_resume_notice_3",
            status: "active",
            pause_collection: null,
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
          previous_attributes: { pause_collection: { behavior: "void" } },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendSubscriptionResumedNotice).not.toHaveBeenCalled();
    });

    it("does not 5xx when the resume notice lookup throws (restore already durable)", async () => {
      getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_resume_notice_4",
            customer: "cus_resume_notice_4",
            status: "active",
            pause_collection: null,
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
          previous_attributes: { pause_collection: { behavior: "void" } },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendSubscriptionResumedNotice).not.toHaveBeenCalled();
    });

    it("skips refunded or disputed historical recurring orders", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "refunded-cafe",
          stripeSessionId: "cs_refunded",
          tier: "growth",
          commerceAddon: false,
          refundedAt: "2026-07-18T00:00:00.000Z",
        },
        {
          leadSlug: "disputed-cafe",
          stripeSessionId: "cs_disputed",
          tier: "complete",
          commerceAddon: false,
          disputedAt: "2026-07-18T00:00:00.000Z",
        },
      ]);
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_resume_notice_5",
            customer: "cus_resume_notice_5",
            status: "active",
            pause_collection: null,
            items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
          },
          previous_attributes: { pause_collection: { behavior: "void" } },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(sendSubscriptionResumedNotice).not.toHaveBeenCalled();
    });

    it("does not fail the webhook when the pause notice send resolves success:false", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        { leadSlug: "demo-cafe", stripeSessionId: "cs_paused_2", tier: "growth", commerceAddon: false },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        email: "owner@demo-cafe.test",
      });
      sendSubscriptionPausedNotice.mockResolvedValueOnce({ success: false, reason: "suppressed" });
      constructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_pause_notice_5",
            customer: "cus_pause_notice_5",
            status: "active",
            pause_collection: { behavior: "void" },
            items: { data: [{ current_period_start: 1_720_001_300 }] },
          },
          previous_attributes: { pause_collection: null },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      // See billing-notice-send-failure-visibility: a suppressed/failed send
      // must still record a durable, operator-visible marker.
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_paused_2",
        "subscription_paused",
        false,
        expect.any(Number),
      );
    });
  });

  describe("invoice.payment_failed CRM pause", () => {
    it("pauses CRM for subscription invoices when retrieve shows past_due (created → ms)", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_renew_1",
        customer: "cus_inv_fail",
        status: "past_due",
        pause_collection: null,
      });
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_fail_1",
            customer: "cus_inv_fail",
            subscription: "sub_renew_1",
            created: 1_720_000_300,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveSubscription).toHaveBeenCalledWith("sub_renew_1");
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_inv_fail",
        1_720_000_300_000,
        { requireConvex: true },
      );
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("skips pause when Subscription already grants (stale failed after recovery)", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_stale_fail",
        customer: "cus_stale",
        status: "active",
        pause_collection: null,
      });
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_stale",
            customer: "cus_stale",
            subscription: "sub_stale_fail",
            created: 1_720_000_310,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveSubscription).toHaveBeenCalledWith("sub_stale_fail");
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("still pauses when retrieve shows active+pause_collection", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_paused_coll",
        customer: "cus_paused_coll",
        status: "active",
        pause_collection: { behavior: "void" },
      });
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_paused_coll",
            customer: "cus_paused_coll",
            subscription: "sub_paused_coll",
            created: 1_720_000_320,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_paused_coll",
        1_720_000_320_000,
        { requireConvex: true },
      );
    });

    it("skips one-time invoices without subscription", async () => {
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_once",
            customer: "cus_once",
            subscription: null,
            created: 1_720_000_400,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveSubscription).not.toHaveBeenCalled();
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("skips when customer is missing (no 5xx)", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_renew_2",
        customer: null,
        status: "past_due",
        pause_collection: null,
      });
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_no_cus",
            customer: null,
            subscription: "sub_renew_2",
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("returns 500 subscription_retrieve when Subscription retrieve fails", async () => {
      retrieveSubscription.mockRejectedValueOnce(new Error("stripe down"));
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_retrieve_fail",
            customer: "cus_retrieve_fail",
            subscription: "sub_retrieve_fail",
            created: 1_720_000_450,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("subscription_retrieve");
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "invoice.payment_failed",
        eventId: undefined,
        failureKind: "subscription_retrieve",
      });
    });

    it("returns 500 orders_recurring_canceled when CRM write fails", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_fail_inv",
        customer: "cus_fail_inv",
        status: "past_due",
        pause_collection: null,
      });
      markOrdersRecurringCanceledByCustomer.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_fail_write",
            customer: "cus_fail_inv",
            subscription: "sub_fail_inv",
            created: 1_720_000_500,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("orders_recurring_canceled");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "invoice.payment_failed",
        eventId: undefined,
        failureKind: "orders_recurring_canceled",
      });
    });
  });

  describe("invoice.payment_failed dunning notice", () => {
    function paymentFailedEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_notice_1",
            customer: "cus_notice",
            subscription: "sub_notice",
            created: 1_720_000_600,
            ...overrides,
          },
        },
      };
    }

    beforeEach(() => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_notice",
        customer: "cus_notice",
        status: "past_due",
        pause_collection: null,
      });
    });

    it("emails the lead once a recurring order is found for the customer", async () => {
      // recurringCanceledAt is set here for the same reason as the
      // pause_collection notice test above: markOrdersRecurringCanceledByCustomer
      // already ran before this read (regression guard for
      // billing-notice-pause-recipient-write-before-read-fix).
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_notice_1",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: 1_720_000_600_000,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        email: "owner@demo-cafe.test",
      });
      constructEvent.mockReturnValue(paymentFailedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_notice");
      expect(sendPaymentFailedNotice).toHaveBeenCalledWith({
        to: "owner@demo-cafe.test",
        businessName: "Demo Cafe",
        slug: "demo-cafe",
        stripeSessionId: "cs_notice_1",
        billingInterval: "monthly",
      });
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_notice_1",
        "payment_failed",
        true,
        expect.any(Number),
      );
    });

    it("passes billingInterval: \"annual\" when the failed Subscription's own Price recurring.interval is \"year\" (payment-failed-notice-annual-billing-copy)", async () => {
      retrieveSubscription.mockReset().mockResolvedValueOnce({
        id: "sub_notice",
        customer: "cus_notice",
        status: "past_due",
        pause_collection: null,
        items: { data: [{ price: { recurring: { interval: "year" } } }] },
      });
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "annual-demo-cafe",
          stripeSessionId: "cs_notice_annual",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: 1_720_000_600_000,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "annual-demo-cafe",
        businessName: "Annual Demo Cafe",
        email: "owner@annual-demo-cafe.test",
      });
      constructEvent.mockReturnValue(paymentFailedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendPaymentFailedNotice).toHaveBeenCalledWith({
        to: "owner@annual-demo-cafe.test",
        businessName: "Annual Demo Cafe",
        slug: "annual-demo-cafe",
        stripeSessionId: "cs_notice_annual",
        billingInterval: "annual",
      });
    });

    it("skips the notice when the customer has no recurring order", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        { leadSlug: "one-off", stripeSessionId: "cs_x", tier: "starter", commerceAddon: false },
      ]);
      constructEvent.mockReturnValue(paymentFailedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendPaymentFailedNotice).not.toHaveBeenCalled();
    });

    it("skips refunded or disputed historical recurring orders", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "refunded-cafe",
          stripeSessionId: "cs_refunded",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: 1_720_000_600_000,
          refundedAt: "2026-07-18T00:00:00.000Z",
        },
        {
          leadSlug: "disputed-cafe",
          stripeSessionId: "cs_disputed",
          tier: "complete",
          commerceAddon: false,
          recurringCanceledAt: 1_720_000_600_000,
          disputedAt: "2026-07-18T00:00:00.000Z",
        },
      ]);
      constructEvent.mockReturnValue(paymentFailedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(sendPaymentFailedNotice).not.toHaveBeenCalled();
    });

    it("skips the notice when the lead has no email on file", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_notice_2",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: 1_720_000_600_000,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({ slug: "demo-cafe", businessName: "Demo Cafe" });
      constructEvent.mockReturnValue(paymentFailedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendPaymentFailedNotice).not.toHaveBeenCalled();
    });

    it("does not 5xx when the notice lookup throws (pause already durable)", async () => {
      getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(paymentFailedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalled();
      expect(sendPaymentFailedNotice).not.toHaveBeenCalled();
    });

    it("does not fail the webhook when the send itself resolves success:false", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_notice_3",
          tier: "growth",
          commerceAddon: false,
          recurringCanceledAt: 1_720_000_600_000,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        email: "owner@demo-cafe.test",
      });
      sendPaymentFailedNotice.mockResolvedValueOnce({ success: false, reason: "suppressed" });
      constructEvent.mockReturnValue(paymentFailedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      // See billing-notice-send-failure-visibility: a suppressed/failed send
      // must still record a durable, operator-visible marker.
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_notice_3",
        "payment_failed",
        false,
        expect.any(Number),
      );
    });
  });

  describe("invoice.paid CRM restore", () => {
    it("clears recurringCanceledAt and syncs tier when retrieve shows active+catalog Price", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_paid_1",
        customer: "cus_paid_1",
        status: "active",
        pause_collection: null,
        items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
      });
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_paid_1",
            customer: "cus_paid_1",
            subscription: "sub_paid_1",
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveSubscription).toHaveBeenCalledWith("sub_paid_1");
      expect(clearOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith("cus_paid_1", {
        requireConvex: true,
      });
      expect(syncOrdersRecurringEntitlementByCustomer).toHaveBeenCalledWith(
        "cus_paid_1",
        { tier: "growth", commerceAddon: false },
        { requireConvex: true },
      );
      expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("pauses when retrieve is active but items lack catalog Prices", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_paid_foreign",
        customer: "cus_paid_foreign",
        status: "active",
        pause_collection: null,
        items: catalogSubscriptionItems("price_foreign_monthly"),
      });
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_paid_foreign",
            customer: "cus_paid_foreign",
            subscription: "sub_paid_foreign",
            created: 1_720_000_600,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(syncOrdersRecurringEntitlementByCustomer).not.toHaveBeenCalled();
      expect(markOrdersRecurringCanceledByCustomer).toHaveBeenCalledWith(
        "cus_paid_foreign",
        1_720_000_600_000,
        { requireConvex: true },
      );
    });

    it("returns 500 orders_recurring_canceled and reports it via captureError when the no-catalog-Price pause write fails (orders-recurring-canceled-capture-error)", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_paid_foreign_fail",
        customer: "cus_paid_foreign_fail",
        status: "active",
        pause_collection: null,
        items: catalogSubscriptionItems("price_foreign_monthly"),
      });
      markOrdersRecurringCanceledByCustomer.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_paid_foreign_fail",
            customer: "cus_paid_foreign_fail",
            subscription: "sub_paid_foreign_fail",
            created: 1_720_000_700,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("orders_recurring_canceled");
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "invoice.paid",
        eventId: undefined,
        failureKind: "orders_recurring_canceled",
      });
    });

    it("skips restore when pause_collection is set (active status hole)", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_paid_paused",
        customer: "cus_paid_paused",
        status: "active",
        pause_collection: { behavior: "void" },
      });
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_paid_paused",
            customer: "cus_paid_paused",
            subscription: "sub_paid_paused",
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("skips one-time invoices without subscription", async () => {
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_paid_once",
            customer: "cus_paid_once",
            subscription: null,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveSubscription).not.toHaveBeenCalled();
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
    });

    it("returns 500 subscription_retrieve when Subscription retrieve fails", async () => {
      retrieveSubscription.mockRejectedValueOnce(new Error("stripe down"));
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_paid_retrieve_fail",
            customer: "cus_paid_retrieve",
            subscription: "sub_paid_retrieve",
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("subscription_retrieve");
      expect(clearOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "invoice.paid",
        eventId: undefined,
        failureKind: "subscription_retrieve",
      });
    });

    it("returns 500 orders_recurring_reactivated when CRM write fails", async () => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_paid_write_fail",
        customer: "cus_paid_write_fail",
        status: "active",
        pause_collection: null,
        items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
      });
      clearOrdersRecurringCanceledByCustomer.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_paid_write_fail",
            customer: "cus_paid_write_fail",
            subscription: "sub_paid_write_fail",
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("orders_recurring_reactivated");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "invoice.paid",
        eventId: undefined,
        failureKind: "orders_recurring_reactivated",
      });
    });
  });

  describe("invoice.paid subscription renewal revenue", () => {
    function activeSubscription(overrides: Record<string, unknown> = {}) {
      return {
        id: "sub_renewal",
        customer: "cus_renewal",
        status: "active",
        pause_collection: null,
        items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
        ...overrides,
      };
    }

    it("records the renewal amount for a subscription_cycle invoice", async () => {
      retrieveSubscription.mockResolvedValueOnce(activeSubscription());
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_renewal_1",
            customer: "cus_renewal",
            subscription: "sub_renewal",
            billing_reason: "subscription_cycle",
            amount_paid: 4900,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordSubscriptionRenewalPayment).toHaveBeenCalledWith(
        "cus_renewal",
        "in_renewal_1",
        49,
        { requireConvex: true },
      );
    });

    it("does not record the subscription's own first invoice (already counted at order creation)", async () => {
      retrieveSubscription.mockResolvedValueOnce(activeSubscription());
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_first_1",
            customer: "cus_renewal",
            subscription: "sub_renewal",
            billing_reason: "subscription_create",
            amount_paid: 4900,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordSubscriptionRenewalPayment).not.toHaveBeenCalled();
    });

    it("skips a zero-amount renewal invoice (e.g. a fully-discounted cycle)", async () => {
      retrieveSubscription.mockResolvedValueOnce(activeSubscription());
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_renewal_zero",
            customer: "cus_renewal",
            subscription: "sub_renewal",
            billing_reason: "subscription_cycle",
            amount_paid: 0,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordSubscriptionRenewalPayment).not.toHaveBeenCalled();
    });

    it("returns 500 subscription_renewal_revenue when the ledger write fails", async () => {
      retrieveSubscription.mockResolvedValueOnce(activeSubscription());
      recordSubscriptionRenewalPayment.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue({
        type: "invoice.paid",
        data: {
          object: {
            id: "in_renewal_fail",
            customer: "cus_renewal",
            subscription: "sub_renewal",
            billing_reason: "subscription_cycle",
            amount_paid: 4900,
          },
        },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("subscription_renewal_revenue");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "invoice.paid",
        eventId: undefined,
        failureKind: "subscription_renewal_revenue",
      });
    });
  });

  describe("invoice.paid payment-recovered confirmation", () => {
    function paidEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: "invoice.paid",
        data: {
          object: {
            id: "in_recovered_1",
            customer: "cus_recovered",
            subscription: "sub_recovered",
            ...overrides,
          },
        },
      };
    }

    beforeEach(() => {
      retrieveSubscription.mockResolvedValueOnce({
        id: "sub_recovered",
        customer: "cus_recovered",
        status: "active",
        pause_collection: null,
        items: catalogSubscriptionItems(GROWTH_MONTHLY_PRICE_ID),
      });
    });

    it("emails the lead once a recurring order is found and the pause was actually cleared", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_recovered_1",
          tier: "growth",
          commerceAddon: false,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        email: "owner@demo-cafe.test",
      });
      constructEvent.mockReturnValue(paidEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_recovered");
      expect(sendPaymentRecoveredNotice).toHaveBeenCalledWith({
        to: "owner@demo-cafe.test",
        businessName: "Demo Cafe",
        slug: "demo-cafe",
        stripeSessionId: "cs_recovered_1",
      });
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_recovered_1",
        "payment_recovered",
        true,
        expect.any(Number),
      );
    });

    it("skips the notice when nothing was actually cleared (ordinary healthy renewal)", async () => {
      clearOrdersRecurringCanceledByCustomer.mockResolvedValueOnce(0);
      constructEvent.mockReturnValue(paidEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
      expect(sendPaymentRecoveredNotice).not.toHaveBeenCalled();
    });

    it("skips the notice when the customer has no recurring order", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        { leadSlug: "one-off", stripeSessionId: "cs_x", tier: "starter", commerceAddon: false },
      ]);
      constructEvent.mockReturnValue(paidEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendPaymentRecoveredNotice).not.toHaveBeenCalled();
    });

    it("skips refunded or disputed historical recurring orders", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "refunded-cafe",
          stripeSessionId: "cs_refunded",
          tier: "growth",
          commerceAddon: false,
          refundedAt: "2026-07-18T00:00:00.000Z",
        },
        {
          leadSlug: "disputed-cafe",
          stripeSessionId: "cs_disputed",
          tier: "complete",
          commerceAddon: false,
          disputedAt: "2026-07-18T00:00:00.000Z",
        },
      ]);
      constructEvent.mockReturnValue(paidEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(sendPaymentRecoveredNotice).not.toHaveBeenCalled();
    });

    it("skips the notice when the lead has no email on file", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_recovered_3",
          tier: "growth",
          commerceAddon: false,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({ slug: "demo-cafe", businessName: "Demo Cafe" });
      constructEvent.mockReturnValue(paidEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendPaymentRecoveredNotice).not.toHaveBeenCalled();
    });

    it("does not 5xx when the notice lookup throws (restore already durable)", async () => {
      getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(paidEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrdersRecurringCanceledByCustomer).toHaveBeenCalled();
      expect(sendPaymentRecoveredNotice).not.toHaveBeenCalled();
    });

    it("does not fail the webhook when the send itself resolves success:false", async () => {
      getOrdersByStripeCustomerId.mockResolvedValueOnce([
        {
          leadSlug: "demo-cafe",
          stripeSessionId: "cs_recovered_4",
          tier: "growth",
          commerceAddon: false,
        },
      ]);
      getLeadBySlug.mockResolvedValueOnce({
        slug: "demo-cafe",
        businessName: "Demo Cafe",
        email: "owner@demo-cafe.test",
      });
      sendPaymentRecoveredNotice.mockResolvedValueOnce({ success: false, reason: "suppressed" });
      constructEvent.mockReturnValue(paidEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      // See billing-notice-send-failure-visibility: a suppressed/failed send
      // must still record a durable, operator-visible marker.
      expect(recordBillingNoticeSendOutcome).toHaveBeenCalledWith(
        "cs_recovered_4",
        "payment_recovered",
        false,
        expect.any(Number),
      );
    });
  });

  describe("charge.refunded commerce order clawback tracking", () => {
    function refundedChargeEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: "charge.refunded",
        data: {
          object: {
            id: "ch_refund_1",
            payment_intent: "pi_refund_1",
            amount: 5000,
            amount_refunded: 5000,
            ...overrides,
          },
        },
      };
    }

    it("marks the commerce order refunded when the Session resolves to a ledgered order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).toHaveBeenCalledWith({
        payment_intent: "pi_refund_1",
        limit: 1,
      });
      expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledWith("cs_commerce_1");
      expect(markCommerceOrderRefunded).toHaveBeenCalledWith(
        "cs_commerce_1",
        expect.any(String),
        { requireConvex: true },
      );
    });

    it("skips a charge with no refunded amount", async () => {
      constructEvent.mockReturnValue(refundedChargeEvent({ amount_refunded: 0 }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(markCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("skips a charge with no payment_intent to correlate", async () => {
      constructEvent.mockReturnValue(refundedChargeEvent({ payment_intent: null }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(markCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("skips when no Checkout Session matches the payment_intent", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [] });
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
      expect(markCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("skips when the Session backs neither a commerce order nor a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_unknown_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce(null);
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrderByStripeSessionId).toHaveBeenCalledWith("cs_unknown_1");
      expect(markCommerceOrderRefunded).not.toHaveBeenCalled();
      expect(markOrderRefunded).not.toHaveBeenCalled();
    });

    it("marks the bundle order refunded when the Session backs no commerce order but a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrderByStripeSessionId).toHaveBeenCalledWith("cs_bundle_1");
      expect(markOrderRefunded).toHaveBeenCalledWith("cs_bundle_1", expect.any(String), {
        requireConvex: true,
      });
      expect(markCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("is idempotent — does not re-mark a bundle order already flagged refunded", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
        refundedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrderRefunded).not.toHaveBeenCalled();
    });

    it("returns 500 bundle_order_refund when the bundle refund mark write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      markOrderRefunded.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_order_refund");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.refunded",
        eventId: undefined,
        failureKind: "bundle_order_refund",
      });
    });

    it("is idempotent — does not re-mark an order already flagged refunded", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        refundedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("returns 500 commerce_order_refund_session_lookup when the Session list call fails", async () => {
      listCheckoutSessions.mockRejectedValueOnce(new Error("stripe down"));
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_refund_session_lookup");
      expect(markCommerceOrderRefunded).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.refunded",
        eventId: undefined,
        failureKind: "commerce_order_refund_session_lookup",
      });
    });

    it("returns 500 commerce_order_refund when the refund mark write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      markCommerceOrderRefunded.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(refundedChargeEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_refund");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.refunded",
        eventId: undefined,
        failureKind: "commerce_order_refund",
      });
    });

    // renewal-charge-refund-dispute-customer-correlation: a subscription
    // renewal invoice's PaymentIntent is minted directly by Stripe's billing
    // system and is never attached to a Checkout Session, so the Session
    // lookup above always misses a renewal-cycle refund. These cases cover
    // the Stripe-Customer-correlation fallback added to close that gap.
    describe("renewal-cycle refund (no Checkout Session) via Stripe Customer correlation", () => {
      it("marks the customer's entitled order refunded when the Session lookup misses", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            lifetimeRevenueUsd: 147,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: "cus_renewal_1" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_renewal_1");
        expect(markOrderRefunded).toHaveBeenCalledWith(
          "cs_original_signup",
          expect.any(String),
          { requireConvex: true },
        );
      });

      it("marks a PAUSED customer's order refunded — regression for renewal-charge-refund-dispute-customer-correlation-paused-order-fix", async () => {
        // A subscription already paused (recurringCanceledAt set, e.g. from a
        // prior invoice.payment_failed) must still correlate a renewal-charge
        // refund to it — orderGrantsSoldCapabilityEntitlement (the predicate
        // this correlation originally shipped with) requires recurringCanceledAt
        // to be unset and would silently drop this exact case, the same bug
        // class orderEligibleForPauseNotice already exists to avoid.
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_paused",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            recurringCanceledAt: 1_720_000_000_000,
          },
        ]);
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: "cus_renewal_paused" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(markOrderRefunded).toHaveBeenCalledWith(
          "cs_original_signup",
          expect.any(String),
          { requireConvex: true },
        );
      });

      it("skips when the charge has no customer to correlate", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: null }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
        expect(markOrderRefunded).not.toHaveBeenCalled();
      });

      it("skips when the customer has no currently-entitled order", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            refundedAt: "2026-06-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: "cus_renewal_1" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(markOrderRefunded).not.toHaveBeenCalled();
      });

      it("is idempotent — does not re-mark an already-refunded entitled order", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            refundedAt: undefined,
          },
        ]);
        markOrderRefunded.mockResolvedValueOnce(undefined);
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: "cus_renewal_1" }));
        const { POST: POST1 } = await import("./route");
        await POST1(webhookRequest());
        expect(markOrderRefunded).toHaveBeenCalledTimes(1);

        // Redelivery: the order now carries refundedAt from the first delivery.
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            refundedAt: "2026-07-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: "cus_renewal_1" }));
        const { POST: POST2 } = await import("./route");
        const response = await POST2(webhookRequest());
        expect(response.status).toBe(200);
        expect(markOrderRefunded).toHaveBeenCalledTimes(1);
      });

      it("returns 500 bundle_order_renewal_customer_lookup when the customer orders lookup fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: "cus_renewal_1" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_renewal_customer_lookup");
        expect(markOrderRefunded).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.refunded",
          eventId: undefined,
          failureKind: "bundle_order_renewal_customer_lookup",
        });
      });

      it("returns 500 bundle_order_refund when the renewal-cycle refund mark write fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        markOrderRefunded.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(refundedChargeEvent({ customer: "cus_renewal_1" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_refund");
        expect(json.received).toBe(false);
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.refunded",
          eventId: undefined,
          failureKind: "bundle_order_refund",
        });
      });
    });
  });

  describe("charge.dispute.created commerce order clawback tracking", () => {
    function disputeCreatedEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: "charge.dispute.created",
        data: {
          object: {
            id: "dp_1",
            charge: "ch_disputed_1",
            payment_intent: "pi_dispute_1",
            amount: 5000,
            status: "warning_needs_response",
            ...overrides,
          },
        },
      };
    }

    it("marks the commerce order disputed when the Session resolves to a ledgered order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).toHaveBeenCalledWith({
        payment_intent: "pi_dispute_1",
        limit: 1,
      });
      expect(getCommerceOrderByStripeSessionId).toHaveBeenCalledWith("cs_commerce_1");
      expect(markCommerceOrderDisputed).toHaveBeenCalledWith(
        "cs_commerce_1",
        expect.any(String),
        { requireConvex: true },
      );
    });

    it("skips a dispute with no payment_intent to correlate", async () => {
      constructEvent.mockReturnValue(disputeCreatedEvent({ payment_intent: null }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("skips when no Checkout Session matches the payment_intent", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [] });
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getCommerceOrderByStripeSessionId).not.toHaveBeenCalled();
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("marks the bundle order disputed when the Session backs no commerce order but a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getOrderByStripeSessionId).toHaveBeenCalledWith("cs_bundle_1");
      expect(markOrderDisputed).toHaveBeenCalledWith("cs_bundle_1", expect.any(String), {
        requireConvex: true,
      });
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("skips when the Session backs neither a commerce order nor a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_unknown_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce(null);
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
      expect(markOrderDisputed).not.toHaveBeenCalled();
    });

    it("is idempotent — does not re-mark a bundle order already flagged disputed", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrderDisputed).not.toHaveBeenCalled();
    });

    it("returns 500 bundle_order_dispute when the bundle dispute mark write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      markOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_order_dispute");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.created",
        eventId: undefined,
        failureKind: "bundle_order_dispute",
      });
    });

    it("is idempotent — does not re-mark an order already flagged disputed", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("returns 500 commerce_order_dispute_session_lookup when the Session list call fails", async () => {
      listCheckoutSessions.mockRejectedValueOnce(new Error("stripe down"));
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_dispute_session_lookup");
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.created",
        eventId: undefined,
        failureKind: "commerce_order_dispute_session_lookup",
      });
    });

    it("returns 500 commerce_order_dispute when the dispute mark write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      markCommerceOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(disputeCreatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_dispute");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.created",
        eventId: undefined,
        failureKind: "commerce_order_dispute",
      });
    });

    // renewal-charge-refund-dispute-customer-correlation: unlike Charge,
    // Dispute has no `.customer` field of its own, so the fallback must
    // retrieve the PaymentIntent first to read its Customer id.
    describe("renewal-cycle dispute (no Checkout Session) via PaymentIntent Customer correlation", () => {
      it("marks the customer's entitled order disputed when the Session lookup misses", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            lifetimeRevenueUsd: 147,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(disputeCreatedEvent());
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(retrievePaymentIntent).toHaveBeenCalledWith("pi_dispute_1");
        expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_renewal_1");
        expect(markOrderDisputed).toHaveBeenCalledWith(
          "cs_original_signup",
          expect.any(String),
          { requireConvex: true },
        );
      });

      it("marks a PAUSED customer's order disputed — regression for renewal-charge-refund-dispute-customer-correlation-paused-order-fix", async () => {
        // Same paused-subscription regression as the charge.refunded sibling
        // test above, for the dispute path's separate PaymentIntent-customer
        // correlation branch.
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_paused" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_paused",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            recurringCanceledAt: 1_720_000_000_000,
          },
        ]);
        constructEvent.mockReturnValue(disputeCreatedEvent());
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(markOrderDisputed).toHaveBeenCalledWith(
          "cs_original_signup",
          expect.any(String),
          { requireConvex: true },
        );
      });

      it("skips when the retrieved PaymentIntent has no customer to correlate", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: null });
        constructEvent.mockReturnValue(disputeCreatedEvent());
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
        expect(markOrderDisputed).not.toHaveBeenCalled();
      });

      it("is idempotent — does not re-mark an already-disputed entitled order", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            disputedAt: "2026-07-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(disputeCreatedEvent());
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(markOrderDisputed).not.toHaveBeenCalled();
      });

      it("returns 500 bundle_order_dispute_renewal_payment_intent_lookup when the PaymentIntent retrieve fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockRejectedValueOnce(new Error("stripe down"));
        constructEvent.mockReturnValue(disputeCreatedEvent());
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_dispute_renewal_payment_intent_lookup");
        expect(markOrderDisputed).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.dispute.created",
          eventId: undefined,
          failureKind: "bundle_order_dispute_renewal_payment_intent_lookup",
        });
      });

      it("returns 500 bundle_order_renewal_customer_lookup when the customer orders lookup fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(disputeCreatedEvent());
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_renewal_customer_lookup");
        expect(markOrderDisputed).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.dispute.created",
          eventId: undefined,
          failureKind: "bundle_order_renewal_customer_lookup",
        });
      });

      it("returns 500 bundle_order_dispute when the renewal-cycle dispute mark write fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        markOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(disputeCreatedEvent());
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_dispute");
        expect(json.received).toBe(false);
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.dispute.created",
          eventId: undefined,
          failureKind: "bundle_order_dispute",
        });
      });
    });
  });

  describe("charge.dispute.closed commerce order resolution", () => {
    function disputeClosedEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: "charge.dispute.closed",
        data: {
          object: {
            id: "dp_closed_1",
            charge: "ch_disputed_1",
            payment_intent: "pi_dispute_1",
            amount: 5000,
            status: "won",
            ...overrides,
          },
        },
      };
    }

    it("clears disputedAt when status is won", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderDisputed).toHaveBeenCalledWith("cs_commerce_1", {
        requireConvex: true,
      });
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("clears disputedAt when status is warning_closed", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "warning_closed" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderDisputed).toHaveBeenCalledWith("cs_commerce_1", {
        requireConvex: true,
      });
    });

    it("is idempotent — does not re-clear when disputedAt is already unset (won)", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("keeps disputedAt and is a no-op mark when status is lost and already disputed", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("marks disputedAt when status is lost and created was missed", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
      expect(markCommerceOrderDisputed).toHaveBeenCalledWith(
        "cs_commerce_1",
        expect.any(String),
        { requireConvex: true },
      );
    });

    it("returns 500 commerce_order_dispute and reports it via captureError when the lost-status commerce mark write fails (stripe-webhook-dispute-resolution-capture-error)", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      markCommerceOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_dispute");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.closed",
        eventId: undefined,
        failureKind: "commerce_order_dispute",
      });
    });

    it("skips a closed dispute with no payment_intent", async () => {
      constructEvent.mockReturnValue(disputeClosedEvent({ payment_intent: null }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("skips when no Checkout Session matches", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [] });
      constructEvent.mockReturnValue(disputeClosedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("clears bundle disputedAt when status is won and Session backs a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrderDisputed).toHaveBeenCalledWith("cs_bundle_1", { requireConvex: true });
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("marks bundle disputedAt when status is lost and created was missed", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markOrderDisputed).toHaveBeenCalledWith("cs_bundle_1", expect.any(String), {
        requireConvex: true,
      });
      expect(markCommerceOrderDisputed).not.toHaveBeenCalled();
    });

    it("returns 500 bundle_order_dispute and reports it via captureError when the lost-status bundle mark write fails (stripe-webhook-dispute-resolution-capture-error)", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      markOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_order_dispute");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.closed",
        eventId: undefined,
        failureKind: "bundle_order_dispute",
      });
    });

    it("skips when the Session backs neither a commerce order nor a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_unknown_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce(null);
      constructEvent.mockReturnValue(disputeClosedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
      expect(clearOrderDisputed).not.toHaveBeenCalled();
    });

    it("returns 500 bundle_order_dispute_clear when the bundle clear write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      clearOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_order_dispute_clear");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.closed",
        eventId: undefined,
        failureKind: "bundle_order_dispute_clear",
      });
    });

    it("returns 500 commerce_order_dispute_closed_session_lookup when Session list fails", async () => {
      listCheckoutSessions.mockRejectedValueOnce(new Error("stripe down"));
      constructEvent.mockReturnValue(disputeClosedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_dispute_closed_session_lookup");
      expect(clearCommerceOrderDisputed).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.closed",
        eventId: undefined,
        failureKind: "commerce_order_dispute_closed_session_lookup",
      });
    });

    it("returns 500 commerce_order_dispute_clear when the clear write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        disputedAt: "2026-07-10T00:00:00.000Z",
      });
      clearCommerceOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_dispute_clear");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "charge.dispute.closed",
        eventId: undefined,
        failureKind: "commerce_order_dispute_clear",
      });
    });

    // A renewal-cycle dispute's PaymentIntent was never attached to a
    // Checkout Session in the first place — the Session lookup above always
    // misses a renewal-cycle closed dispute too, the same gap
    // charge.dispute.created's own fallback closes for the "opened" event.
    // These cases cover the PaymentIntent-Customer-correlation fallback added
    // to close the "closed" twin gap. See
    // refund-updated-dispute-closed-customer-correlation-fallback.
    describe("renewal-cycle closed dispute (no Checkout Session) via PaymentIntent Customer correlation", () => {
      it("clears the customer's entitled order disputed when status is won", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            disputedAt: "2026-07-10T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(retrievePaymentIntent).toHaveBeenCalledWith("pi_dispute_1");
        expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_renewal_1");
        expect(clearOrderDisputed).toHaveBeenCalledWith("cs_original_signup", {
          requireConvex: true,
        });
      });

      it("marks the customer's entitled order disputed when status is lost and created was missed", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(markOrderDisputed).toHaveBeenCalledWith(
          "cs_original_signup",
          expect.any(String),
          { requireConvex: true },
        );
        expect(clearOrderDisputed).not.toHaveBeenCalled();
      });

      it("is idempotent — does not re-clear when disputedAt is already unset (won)", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(clearOrderDisputed).not.toHaveBeenCalled();
        expect(markOrderDisputed).not.toHaveBeenCalled();
      });

      it("is idempotent — does not re-mark when status is lost and already disputed", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            disputedAt: "2026-07-10T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(markOrderDisputed).not.toHaveBeenCalled();
        expect(clearOrderDisputed).not.toHaveBeenCalled();
      });

      it("skips when the retrieved PaymentIntent has no customer to correlate", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: null });
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
        expect(clearOrderDisputed).not.toHaveBeenCalled();
      });

      it("skips when the customer has no currently-entitled order", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([]);
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(clearOrderDisputed).not.toHaveBeenCalled();
      });

      it("returns 500 bundle_order_dispute_renewal_payment_intent_lookup when the PaymentIntent retrieve fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockRejectedValueOnce(new Error("stripe down"));
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_dispute_renewal_payment_intent_lookup");
        expect(clearOrderDisputed).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.dispute.closed",
          eventId: undefined,
          failureKind: "bundle_order_dispute_renewal_payment_intent_lookup",
        });
      });

      it("returns 500 bundle_order_renewal_customer_lookup when the customer orders lookup fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_renewal_customer_lookup");
        expect(clearOrderDisputed).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.dispute.closed",
          eventId: undefined,
          failureKind: "bundle_order_renewal_customer_lookup",
        });
      });

      it("returns 500 bundle_order_dispute_clear when the renewal-cycle clear write fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            disputedAt: "2026-07-10T00:00:00.000Z",
          },
        ]);
        clearOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "won" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_dispute_clear");
        expect(json.received).toBe(false);
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.dispute.closed",
          eventId: undefined,
          failureKind: "bundle_order_dispute_clear",
        });
      });

      it("returns 500 bundle_order_dispute when the renewal-cycle mark write fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrievePaymentIntent.mockResolvedValueOnce({ customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        markOrderDisputed.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(disputeClosedEvent({ status: "lost" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_dispute");
        expect(json.received).toBe(false);
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "charge.dispute.closed",
          eventId: undefined,
          failureKind: "bundle_order_dispute",
        });
      });
    });
  });

  describe("refund.updated reversed-refund resolution", () => {
    function refundUpdatedEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: "refund.updated",
        data: {
          object: {
            id: "re_1",
            charge: "ch_refund_1",
            payment_intent: "pi_refund_1",
            amount: 5000,
            status: "failed",
            ...overrides,
          },
        },
      };
    }

    it("clears refundedAt when status is failed", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        refundedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveCharge).toHaveBeenCalledWith("ch_refund_1");
      expect(clearCommerceOrderRefunded).toHaveBeenCalledWith("cs_commerce_1", {
        requireConvex: true,
      });
    });

    it("clears refundedAt when status is canceled", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        refundedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "canceled" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderRefunded).toHaveBeenCalledWith("cs_commerce_1", {
        requireConvex: true,
      });
    });

    it("skips a non-reversal status (succeeded) entirely — no Session lookup", async () => {
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "succeeded" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("skips in-progress statuses (pending, requires_action)", async () => {
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "pending" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("is idempotent — does not re-clear when refundedAt is already unset", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("skips a reversed refund with no payment_intent", async () => {
      constructEvent.mockReturnValue(refundUpdatedEvent({ payment_intent: null }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("skips a reversed refund with no charge — cannot re-verify aggregate state", async () => {
      constructEvent.mockReturnValue(refundUpdatedEvent({ charge: null }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveCharge).not.toHaveBeenCalled();
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("does not clear refundedAt when a different refund on the same charge is still in effect", async () => {
      // Refund A ($30) already succeeded on this charge (refundedAt got set
      // by the earlier charge.refunded event). Refund B ($20), a separate
      // partial refund attempt on the SAME charge, now fails — but Refund A's
      // money never came back, so the charge's own amount_refunded is still
      // nonzero. refundedAt must stay set; this refund event alone must not
      // clear it. See refund-reversal-charge-aggregate-recheck.
      retrieveCharge.mockResolvedValueOnce({ amount_refunded: 3000 });
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(retrieveCharge).toHaveBeenCalledWith("ch_refund_1");
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
      expect(clearOrderRefunded).not.toHaveBeenCalled();
    });

    it("returns 500 commerce_order_refund_reversed_charge_lookup when the charge retrieve fails", async () => {
      retrieveCharge.mockRejectedValueOnce(new Error("stripe down"));
      constructEvent.mockReturnValue(refundUpdatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_refund_reversed_charge_lookup");
      expect(json.received).toBe(false);
      expect(listCheckoutSessions).not.toHaveBeenCalled();
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "refund.updated",
        eventId: undefined,
        failureKind: "commerce_order_refund_reversed_charge_lookup",
      });
    });

    it("skips when no Checkout Session matches", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [] });
      constructEvent.mockReturnValue(refundUpdatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("clears bundle refundedAt when the Session backs a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
        refundedAt: "2026-07-10T00:00:00.000Z",
      });
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearOrderRefunded).toHaveBeenCalledWith("cs_bundle_1", { requireConvex: true });
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
    });

    it("skips when the Session backs neither a commerce order nor a bundle order", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_unknown_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce(null);
      constructEvent.mockReturnValue(refundUpdatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
      expect(clearOrderRefunded).not.toHaveBeenCalled();
    });

    it("returns 500 bundle_order_refund_clear when the bundle clear write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_bundle_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce(null);
      getOrderByStripeSessionId.mockResolvedValueOnce({
        id: "ord_1",
        leadSlug: "demo-cafe",
        stripeSessionId: "cs_bundle_1",
        tier: "growth",
        commerceAddon: false,
        amountPaid: 300,
        status: "paid",
        createdAt: "2026-07-01T00:00:00.000Z",
        refundedAt: "2026-07-10T00:00:00.000Z",
      });
      clearOrderRefunded.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_order_refund_clear");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "refund.updated",
        eventId: undefined,
        failureKind: "bundle_order_refund_clear",
      });
    });

    it("returns 500 commerce_order_refund_reversed_session_lookup when Session list fails", async () => {
      listCheckoutSessions.mockRejectedValueOnce(new Error("stripe down"));
      constructEvent.mockReturnValue(refundUpdatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_refund_reversed_session_lookup");
      expect(clearCommerceOrderRefunded).not.toHaveBeenCalled();
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "refund.updated",
        eventId: undefined,
        failureKind: "commerce_order_refund_reversed_session_lookup",
      });
    });

    it("returns 500 commerce_order_refund_clear when the clear write fails", async () => {
      listCheckoutSessions.mockResolvedValueOnce({ data: [{ id: "cs_commerce_1" }] });
      getCommerceOrderByStripeSessionId.mockResolvedValueOnce({
        id: "corder_1",
        leadSlug: "demo-cafe",
        skuId: "sku_1",
        skuName: "Widget",
        amountPaidUsd: 50,
        stripeSessionId: "cs_commerce_1",
        createdAt: "2026-07-01T00:00:00.000Z",
        refundedAt: "2026-07-10T00:00:00.000Z",
      });
      clearCommerceOrderRefunded.mockRejectedValueOnce(new Error("convex down"));
      constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_refund_clear");
      expect(json.received).toBe(false);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-webhook",
        eventType: "refund.updated",
        eventId: undefined,
        failureKind: "commerce_order_refund_clear",
      });
    });

    // A renewal-cycle refund's PaymentIntent was never attached to a Checkout
    // Session in the first place — the Session lookup above always misses a
    // renewal-cycle reversal too, the same gap charge.refunded's own fallback
    // closes for the "opened" event. These cases cover the Stripe-Customer-
    // correlation fallback added to close the "closed/reversed" twin gap. See
    // refund-updated-dispute-closed-customer-correlation-fallback.
    describe("renewal-cycle reversed refund (no Checkout Session) via Stripe Customer correlation", () => {
      it("clears the customer's entitled order refundedAt when the Session lookup misses", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrieveCharge.mockResolvedValueOnce({ amount_refunded: 0, customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            refundedAt: "2026-07-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(getOrdersByStripeCustomerId).toHaveBeenCalledWith("cus_renewal_1");
        expect(clearOrderRefunded).toHaveBeenCalledWith("cs_original_signup", {
          requireConvex: true,
        });
      });

      it("is idempotent — does not clear when refundedAt was never set", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrieveCharge.mockResolvedValueOnce({ amount_refunded: 0, customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
          },
        ]);
        constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(clearOrderRefunded).not.toHaveBeenCalled();
      });

      it("skips when the re-fetched charge has no customer to correlate", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrieveCharge.mockResolvedValueOnce({ amount_refunded: 0, customer: null });
        constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(getOrdersByStripeCustomerId).not.toHaveBeenCalled();
        expect(clearOrderRefunded).not.toHaveBeenCalled();
      });

      it("skips when the customer has no currently-entitled order", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrieveCharge.mockResolvedValueOnce({ amount_refunded: 0, customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([]);
        constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(clearOrderRefunded).not.toHaveBeenCalled();
      });

      it("returns 500 bundle_order_renewal_customer_lookup when the customer orders lookup fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrieveCharge.mockResolvedValueOnce({ amount_refunded: 0, customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_renewal_customer_lookup");
        expect(clearOrderRefunded).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "refund.updated",
          eventId: undefined,
          failureKind: "bundle_order_renewal_customer_lookup",
        });
      });

      it("returns 500 bundle_order_refund_clear when the renewal-cycle clear write fails", async () => {
        listCheckoutSessions.mockResolvedValueOnce({ data: [] });
        retrieveCharge.mockResolvedValueOnce({ amount_refunded: 0, customer: "cus_renewal_1" });
        getOrdersByStripeCustomerId.mockResolvedValueOnce([
          {
            id: "ord_1",
            leadSlug: "demo-cafe",
            stripeSessionId: "cs_original_signup",
            stripeCustomerId: "cus_renewal_1",
            tier: "growth",
            commerceAddon: false,
            amountPaid: 49,
            status: "paid",
            createdAt: "2026-05-01T00:00:00.000Z",
            refundedAt: "2026-07-01T00:00:00.000Z",
          },
        ]);
        clearOrderRefunded.mockRejectedValueOnce(new Error("convex down"));
        constructEvent.mockReturnValue(refundUpdatedEvent({ status: "failed" }));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        const json = await response.json();
        expect(response.status).toBe(500);
        expect(json.step).toBe("bundle_order_refund_clear");
        expect(json.received).toBe(false);
        expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
          component: "stripe-webhook",
          eventType: "refund.updated",
          eventId: undefined,
          failureKind: "bundle_order_refund_clear",
        });
      });
    });
  });

  describe("payment_status paid gate (async ACH)", () => {
    it("completed+unpaid: marks session complete but skips bundle ledger/handoff/receipt", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
        payment_status: "unpaid",
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledWith("cs_test_1", {
        requireConvex: true,
      });
      expect(markCompleteOpenBundleCheckoutSessionsForLead).not.toHaveBeenCalled();
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
      expect(sendBundleDnsHandoffEmail).not.toHaveBeenCalled();
    });

    it("completed+unpaid: marks session complete but skips commerce ledger/inquiry/receipt", async () => {
      const session = checkoutSession({
        metadata: {
          kind: "commerce_sku",
          slug: "demo-cafe",
          skuId: "sku_latte",
        },
        amount_total: 2500,
        payment_status: "unpaid",
      });
      constructEvent.mockReturnValue(completedEvent(session));
      getCommerceCatalog.mockResolvedValue({
        items: [{ id: "sku_latte", name: "Latte", priceCents: 2500 }],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledWith("cs_test_1", {
        requireConvex: true,
      });
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("async_payment_succeeded+paid: fulfills bundle ledger after prior unpaid completed", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
        payment_status: "paid",
      });
      constructEvent.mockReturnValue(asyncPaymentSucceededEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "demo-cafe", tier: "growth" }),
        { requireConvex: true },
      );
      expect(sendReceiptEmail).toHaveBeenCalled();
    });

    it("async_payment_failed: reopens checkout session for abandoned-recovery (no fulfillment)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
        payment_status: "unpaid",
      });
      constructEvent.mockReturnValue(asyncPaymentFailedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionOpen).toHaveBeenCalledWith("cs_test_1", {
        requireConvex: true,
      });
      expect(markCheckoutSessionComplete).not.toHaveBeenCalled();
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });

    it("returns 500 (checkout_session_mark_open) when async_payment_failed reopen fails", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        payment_status: "unpaid",
      });
      constructEvent.mockReturnValue(asyncPaymentFailedEvent(session));
      markCheckoutSessionOpen.mockRejectedValueOnce(new Error("convex down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("checkout_session_mark_open");
      expect(json.received).toBe(false);
      expect(recordLeadPayment).not.toHaveBeenCalled();
    });
  });

  describe("orphan open bundle checkout_sessions cleanup", () => {
    it("paid bundle: closes other open bundle sessions after durable recordLeadPayment", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledWith("cs_test_1", {
        requireConvex: true,
      });
      expect(recordLeadPayment).toHaveBeenCalled();
      expect(markCompleteOpenBundleCheckoutSessionsForLead).toHaveBeenCalledWith(
        "demo-cafe",
        "cs_test_1",
        { requireConvex: true },
      );
      // Cleanup must follow durable payment — not run on slug parse alone.
      expect(markCompleteOpenBundleCheckoutSessionsForLead.mock.invocationCallOrder[0]).toBeGreaterThan(
        recordLeadPayment.mock.invocationCallOrder[0]!,
      );
    });

    it("commerce_sku paid: does not close sibling bundle carts for the lead", async () => {
      const session = checkoutSession({
        metadata: {
          kind: "commerce_sku",
          slug: "demo-cafe",
          skuId: "sku_latte",
        },
        amount_total: 2500,
        customer_details: { email: "shopper@example.com" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      listLineItems.mockResolvedValue(
        commerceSkuLineItems(COMMERCE_SKU_PRICE_ID, commerceSkuStripeKey("demo-cafe", "sku_latte")),
      );
      getLeadBySlug.mockResolvedValue({
        ...eligibleCommerceLead,
        slug: "demo-cafe",
      });
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_latte",
            name: "Latte",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      sendCommerceBuyNowClientReceipt.mockResolvedValue({ success: true });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalled();
      expect(markCompleteOpenBundleCheckoutSessionsForLead).not.toHaveBeenCalled();
    });

    it("skips orphan cleanup when amount_total mismatches catalog (keep recovery carts)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        amount_total: 999,
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledTimes(1);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(markCompleteOpenBundleCheckoutSessionsForLead).not.toHaveBeenCalled();
    });

    it("skips orphan cleanup when tier is unknown (keep recovery carts)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "enterprise" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(markCompleteOpenBundleCheckoutSessionsForLead).not.toHaveBeenCalled();
    });

    it("skips orphan cleanup when currency is not usd (keep recovery carts)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        currency: "eur",
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(markCompleteOpenBundleCheckoutSessionsForLead).not.toHaveBeenCalled();
    });

    it("returns 500 (checkout_session_orphan_bundle_cleanup) when orphan cleanup fails after payment", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      markCompleteOpenBundleCheckoutSessionsForLead.mockRejectedValueOnce(
        new Error("convex down"),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("checkout_session_orphan_bundle_cleanup");
      expect(json.received).toBe(false);
      // Payment already durable — Stripe retry recovers cleanup + emails.
      expect(recordLeadPayment).toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });
  });

  describe("orphan open commerce_sku checkout_sessions cleanup", () => {
    function paidCommerceSession(overrides: Record<string, unknown> = {}) {
      return checkoutSession({
        metadata: {
          kind: "commerce_sku",
          slug: "demo-cafe",
          skuId: "sku_latte",
        },
        amount_total: 2500,
        customer_details: { email: "shopper@example.com" },
        ...overrides,
      });
    }

    beforeEach(() => {
      listLineItems.mockResolvedValue(
        commerceSkuLineItems(COMMERCE_SKU_PRICE_ID, commerceSkuStripeKey("demo-cafe", "sku_latte")),
      );
      getLeadBySlug.mockResolvedValue({
        ...eligibleCommerceLead,
        slug: "demo-cafe",
      });
      listOrdersByLeadSlug.mockResolvedValue(activeCommerceOrders);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_latte",
            name: "Latte",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      sendCommerceBuyNowClientReceipt.mockResolvedValue({ success: true });
    });

    it("paid commerce: closes matching open carts after ledger write", async () => {
      constructEvent.mockReturnValue(completedEvent(paidCommerceSession()));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalled();
      expect(markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer).toHaveBeenCalledWith(
        "demo-cafe",
        "sku_latte",
        "shopper@example.com",
        "cs_test_1",
        { requireConvex: true },
      );
      // After durable ledger — not before (amount/catalog gates must pass first).
      expect(insertCommerceOrder.mock.invocationCallOrder[0]).toBeLessThan(
        markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer.mock.invocationCallOrder[0]!,
      );
    });

    it("skips commerce orphan cleanup when shopper email is missing", async () => {
      constructEvent.mockReturnValue(
        completedEvent(
          paidCommerceSession({
            customer_details: { email: null },
            customer_email: null,
          }),
        ),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalled();
      expect(markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer).not.toHaveBeenCalled();
    });

    it("does not close commerce orphans when amount_total is invalid (skips ledger)", async () => {
      // amount_total no longer has to equal the catalog's *current* priceCents
      // (see commerce-sku-price-resync-metadata-match) — a non-positive
      // amount is still invalid regardless of price history.
      constructEvent.mockReturnValue(
        completedEvent(paidCommerceSession({ amount_total: 0 })),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer).not.toHaveBeenCalled();
    });

    it("returns 500 (checkout_session_orphan_commerce_cleanup) when orphan cleanup fails after ledger", async () => {
      constructEvent.mockReturnValue(completedEvent(paidCommerceSession()));
      markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer.mockRejectedValueOnce(
        new Error("convex down"),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("checkout_session_orphan_commerce_cleanup");
      expect(json.received).toBe(false);
      expect(insertCommerceOrder).toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
    });
  });

  describe("bundle checkout (Starter/Growth/Complete)", () => {
    it("first delivery: records payment, enqueues handoff, and sends both buyer emails", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json).toEqual({ received: true });
      expect(markCheckoutSessionComplete).toHaveBeenCalledWith("cs_test_1", { requireConvex: true });
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "demo-cafe", tier: "growth" }),
        { requireConvex: true },
      );
      expect(insertDeployHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ leadSlug: "demo-cafe", tier: "growth" }),
        { requireConvex: true },
      );
      expect(sendReceiptEmail).toHaveBeenCalledWith(
        "owner@demo-cafe.test",
        "Demo Cafe",
        "growth",
        GROWTH_CHECKOUT_AMOUNT_CENTS / 100,
      );
      expect(sendBundleDnsHandoffEmail).toHaveBeenCalledTimes(1);
      expect(updateDeployHandoffStatus).toHaveBeenCalledTimes(2);
    });

    describe("annual billing (annual-billing-option)", () => {
      beforeEach(() => {
        process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL = GROWTH_ANNUAL_PRICE_ID;
      });

      it("fulfills an annual Growth session: catalog Price gate + amount gate both use the annual Price/amount, not monthly", async () => {
        listLineItems.mockResolvedValue({
          data: [
            { price: { id: GROWTH_SETUP_PRICE_ID } },
            { price: { id: GROWTH_ANNUAL_PRICE_ID } },
          ],
        });
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth", billingInterval: "annual" },
          customer_details: { email: "owner@demo-cafe.test" },
          amount_total: GROWTH_ANNUAL_CHECKOUT_AMOUNT_CENTS,
        });
        constructEvent.mockReturnValue(completedEvent(session));
        recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
        getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
        updateDeployHandoffStatus.mockImplementation(
          async (_slug: string, status: string, notes: string[]) => ({
            ...existingHandoff({ status: status as DeployHandoff["status"] }),
            notes: [...existingHandoff().notes, ...notes],
          }),
        );
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).toHaveBeenCalledWith(
          expect.objectContaining({ slug: "demo-cafe", tier: "growth" }),
          { requireConvex: true },
        );
        expect(sendReceiptEmail).toHaveBeenCalledWith(
          "owner@demo-cafe.test",
          "Demo Cafe",
          "growth",
          GROWTH_ANNUAL_CHECKOUT_AMOUNT_CENTS / 100,
        );
      });

      it("skips fulfillment when an annual session's amount_total matches the MONTHLY expected amount instead of annual — proves the amount gate actually switched, not just accepted a wider range", async () => {
        listLineItems.mockResolvedValue({
          data: [
            { price: { id: GROWTH_SETUP_PRICE_ID } },
            { price: { id: GROWTH_ANNUAL_PRICE_ID } },
          ],
        });
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth", billingInterval: "annual" },
          customer_details: { email: "owner@demo-cafe.test" },
          // Monthly amount, not annual — must not fulfill.
          amount_total: GROWTH_CHECKOUT_AMOUNT_CENTS,
        });
        constructEvent.mockReturnValue(completedEvent(session));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).not.toHaveBeenCalled();
      });

      it("skips fulfillment when an annual session's line items carry the monthly Price id instead of the annual one", async () => {
        // Session claims annual but Stripe actually charged the monthly Price.
        listLineItems.mockResolvedValue(growthLineItems());
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth", billingInterval: "annual" },
          customer_details: { email: "owner@demo-cafe.test" },
          amount_total: GROWTH_ANNUAL_CHECKOUT_AMOUNT_CENTS,
        });
        constructEvent.mockReturnValue(completedEvent(session));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).not.toHaveBeenCalled();
      });

      it("skips fulfillment when the Growth annual Price env is unset, even though the monthly env is configured", async () => {
        delete process.env.STRIPE_PRICE_ID_GROWTH_ANNUAL;
        listLineItems.mockResolvedValue({
          data: [
            { price: { id: GROWTH_SETUP_PRICE_ID } },
            { price: { id: GROWTH_ANNUAL_PRICE_ID } },
          ],
        });
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth", billingInterval: "annual" },
          customer_details: { email: "owner@demo-cafe.test" },
          amount_total: GROWTH_ANNUAL_CHECKOUT_AMOUNT_CENTS,
        });
        constructEvent.mockReturnValue(completedEvent(session));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).not.toHaveBeenCalled();
      });

      it("treats a missing/malformed billingInterval metadata value as monthly (falls back, does not skip or crash)", async () => {
        listLineItems.mockResolvedValue(growthLineItems());
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth", billingInterval: "yearly" },
          customer_details: { email: "owner@demo-cafe.test" },
          amount_total: GROWTH_CHECKOUT_AMOUNT_CENTS,
        });
        constructEvent.mockReturnValue(completedEvent(session));
        recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
        getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
        updateDeployHandoffStatus.mockImplementation(
          async (_slug: string, status: string, notes: string[]) => ({
            ...existingHandoff({ status: status as DeployHandoff["status"] }),
            notes: [...existingHandoff().notes, ...notes],
          }),
        );
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).toHaveBeenCalledWith(
          expect.objectContaining({ slug: "demo-cafe", tier: "growth" }),
          { requireConvex: true },
        );
      });
    });

    describe("setup-fee skip on a tier-upgrade checkout (checkout-setup-fee-skip-on-upgrade / webhook-setup-fee-skip-parity)", () => {
      /** Growth first month only ($99) — no setup fee. */
      const GROWTH_NO_SETUP_AMOUNT_CENTS = 9_900;

      function noSetupGrowthLineItems() {
        return { data: [{ price: { id: GROWTH_MONTHLY_PRICE_ID } }] };
      }

      it("fulfills a session that omitted the setup fee when the lead already has a different prior order", async () => {
        listLineItems.mockResolvedValue(noSetupGrowthLineItems());
        listOrdersByLeadSlug.mockResolvedValue([
          { stripeSessionId: "cs_prior_starter", tier: "starter", commerceAddon: false },
        ]);
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth" },
          customer_details: { email: "owner@demo-cafe.test" },
          amount_total: GROWTH_NO_SETUP_AMOUNT_CENTS,
        });
        constructEvent.mockReturnValue(completedEvent(session));
        recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
        getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
        updateDeployHandoffStatus.mockImplementation(
          async (_slug: string, status: string, notes: string[]) => ({
            ...existingHandoff({ status: status as DeployHandoff["status"] }),
            notes: [...existingHandoff().notes, ...notes],
          }),
        );
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).toHaveBeenCalledWith(
          expect.objectContaining({
            slug: "demo-cafe",
            tier: "growth",
            amountTotal: GROWTH_NO_SETUP_AMOUNT_CENTS / 100,
          }),
          { requireConvex: true },
        );
      });

      it("skips fulfillment when the setup fee is omitted but the lead has NO prior order on record — the exact bug this gate exists to catch (a tampered/mismatched session must not bypass the setup fee)", async () => {
        listLineItems.mockResolvedValue(noSetupGrowthLineItems());
        listOrdersByLeadSlug.mockResolvedValue([]);
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth" },
          customer_details: { email: "owner@demo-cafe.test" },
          amount_total: GROWTH_NO_SETUP_AMOUNT_CENTS,
        });
        constructEvent.mockReturnValue(completedEvent(session));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).not.toHaveBeenCalled();
      });

      it("a redelivery whose only recorded order is this exact session's own row still fulfills normally (self-exclusion) — the lead's genuinely first-ever purchase, which correctly charged the setup fee", async () => {
        // Only "prior" order on record is this session's own row (already
        // recorded by an earlier delivery of the same event) — excluded from
        // the prior-order count, so this is correctly treated as a first-time
        // purchase requiring (and, per the real charged line items, having)
        // the setup fee — never miscounted into a false setup-fee-skip.
        listLineItems.mockResolvedValue(growthLineItems());
        listOrdersByLeadSlug.mockResolvedValue([
          { stripeSessionId: "cs_test_1", tier: "growth", commerceAddon: false },
        ]);
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth" },
          customer_details: { email: "owner@demo-cafe.test" },
        });
        constructEvent.mockReturnValue(completedEvent(session));
        recordLeadPayment.mockResolvedValue({ alreadyRecorded: true });
        getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
        updateDeployHandoffStatus.mockImplementation(
          async (_slug: string, status: string, notes: string[]) => ({
            ...existingHandoff({ status: status as DeployHandoff["status"] }),
            notes: [...existingHandoff().notes, ...notes],
          }),
        );
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(recordLeadPayment).toHaveBeenCalledWith(
          expect.objectContaining({
            slug: "demo-cafe",
            tier: "growth",
            amountTotal: GROWTH_CHECKOUT_AMOUNT_CENTS / 100,
          }),
          { requireConvex: true },
        );
      });
    });

    describe("recurring order supersedes an earlier subscription for the same lead", () => {
      function baseSetup() {
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth" },
          customer_details: { email: "owner@demo-cafe.test" },
          customer: "cus_new",
        });
        constructEvent.mockReturnValue(completedEvent(session));
        recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
        getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
        updateDeployHandoffStatus.mockImplementation(
          async (_slug: string, status: string, notes: string[]) => ({
            ...existingHandoff({ status: status as DeployHandoff["status"] }),
            notes: [...existingHandoff().notes, ...notes],
          }),
        );
      }

      it("cancels the prior Customer's active subscription and marks its order recurringCanceledAt", async () => {
        baseSetup();
        listOrdersByLeadSlug.mockResolvedValue([
          { stripeSessionId: "cs_prior", stripeCustomerId: "cus_old", tier: "growth", commerceAddon: false },
        ]);
        listSubscriptions.mockResolvedValue({ data: [{ id: "sub_old_1" }] });
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        // No status filter — Stripe's own default excludes only
        // status=canceled, so a past_due/unpaid/paused Subscription is
        // found here too (recurring-upgrade-dedup-past-due-customer-reuse-gap).
        expect(listSubscriptions).toHaveBeenCalledWith({ customer: "cus_old" });
        // cancellation_details.comment lets the customer.subscription.deleted
        // handler's win-back notice tell this apart from a genuine
        // customer-initiated cancel and skip it (subscription-canceled-
        // win-back-notice suppression).
        expect(cancelSubscription).toHaveBeenCalledWith("sub_old_1", {
          cancellation_details: { comment: "superseded_by_recurring_upgrade" },
        });
        // Marked by the OLD order's own stripeSessionId, never by Customer
        // id — markOrdersRecurringCanceledByCustomer would also hit a
        // brand-new order sharing this Customer in the shared-Customer case
        // below (stripe-checkout-recurring-upgrade-dedup-shared-customer-fix).
        expect(markOrderRecurringCanceledBySessionId).toHaveBeenCalledWith(
          "cs_prior",
          expect.any(Number),
          { requireConvex: true },
        );
        expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      });

      it("cancels a superseded subscription that is past_due (recurringCanceledAt was set by a pause, not a terminal cancel) — recurring-upgrade-dedup-past-due-customer-reuse-gap", async () => {
        baseSetup();
        listOrdersByLeadSlug.mockResolvedValue([
          {
            stripeSessionId: "cs_prior",
            stripeCustomerId: "cus_past_due",
            tier: "growth",
            commerceAddon: false,
            recurringCanceledAt: 1_720_000_000_000,
          },
        ]);
        listSubscriptions.mockResolvedValue({ data: [{ id: "sub_past_due_1" }] });
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(listSubscriptions).toHaveBeenCalledWith({ customer: "cus_past_due" });
        expect(cancelSubscription).toHaveBeenCalledWith("sub_past_due_1", {
          cancellation_details: { comment: "superseded_by_recurring_upgrade" },
        });
      });

      it("does nothing for a genuinely first-time subscriber (no prior orders)", async () => {
        baseSetup();
        listOrdersByLeadSlug.mockResolvedValue([]);
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(listSubscriptions).not.toHaveBeenCalled();
        expect(cancelSubscription).not.toHaveBeenCalled();
      });

      it("cancels the prior subscription even when the prior order shares the new session's reused Customer id — the common upgrade path, distinguishing old from new by Subscription id (stripe-checkout-recurring-upgrade-dedup-shared-customer-fix)", async () => {
        baseSetup();
        // existingRecurringStripeCustomerId (checkout route) reuses "cus_new"
        // for the upgrade session, so the old order shares that same
        // Customer id — this is the PRIMARY intended path, not an edge case.
        listOrdersByLeadSlug.mockResolvedValue([
          { stripeSessionId: "cs_prior", stripeCustomerId: "cus_new", tier: "growth", commerceAddon: false },
        ]);
        // Both the old (superseded) and brand-new Subscription live under
        // the one shared Customer.
        listSubscriptions.mockResolvedValue({
          data: [{ id: "sub_old_1" }, { id: "sub_brand_new" }],
        });
        const session = checkoutSession({
          metadata: { slug: "demo-cafe", tier: "growth" },
          customer_details: { email: "owner@demo-cafe.test" },
          customer: "cus_new",
          subscription: "sub_brand_new",
        });
        constructEvent.mockReturnValue(completedEvent(session));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(listSubscriptions).toHaveBeenCalledWith({ customer: "cus_new" });
        // The old Subscription is canceled...
        expect(cancelSubscription).toHaveBeenCalledWith("sub_old_1", {
          cancellation_details: { comment: "superseded_by_recurring_upgrade" },
        });
        // ...but the brand-new one the customer just paid for is never
        // touched.
        expect(cancelSubscription).not.toHaveBeenCalledWith(
          "sub_brand_new",
          expect.anything(),
        );
        expect(cancelSubscription).toHaveBeenCalledTimes(1);
        // Marked by the OLD order's own stripeSessionId — never by
        // Customer id, which would also flip the brand-new order (sharing
        // "cus_new") recurring-canceled the instant it was created.
        expect(markOrderRecurringCanceledBySessionId).toHaveBeenCalledWith(
          "cs_prior",
          expect.any(Number),
          { requireConvex: true },
        );
        expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
      });

      it("skips cancellation on a shared Customer id when session.subscription is unexpectedly missing, rather than risk canceling the brand-new subscription", async () => {
        baseSetup();
        listOrdersByLeadSlug.mockResolvedValue([
          { stripeSessionId: "cs_prior", stripeCustomerId: "cus_new", tier: "growth", commerceAddon: false },
        ]);
        // No `subscription` override — checkoutSession() defaults to none.
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(listSubscriptions).not.toHaveBeenCalled();
        expect(cancelSubscription).not.toHaveBeenCalled();
        expect(markOrderRecurringCanceledBySessionId).not.toHaveBeenCalled();
        expect(markOrdersRecurringCanceledByCustomer).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            component: "stripe-webhook",
            failureKind: "supersede_recurring_subscription_missing_new_subscription_id",
          }),
        );
        // The new order's own recording must proceed regardless.
        expect(recordLeadPayment).toHaveBeenCalled();
      });

      it("is best-effort: a cancellation failure is captured but does not fail the webhook response", async () => {
        baseSetup();
        listOrdersByLeadSlug.mockResolvedValue([
          { stripeSessionId: "cs_prior", stripeCustomerId: "cus_old", tier: "growth", commerceAddon: false },
        ]);
        listSubscriptions.mockRejectedValue(new Error("Stripe API unavailable"));
        const { POST } = await import("./route");

        const response = await POST(webhookRequest());
        expect(response.status).toBe(200);
        expect(cancelSubscription).not.toHaveBeenCalled();
        expect(captureError).toHaveBeenCalledWith(
          expect.any(Error),
          expect.objectContaining({
            component: "stripe-webhook",
            failureKind: "supersede_recurring_subscription",
          }),
        );
        // The new order's own recording/handoff/receipt must not be rolled
        // back by a best-effort cancellation failure.
        expect(recordLeadPayment).toHaveBeenCalled();
        expect(sendReceiptEmail).toHaveBeenCalled();
      });
    });

    it("passes a valid metadata.acquisitionSource through to recordLeadPayment", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth", acquisitionSource: "cat-restaurant" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({ acquisitionSource: "cat-restaurant" }),
        { requireConvex: true },
      );
    });

    it("drops an unrecognized metadata.acquisitionSource rather than passing it through", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth", acquisitionSource: "google-ads" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({ acquisitionSource: undefined }),
        { requireConvex: true },
      );
    });

    it("passes trimmed metadata.businessName/businessPhone through to recordLeadPayment (organic no-preexisting-lead path)", async () => {
      const session = checkoutSession({
        metadata: {
          slug: "organic-abc123",
          tier: "growth",
          businessName: "  Riverside Plumbing  ",
          businessPhone: "  555-867-5309  ",
        },
        customer_details: { email: "owner@example.com" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Riverside Plumbing" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          businessName: "Riverside Plumbing",
          businessPhone: "555-867-5309",
        }),
        { requireConvex: true },
      );
    });

    it("omits businessName/businessPhone from recordLeadPayment when metadata is absent or blank", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({ businessName: undefined, businessPhone: undefined }),
        { requireConvex: true },
      );
    });

    it("redelivery with both emails already marked sent: skips both, no duplicate send", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: true });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      getDeployHandoffBySlug.mockResolvedValue(
        existingHandoff({
          notes: [
            "Buyer receipt email sent — Stripe session cs_test_1",
            "DNS handoff email sent — Stripe session cs_test_1",
          ],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
      expect(sendBundleDnsHandoffEmail).not.toHaveBeenCalled();
      expect(updateDeployHandoffStatus).not.toHaveBeenCalled();
    });

    it("redelivery recovery: recovers only the missing DNS handoff email", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: true });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      getDeployHandoffBySlug.mockResolvedValue(
        existingHandoff({
          notes: ["Buyer receipt email sent — Stripe session cs_test_1"],
        }),
      );
      updateDeployHandoffStatus.mockResolvedValue(
        existingHandoff({
          notes: [
            "Buyer receipt email sent — Stripe session cs_test_1",
            "DNS handoff email sent — Stripe session cs_test_1",
          ],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendReceiptEmail).not.toHaveBeenCalled();
      expect(sendBundleDnsHandoffEmail).toHaveBeenCalledTimes(1);
      expect(updateDeployHandoffStatus).toHaveBeenCalledTimes(1);
    });

    it("does not record payment when slug or tier metadata is missing (still marks the checkout session complete)", async () => {
      const session = checkoutSession({ metadata: { slug: "demo-cafe" } });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledTimes(1);
      expect(recordLeadPayment).not.toHaveBeenCalled();
    });

    it("does not record payment when tier is truthy but unknown (mirrors checkout getBundle gate)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "enterprise" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledTimes(1);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });

    it("does not record payment when tier is wrong-cased (getBundle is case-sensitive)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "Growth" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
    });

    it("does not record payment when slug is over MAX_LEAD_SLUG_LENGTH (create-path twin)", async () => {
      const { MAX_LEAD_SLUG_LENGTH } = await import("@/lib/leads/slug");
      const overLongSlug = "a".repeat(MAX_LEAD_SLUG_LENGTH + 1);
      const session = checkoutSession({
        metadata: { slug: overLongSlug, tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledTimes(1);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });

    it("trims bundle slug before recordLeadPayment (same as create-path lookup)", async () => {
      const session = checkoutSession({
        metadata: { slug: "  demo-cafe  ", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "demo-cafe",
          tier: "growth",
          amountTotal: GROWTH_CHECKOUT_AMOUNT_CENTS / 100,
        }),
        { requireConvex: true },
      );
    });

    it("does not record payment when amount_total !== catalog expected cents (create Price twin)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        amount_total: 999,
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledTimes(1);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });

    it("does not record payment when amount_total is below catalog expected cents with no matching Stripe-verified discount (tamper, not a real promo)", async () => {
      // Same 999 mismatch as above, but this time total_details is present
      // with amount_discount: 0 — proves the low amount isn't excused just
      // because total_details exists; it must actually account for the gap.
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        amount_total: 999,
        total_details: { amount_discount: 0, amount_shipping: null, amount_tax: 0 },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });

    it("records payment when amount_total reflects a genuine Stripe-applied allow_promotion_codes discount (bundle-webhook-promotion-code-amount-parity)", async () => {
      const discountCents = 10_000;
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        amount_total: GROWTH_CHECKOUT_AMOUNT_CENTS - discountCents,
        total_details: {
          amount_discount: discountCents,
          amount_shipping: null,
          amount_tax: 0,
        },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "demo-cafe",
          tier: "growth",
          amountTotal: (GROWTH_CHECKOUT_AMOUNT_CENTS - discountCents) / 100,
        }),
        { requireConvex: true },
      );
    });

    it("does not record payment when amount_total is missing (null) despite known tier", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        amount_total: null,
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledTimes(1);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
    });

    it("records payment for a 100%-off allow_promotion_codes redemption (payment_status no_payment_required, amount_total 0 — checkout-session-no-payment-required-fulfillment-gap)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        amount_total: 0,
        payment_status: "no_payment_required",
        total_details: {
          amount_discount: GROWTH_CHECKOUT_AMOUNT_CENTS,
          amount_shipping: null,
          amount_tax: 0,
        },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({ slug: "demo-cafe", tier: "growth", amountTotal: 0 }),
        { requireConvex: true },
      );
      expect(sendReceiptEmail).toHaveBeenCalled();
    });

    it("does not record payment when currency is not usd (create Price twin)", async () => {
      // amount_total matches catalog cents but EUR minor units must not ledger as USD.
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        currency: "eur",
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledTimes(1);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });

    it("does not trust metadata.commerceAddon=true without Commerce Price line items", async () => {
      process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
      process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth", commerceAddon: "true" },
        // amount matches growth-only catalog (derived commerceAddon=false)
        amount_total: GROWTH_CHECKOUT_AMOUNT_CENTS,
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      listLineItems.mockResolvedValue({
        data: [{ price: { id: "price_growth_setup" } }, { price: { id: "price_growth_monthly" } }],
      });
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listLineItems).toHaveBeenCalledWith("cs_test_1", { limit: 100 });
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({ commerceAddon: false }),
        { requireConvex: true },
      );
      expect(insertDeployHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ commerceAddon: false }),
        { requireConvex: true },
      );
    });

    it("records commerceAddon=true when both Commerce Price IDs are on line items", async () => {
      process.env.STRIPE_PRICE_ID_COMMERCE_SETUP = "price_commerce_setup";
      process.env.STRIPE_PRICE_ID_COMMERCE_MONTHLY = "price_commerce_monthly";
      // Growth ($599) + Commerce setup+month ($349) = $948
      const growthWithCommerceCents = GROWTH_CHECKOUT_AMOUNT_CENTS + 34_900;
      const session = checkoutSession({
        // metadata false must not withhold a paid add-on charged on line_items
        metadata: { slug: "demo-cafe", tier: "growth", commerceAddon: "false" },
        amount_total: growthWithCommerceCents,
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      listLineItems.mockResolvedValue({
        data: [
          { price: { id: "price_growth_setup" } },
          { price: { id: "price_growth_monthly" } },
          { price: { id: "price_commerce_setup" } },
          { price: { id: "price_commerce_monthly" } },
        ],
      });
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).toHaveBeenCalledWith(
        expect.objectContaining({
          commerceAddon: true,
          amountTotal: growthWithCommerceCents / 100,
        }),
        { requireConvex: true },
      );
      expect(insertDeployHandoff).toHaveBeenCalledWith(
        expect.objectContaining({ commerceAddon: true }),
        { requireConvex: true },
      );
    });

    it("returns 500 (bundle_commerce_addon_line_items) when listLineItems fails", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth", commerceAddon: "true" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      listLineItems.mockRejectedValue(new Error("stripe down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_commerce_addon_line_items");
      expect(recordLeadPayment).not.toHaveBeenCalled();
    });

    it("does not record payment when Growth catalog Prices are missing from line items (amount+currency match)", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      // Wrong Price IDs with matching cents — must not ledger.
      listLineItems.mockResolvedValue({
        data: [{ price: { id: "price_other_setup" } }, { price: { id: "price_other_monthly" } }],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
      expect(sendReceiptEmail).not.toHaveBeenCalled();
    });

    it("does not record payment when Growth monthly Price env is missing (create twin 501)", async () => {
      delete process.env.STRIPE_PRICE_ID_GROWTH_MONTHLY;
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(recordLeadPayment).not.toHaveBeenCalled();
      expect(insertDeployHandoff).not.toHaveBeenCalled();
    });

    it("returns 500 (checkout_session_mark_complete) so Stripe retries when marking the session complete fails", async () => {
      const session = checkoutSession({ metadata: { slug: "demo-cafe", tier: "growth" } });
      constructEvent.mockReturnValue(completedEvent(session));
      markCheckoutSessionComplete.mockRejectedValue(new Error("db down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("checkout_session_mark_complete");
      expect(recordLeadPayment).not.toHaveBeenCalled();
    });

    it("returns 500 (bundle_payment_or_handoff) so Stripe retries when recordLeadPayment fails, and reports it via captureError since this inner catch returns rather than re-throwing (stripe-webhook-payment-write-capture-error)", async () => {
      const session = checkoutSession({ metadata: { slug: "demo-cafe", tier: "growth" } });
      const paymentError = new Error("db down");
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockRejectedValue(paymentError);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_payment_or_handoff");
      expect(sendReceiptEmail).not.toHaveBeenCalled();
      // This catch returns a 5xx response instead of re-throwing, so it never
      // reaches the outer try/catch's own captureError call — it must be
      // wired here directly (see stripe-webhook-payment-write-capture-error).
      expect(captureError).toHaveBeenCalledWith(paymentError, {
        component: "stripe-webhook",
        eventType: "checkout.session.completed",
        eventId: undefined,
        failureKind: "bundle_payment_or_handoff",
      });
    });

    it("returns 500 (bundle_email_sent_marker) when the durable sent-marker write fails after a successful send, forcing Stripe to redeliver", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      updateDeployHandoffStatus.mockRejectedValue(new Error("marker write failed"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_email_sent_marker");
      expect(sendReceiptEmail).toHaveBeenCalledTimes(1);
      // Best-effort send already happened once; do not re-send DNS email on this failure path.
      expect(sendBundleDnsHandoffEmail).not.toHaveBeenCalled();
    });

    it("returns 500 after attempting the DNS handoff email when the buyer receipt send throws", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      sendReceiptEmail.mockRejectedValue(new Error("resend down"));
      updateDeployHandoffStatus.mockResolvedValue(existingHandoff());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_email_send");
      expect(sendBundleDnsHandoffEmail).toHaveBeenCalledTimes(1);
    });

    it("returns 500 when the DNS handoff email throws unexpectedly, so Stripe retries missing markers", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      sendBundleDnsHandoffEmail.mockRejectedValue(new Error("dns formatting failed"));
      updateDeployHandoffStatus.mockResolvedValue(existingHandoff());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_email_send");
      // The buyer receipt completed before the DNS formatter failed; its
      // independent marker remains durable while DNS is retried.
      expect(updateDeployHandoffStatus).toHaveBeenCalledTimes(1);
    });

    it("does not mark the receipt sent when sendReceiptEmail resolves success:false (suppressed), so redelivery retries it", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      sendReceiptEmail.mockResolvedValue({ success: false, reason: "suppressed" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_email_send");
      expect(sendReceiptEmail).toHaveBeenCalledTimes(1);
      // Only the DNS handoff marker is written — the suppressed receipt never gets one.
      expect(updateDeployHandoffStatus).toHaveBeenCalledTimes(1);
      expect(updateDeployHandoffStatus).toHaveBeenCalledWith(
        "demo-cafe",
        expect.anything(),
        [expect.stringContaining("DNS handoff email sent")],
        { requireConvex: true },
      );
    });

    it("does not mark the DNS handoff email sent when sendBundleDnsHandoffEmail resolves success:false, so redelivery retries it", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      sendBundleDnsHandoffEmail.mockResolvedValue({ success: false, error: "Resend API error" });
      updateDeployHandoffStatus.mockImplementation(
        async (_slug: string, status: string, notes: string[]) => ({
          ...existingHandoff({ status: status as DeployHandoff["status"] }),
          notes: [...existingHandoff().notes, ...notes],
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_email_send");
      expect(sendBundleDnsHandoffEmail).toHaveBeenCalledTimes(1);
      // Only the receipt marker is written — the failed DNS email never gets one.
      expect(updateDeployHandoffStatus).toHaveBeenCalledTimes(1);
      expect(updateDeployHandoffStatus).toHaveBeenCalledWith(
        "demo-cafe",
        expect.anything(),
        [expect.stringContaining("Buyer receipt email sent")],
        { requireConvex: true },
      );
    });
  });

  describe("commerce Buy now checkout", () => {
    function commerceSession(overrides: Record<string, unknown> = {}) {
      return checkoutSession({
        metadata: { kind: "commerce_sku", slug: "demo-cafe", skuId: "sku_1" },
        amount_total: 2500,
        ...overrides,
      });
    }

    const syncedCommerceCatalog = {
      items: [
        {
          id: "sku_1",
          name: "Coffee Beans",
          priceCents: 2500,
          stripePriceId: COMMERCE_SKU_PRICE_ID,
        },
      ],
    };

    beforeEach(() => {
      // Commerce path lists line items for catalog Price membership (not Growth).
      listLineItems.mockResolvedValue(commerceSkuLineItems());
      // Default CRM entitlement — mirrors POST /api/commerce/checkout fixtures.
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      listOrdersByLeadSlug.mockResolvedValue(activeCommerceOrders);
      getCommerceCatalog.mockResolvedValue(syncedCommerceCatalog);
    });

    it("first delivery: records the ledger and notifies the operator via inquiry + client receipt", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
      expect(listLineItems).toHaveBeenCalledWith("cs_test_1", {
        limit: 100,
        expand: ["data.price"],
      });
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          leadSlug: "demo-cafe",
          skuId: "sku_1",
          skuName: "Coffee Beans",
          amountPaidUsd: 25,
          stripeSessionId: "cs_test_1",
        }),
        { requireConvex: true },
      );
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      const inquiryArg = insertClientInquiry.mock.calls[0]?.[0];
      expect(inquiryArg.source).toBe("commerce_checkout");
      expect(inquiryArg.message).toContain("cs_test_1");
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
      expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledWith(
        "cs_test_1",
        expect.any(String),
        { requireConvex: true },
      );
    });

    it("records the purchased quantity on the ledger and surfaces it to the operator inquiry + client receipt (adjustable_quantity Buy now)", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      listLineItems.mockResolvedValue(
        commerceSkuLineItems(COMMERCE_SKU_PRICE_ID, undefined, 3),
      );
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
        quantity: 3,
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 3 }),
        { requireConvex: true },
      );
      const inquiryArg = insertClientInquiry.mock.calls[0]?.[0];
      expect(inquiryArg.message).toContain("quantity 3");
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 3 }),
      );
    });

    it("omits quantity (undefined, never a bogus fallback) when the matched line item carries no quantity", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      listLineItems.mockResolvedValue(commerceSkuLineItems());
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: undefined }),
        { requireConvex: true },
      );
      const inquiryArg = insertClientInquiry.mock.calls[0]?.[0];
      expect(inquiryArg.message).not.toContain("quantity");
    });

    it("records the shopper's customer_details.email on the ledger so a later manual resend can Reply-To them", async () => {
      constructEvent.mockReturnValue(
        completedEvent(
          commerceSession({ customer_details: { email: "shopper@example.com" } }),
        ),
      );
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customerEmail: "shopper@example.com" }),
        { requireConvex: true },
      );
    });

    it("omits customerEmail (undefined, not empty string) when Checkout collected no customer email", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ customerEmail: undefined }),
        { requireConvex: true },
      );
    });

    it("soft-caps an over-long customer_details.email before persisting (same bound the checkout-create routes already apply to this field)", async () => {
      const { MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH } = await import(
        "@/lib/checkout/customer-email"
      );
      const overlong = `${"a".repeat(MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH + 40)}@shop.test`;
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ customer_details: { email: overlong } })),
      );
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      const persisted = insertCommerceOrder.mock.calls[0]?.[0]?.customerEmail as string;
      expect(persisted.length).toBe(MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH);
      expect(overlong.length).toBeGreaterThan(MAX_CHECKOUT_CUSTOMER_EMAIL_LENGTH);
    });

    it("skips ledger/notify when lead is missing (create-path 404 twin)", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(null);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledWith("cs_test_1", {
        requireConvex: true,
      });
      expect(listOrdersByLeadSlug).not.toHaveBeenCalled();
      expect(listLineItems).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when recurring entitlement is paused/canceled (create-path 403 twin)", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      listOrdersByLeadSlug.mockResolvedValue([
        { commerceAddon: true, recurringCanceledAt: Date.parse("2026-07-01T00:00:00.000Z") },
      ]);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(markCheckoutSessionComplete).toHaveBeenCalledWith("cs_test_1", {
        requireConvex: true,
      });
      expect(listOrdersByLeadSlug).toHaveBeenCalledWith("demo-cafe");
      expect(listLineItems).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when lead has no active commerceAddon order", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      listOrdersByLeadSlug.mockResolvedValue([{ commerceAddon: false }]);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("redelivery already notified: skips inquiry and client receipt when both durable markers exist", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: true });
      listCommerceCheckoutInquiriesBySlug.mockResolvedValue([
        { source: "commerce_checkout", message: "Paid order — Stripe session cs_test_1" },
      ]);
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
        clientReceiptEmailSentAt: "2026-07-14T12:00:00.000Z",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
      expect(markCommerceOrderClientReceiptSent).not.toHaveBeenCalled();
    });

    it("redelivery recovery: ledger already recorded but inquiry missing — recovers the notify", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: true });
      listCommerceCheckoutInquiriesBySlug.mockResolvedValue([]);
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
      expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledTimes(1);
    });

    it("redelivery recovery: inquiry exists but receipt marker missing — recovers only the client receipt", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: true });
      listCommerceCheckoutInquiriesBySlug.mockResolvedValue([
        { source: "commerce_checkout", message: "Paid order — Stripe session cs_test_1" },
      ]);
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
      expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledTimes(1);
    });

    it("skips the notify entirely when skuId is missing from metadata, without writing the ledger", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ metadata: { kind: "commerce_sku", slug: "demo-cafe" } })),
      );
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getCommerceCatalog).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when skuId is over MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH (create-path twin)", async () => {
      const { MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH } = await import(
        "@/lib/commerce/checkout-fields"
      );
      const overLongSkuId = "s".repeat(MAX_COMMERCE_CHECKOUT_SKU_ID_LENGTH + 1);
      constructEvent.mockReturnValue(
        completedEvent(
          commerceSession({
            metadata: { kind: "commerce_sku", slug: "demo-cafe", skuId: overLongSkuId },
          }),
        ),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getCommerceCatalog).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when skuId is not in the lead catalog (mirrors Buy now create 404)", async () => {
      constructEvent.mockReturnValue(
        completedEvent(
          commerceSession({
            metadata: { kind: "commerce_sku", slug: "demo-cafe", skuId: "sku_unknown" },
          }),
        ),
      );
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when the lead has no commerce catalog (no Catalog item fallback)", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue(null);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("records the ledger from the actual amount_total even when it no longer matches the catalog's current priceCents (commerce-sku-price-resync-metadata-match regression)", async () => {
      // Simulates: shopper opens a Checkout Session at the old $9.99 price,
      // operator edits the SKU to $25.00 and re-syncs (catalog.priceCents is
      // now 2500 and stripePriceId points at a brand-new Stripe Price), then
      // the shopper completes the ORIGINAL session — Stripe honors the old,
      // now catalog-orphaned Price and genuinely charges $9.99. The line
      // item still carries the platform's stable metadata key for this SKU
      // (stripe-sync sets it on every Price it ever mints), so the ledger
      // must record the real $9.99 charge instead of silently dropping it.
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ amount_total: 999 })),
      );
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: "price_commerce_sku_1_resynced",
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          leadSlug: "demo-cafe",
          skuId: "sku_1",
          amountPaidUsd: 9.99,
          stripeSessionId: "cs_test_1",
        }),
        { requireConvex: true },
      );
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
    });

    it("skips ledger/notify when amount_total is non-positive (invalid charge, not a repriced-catalog case)", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ amount_total: 0 })),
      );
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("records ledger/notify for a 100%-off allow_promotion_codes redemption (payment_status no_payment_required, amount_total 0 — checkout-session-no-payment-required-fulfillment-gap)", async () => {
      constructEvent.mockReturnValue(
        completedEvent(
          commerceSession({ amount_total: 0, payment_status: "no_payment_required" }),
        ),
      );
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          leadSlug: "demo-cafe",
          skuId: "sku_1",
          amountPaidUsd: 0,
          stripeSessionId: "cs_test_1",
        }),
        { requireConvex: true },
      );
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
    });

    it("skips ledger/notify when amount_total is missing (null) despite catalog SKU match", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ amount_total: null })),
      );
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when currency is not usd despite catalog amount match", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ currency: "eur" })),
      );
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when currency is missing (null) despite catalog SKU match", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ currency: null })),
      );
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when no line item Price carries the expected metadata key (foreign/tampered Price)", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      // A Price with no local_site_studio_key at all — never platform-issued
      // for any SKU, e.g. a Dashboard-minted or tampered Session.
      listLineItems.mockResolvedValue(commerceSkuLineItems("price_other_sku", null));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listLineItems).toHaveBeenCalledWith("cs_test_1", {
        limit: 100,
        expand: ["data.price"],
      });
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("records the ledger even when the catalog's current stripePriceId is missing, as long as line items carry this SKU's metadata key", async () => {
      // Same resync scenario as the commerce-sku-price-resync-metadata-match
      // regression test above, at the extreme: the catalog row currently has
      // no stripePriceId at all (e.g. cleared by a later edit), but the
      // Session's Price is still provably platform-issued for this SKU via
      // its stable metadata key, so the sale must still be ledgered.
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [{ id: "sku_1", name: "Coffee Beans", priceCents: 2500 }],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listLineItems).toHaveBeenCalled();
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ leadSlug: "demo-cafe", skuId: "sku_1" }),
        { requireConvex: true },
      );
    });

    it("returns 500 (commerce_sku_price_line_items) when listLineItems fails", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      listLineItems.mockRejectedValue(new Error("stripe down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_sku_price_line_items");
      expect(insertCommerceOrder).not.toHaveBeenCalled();
    });

    it("warns and stops when slug metadata is missing from a commerce_sku session", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ metadata: { kind: "commerce_sku", skuId: "sku_1" } })),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(getCommerceCatalog).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when slug is over MAX_COMMERCE_CHECKOUT_SLUG_LENGTH (create-path twin)", async () => {
      const { MAX_COMMERCE_CHECKOUT_SLUG_LENGTH } = await import(
        "@/lib/commerce/checkout-fields"
      );
      const overLongSlug = "a".repeat(MAX_COMMERCE_CHECKOUT_SLUG_LENGTH + 1);
      constructEvent.mockReturnValue(
        completedEvent(
          commerceSession({
            metadata: { kind: "commerce_sku", slug: overLongSlug, skuId: "sku_1" },
          }),
        ),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(getCommerceCatalog).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("trims commerce slug before catalog lookup (same as Buy now create)", async () => {
      constructEvent.mockReturnValue(
        completedEvent(
          commerceSession({
            metadata: { kind: "commerce_sku", slug: "  demo-cafe  ", skuId: "sku_1" },
          }),
        ),
      );
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).toHaveBeenCalledWith("demo-cafe");
      expect(getCommerceCatalog).toHaveBeenCalledWith("demo-cafe");
      expect(insertCommerceOrder).toHaveBeenCalledWith(
        expect.objectContaining({ leadSlug: "demo-cafe", skuId: "sku_1" }),
        { requireConvex: true },
      );
    });

    it("does not email a client receipt when the lead has no email on file", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue({ ...eligibleCommerceLead, email: "" });
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
      expect(markCommerceOrderClientReceiptSent).not.toHaveBeenCalled();
    });

    it("returns 500 (commerce_order_ledger) so Stripe retries when the ledger write fails, and reports it via captureError since this inner catch returns rather than re-throwing (commerce-order-ledger-write-capture-error)", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      const ledgerError = new Error("db down");
      insertCommerceOrder.mockRejectedValue(ledgerError);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_ledger");
      expect(insertClientInquiry).not.toHaveBeenCalled();
      // This catch returns a 5xx response instead of re-throwing, so it never
      // reaches the outer try/catch's own captureError call — it must be
      // wired here directly (see commerce-order-ledger-write-capture-error).
      expect(captureError).toHaveBeenCalledWith(ledgerError, {
        component: "stripe-webhook",
        eventType: "checkout.session.completed",
        eventId: undefined,
        failureKind: "commerce_order_ledger",
      });
    });

    it("returns 500 (commerce_order_inquiry) so Stripe retries when the operator inquiry write fails after a durable ledger write", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      insertClientInquiry.mockRejectedValue(new Error("db down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_inquiry");
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("returns 500 and leaves the receipt marker unwritten when sendCommerceBuyNowClientReceipt throws", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      sendCommerceBuyNowClientReceipt.mockRejectedValue(new Error("resend down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_client_receipt_send");
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(markCommerceOrderClientReceiptSent).not.toHaveBeenCalled();
    });

    it("does not mark the client receipt sent when send resolves success:false, so redelivery retries it", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      sendCommerceBuyNowClientReceipt.mockResolvedValue({
        success: false,
        reason: "suppressed",
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_client_receipt_send");
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
      expect(markCommerceOrderClientReceiptSent).not.toHaveBeenCalled();
    });

    it("returns 500 (commerce_client_receipt_sent_marker) when the durable receipt marker write fails after a successful send", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      markCommerceOrderClientReceiptSent.mockRejectedValue(new Error("db down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_client_receipt_sent_marker");
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
      expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledTimes(1);
    });

    it("returns 200 (not a fulfillment failure) when a concurrent writer already set the receipt marker", async () => {
      // Regression test for commerce-client-receipt-marker-race-guard:
      // markCommerceOrderClientReceiptSent now re-checks clientReceiptEmailSentAt
      // atomically with the write and returns false when an independent
      // trigger (e.g. an operator's manual resend, or another redelivery of
      // this same event) already set it between this handler's read and its
      // write. The email above already sent — the marker state is already
      // consistent (marked), so this must not be treated as a fulfillment
      // failure worth a 5xx retry.
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [
          {
            id: "sku_1",
            name: "Coffee Beans",
            priceCents: 2500,
            stripePriceId: COMMERCE_SKU_PRICE_ID,
          },
        ],
      });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      getCommerceOrderByStripeSessionId.mockResolvedValue({
        id: "corder_1",
        stripeSessionId: "cs_test_1",
      });
      markCommerceOrderClientReceiptSent.mockResolvedValue(false);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
      expect(markCommerceOrderClientReceiptSent).toHaveBeenCalledTimes(1);
    });
  });

  describe("account.updated Connect status cache refresh", () => {
    function accountUpdatedEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: "account.updated",
        data: {
          object: {
            id: "acct_connect_1",
            charges_enabled: true,
            payouts_enabled: true,
            details_submitted: true,
            ...overrides,
          },
        },
      };
    }

    it("persists the fresh status cache for the lead whose stripeConnectAccountId matches", async () => {
      getLeads.mockResolvedValueOnce([
        { slug: "demo-cafe", stripeConnectAccountId: "acct_connect_1" },
        { slug: "other-lead", stripeConnectAccountId: "acct_other" },
      ]);
      constructEvent.mockReturnValue(
        accountUpdatedEvent({
          charges_enabled: true,
          payouts_enabled: false,
          details_submitted: true,
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(updateLeadStripeConnectStatus).toHaveBeenCalledWith(
        "demo-cafe",
        { chargesEnabled: true, payoutsEnabled: false, detailsSubmitted: true },
        expect.any(String),
        { requireConvex: true },
      );
    });

    it("no-ops (200, no persist) when the account id matches no known lead", async () => {
      getLeads.mockResolvedValueOnce([{ slug: "other-lead", stripeConnectAccountId: "acct_other" }]);
      constructEvent.mockReturnValue(accountUpdatedEvent({ id: "acct_unknown" }));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(updateLeadStripeConnectStatus).not.toHaveBeenCalled();
    });

    it("still returns 200 (never 5xx — this is a display cache, not a ledger write) when the persist call fails, and reports it via captureError since this swallow-and-continue catch has no path to the outer catch (stripe-connect-status-cache-write-capture-error)", async () => {
      getLeads.mockResolvedValueOnce([
        { slug: "demo-cafe", stripeConnectAccountId: "acct_connect_1" },
      ]);
      updateLeadStripeConnectStatus.mockRejectedValueOnce(new Error("Convex write failed"));
      constructEvent.mockReturnValue(accountUpdatedEvent());
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(updateLeadStripeConnectStatus).toHaveBeenCalledTimes(1);
      expect(captureError).toHaveBeenCalledWith(expect.any(Error), {
        component: "stripe-connect-status",
        failureKind: "account_updated_webhook",
        leadSlug: "demo-cafe",
      });
    });

    it("defaults missing charges_enabled/payouts_enabled/details_submitted to false", async () => {
      getLeads.mockResolvedValueOnce([
        { slug: "demo-cafe", stripeConnectAccountId: "acct_connect_1" },
      ]);
      constructEvent.mockReturnValue(
        accountUpdatedEvent({
          charges_enabled: undefined,
          payouts_enabled: undefined,
          details_submitted: undefined,
        }),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(updateLeadStripeConnectStatus).toHaveBeenCalledWith(
        "demo-cafe",
        { chargesEnabled: false, payoutsEnabled: false, detailsSubmitted: false },
        expect.any(String),
        { requireConvex: true },
      );
    });
  });

  describe("unexpected error capture (observability-error-tracking-scaffold)", () => {
    it("captures and re-throws (still failing the request, preserving Stripe retry-on-5xx) on a genuinely unexpected error", async () => {
      // account.updated's `getLeads()` call has no inner try/catch of its own
      // (every other failure in this switch is already caught at its own call
      // site) — use it as the one real "escapes every inner catch" trigger.
      getLeads.mockRejectedValueOnce(new Error("unexpected db outage"));
      constructEvent.mockReturnValue({
        type: "account.updated",
        id: "evt_unexpected_1",
        data: { object: { id: "acct_connect_1" } },
      });
      const { POST } = await import("./route");

      await expect(POST(webhookRequest())).rejects.toThrow("unexpected db outage");
      expect(captureError).toHaveBeenCalledTimes(1);
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          component: "stripe-webhook",
          eventType: "account.updated",
          eventId: "evt_unexpected_1",
        }),
      );
    });

    it("never calls captureError when every branch completes normally", async () => {
      getLeads.mockResolvedValueOnce([]);
      constructEvent.mockReturnValue({
        type: "account.updated",
        id: "evt_ok_1",
        data: { object: { id: "acct_connect_1" } },
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(captureError).not.toHaveBeenCalled();
    });
  });
});
