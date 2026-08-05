/**
 * Best-effort caller IP from proxy headers.
 *
 * Both headers are client-controllable in principle, so this is only good
 * enough for coarse rate limiting — never for authorisation. Behind
 * Vercel's proxy `x-forwarded-for` is rewritten, and the leftmost entry is
 * the real client.
 */
export function getClientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}

/**
 * Stable, server-keyed rate-limit identifier. The database can correlate one
 * caller inside a limit window without retaining a usable IP address.
 */
export function rateLimitKey(ip: string): string {
  const secret = process.env.RATE_LIMIT_SECRET ?? process.env.ADMIN_SESSION_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") throw new Error("RATE_LIMIT_SECRET is not set");
    return `dev:${createHmac("sha256", "quick-pick-local-rate-limit").update(ip).digest("hex")}`;
  }
  return `v1:${createHmac("sha256", secret).update(ip).digest("hex")}`;
}

/**
 * Every database-backed limiter here is built from two numbers that look
 * independent and are not: a *window* it counts inside, and a *retention*
 * period after which the sweep in the recording function deletes rows. The
 * sweep runs in the same `$transaction` as the counter insert, and it deletes
 * the very rows the count depends on, so the window a limiter actually
 * enforces is `min(windowMs, retentionMs)`.
 *
 * Put retention below the window and the limiter degrades silently: no error,
 * no log, the `MAX_*` constants still read correctly, the endpoint still
 * returns 200 to the abuse it exists to stop, and at a retention short enough
 * relative to the caller's pacing it stops limiting altogether. Nothing about
 * either constant's declaration says the other exists.
 *
 * So each limiter states the coupling at module load and refuses to load
 * without it. A violation takes the routes down — which is the safe direction
 * for a control whose only failure mode is otherwise to look enforced while
 * admitting everything.
 */
export function assertRetentionOutlivesWindow(label: string, windowMs: number, retentionMs: number): void {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error(`${label}: rate-limit window must be a positive number of milliseconds, got ${windowMs}.`);
  }
  if (!Number.isFinite(retentionMs) || retentionMs <= windowMs) {
    throw new Error(
      `${label}: retention (${retentionMs}ms) must outlive the rate-limit window (${windowMs}ms). ` +
        `The retention sweep deletes rows in the same transaction that inserts the counter row, so a ` +
        `retention at or below the window shrinks the effective counting window to the retention ` +
        `period and the limit stops being reachable.`,
    );
  }
}

/** Reject an explicitly oversized request before a route buffers/parses it. */
export function requestBodyTooLarge(headers: Headers, maxBytes = 64 * 1024): boolean {
  const raw = headers.get("content-length");
  if (raw === null) return false;
  if (!/^\d+$/.test(raw)) return true;
  const bytes = Number(raw);
  return !Number.isSafeInteger(bytes) || bytes > maxBytes;
}
import { createHmac } from "crypto";
