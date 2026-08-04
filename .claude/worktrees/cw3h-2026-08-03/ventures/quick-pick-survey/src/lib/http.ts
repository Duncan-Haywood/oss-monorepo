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

/** Reject an explicitly oversized request before a route buffers/parses it. */
export function requestBodyTooLarge(headers: Headers, maxBytes = 64 * 1024): boolean {
  const raw = headers.get("content-length");
  if (raw === null) return false;
  if (!/^\d+$/.test(raw)) return true;
  const bytes = Number(raw);
  return !Number.isSafeInteger(bytes) || bytes > maxBytes;
}
import { createHmac } from "crypto";
