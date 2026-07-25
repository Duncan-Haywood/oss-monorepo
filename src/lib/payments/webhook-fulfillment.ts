/**
 * Stripe webhook fulfillment policy.
 * Required ledger / handoff writes and transactional email delivery must fail
 * the HTTP response (5xx) so Stripe redelivers. Email / notify side effects
 * still run after durable writes, with independent markers for recovery.
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
   * customer.subscription.deleted, past_due|unpaid subscription.updated, or
   * invoice.payment_failed (subscription invoices) — required so Stripe retries
   * rather than leaving canceled/past-due subscribers with active
   * marketing/voice/catalog entitlement.
   */
  | "orders_recurring_canceled"
  /**
   * Clearing Growth/Complete/Commerce orders.recurringCanceledAt after
   * customer.subscription.created|updated reaches active|trialing, or after
   * invoice.paid when subscriptions.retrieve proves grants + !pause_collection
   * — required so Stripe retries rather than leaving resubscribers / recovered
   * renewals without packs/catalog.
   */
  | "orders_recurring_reactivated"
  /**
   * Retrieving the Subscription for invoice.paid / invoice.payment_failed CRM
   * twins before clear/mark — required so Stripe retries rather than skipping
   * restore/pause (or blindly mutating) when retrieve fails.
   */
  | "subscription_retrieve"
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
   * Sending a bundle buyer receipt or DNS handoff email — required so Stripe
   * redelivers after a transient Resend failure when its marker is absent.
   */
  | "bundle_email_send"
  /**
   * Durable commerceOrders.clientReceiptEmailSentAt marker after a successful
   * sendCommerceBuyNowClientReceipt — required so Stripe retries rather than
   * leaving recovery unable to see that the client order notification went out.
   */
  | "commerce_client_receipt_sent_marker"
  /**
   * Sending the Commerce client receipt — required so Stripe redelivers after
   * a transient Resend failure when its marker is absent.
   */
  | "commerce_client_receipt_send"
  /**
   * Looking up the Checkout Session behind a refunded charge (via
   * stripe.checkout.sessions.list({ payment_intent })) on charge.refunded —
   * required so Stripe retries rather than silently leaving a refunded
   * commerce order still counted as owed (or already-paid-out clawback
   * debt invisible) because the correlating lookup failed transiently.
   */
  | "commerce_order_refund_session_lookup"
  /**
   * Marking commerceOrders.refundedAt after charge.refunded resolves the
   * order's Checkout Session — required so Stripe retries rather than
   * leaving a refunded Buy now order still counted toward the "owed to
   * client" total, or an already-paid-out clawback silently unflagged.
   */
  | "commerce_order_refund"
  /**
   * Looking up the Checkout Session behind a disputed charge (via
   * stripe.checkout.sessions.list({ payment_intent })) on
   * charge.dispute.created — required so Stripe retries rather than
   * silently leaving a disputed commerce order still counted as owed (or
   * already-paid-out clawback debt invisible) because the correlating
   * lookup failed transiently.
   */
  | "commerce_order_dispute_session_lookup"
  /**
   * Marking commerceOrders.disputedAt after charge.dispute.created resolves
   * the order's Checkout Session — required so Stripe retries rather than
   * leaving a disputed Buy now order still counted toward the "owed to
   * client" total, or an already-paid-out clawback silently unflagged.
   */
  | "commerce_order_dispute"
  /**
   * Looking up the Checkout Session behind a closed dispute (via
   * stripe.checkout.sessions.list({ payment_intent })) on
   * charge.dispute.closed — required so Stripe retries rather than silently
   * leaving a won dispute still flagged disputedAt (false Mark-paid-out
   * reject + false clawback debt) because the correlating lookup failed.
   */
  | "commerce_order_dispute_closed_session_lookup"
  /**
   * Clearing commerceOrders.disputedAt after charge.dispute.closed with
   * status won / warning_closed — required so Stripe retries rather than
   * leaving Mark paid out rejected and Dispute clawback needed counting a
   * false clawback after Stripe reinstated the funds.
   */
  | "commerce_order_dispute_clear"
  /**
   * Marking orders.refundedAt (bundle Starter/Growth/Complete/Commerce-addon
   * revenue) after charge.refunded resolves the order's Checkout Session —
   * required so Stripe retries rather than leaving a refunded bundle order
   * still counted in revenueTotalUsd with no operator visibility. See
   * bundle-order-refund-tracking. Session lookup itself reuses
   * commerce_order_refund_session_lookup (shared correlation call).
   */
  | "bundle_order_refund"
  /**
   * Marking orders.disputedAt after charge.dispute.created (or dispute.closed
   * lost) resolves a bundle order's Checkout Session — required so Stripe
   * retries rather than leaving a disputed bundle order still counted in
   * revenueTotalUsd. Session lookup reuses commerce_order_dispute_session_lookup
   * / commerce_order_dispute_closed_session_lookup. See
   * bundle-order-dispute-tracking.
   */
  | "bundle_order_dispute"
  /**
   * Clearing orders.disputedAt after charge.dispute.closed with status won /
   * warning_closed — required so Stripe retries rather than leaving a won
   * dispute still excluded from revenueTotalUsd forever. See
   * bundle-order-dispute-tracking.
   */
  | "bundle_order_dispute_clear"
  /**
   * Re-fetching the Charge behind a reversed refund (via
   * stripe.charges.retrieve) on refund.updated (status failed/canceled), to
   * re-verify the charge's own aggregate amount_refunded before clearing —
   * required so Stripe retries rather than risking a stale-state clear (or
   * silently leaving refundedAt stuck) because the re-verification lookup
   * failed transiently. Stripe allows multiple independent refunds per
   * charge; a single refund event's status alone is not ground truth for
   * whether the charge still has a genuinely-completed refund on it. See
   * refund-reversal-charge-aggregate-recheck.
   */
  | "commerce_order_refund_reversed_charge_lookup"
  /**
   * Looking up the Checkout Session behind a reversed refund (via
   * stripe.checkout.sessions.list({ payment_intent })) on refund.updated
   * (status failed/canceled), after the charge re-verification above showed
   * zero net refund remaining — required so Stripe retries rather than
   * silently leaving a refund-that-never-completed still excluded from owed
   * totals because the correlating lookup failed transiently. See
   * commerce-order-refund-reversal-tracking.
   */
  | "commerce_order_refund_reversed_session_lookup"
  /**
   * Clearing commerceOrders.refundedAt after refund.updated reports the
   * refund that set it (failed/canceled) never actually completed —
   * required so Stripe retries rather than leaving a commerce order
   * permanently excluded from the "owed to client" total and Mark paid out
   * even though the funds never left the platform. See
   * commerce-order-refund-reversal-tracking.
   */
  | "commerce_order_refund_clear"
  /**
   * Clearing orders.refundedAt (bundle Starter/Growth/Complete/Commerce-addon
   * revenue) after refund.updated reports the refund that set it
   * (failed/canceled) never actually completed — required so Stripe retries
   * rather than leaving a bundle order permanently excluded from
   * revenueTotalUsd. Session lookup reuses
   * commerce_order_refund_reversed_session_lookup. See
   * commerce-order-refund-reversal-tracking.
   */
  | "bundle_order_refund_clear"
  /**
   * Adding a subscription-cycle renewal invoice's amount to
   * orders.lifetimeRevenueUsd on invoice.paid — required so Stripe retries
   * rather than silently leaving a Growth/Complete/Commerce-addon
   * subscriber's renewal permanently uncounted in revenueTotalUsd. See
   * revenue-total-usd-renewal-gap.
   */
  | "subscription_renewal_revenue";

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
