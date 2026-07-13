/**
 * Minimal in-memory rate limiter for public write endpoints (contact form,
 * checkout create, commerce checkout create, preview-open beacon).
 *
 * IMPORTANT — this is per-instance, best-effort protection, not a hard
 * security boundary:
 *  - State lives in a process-local Map. On a multi-instance deployment
 *    (multiple Vercel/Node processes) each instance enforces its own
 *    independent counter — a client whose requests land across N instances
 *    effectively gets up to N times the configured allowance. This is not
 *    backed by Convex/SQLite or any shared store (that would need a new
 *    round trip per request on every public route, and a new consistency
 *    story this codebase doesn't need yet).
 *  - A redeploy/restart resets every counter to zero.
 *  - The client key derives from x-forwarded-for / x-real-ip, which a
 *    direct (non-proxied) client can spoof; it still blunts unsophisticated
 *    scripted abuse (contact-form spam, checkout-session churn, preview-open
 *    flooding) on a single instance without adding a new infra dependency
 *    (no Upstash/Redis). If real multi-instance abuse shows up in practice,
 *    upgrade to a shared store keyed the same way (route name + client IP)
 *    rather than inventing a second scheme alongside this one.
 */

export interface RateLimitConfig {
  /** Max requests allowed within the window. */
  limit: number;
  /** Window size in milliseconds. */
  windowMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  /** Requests remaining in the current window when allowed, else 0. */
  remaining: number;
  /** Seconds until the caller should retry — only meaningful when !allowed. */
  retryAfterSeconds: number;
}

interface WindowState {
  count: number;
  windowStart: number;
}

/**
 * Generous enough not to trip on legitimate use (a visitor retrying a
 * contact form, or a shopper re-opening checkout) while still bounding a
 * scripted burst to a single instance.
 */
export const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  limit: 20,
  windowMs: 60_000,
};

const buckets = new Map<string, WindowState>();

/**
 * Fixed-window counter keyed by an arbitrary string (callers compose
 * `${routeName}:${clientIp}`). Pure function of (key, config, now) plus
 * module-local state — `now` is injectable so tests never depend on real
 * timers or sleeps.
 *
 * Fixed windows allow a caller up to 2x the configured limit across a
 * window boundary (e.g. `limit` requests just before the boundary and
 * `limit` more just after) — an accepted trade-off for a best-effort,
 * dependency-free limiter; document, don't silently oversell precision.
 */
export function checkRateLimit(
  key: string,
  config: RateLimitConfig = DEFAULT_RATE_LIMIT,
  now: number = Date.now(),
): RateLimitResult {
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= config.windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: Math.max(config.limit - 1, 0), retryAfterSeconds: 0 };
  }

  if (existing.count < config.limit) {
    existing.count += 1;
    return {
      allowed: true,
      remaining: Math.max(config.limit - existing.count, 0),
      retryAfterSeconds: 0,
    };
  }

  const elapsedMs = now - existing.windowStart;
  const retryAfterMs = Math.max(config.windowMs - elapsedMs, 0);
  return {
    allowed: false,
    remaining: 0,
    // Always report at least 1s so a caller never sends Retry-After: 0.
    retryAfterSeconds: Math.max(Math.ceil(retryAfterMs / 1000), 1),
  };
}

/**
 * Derives a best-effort client identifier from standard proxy headers.
 * Falls back to a fixed placeholder when neither header is present (direct
 * connection in dev, or a test harness) so every unattributed request
 * shares one bucket rather than silently bypassing the limiter.
 */
export function clientIpFromHeaders(headers: Headers): string {
  const forwardedFor = headers.get("x-forwarded-for");
  if (forwardedFor) {
    const first = forwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip");
  if (realIp && realIp.trim()) return realIp.trim();
  return "unknown";
}

/** Clears all in-memory limiter state. Test-only — never call from product code. */
export function resetRateLimiterForTests(): void {
  buckets.clear();
}
