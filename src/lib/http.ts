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
