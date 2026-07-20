/**
 * Rate-limit gate for the public, unauthenticated `/preview/[slug]` page —
 * mirrors planLeadOgImageResponse (src/lib/og/lead-preview-image.tsx), which
 * closed the identical gap on opengraph-image.tsx / twitter-image.tsx
 * (preview-og-image-rate-limit). The page itself was the residual, highest-
 * cost twin: loadPreviewPageLead resolves ANY slug to a real-or-synthetic
 * lead (no cheap existence short-circuit), so a scripted loop over random
 * slugs forced an unbounded DB round trip plus a full SSR render on both
 * generateMetadata and the page component, with zero per-IP throttle — the
 * exact resource-exhaustion class AGENT_PROTOCOL's rate-limiting rule names
 * (see preview-page-rate-limit).
 *
 * Checks the rate limit BEFORE the DB lookup (same ordering as every other
 * public route) so a limited request never pays that round trip either.
 */
import type { Lead } from "@/lib/leads/types";
import type { RateLimitConfig, RateLimitResult } from "@/lib/security/rate-limit";

export type PreviewPageAccessPlan =
  | { kind: "rate_limited" }
  | { kind: "not_found" }
  | { kind: "ok"; lead: Lead };

export interface PlanPreviewPageAccessDeps {
  loadLead: (slug: string) => Promise<Lead | null>;
  checkRateLimit: (key: string, config?: RateLimitConfig) => RateLimitResult;
}

/**
 * Next.js invokes generateMetadata and the page component separately for the
 * same request with no built-in dedup between them (same reason
 * loadPreviewPageLead already pays two DB round trips per real page view) —
 * so a single visit consumes this bucket twice. Double DEFAULT_RATE_LIMIT's
 * allowance so the *effective* per-visitor budget (~20 real views/min)
 * matches every other public route instead of silently being cut in half.
 */
export const PREVIEW_PAGE_RATE_LIMIT: RateLimitConfig = { limit: 40, windowMs: 60_000 };

export async function planPreviewPageAccess(
  slug: string,
  clientIp: string,
  deps: PlanPreviewPageAccessDeps,
): Promise<PreviewPageAccessPlan> {
  const rate = deps.checkRateLimit(`preview-page:${clientIp}`, PREVIEW_PAGE_RATE_LIMIT);
  if (!rate.allowed) {
    return { kind: "rate_limited" };
  }
  const lead = await deps.loadLead(slug);
  if (!lead) {
    return { kind: "not_found" };
  }
  return { kind: "ok", lead };
}
