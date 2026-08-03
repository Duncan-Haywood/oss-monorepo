/**
 * Stripe webhook fulfillment policy.
 * Required ledger / handoff writes must fail the HTTP response (5xx) so Stripe
 * redelivers. Email / notify side effects stay best-effort after durable writes.
 */

/**
 * True when Stripe has actually collected the money for a Checkout Session.
 *
 * `checkout.session.completed` fires when the customer finishes Checkout, NOT
 * when the payment settles. For any delayed-notification method — ACH
 * (`us_bank_account`), Klarna, Bacs — it arrives with
 * `payment_status: "unpaid"` and settles minutes-to-days later, or fails.
 * Enabling one of those is a Stripe Dashboard setting that needs no code change
 * here, so this predicate has to hold regardless of how the account is
 * configured. Session `status: "complete"` is not a substitute: it means the
 * Checkout flow finished, not that funds moved.
 *
 * `no_payment_required` is a genuine zero-total session (100% coupon) and does
 * count as paid.
 *
 * Takes the payment_status field rather than the session so both the webhook
 * and the success page can share one definition without importing Stripe types
 * in opposite directions.
 */
export function isCheckoutSessionPaid(paymentStatus: string | null | undefined): boolean {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}

export type WebhookFulfillmentStep =
  | "bundle_payment_or_handoff"
  | "commerce_order_ledger"
  /** Operator inquiry after a durable commerce ledger write — required for Stripe retry / side-effect recovery. */
  | "commerce_order_inquiry"
  /** Marking a checkout_sessions row complete — required so abandoned-checkout due queues stop targeting a paid session. */
  | "checkout_session_mark_complete"
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
