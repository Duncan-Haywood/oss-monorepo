// Canonical-host redirect. Production lives at APP_URL (https://marisstella.app/grants); the old host
// (grants.marisstella.app) stays attached to this Worker only to send people and links there with a
// 301. Local dev (localhost) and workers.dev keep answering directly, and plain-http APP_URLs (local
// dev, tests) never redirect.
import { withBase } from "@shared/base-path";

/** Hosts that always answer directly: local dev and the account's workers.dev subdomain. */
export function isDevHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h === "::1" ||
    /^127(?:\.\d{1,3}){3}$/.test(h) ||
    h.endsWith(".workers.dev")
  );
}

/**
 * Where a request on a non-canonical host should go: the canonical origin + base path + the original
 * path (a leading base path is not doubled) + query. Null when the request should be served here.
 */
export function canonicalRedirect(
  requestUrl: URL,
  appUrl: string,
  basePath: string,
): string | null {
  let canonical: URL;
  try {
    canonical = new URL(appUrl);
  } catch {
    return null;
  }
  if (canonical.protocol !== "https:") return null;
  if (requestUrl.host.toLowerCase() === canonical.host.toLowerCase()) return null;
  if (isDevHost(requestUrl.hostname)) return null;
  return `${canonical.origin}${withBase(basePath, requestUrl.pathname)}${requestUrl.search}`;
}

/**
 * Cookie-less machine endpoints keep answering on every host instead of redirecting: webhook senders
 * (billing provider, Slack) and API clients do not follow redirects on POST, and their URLs are set
 * outside this repo; the post-deploy smoke test and grants-monitor read /api/health on the Worker's
 * own host while the catalogue forward is not live; calendar apps poll their subscribed .ics feed URL
 * (token in the path) and not all of them follow redirects. None of them uses the session cookie.
 * `appPathname` is the path without the base path.
 */
export function answersOnEveryHost(appPathname: string): boolean {
  return (
    appPathname === "/api/health" ||
    appPathname.startsWith("/api/health/") ||
    appPathname === "/api/billing/webhook" ||
    appPathname.startsWith("/api/calendar/") ||
    appPathname.startsWith("/api/integrations/") ||
    appPathname.startsWith("/api/internal/")
  );
}

/** 301 for GET/HEAD; 308 for everything else, so a method and body are never silently dropped. */
export const redirectStatusFor = (method: string): 301 | 308 =>
  method === "GET" || method === "HEAD" ? 301 : 308;
