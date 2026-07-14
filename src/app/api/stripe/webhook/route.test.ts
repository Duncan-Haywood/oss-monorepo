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
vi.mock("stripe", () => ({
  default: class MockStripe {
    webhooks = { constructEvent: (...args: unknown[]) => constructEvent(...args) };
  },
}));

const markCheckoutSessionComplete = vi.fn();
const recordLeadPayment = vi.fn();
const getLeadBySlug = vi.fn();
const getCommerceCatalog = vi.fn();
const insertClientInquiry = vi.fn();
const insertCommerceOrder = vi.fn();
const listCommerceCheckoutInquiriesBySlug = vi.fn();
const getDeployHandoffBySlug = vi.fn();
const insertDeployHandoff = vi.fn();
const listDeployHandoffs = vi.fn();
const updateDeployHandoffCustomDomain = vi.fn();
const updateDeployHandoffStatus = vi.fn();
const updateDeployHandoffVercelProject = vi.fn();
const updateLeadStage = vi.fn();

vi.mock("@/lib/db", () => ({
  markCheckoutSessionComplete: (...args: unknown[]) => markCheckoutSessionComplete(...args),
  recordLeadPayment: (...args: unknown[]) => recordLeadPayment(...args),
  getLeadBySlug: (...args: unknown[]) => getLeadBySlug(...args),
  getCommerceCatalog: (...args: unknown[]) => getCommerceCatalog(...args),
  insertClientInquiry: (...args: unknown[]) => insertClientInquiry(...args),
  insertCommerceOrder: (...args: unknown[]) => insertCommerceOrder(...args),
  listCommerceCheckoutInquiriesBySlug: (...args: unknown[]) =>
    listCommerceCheckoutInquiriesBySlug(...args),
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

function checkoutSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "cs_test_1",
    metadata: {},
    customer_details: { email: null },
    customer_email: null,
    amount_total: 9900,
    customer: null,
    ...overrides,
  };
}

function completedEvent(session: Record<string, unknown>) {
  return { type: "checkout.session.completed", data: { object: session } };
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
    markCheckoutSessionComplete.mockReset().mockResolvedValue(undefined);
    recordLeadPayment.mockReset();
    getLeadBySlug.mockReset().mockResolvedValue(null);
    getCommerceCatalog.mockReset().mockResolvedValue(null);
    insertClientInquiry.mockReset().mockResolvedValue({ id: "inq_1" });
    insertCommerceOrder.mockReset();
    listCommerceCheckoutInquiriesBySlug.mockReset().mockResolvedValue([]);
    getDeployHandoffBySlug.mockReset().mockResolvedValue(null);
    insertDeployHandoff.mockReset().mockResolvedValue(undefined);
    listDeployHandoffs.mockReset().mockResolvedValue([]);
    updateDeployHandoffCustomDomain.mockReset();
    updateDeployHandoffStatus.mockReset();
    updateDeployHandoffVercelProject.mockReset();
    updateLeadStage.mockReset();
    sendEmail.mockReset().mockResolvedValue({ success: true });
    sendReceiptEmail.mockReset().mockResolvedValue({ success: true });
    sendCommerceBuyNowClientReceipt.mockReset().mockResolvedValue(undefined);

    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
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
    constructEvent.mockReturnValue({ type: "customer.subscription.deleted", data: { object: {} } });
    const { POST } = await import("./route");

    const response = await POST(webhookRequest());
    const json = await response.json();
    expect(response.status).toBe(200);
    expect(json).toEqual({ received: true });
    expect(markCheckoutSessionComplete).not.toHaveBeenCalled();
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
      expect(recordLeadPayment).toHaveBeenCalledTimes(1);
      expect(insertDeployHandoff).toHaveBeenCalledTimes(1);
      expect(sendReceiptEmail).toHaveBeenCalledWith(
        "owner@demo-cafe.test",
        "Demo Cafe",
        "growth",
        99,
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

    it("still attempts the DNS handoff email when the best-effort buyer receipt send itself throws", async () => {
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
      expect(response.status).toBe(200);
      expect(sendEmail).toHaveBeenCalledTimes(1);
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
      expect(response.status).toBe(200);
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
      expect(response.status).toBe(200);
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

    it("first delivery: records the ledger and notifies the operator via inquiry + client receipt", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe", email: "owner@demo-cafe.test" });
      getCommerceCatalog.mockResolvedValue({ items: [{ id: "sku_1", name: "Coffee Beans" }] });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
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
    });

    it("redelivery already notified: skips inquiry and client receipt", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe", email: "owner@demo-cafe.test" });
      getCommerceCatalog.mockResolvedValue({ items: [{ id: "sku_1", name: "Coffee Beans" }] });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: true });
      listCommerceCheckoutInquiriesBySlug.mockResolvedValue([
        { source: "commerce_checkout", message: "Paid order — Stripe session cs_test_1" },
      ]);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).not.toHaveBeenCalled();
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("redelivery recovery: ledger already recorded but inquiry missing — recovers the notify", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe", email: "owner@demo-cafe.test" });
      getCommerceCatalog.mockResolvedValue({ items: [{ id: "sku_1", name: "Coffee Beans" }] });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: true });
      listCommerceCheckoutInquiriesBySlug.mockResolvedValue([]);
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(sendCommerceBuyNowClientReceipt).toHaveBeenCalledTimes(1);
    });

    it("skips the notify entirely when skuId is missing from metadata, without writing the ledger", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ metadata: { kind: "commerce_sku", slug: "demo-cafe" } })),
      );
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertCommerceOrder).not.toHaveBeenCalled();
      expect(insertClientInquiry).not.toHaveBeenCalled();
    });

    it("warns and stops when slug metadata is missing from a commerce_sku session", async () => {
      constructEvent.mockReturnValue(
        completedEvent(commerceSession({ metadata: { kind: "commerce_sku", skuId: "sku_1" } })),
      );
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(getLeadBySlug).not.toHaveBeenCalled();
      expect(insertCommerceOrder).not.toHaveBeenCalled();
    });

    it("does not email a client receipt when the lead has no email on file", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe", email: "" });
      getCommerceCatalog.mockResolvedValue({ items: [{ id: "sku_1", name: "Coffee Beans" }] });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("returns 500 (commerce_order_ledger) so Stripe retries when the ledger write fails", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe" });
      getCommerceCatalog.mockResolvedValue({ items: [{ id: "sku_1", name: "Coffee Beans" }] });
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
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe", email: "owner@demo-cafe.test" });
      getCommerceCatalog.mockResolvedValue({ items: [{ id: "sku_1", name: "Coffee Beans" }] });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      insertClientInquiry.mockRejectedValue(new Error("db down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      const json = await response.json();
      expect(response.status).toBe(500);
      expect(json.step).toBe("commerce_order_inquiry");
      expect(sendCommerceBuyNowClientReceipt).not.toHaveBeenCalled();
    });

    it("stays best-effort (200) when the client receipt email itself fails after a successful inquiry write", async () => {
      constructEvent.mockReturnValue(completedEvent(commerceSession()));
      getLeadBySlug.mockResolvedValue({ businessName: "Demo Cafe", email: "owner@demo-cafe.test" });
      getCommerceCatalog.mockResolvedValue({ items: [{ id: "sku_1", name: "Coffee Beans" }] });
      insertCommerceOrder.mockResolvedValue({ alreadyRecorded: false });
      sendCommerceBuyNowClientReceipt.mockRejectedValue(new Error("resend down"));
      const { POST } = await import("./route");

      const response = await POST(webhookRequest());
      expect(response.status).toBe(200);
      expect(insertClientInquiry).toHaveBeenCalledTimes(1);
    });
  });
});
