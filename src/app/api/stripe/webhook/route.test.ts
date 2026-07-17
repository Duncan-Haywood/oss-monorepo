import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DeployHandoff } from "@/lib/deploy/types";

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
const listCheckoutSessions = vi.fn();
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
    };
  },
}));

const markCheckoutSessionComplete = vi.fn();
const markCheckoutSessionOpen = vi.fn();
const markCompleteOpenBundleCheckoutSessionsForLead = vi.fn();
const markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer = vi.fn();
const markOrdersRecurringCanceledByCustomer = vi.fn();
const clearOrdersRecurringCanceledByCustomer = vi.fn();
const syncOrdersRecurringEntitlementByCustomer = vi.fn();
const recordLeadPayment = vi.fn();
const getLeadBySlug = vi.fn();
const getCommerceCatalog = vi.fn();
const insertClientInquiry = vi.fn();
const insertCommerceOrder = vi.fn();
const listCommerceCheckoutInquiriesBySlug = vi.fn();
const listOrdersByLeadSlug = vi.fn();
const getCommerceOrderByStripeSessionId = vi.fn();
const getOrderByStripeSessionId = vi.fn();
const markCommerceOrderClientReceiptSent = vi.fn();
const markCommerceOrderRefunded = vi.fn();
const markOrderRefunded = vi.fn();
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
  clearOrdersRecurringCanceledByCustomer: (...args: unknown[]) =>
    clearOrdersRecurringCanceledByCustomer(...args),
  syncOrdersRecurringEntitlementByCustomer: (...args: unknown[]) =>
    syncOrdersRecurringEntitlementByCustomer(...args),
  recordLeadPayment: (...args: unknown[]) => recordLeadPayment(...args),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  insertClientInquiry: (...args: unknown[]) => insertClientInquiry(...args),
  insertCommerceOrder: (...args: unknown[]) => insertCommerceOrder(...args),
  listCommerceCheckoutInquiriesBySlug: (...args: unknown[]) =>
    listCommerceCheckoutInquiriesBySlug(...args),
  listOrdersByLeadSlug: (...args: unknown[]) => listOrdersByLeadSlug(...args),
  getCommerceOrderByStripeSessionId: (...args: unknown[]) =>
    getCommerceOrderByStripeSessionId(...args),
  getOrderByStripeSessionId: (...args: unknown[]) => getOrderByStripeSessionId(...args),
  markCommerceOrderClientReceiptSent: (...args: unknown[]) =>
    markCommerceOrderClientReceiptSent(...args),
  markCommerceOrderRefunded: (...args: unknown[]) => markCommerceOrderRefunded(...args),
  markOrderRefunded: (...args: unknown[]) => markOrderRefunded(...args),
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
const sendCommerceBuyNowClientReceipt = vi.fn();
vi.mock("@/lib/email/resend", () => ({
  sendEmail: (...args: unknown[]) => sendEmail(...args),
  sendReceiptEmail: (...args: unknown[]) => sendReceiptEmail(...args),
  sendCommerceBuyNowClientReceipt: (...args: unknown[]) => sendCommerceBuyNowClientReceipt(...args),
}));

/** Growth setup ($500) + first month ($99) — matches expectedBundleCheckoutAmountCents. */
const GROWTH_CHECKOUT_AMOUNT_CENTS = 59_900;
/** Create-path Growth Price IDs — webhook catalog Price line-item gate requires these. */
const GROWTH_SETUP_PRICE_ID = "price_growth_setup";
const GROWTH_MONTHLY_PRICE_ID = "price_growth_monthly";
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

