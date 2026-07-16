/**
 * Sanitize a post-login (or already-authenticated login-page) redirect target.
 *
 * Only same-app operator dashboard paths are allowed. Protocol-relative
 * (`//evil.example`), backslash host tricks (`/\evil`), absolute URLs,
 * control characters (CRLF), over-length paths, and the login page itself
 * (self-redirect loop) fall back to `/dashboard`.
 *
 * Pure — no cookies / Next APIs — so Vitest can cover every branch without
 * mocking server actions. Used by both loginOperatorAction and the login
 * page's already-authenticated redirect (the page previously used a weaker
 * `startsWith("/")` check that accepted `//evil.example`).
 *
 * Length policy matches optional redirect fields (billing-portal returnUrl):
 * over-MAX falls back — soft-cap would change the destination; hard-reject
 * would strand login. Legitimate dashboard paths sit far below the ceiling.
 */

export const DEFAULT_SAFE_NEXT_PATH = "/dashboard";

/** Max length for a client-supplied login `next` path (chars after trim). */
export const MAX_SAFE_NEXT_PATH_LENGTH = 2048;

/**
 * Decode the pathname (strip query/hash first), collapse no-op `.` segments,
 * and reject any `..` segment. Returns null when the path is malformed or
 * escapes via `..` — fail closed so callers treat it as unsafe.
 *
 * Used for both the dashboard-prefix check and the login self-loop check so
 * that `/dashboard/login#x`, `/dashboard/./login`, and `/dashboard/%6cogin`
 * are rejected the same way a bare `/dashboard/login` is. The prior login
 * gate only compared the raw string (exact path / `?` query / trailing slash)
 * and missed those browser-normalized equivalents.
 */
function normalizePathnameForSafety(path: string): string | null {
  const pathname = path.split(/[?#]/, 1)[0] ?? "";
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  // After decoding, control chars / backslashes that were percent-encoded
  // in the raw string must still fail closed.
  if (/[\u0000-\u001f\u007f]/.test(decoded) || decoded.includes("\\")) {
    return null;
  }
  if (!decoded.startsWith("/")) return null;

  const out: string[] = [];
  for (const segment of decoded.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    out.push(segment);
  }
  return `/${out.join("/")}`;
}

/**
 * True when `path` is a safe relative destination under `/dashboard`.
 * Exported for tests; prefer `safeNextPath` at call sites.
 */
export function isSafeNextPath(path: string): boolean {
  if (!path.startsWith("/")) return false;
  // Over-length — optional redirect fall-back (same class as returnUrl).
  // Check before other work so a multi-KB probe never burns decode/normalize.
  if (path.length > MAX_SAFE_NEXT_PATH_LENGTH) return false;
  // Protocol-relative absolute URL (//host/...) — open redirect.
  if (path.startsWith("//")) return false;
  // Backslash host tricks (/\evil, /\\evil) some browsers normalize oddly.
  if (path.includes("\\")) return false;
  // Control chars / CRLF — header or Location injection surface.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  // Absolute URL smuggled as a path (/https://evil, /http:...).
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(path)) return false;

  const normalized = normalizePathnameForSafety(path);
  if (normalized == null) return false;

  // Operator login only ever needs dashboard destinations (proxy sets
  // next=pathname under /dashboard/*). Restricting the prefix closes
  // accidental redirects to public marketing/preview surfaces. Check the
  // normalized form so percent-encoded / ./ variants cannot slip past.
  if (normalized !== "/dashboard" && !normalized.startsWith("/dashboard/")) {
    return false;
  }

  // Already on login with next=/dashboard/login → infinite redirect loop
  // for authenticated visitors (page redirects to next → login again).
  // Covers hash (`#x`), query (`?error=`), single-dot (`./login`), and
  // percent-encoded (`%6cogin`) forms via the normalizer above.
  if (
    normalized === "/dashboard/login" ||
    normalized.startsWith("/dashboard/login/")
  ) {
    return false;
  }
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
