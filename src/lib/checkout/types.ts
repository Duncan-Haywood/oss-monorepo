/**
 * Stripe Checkout Session tracking for abandoned-checkout recovery.
 * Written by POST /api/stripe/checkout (bundle) and POST /api/commerce/checkout
 * (commerce_sku) on creation; flipped to "complete" by the
 * checkout.session.completed webhook. See /docs/architecture#payments.
 */

export type CheckoutSessionStatus = "open" | "complete";

/**
 * Discriminator for what the Checkout Session is selling.
 * Missing/undefined on legacy rows means "bundle" (pre-commerce tracking).
 * Never dump commerce Buy now sessions into bundle recovery without this —
 * Finish-checkout emails link /checkout?tier= and would be wrong for SKUs.
 */
export type CheckoutSessionKind = "bundle" | "commerce_sku";

export interface CheckoutSessionRecord {
  /** Stripe's session id — the natural unique key across both backends. */
  stripeSessionId: string;
  leadSlug: string;
  /**
   * Bundle tier id for kind=bundle. Empty string for commerce_sku rows
   * (SKU lives in skuId instead).
   */
  tier: string;
  commerceAddon: boolean;
  /** Prefilled at session creation; Stripe doesn't hand this back until completion. */
  customerEmail?: string;
  status: CheckoutSessionStatus;
  createdAt: string; // ISO
  /** ISO timestamp of the last operator-triggered abandoned-checkout recovery email. */
  recoverySentAt?: string;
  /**
   * What this session sells. Omit/undefined = bundle (legacy rows).
   * commerce_sku = end-customer Buy now on a client's catalog.
   */
  kind?: CheckoutSessionKind;
  /** Present when kind === "commerce_sku". */
  skuId?: string;
}
