/**
 * The full set of Stripe event types src/app/api/stripe/webhook/route.ts's
 * switch statement handles: checkout fulfillment (sync + async), subscription
 * lifecycle, invoice payment failed/paid, and refund/dispute clawback
 * tracking.
 *
 * This is the single source of truth /docs/launch-checklist renders its
 * "Select events" webhook-setup step from. Before this list existed, that
 * page told operators to point the Stripe webhook at
 * `/api/stripe/webhook` for `checkout.session.completed` only — but the
 * route already handled eleven other event types whose entire shipped,
 * tested fulfillment/notification/clawback-tracking code paths would never
 * fire in production unless the operator also separately enabled them on
 * the Stripe Dashboard webhook endpoint (Developers -> Webhooks -> your
 * endpoint -> Select events). Not a code bug — Stripe simply never sends an
 * event type the endpoint isn't subscribed to — but a real, silent
 * production gap for a checklist explicitly meant to be followed
 * top-to-bottom before the first outreach batch (see
 * stripe-webhook-event-selection-docs-gap in BUSINESS_DECISIONS).
 *
 * webhook-event-audit.test.ts asserts this list stays byte-for-byte in sync
 * (as a set) with route.ts's own `case "..."` labels, so a future handler
 * added to (or removed from) that switch without updating this list fails
 * tests rather than silently drifting out of sync with the docs again.
 */
export const STRIPE_WEBHOOK_HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_failed",
  "invoice.paid",
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.closed",
  "refund.updated",
  "account.updated",
] as const;

export type StripeWebhookHandledEventType =
  (typeof STRIPE_WEBHOOK_HANDLED_EVENT_TYPES)[number];
