/**
 * Stripe webhook fulfillment policy.
 * Required ledger / handoff writes must fail the HTTP response (5xx) so Stripe
 * redelivers. Email / notify side effects stay best-effort after durable writes.
 */

export type WebhookFulfillmentStep =
  | "bundle_payment_or_handoff"
  | "commerce_order_ledger"
  /** Operator inquiry after a durable commerce ledger write — required for Stripe retry / side-effect recovery. */
  | "commerce_order_inquiry";

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
