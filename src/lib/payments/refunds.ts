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
