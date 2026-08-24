/**
 * Bounds for client-supplied Billing Portal returnUrl on the public route.
 *
 * returnUrl is optional: cross-origin / malformed values already fall back to
 * the derived default rather than 400. Over-length gets the same treatment —
 * hard-reject would strand a legitimate portal open over an optional field.
 * Soft-cap/truncate is wrong: it would change the redirect destination.
 *
 * 2048 matches common browser URL ceilings; legitimate same-origin return
 * paths (e.g. /checkout/success?session_id=…) sit far below.
 */

export const MAX_BILLING_PORTAL_RETURN_URL_LENGTH = 2048;

/**
 * A client-supplied returnUrl is only honored when it is same-origin with
 * the app and within MAX length — otherwise the route silently replaces it
 * with the derived default. Without the origin check, an attacker with any
 * valid completed Checkout Session id could get Stripe to mint a real
 * billing.stripe.com portal URL whose "Return to [merchant]" link points
 * anywhere they choose. Without the length check, a rate-limited public
 * caller can still POST multi-KB same-origin garbage into
 * stripe.billingPortal.sessions.create.
 */
export function isAcceptableBillingPortalReturnUrl(
  candidate: string,
  appUrl: string,
): boolean {
  if (candidate.length > MAX_BILLING_PORTAL_RETURN_URL_LENGTH) {
    return false;
  }
  try {
    return new URL(candidate).origin === new URL(appUrl).origin;
  } catch {
    return false;
  }
}
