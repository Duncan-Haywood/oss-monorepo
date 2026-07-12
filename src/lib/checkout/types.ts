/**
 * Stripe Checkout Session tracking for abandoned-checkout recovery.
 * Written by POST /api/stripe/checkout on creation, flipped to "complete" by
 * the checkout.session.completed webhook. See /docs/architecture#payments.
 */

export type CheckoutSessionStatus = "open" | "complete";

export interface CheckoutSessionRecord {
  /** Stripe's session id — the natural unique key across both backends. */
  stripeSessionId: string;
  leadSlug: string;
  tier: string;
  commerceAddon: boolean;
  /** Prefilled at session creation; Stripe doesn't hand this back until completion. */
  customerEmail?: string;
  status: CheckoutSessionStatus;
  createdAt: string; // ISO
  /** ISO timestamp of the last operator-triggered abandoned-checkout recovery email. */
  recoverySentAt?: string;
}
