// The billing port: a merchant-of-record payment provider (checkout, tax, invoices, refunds).
// Implementations: PaddleBillingProvider (./paddle.ts) and SignedFakeBillingProvider (./fake.ts).

/** Subscription statuses a provider can report. ("comp" is app-granted, never provider-reported.) */
export const PROVIDER_SUBSCRIPTION_STATUSES = [
  "trialing",
  "active",
  "past_due",
  "paused",
  "canceled",
] as const;
export type ProviderSubscriptionStatus = (typeof PROVIDER_SUBSCRIPTION_STATUSES)[number];

export type BillingInterval = "month" | "year";

export interface CheckoutRequest {
  /**
   * Opaque signed token for the app's pending-checkout row (./checkout-token.ts). It is the ONLY
   * org-binding data a provider may carry in custom_data; never put an orgId there.
   */
  checkoutToken: string;
  /** Checkout price key: "starter" (monthly) or "starter:annual" (see plans.ts checkoutPriceKey). */
  planKey: string;
  customerEmail: string;
  successUrl: string;
  cancelUrl: string;
  promoCode?: string;
  interval?: BillingInterval;
  /** The org's existing provider customer, reused so a re-subscription keeps the same customer. */
  providerCustomerId?: string | null;
}

export interface ProviderSubscription {
  /** Plan key derived from the BILLED PRICE (never from custom_data). */
  planKey: string;
  status: ProviderSubscriptionStatus;
  providerCustomerId: string;
  providerSubscriptionId: string;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /**
   * The recurring price the provider reports for the subscription's first item, exactly as the
   * webhook carries it (never looked up or estimated). Absent when the payload has no usable price.
   */
  price?: SubscriptionPrice;
}

/** A subscription's billed recurring price, as recorded from the provider's webhook. */
export interface SubscriptionPrice {
  /** Unit price in the currency's minor units (Paddle `unit_price.amount`), before tax. */
  unitAmountMinor: number;
  /** ISO 4217 code, upper case. */
  currency: string;
  /** Billing cycle: every `frequency` `interval`s. */
  interval: "day" | "week" | "month" | "year";
  frequency: number;
  quantity: number;
  /**
   * A discount applies (Paddle `discount` is set). The payload does not say how much the customer
   * actually pays, so such a subscription is counted as "unpriced" in MRR rather than guessed.
   */
  discounted: boolean;
}

export interface BillingWebhookEvent {
  providerEventId: string;
  type: string;
  /** Provider-side event time (Paddle `occurred_at`); orders out-of-order deliveries. */
  occurredAt: Date | null;
  /**
   * custom_data.checkoutToken, unverified. The app resolves the org from it (signature, expiry,
   * one-time use) — events deliberately carry no orgId: raw custom_data is never trusted.
   */
  checkoutToken: string | null;
  /** Subscription the event is about (data.id for subscription.*, data.subscription_id otherwise). */
  providerSubscriptionId: string | null;
  subscription?: ProviderSubscription;
  raw: Record<string, unknown>;
}

/**
 * A one-time charge on a live subscription for metered usage above what its recurring price covers
 * (e.g. apps/einvoice-preflight's vendor API plan). Billed with the subscription's next renewal.
 */
export interface UsageChargeRequest {
  providerSubscriptionId: string;
  /** The subscription's plan key: the charge is filed under that plan's product. */
  planKey: string;
  /** Amount in the currency's minor units, before tax. Positive integer. */
  amountMinor: number;
  currency: string;
  /** Shown to the customer on the invoice (Paddle: 1-50 characters). */
  name: string;
  /** Internal note, not shown to the customer (Paddle: 2-200 characters). */
  description: string;
}

export interface BillingProvider {
  readonly name: string;
  createCheckout(req: CheckoutRequest): Promise<{ url: string }>;
  createPortalSession(providerCustomerId: string, returnUrl: string): Promise<{ url: string }>;
  /** Optional: providers that can bill metered usage onto a subscription. */
  chargeUsage?(req: UsageChargeRequest): Promise<{ chargeId: string | null }>;
  /** Verify signature and normalize. Throws WebhookSignatureError on an invalid signature. */
  parseWebhook(request: Request): Promise<BillingWebhookEvent>;
}
