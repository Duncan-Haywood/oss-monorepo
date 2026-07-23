/**
 * Client-supplied Stripe Idempotency-Key support for the two public Stripe
 * Checkout Session create routes (bundle + commerce Buy now).
 *
 * This is a different shape than the stable, server-derived keys in
 * bootstrap-stripe-prices.ts / stripe-sync.ts / stripe-connect.ts: those
 * guard a *permanent* catalog object (a Product/Price/Connect account should
 * only ever exist once for a given spec, forever), so a key derived purely
 * from server-known identity is correct and safe to reuse across all time.
 * A Checkout Session is the opposite — a shopper legitimately creates a new
 * one on every real purchase attempt (retrying after an abandoned session,
 * buying again later), so a stable server-derived key would make Stripe
 * replay a stale cached Session (and redirect URL) for what should be a
 * brand new attempt. Only the client can tell "this is a network-error retry
 * of my last click" apart from "this is a new checkout attempt", so the
 * client mints the key and the server only validates its shape before
 * handing it to Stripe.
 *
 * parseClientIdempotencyKey restricts the accepted shape to a v4-style UUID
 * (exactly what crypto.randomUUID() produces) rather than an arbitrary
 * string — this value flows straight into an outbound Idempotency-Key
 * request header via the Stripe SDK, so an unvalidated string is a
 * header-injection surface (CR/LF, oversized value), not just a format nit.
 * A missing/malformed key is not an error: checkout still works, just
 * without de-dup, matching every other optional/best-effort field on these
 * routes.
 */

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseClientIdempotencyKey(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return UUID_PATTERN.test(value) ? value : undefined;
}

export interface ClientIdempotencyAttempt {
  paramsKey: string;
  idempotencyKey: string;
}

/**
 * Client-side helper: decide the idempotency key to send for a checkout
 * attempt whose request body serializes to `paramsKey`. Reuses the previous
 * attempt's key when `paramsKey` is unchanged (so re-clicking after a
 * network-error retry collapses to one Stripe Checkout Session); mints a
 * fresh key via `generateKey()` whenever the params changed (e.g. the
 * shopper picked a different tier before retrying) — reusing a Stripe
 * Idempotency-Key across two requests with different parameters is itself a
 * Stripe API error, not a safe no-op, so params-changed must never reuse.
 */
export function nextClientIdempotencyKey(
  paramsKey: string,
  previous: ClientIdempotencyAttempt | null,
  generateKey: () => string,
): ClientIdempotencyAttempt {
  if (previous && previous.paramsKey === paramsKey) return previous;
  return { paramsKey, idempotencyKey: generateKey() };
}
