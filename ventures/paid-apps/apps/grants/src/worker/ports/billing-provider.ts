// Merchant-of-record payment provider (handles checkout, tax, invoices, refunds).
export interface CheckoutRequest {
  /**
   * Opaque signed token for our pending_checkouts row (ports/billing/checkout-token.ts). It is the
   * ONLY org-binding data a provider may carry in custom_data; never put an orgId there.
   */
  checkoutToken: string;
  planKey: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  promoCode?: string;
  interval?: "month" | "year";
  /** The org's existing provider customer, reused so a re-subscription keeps the same customer. */
  providerCustomerId?: string | null;
}

export interface BillingWebhookEvent {
  providerEventId: string;
  type: string;
  /** Provider-side event time (Paddle `occurred_at`); orders out-of-order deliveries. */
  occurredAt: Date | null;
  /**
   * custom_data.checkoutToken, unverified. The webhook service resolves the org from it (signature,
   * expiry, one-time use) — events deliberately carry no orgId: raw custom_data is never trusted.
   */
  checkoutToken: string | null;
  /** Subscription the event is about (data.id for subscription.*, data.subscription_id otherwise). */
  providerSubscriptionId: string | null;
  subscription?: {
    planKey: string;
    status: "trialing" | "active" | "past_due" | "paused" | "canceled";
    providerCustomerId: string;
    providerSubscriptionId: string;
    currentPeriodStart: Date | null;
    currentPeriodEnd: Date | null;
    cancelAtPeriodEnd: boolean;
  };
  raw: Record<string, unknown>;
}

export interface BillingProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  createPortalSession(providerCustomerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Verify signature and normalize. Throws on invalid signature. */
  parseWebhook(request: Request): Promise<BillingWebhookEvent>;
}
