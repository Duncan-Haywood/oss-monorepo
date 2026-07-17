/**
 * Stripe webhook fulfillment policy.
 * Required ledger / handoff writes must fail the HTTP response (5xx) so Stripe
 * redelivers. Email / notify side effects stay best-effort after durable writes.
 */

export type WebhookFulfillmentStep =
  | "bundle_payment_or_handoff"
  | "commerce_order_ledger"
  /** Operator inquiry after a durable commerce ledger write — required for Stripe retry / side-effect recovery. */
  | "commerce_order_inquiry"
  /** Marking a checkout_sessions row complete — required so abandoned-checkout due queues stop targeting a paid session. */
  | "checkout_session_mark_complete"
  /**
   * Closing other open bundle checkout_sessions for the same lead after a paid
   * bundle Session — required so Stripe retries rather than leaving orphan
   * abandoned carts that Finish-checkout / digest still nudge after pay.
   */
  | "checkout_session_orphan_bundle_cleanup"
  /**
   * Closing other open commerce_sku checkout_sessions for the same
   * leadSlug+skuId+customerEmail after a paid Buy now Session — required so
   * Stripe retries rather than leaving orphan abandoned carts that digest /
   * Send Buy now recovery still nudge after pay.
   */
  | "checkout_session_orphan_commerce_cleanup"
  /**
   * Re-opening a checkout_sessions row after async_payment_failed — required so
   * Stripe retries rather than leaving a failed ACH cart stuck status=complete
   * (Finish-checkout / Buy now recovery permanently skipped).
   */
  | "checkout_session_mark_open"
  /**
   * Marking Growth/Complete/Commerce orders.recurringCanceledAt after
   * customer.subscription.deleted — required so Stripe retries rather than
   * leaving canceled subscribers with active marketing/voice/catalog entitlement.
   */
  | "orders_recurring_canceled"
  /**
   * Listing Checkout Session line items to derive commerceAddon + verify
   * bundle catalog Price IDs (create-path Price ID parity) — required so
   * Stripe retries rather than recording a forged metadata.commerceAddon
   * entitlement or a session that never charged the catalog Prices.
   */
  | "bundle_commerce_addon_line_items"
  /**
   * Listing Checkout Session line items to verify commerce_sku catalog
   * stripePriceId membership — required so Stripe retries rather than
   * ledgering a session whose amount/currency match but Price differs.
   */
  | "commerce_sku_price_line_items"
  /**
   * Durable handoff-note marker after a successful bundle buyer receipt / DNS
   * email — required so Stripe retries rather than leaving recovery unable to
   * see that the email already went out (duplicate risk on every redelivery).
   */
  | "bundle_email_sent_marker"
  /**
   * Durable commerceOrders.clientReceiptEmailSentAt marker after a successful
   * sendCommerceBuyNowClientReceipt — required so Stripe retries rather than
   * leaving recovery unable to see that the client order notification went out.
   */
  | "commerce_client_receipt_sent_marker";

/** HTTP status Stripe should see when a required fulfillment write fails. */
export const WEBHOOK_FULFILLMENT_FAILURE_STATUS = 500;

export function webhookFulfillmentFailureResponse(step: WebhookFulfillmentStep): {
  status: number;
  body: { error: string; step: WebhookFulfillmentStep; received: false };
} {
  return {
    status: WEBHOOK_FULFILLMENT_FAILURE_STATUS,
    body: {
      error: "Fulfillment write failed — Stripe should retry",
      step,
      received: false,
    },
  };
}
