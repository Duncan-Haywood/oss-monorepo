// The URL path prefix the app is served under: "" at a host root (local dev, tests, a host of its
// own) or a prefix such as "/seller-books/app" when it shares a host with the marketing site
// (apps/seller-books-site owns https://marisstella.app/seller-books). Copied from apps/grants, which
// serves under /grants this way. One setting, BASE_PATH, drives it: Vite `base` and the build's
// assets.base_path / run_worker_first (vite.config.ts), the client (import.meta.env.BASE_URL) and
// the Worker (env.BASE_PATH, src/worker/http.ts). See docs/DEPLOY.md, "Path prefix".

const SEGMENT = /^[A-Za-z0-9._~-]+$/;

/**
 * "/grants", "grants/", "/grants/" -> "/grants"; "", "/", undefined -> "".
 * Throws on anything that is not a plain path (a URL, "..", query, encoded characters).
 */
export function normalizeBasePath(raw: string | null | undefined): string {
  const segments = (raw ?? "")
    .trim()
    .split("/")
    .filter((s) => s !== "");
  for (const s of segments) {
    if (!SEGMENT.test(s) || s === "." || s === "..") {
      throw new Error(`Invalid base path ${JSON.stringify(raw)}: use a plain path like "/grants"`);
    }
  }
  return segments.length === 0 ? "" : `/${segments.join("/")}`;
}

/** True when `path` (a pathname, optionally with ?query/#hash) is already under `base`. */
export function isUnderBase(base: string, path: string): boolean {
  if (!base) return true;
  if (!path.startsWith(base)) return false;
  const next = path.charAt(base.length);
  return next === "" || next === "/" || next === "?" || next === "#";
}

/**
 * Prefix a root-relative path with the base: withBase("/grants", "/api/me") -> "/grants/api/me",
 * "/" -> "/grants/". Idempotent (an already prefixed path is returned as is). Anything that is not
 * root-relative (absolute URLs, "//host", "#hash", "mailto:") is returned unchanged.
 */
export function withBase(base: string, path: string): string {
  if (!base || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\"))
    return path;
  if (isUnderBase(base, path)) return path;
  return `${base}${path}`;
}

/**
 * The app-relative pathname for a request pathname: stripBase("/grants", "/grants/api/me") ->
 * "/api/me"; "/grants" -> "/". Returns null when the pathname is outside the base.
 */
export function stripBase(base: string, pathname: string): string | null {
  if (!base) return pathname;
  if (pathname === base) return "/";
  if (pathname.startsWith(`${base}/`)) return pathname.slice(base.length);
  return null;
}
