import { extractStripeShippingMetadata } from "./buyer-shipping";

/**
 * Asking Stripe for what the webhook event does not carry.
 *
 * `payment_intent.succeeded` delivers an *unexpanded* PaymentIntent. On API
 * version `2025-02-24.acacia` that object has no `customer_details` (a Checkout
 * Session field), no `charges` (removed from the PaymentIntent in 2022-11-15),
 * and a `latest_charge` that is a bare charge **id string**. `receipt_email` is
 * null unless something set it, and a Checkout Session cannot: the buyer types
 * their email into Stripe's own page *after* the session is created, so there is
 * no value for `payment_intent_data.receipt_email` to carry at create time.
 *
 * The email the buyer actually typed lands on the charge, as
 * `billing_details.email`. Reaching it means one retrieval with
 * `expand[]=latest_charge` — the same PaymentIntent, with the charge inlined,
 * which `extractStripeShippingMetadata` already knows how to read.
 *
 * Nothing here defaults or synthesises an address. A retrieval that succeeds and
 * finds no email returns an empty one, and the fulfillment adapters refuse the
 * order on it.
 */

export type FetchLike = (
  input: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

export const STRIPE_PAYMENT_INTENTS_ENDPOINT = "https://api.stripe.com/v1/payment_intents";

/** The version the checkout client pins, so both ends read the same shapes. */
export const STRIPE_API_VERSION = "2025-02-24.acacia";

export type StripeBuyerEmailLookup =
  /** Stripe answered. `email` is `""` when the charge genuinely carries none. */
  | { ok: true; email: string }
  /**
   * Stripe did not answer usefully. `retryable` says whether redelivering the
   * webhook later could plausibly succeed — the caller uses it to decide
   * between acknowledging the event and asking Stripe to send it again.
   */
  | { ok: false; retryable: boolean; reason: string };

/**
 * Whether a later redelivery could plausibly do better.
 *
 * 5xx and 429 are Stripe being temporarily unable or unwilling; 401 and 403 are
 * a misconfigured or rotated key, which an operator can fix inside Stripe's
 * ~3-day redelivery window. 400 and 404 are about this request and this object,
 * and will be just as wrong on every retry.
 */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429 || status === 401 || status === 403;
}

/**
 * The buyer's email for a PaymentIntent, read from the charge behind it.
 *
 * `fetchFn` is injected rather than reached for so the network is a seam the
 * callers own: the webhook route passes the platform `fetch` only when a secret
 * key is configured, exactly as it does for the print partners' APIs.
 */
export async function fetchStripePaymentIntentBuyerEmail(
  paymentIntentId: string,
  secretKey: string,
  fetchFn: FetchLike,
): Promise<StripeBuyerEmailLookup> {
  const id = paymentIntentId.trim();
  if (id === "") {
    return { ok: false, retryable: false, reason: "no PaymentIntent id on the event" };
  }
  if (secretKey.trim() === "") {
    return { ok: false, retryable: false, reason: "STRIPE_SECRET_KEY not configured" };
  }

  // `expand[]` and not `expand`: Stripe's form encoding takes expansions as a
  // list, and the singular form is ignored — which returns the same bare charge
  // id the event already carried, silently.
  const url = `${STRIPE_PAYMENT_INTENTS_ENDPOINT}/${encodeURIComponent(id)}?expand[]=latest_charge`;

  let response: { ok: boolean; status: number; text: () => Promise<string> };
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${secretKey.trim()}`,
        "Stripe-Version": STRIPE_API_VERSION,
      },
    });
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      reason: `Stripe PaymentIntent retrieve failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      retryable: isRetryableStatus(response.status),
      reason: `Stripe PaymentIntent retrieve returned ${response.status}`,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await response.text());
  } catch {
    return {
      ok: false,
      // A body Stripe cannot have meant to send is treated as transient: the
      // alternative is discarding a paid order on one malformed response.
      retryable: true,
      reason: "Stripe PaymentIntent retrieve returned a body that is not JSON",
    };
  }

  // The same extractor the webhook uses on the event object. An expanded
  // `latest_charge` is one of the shapes it already handles, so the retrieved
  // object and the delivered one are read by exactly one piece of code.
  const email = extractStripeShippingMetadata(parsed).buyerEmail ?? "";
  return { ok: true, email };
}