function commerceSkuLineItems(priceId: string = COMMERCE_SKU_PRICE_ID) {
  return { data: [{ price: { id: priceId } }] };
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
    markCheckoutSessionComplete.mockReset().mockResolvedValue(undefined);
    markCheckoutSessionOpen.mockReset().mockResolvedValue(undefined);
    markCompleteOpenBundleCheckoutSessionsForLead.mockReset().mockResolvedValue(0);
    markCompleteOpenCommerceCheckoutSessionsForLeadSkuCustomer
      .mockReset()
      .mockResolvedValue(0);
    markOrdersRecurringCanceledByCustomer.mockReset().mockResolvedValue(1);
    clearOrdersRecurringCanceledByCustomer.mockReset().mockResolvedValue(1);
    syncOrdersRecurringEntitlementByCustomer.mockReset().mockResolvedValue(1);
    recordLeadPayment.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(null);
    getCommerceCatalog.mockReset().mockResolvedValue(null);
    insertClientInquiry.mockReset().mockResolvedValue({ id: "inq_1" });
    insertCommerceOrder.mockReset();
    listCommerceCheckoutInquiriesBySlug.mockReset().mockResolvedValue([]);
    listOrdersByLeadSlug.mockReset().mockResolvedValue(activeCommerceOrders);
    getCommerceOrderByStripeSessionId.mockReset().mockResolvedValue(null);
    getOrderByStripeSessionId.mockReset().mockResolvedValue(null);
    markCommerceOrderClientReceiptSent.mockReset().mockResolvedValue(undefined);
    markCommerceOrderRefunded.mockReset().mockResolvedValue(undefined);
    markOrderRefunded.mockReset().mockResolvedValue(undefined);
    markOrderDisputed.mockReset().mockResolvedValue(undefined);
    clearOrderDisputed.mockReset().mockResolvedValue(undefined);
    markCommerceOrderDisputed.mockReset().mockResolvedValue(undefined);
    clearCommerceOrderDisputed.mockReset().mockResolvedValue(undefined);
    listCheckoutSessions.mockReset().mockResolvedValue({ data: [] });
    getDeployHandoffBySlug.mockReset().mockResolvedValue(null);
    insertDeployHandoff.mockReset().mockResolvedValue(undefined);
    listDeployHandoffs.mockReset().mockResolvedValue([]);
    updateDeployHandoffCustomDomain.mockReset();
    updateDeployHandoffStatus.mockReset();
    updateDeployHandoffVercelProject.mockReset();
    updateLeadStage.mockReset();
    sendEmail.mockReset().mockResolvedValue({ success: true });
    sendReceiptEmail.mockReset().mockResolvedValue({ success: true });
    sendCommerceBuyNowClientReceipt.mockReset().mockResolvedValue({ success: true });

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
      expect(sendEmail).not.toHaveBeenCalled();
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
      listLineItems.mockResolvedValue(commerceSkuLineItems());
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
      listLineItems.mockResolvedValue(commerceSkuLineItems());
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

    it("does not close commerce orphans when catalog amount gate skips ledger", async () => {
      constructEvent.mockReturnValue(
        completedEvent(paidCommerceSession({ amount_total: 9999 })),
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
      expect(sendEmail).toHaveBeenCalledTimes(1);
      expect(updateDeployHandoffStatus).toHaveBeenCalledTimes(2);
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
      expect(sendEmail).not.toHaveBeenCalled();
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
      expect(sendEmail).toHaveBeenCalledTimes(1);
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

    it("returns 500 (bundle_payment_or_handoff) so Stripe retries when recordLeadPayment fails", async () => {
      const session = checkoutSession({ metadata: { slug: "demo-cafe", tier: "growth" } });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockRejectedValue(new Error("db down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("bundle_payment_or_handoff");
      expect(sendReceiptEmail).not.toHaveBeenCalled();
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
      expect(sendEmail).not.toHaveBeenCalled();
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
      expect(sendEmail).toHaveBeenCalledTimes(1);
    });

    it("returns 500 when unexpected DNS email formatting fails, so Stripe retries missing markers", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      getDeployHandoffBySlug.mockResolvedValue(
        existingHandoff({ dnsInstructions: null as never }),
      );
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

    it("does not mark the DNS handoff email sent when sendEmail resolves success:false, so redelivery retries it", async () => {
      const session = checkoutSession({
        metadata: { slug: "demo-cafe", tier: "growth" },
        customer_details: { email: "owner@demo-cafe.test" },
      });
      constructEvent.mockReturnValue(completedEvent(session));
      recordLeadPayment.mockResolvedValue({ alreadyRecorded: false });
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      sendEmail.mockResolvedValue({ success: false, error: "Resend API error" });
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
      expect(sendEmail).toHaveBeenCalledTimes(1);
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
      expect(listLineItems).toHaveBeenCalledWith("cs_test_1", { limit: 100 });
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

    it("skips ledger/notify when amount_total !== catalog priceCents (Buy now create Price twin)", async () => {
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

    it("skips ledger/notify when catalog Price is not on line items (amount+currency match)", async () => {
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
      listLineItems.mockResolvedValue(commerceSkuLineItems("price_other_sku"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listLineItems).toHaveBeenCalledWith("cs_test_1", { limit: 100 });
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("skips ledger/notify when catalog stripePriceId is missing (Buy now create unsynced twin)", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue(eligibleCommerceLead);
      getCommerceCatalog.mockResolvedValue({
        items: [{ id: "sku_1", name: "Coffee Beans", priceCents: 2500 }],
      });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(listLineItems).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
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

    it("returns 500 (commerce_order_ledger) so Stripe retries when the ledger write fails", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      insertCommerceOrder.mockRejectedValue(new Error("db down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_ledger");
      expect(insertClientInquiry).not.toHaveBeenCalled();
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
  });
});
