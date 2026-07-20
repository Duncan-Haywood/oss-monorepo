/**
 * Rate-limit gate for the public, unauthenticated `/checkout` entry page —
 * mirrors planCheckoutSuccessAccess (src/lib/checkout/success-page-access.ts)
 * and planPreviewPageAccess (src/lib/leads/preview-page-access.ts), which
 * closed the identical resource-exhaustion class for `/checkout/success` and
 * `/preview/[slug]`.
 *
 * loadCheckoutPrefillLead fires a real Convex/SQLite getLeadBySlug round
 * trip for any slug that passes resolveCheckoutPrefillSlug's length gate —
 * the same "public, unauthenticated, data-driven GET with no existence
 * short-circuit" class AGENT_PROTOCOL calls out — but this page had no
 * per-IP throttle at all, unlike its two siblings.
 *
 * Checks the rate limit BEFORE loadCheckoutPrefillLead so a limited request
 * never pays the DB round trip either.
 */
import type { CheckoutPrefillLeadResult } from "@/lib/checkout/prefill-slug";
import { DEFAULT_RATE_LIMIT } from "@/lib/security/rate-limit";
import type { RateLimitConfig, RateLimitResult } from "@/lib/security/rate-limit";

export type CheckoutPageAccessPlan =
  | { kind: "rate_limited" }
  | { kind: "loaded"; result: CheckoutPrefillLeadResult };

export interface PlanCheckoutPageAccessDeps {
  loadPrefillLead: (slug: string | undefined) => Promise<CheckoutPrefillLeadResult>;
  checkRateLimit: (key: string, config?: RateLimitConfig) => RateLimitResult;
}

/** One loadPrefillLead call per real page view — the plain per-route default. */
export const CHECKOUT_PAGE_RATE_LIMIT: RateLimitConfig = DEFAULT_RATE_LIMIT;

export async function planCheckoutPageAccess(
  rawSlug: string | undefined,
  clientIp: string,
  deps: PlanCheckoutPageAccessDeps,
): Promise<CheckoutPageAccessPlan> {
  const rate = deps.checkRateLimit(`checkout-page:${clientIp}`, CHECKOUT_PAGE_RATE_LIMIT);
  if (!rate.allowed) {
    return { kind: "rate_limited" };
  }
  const result = await deps.loadPrefillLead(rawSlug);
  return { kind: "loaded", result };
}
