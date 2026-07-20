/**
 * Rate-limit gate for the public, unauthenticated `/checkout/success` page —
 * mirrors planPreviewPageAccess (src/lib/leads/preview-page-access.ts), which
 * closed the identical resource-exhaustion class for `/preview/[slug]`.
 *
 * loadCheckoutSuccessSession fires up to two live Stripe API calls per
 * request (sessions.retrieve + sessions.listLineItems) for any session_id
 * that passes parseCheckoutSessionId's length cap — the same opaque-id class
 * as POST /api/stripe/billing-portal, which already rate-limits its own
 * single retrieve call. Unlike the billing portal route, this page had no
 * per-IP throttle at all: a scripted loop over guessed/leaked session ids
 * would burn Stripe's account-wide API quota with zero rate limit, a more
 * expensive and more externally-consequential resource than the DB round
 * trips preview-page-rate-limit was written to bound.
 *
 * Checks the rate limit BEFORE loadSession so a limited request never pays
 * the Stripe round trip either.
 */
import type { CheckoutSuccessLoadResult } from "@/lib/checkout/success-session";
import { DEFAULT_RATE_LIMIT } from "@/lib/security/rate-limit";
import type { RateLimitConfig, RateLimitResult } from "@/lib/security/rate-limit";

export type CheckoutSuccessPageAccessPlan =
  | { kind: "rate_limited" }
  | { kind: "loaded"; result: CheckoutSuccessLoadResult };

export interface PlanCheckoutSuccessAccessDeps {
  loadSession: (sessionId: string | undefined) => Promise<CheckoutSuccessLoadResult>;
  checkRateLimit: (key: string, config?: RateLimitConfig) => RateLimitResult;
}

/**
 * Only one loadSession call per real page view (unlike /preview/[slug],
 * this page's metadata is static and never calls Stripe) — the plain
 * per-route default is the right budget, not a doubled allowance.
 */
export const CHECKOUT_SUCCESS_RATE_LIMIT: RateLimitConfig = DEFAULT_RATE_LIMIT;

export async function planCheckoutSuccessAccess(
  sessionId: string | undefined,
  clientIp: string,
  deps: PlanCheckoutSuccessAccessDeps,
): Promise<CheckoutSuccessPageAccessPlan> {
  const rate = deps.checkRateLimit(`checkout-success:${clientIp}`, CHECKOUT_SUCCESS_RATE_LIMIT);
  if (!rate.allowed) {
    return { kind: "rate_limited" };
  }
  const result = await deps.loadSession(sessionId);
  return { kind: "loaded", result };
}
