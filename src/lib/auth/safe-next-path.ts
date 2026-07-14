/**
 * Sanitize a post-login (or already-authenticated login-page) redirect target.
 *
 * Only same-app operator dashboard paths are allowed. Protocol-relative
 * (`//evil.example`), backslash host tricks (`/\evil`), absolute URLs,
 * control characters (CRLF), and the login page itself (self-redirect loop)
 * fall back to `/dashboard`.
 *
 * Pure — no cookies / Next APIs — so Vitest can cover every branch without
 * mocking server actions. Used by both loginOperatorAction and the login
 * page's already-authenticated redirect (the page previously used a weaker
 * `startsWith("/")` check that accepted `//evil.example`).
 */

export const DEFAULT_SAFE_NEXT_PATH = "/dashboard";

/**
 * True when `path` is a safe relative destination under `/dashboard`.
 * Exported for tests; prefer `safeNextPath` at call sites.
 */
export function isSafeNextPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  // Protocol-relative absolute URL (//host/...) — open redirect.
  if (path.startsWith("//")) return false;
  // Backslash host tricks (/\evil, /\\evil) some browsers normalize oddly.
  if (path.includes("\\")) return false;
  // Control chars / CRLF — header or Location injection surface.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  // Absolute URL smuggled as a path (/https://evil, /http:...).
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(path)) return false;
  // Operator login only ever needs dashboard destinations (proxy sets
  // next=pathname under /dashboard/*). Restricting the prefix closes
  // accidental redirects to public marketing/preview surfaces.
  if (path !== "/dashboard" && !path.startsWith("/dashboard/")) return false;
  // Already on login with next=/dashboard/login → infinite redirect loop
  // for authenticated visitors (page redirects to next → login again).
  if (path === "/dashboard/login" || path.startsWith("/dashboard/login?")) {
    return false;
  }
  if (path.startsWith("/dashboard/login/")) return false;
  return true;
}

/**
 * Return a safe relative path for post-auth navigation, or `fallback`
 * (default `/dashboard`) when the raw value is missing or unsafe.
 */
export function safeNextPath(
  raw: string | undefined | null,
  fallback: string = DEFAULT_SAFE_NEXT_PATH,
): string {
  if (raw == null) return fallback;
  const path = raw.trim();
  if (!path) return fallback;
  return isSafeNextPath(path) ? path : fallback;
}
