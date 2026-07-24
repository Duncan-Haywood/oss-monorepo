/**
 * Stripe Checkout Session payment_status gate for sold fulfillment.
 *
 * checkout.session.completed can fire with payment_status !== "paid" for
 * async methods (ACH, bank transfer). amount_total / currency may already
 * match catalog — ledger, deploy handoff, and receipts must wait until
 * funds are collected (payment_status === "paid"), either on the same
 * completed event (card) or on checkout.session.async_payment_succeeded.
 *
 * "no_payment_required" is a distinct, TERMINAL status Stripe sets when
 * allow_promotion_codes (checkout-allow-promotion-codes) lets a redeemed
 * code discount amount_total to exactly 0 — unlike "unpaid", no further
 * event ever arrives to resolve it. Stripe's own fulfillment guidance is to
 * treat "paid" and "no_payment_required" identically; excluding the latter
 * silently and permanently drops every 100%-off order (checkout-session-
 * no-payment-required-fulfillment-gap).
 *
 * Also used by loadCheckoutSuccessSession and
 * createBillingPortalForCheckoutSession so success UI + public Manage
 * billing cannot confirm / open while genuinely unpaid.
 *
 * See webhook-checkout-payment-status-paid-gate +
 * billing-portal-checkout-payment-status-paid-gate.
 */

export function isStripeCheckoutSessionPaid(
  paymentStatus: string | null | undefined,
): boolean {
  return paymentStatus === "paid" || paymentStatus === "no_payment_required";
}
