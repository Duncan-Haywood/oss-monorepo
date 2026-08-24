/**
 * Stripe charge.refunded webhook helpers (commerce-order-refund-clawback-tracking).
 *
 * A completed commerce_sku Buy now Checkout Session is pass-through revenue —
 * the operator manually pays that amount out to the underlying local business
 * (commerceOrders.paidOutAt) until Stripe Connect ships (see
 * commerce-order-manual-payout-mark). Until this fix, a Stripe refund or
 * dispute on that charge was invisible to the app entirely: the order kept
 * counting toward the "owed to client" total even after the money was
 * returned to the shopper, and if the operator had already paid the client
 * out before the refund landed, there was no record that the operator is now
 * out that money and needs to claw it back from the client. See
 * src/lib/commerce/orders.ts (isCommerceOrderRefunded, commerceOrderNeedsClawback).
 *
 * charge.refunded fires on both full and partial refunds; the Charge's own
 * `refunded` boolean is only true once the full amount is refunded. Any
 * amount_refunded > 0 is treated as "flag for manual review" here — the app
 * does not attempt to compute a partial owed remainder, it simply stops
 * treating the order as ordinary unpaid liability and requires the operator
 * to look at it.
 */

/** True once any amount (full or partial) has been refunded on this charge. */
export function chargeHasRefund(charge: {
  amount_refunded?: number | null;
}): boolean {
  return (
    typeof charge.amount_refunded === "number" &&
    Number.isFinite(charge.amount_refunded) &&
    charge.amount_refunded > 0
  );
}

/**
 * Extracts the PaymentIntent id from a Stripe Charge — `payment_intent` may be
 * a bare id string or an expanded PaymentIntent object depending on the
 * webhook's expand config. Returns null when absent (charges not created via
 * a PaymentIntent, e.g. some legacy flows) so the caller can skip correlation.
 *
 * Also used for Stripe Dispute objects (same payment_intent shape) so
 * charge.dispute.created / charge.dispute.closed can reuse Session correlation.
 */
export function chargePaymentIntentId(charge: {
  payment_intent?: string | { id?: string | null } | null;
}): string | null {
  const paymentIntent = charge.payment_intent;
  if (typeof paymentIntent === "string" && paymentIntent.trim().length > 0) {
    return paymentIntent;
  }
  if (
    paymentIntent &&
    typeof paymentIntent === "object" &&
    typeof paymentIntent.id === "string" &&
    paymentIntent.id.trim().length > 0
  ) {
    return paymentIntent.id;
  }
  return null;
}

/**
 * True when charge.dispute.closed should clear commerceOrders.disputedAt —
 * Stripe reinstated (or never permanently withdrew) the funds.
 *
 * - `won` — operator won the chargeback; funds return to the platform.
 * - `warning_closed` — early inquiry closed without becoming a full chargeback.
 *
 * `lost` (and any other closed status) keeps/ensures disputedAt — money is
 * permanently gone, same payout-safety exposure as a refund.
 */
export function disputeStatusClearsDisputeFlag(status: unknown): boolean {
  return status === "won" || status === "warning_closed";
}

/**
 * Extracts the Charge id from a Stripe Refund — `charge` may be a bare id
 * string or an expanded Charge object depending on the webhook's expand
 * config. Returns null when absent so the caller can skip re-verification.
 * Used by refund.updated's reversal handler to re-fetch the charge's own
 * aggregate amount_refunded before trusting a single refund event's status —
 * see refundStatusReversesRefund below for why a single event is not enough.
 */
export function refundChargeId(refund: {
  charge?: string | { id?: string | null } | null;
}): string | null {
  const charge = refund.charge;
  if (typeof charge === "string" && charge.trim().length > 0) {
    return charge;
  }
  if (
    charge &&
    typeof charge === "object" &&
    typeof charge.id === "string" &&
    charge.id.trim().length > 0
  ) {
    return charge.id;
  }
  return null;
}

/**
 * True when a refund.updated event should clear refundedAt — the refund that
 * originally set it (via charge.refunded, amount_refunded > 0) never actually
 * completed. This is common for bank-sourced refunds (ACH, some debit cards):
 * Stripe reports the refund as pending/succeeded first, then reverses it days
 * later when the destination account rejects it. Until this reversal twin
 * shipped, that money silently stayed excluded from the "owed to client"
 * total and permanently blocked Mark paid out forever, even though the funds
 * never left the platform. See commerce-order-refund-reversal-tracking.
 *
 * - `failed` — the refund attempt did not complete; funds stay with the platform.
 * - `canceled` — a `requires_action` refund (e.g. Sofort) was canceled before completing.
 *
 * IMPORTANT: this predicate is about the single refund EVENT, not the whole
 * charge. Stripe allows multiple independent (e.g. partial) refunds per
 * charge — a caller must not clear refundedAt off this predicate alone,
 * since a *different*, still-successful refund on the same charge would then
 * be silently erased. Re-fetch the charge (stripe.charges.retrieve, keyed by
 * refundChargeId(refund)) and re-check chargeHasRefund(charge) — only clear
 * when that re-derived aggregate shows zero net refund remaining. See
 * refund-reversal-charge-aggregate-recheck.
 *
 * `succeeded` (and any other status) is not a reversal — the initial
 * refundedAt mark from charge.refunded already covers that case.
 */
export function refundStatusReversesRefund(status: unknown): boolean {
  return status === "failed" || status === "canceled";
}
