import { describe, expect, it } from "vitest";
import {
  WEBHOOK_FULFILLMENT_FAILURE_STATUS,
  webhookFulfillmentFailureResponse,
} from "./webhook-fulfillment";

describe("webhookFulfillmentFailureResponse", () => {
  it("returns 500 with received:false for bundle fulfillment failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_payment_or_handoff");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_payment_or_handoff");
  });

  it("returns 500 with received:false for commerce ledger failures", () => {
    const result = webhookFulfillmentFailureResponse("commerce_order_ledger");
    expect(result.status).toBe(500);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_ledger");
  });

  it("returns 500 with received:false for commerce inquiry failures after ledger", () => {
    const result = webhookFulfillmentFailureResponse("commerce_order_inquiry");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_inquiry");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for checkout-session mark-complete failures", () => {
    const result = webhookFulfillmentFailureResponse("checkout_session_mark_complete");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("checkout_session_mark_complete");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for orphan open bundle cleanup failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "checkout_session_orphan_bundle_cleanup",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("checkout_session_orphan_bundle_cleanup");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for orphan open commerce cleanup failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "checkout_session_orphan_commerce_cleanup",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("checkout_session_orphan_commerce_cleanup");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for checkout-session mark-open failures", () => {
    const result = webhookFulfillmentFailureResponse("checkout_session_mark_open");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("checkout_session_mark_open");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for subscription.deleted CRM sync failures", () => {
    const result = webhookFulfillmentFailureResponse("orders_recurring_canceled");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("orders_recurring_canceled");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for subscription reactivated CRM sync failures", () => {
    const result = webhookFulfillmentFailureResponse("orders_recurring_reactivated");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("orders_recurring_reactivated");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for subscription retrieve failures on invoice CRM twins", () => {
    const result = webhookFulfillmentFailureResponse("subscription_retrieve");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("subscription_retrieve");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for bundle commerceAddon line-item list failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_commerce_addon_line_items");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_commerce_addon_line_items");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for bundle email sent-marker failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_email_sent_marker");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_email_sent_marker");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for bundle email send failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_email_send");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_email_send");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for commerce client-receipt sent-marker failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "commerce_client_receipt_sent_marker",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_client_receipt_sent_marker");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for commerce client-receipt send failures", () => {
    const result = webhookFulfillmentFailureResponse("commerce_client_receipt_send");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_client_receipt_send");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for refund Checkout Session lookup failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "commerce_order_refund_session_lookup",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_refund_session_lookup");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for commerce order refund mark failures", () => {
    const result = webhookFulfillmentFailureResponse("commerce_order_refund");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_refund");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for dispute Checkout Session lookup failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "commerce_order_dispute_session_lookup",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_dispute_session_lookup");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for commerce order dispute mark failures", () => {
    const result = webhookFulfillmentFailureResponse("commerce_order_dispute");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_dispute");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for dispute.closed Session lookup failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "commerce_order_dispute_closed_session_lookup",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_dispute_closed_session_lookup");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for commerce order dispute clear failures", () => {
    const result = webhookFulfillmentFailureResponse("commerce_order_dispute_clear");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_dispute_clear");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for bundle order refund failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_order_refund");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_order_refund");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for bundle order dispute failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_order_dispute");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_order_dispute");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for bundle order dispute clear failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_order_dispute_clear");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_order_dispute_clear");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for reversed-refund charge lookup failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "commerce_order_refund_reversed_charge_lookup",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_refund_reversed_charge_lookup");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for reversed-refund session lookup failures", () => {
    const result = webhookFulfillmentFailureResponse(
      "commerce_order_refund_reversed_session_lookup",
    );
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_refund_reversed_session_lookup");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for commerce order refund clear failures", () => {
    const result = webhookFulfillmentFailureResponse("commerce_order_refund_clear");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("commerce_order_refund_clear");
    expect(result.body.error).toMatch(/retry/i);
  });

  it("returns 500 with received:false for bundle order refund clear failures", () => {
    const result = webhookFulfillmentFailureResponse("bundle_order_refund_clear");
    expect(result.status).toBe(WEBHOOK_FULFILLMENT_FAILURE_STATUS);
    expect(result.body.received).toBe(false);
    expect(result.body.step).toBe("bundle_order_refund_clear");
    expect(result.body.error).toMatch(/retry/i);
  });
});
