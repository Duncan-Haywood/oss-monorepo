/**
 * Bounds for client-supplied Stripe Checkout Session ids on public surfaces.
 *
 * Soft-cap is wrong here: truncating an opaque id guarantees a Stripe miss
 * and still burns a retrieve call. Hard-reject over-length before any SDK
 * call so public callers cannot force multi-KB garbage into
 * checkout.sessions.retrieve (POST /api/stripe/billing-portal body.sessionId
 * and GET /checkout/success?session_id= share this helper).
 *
 * 255 matches Stripe's common object-id ceiling; real cs_test_/cs_live_
 * ids are far shorter.
 */

export const MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH = 255;

export type ParseCheckoutSessionIdResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Trim and validate a public body/query Checkout Session id.
 * Empty/whitespace → missing; over MAX → too_long (never truncate).
 */
export function parseCheckoutSessionId(
  raw: unknown,
): ParseCheckoutSessionIdResult {
  if (typeof raw !== "string") {
    return { ok: false, reason: "missing" };
  }
  const sessionId = raw.trim();
  if (!sessionId) {
    return { ok: false, reason: "missing" };
  }
  if (sessionId.length > MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH) {
    return { ok: false, reason: "too_long" };
  }
  return { ok: true, sessionId };
}
