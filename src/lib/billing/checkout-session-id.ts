/**
 * Bounds for client-supplied Stripe Checkout Session ids.
 *
 * Soft-cap is wrong here: truncating an opaque id guarantees a miss and
 * still burns lookup/SDK work. Hard-reject over-length before any
 * Stripe retrieve or Convex/SQLite keyed lookup.
 *
 * Shared by:
 * - Public: POST /api/stripe/billing-portal body.sessionId
 * - Public: GET /checkout/success?session_id=
 * - Auth-gated dashboard: markCommerceOrderPaidOutAction,
 *   sendCheckoutRecoveryAction, sendCommerceCheckoutRecoveryAction
 *   (requireOperatorAuth is not a payload-size throttle — same class as
 *   assignVercelProjectAction / parseVercelProjectId)
 *
 * 255 matches Stripe's common object-id ceiling; real cs_test_/cs_live_
 * ids are far shorter.
 */

export const MAX_STRIPE_CHECKOUT_SESSION_ID_LENGTH = 255;

export type ParseCheckoutSessionIdResult =
  | { ok: true; sessionId: string }
  | { ok: false; reason: "missing" | "too_long" };

/**
 * Trim and validate a Checkout Session id (public body/query or dashboard action arg).
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
