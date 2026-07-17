/**
 * Stripe Checkout Session payment_status gate for sold fulfillment.
 *
 * checkout.session.completed can fire with payment_status !== "paid" for
 * async methods (ACH, bank transfer). amount_total / currency may already
 * match catalog — ledger, deploy handoff, and receipts must wait until
 * funds are collected (payment_status === "paid"), either on the same
 * completed event (card) or on checkout.session.async_payment_succeeded.
 *
 * Also used by loadCheckoutSuccessSession and
 * createBillingPortalForCheckoutSession so success UI + public Manage
 * billing cannot confirm / open while unpaid.
 *
 * See webhook-checkout-payment-status-paid-gate +
 * billing-portal-checkout-payment-status-paid-gate.
 */

export function isStripeCheckoutSessionPaid(
  paymentStatus: string | null | undefined,
): boolean {
  return paymentStatus === "paid";
}
